import "dotenv/config"
import express from "express"
import path from "path"
import { fileURLToPath } from "url"
import cron from "node-cron"
import { ghostRoutes } from "./routes/ghost-routes.js"
import { previewRoutes } from "./routes/preview-routes.js"
import { syncRoutes } from "./routes/sync-routes.js"
import { wpRoutes } from "./routes/wp-routes.js"
import { blogRoutes } from "./routes/blog-routes.js"
import { brunchRoutes } from "./routes/brunch-routes.js"
import { runScheduledSync } from "./scheduled-sync.js"
import { runBrunchAutoReserve } from "./blog-format/brunch-auto-publish.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
const PORT = parseInt(process.env.PORT ?? "3000", 10)

app.use(express.json())
app.use(express.static(path.join(__dirname, "public")))

app.use("/api/ghost", ghostRoutes)
app.use("/api/preview", previewRoutes)
app.use("/api/sync", syncRoutes)
app.use("/api/wp", wpRoutes)
// brunchRoutes는 blogRoutes보다 먼저 마운트해야 /brunch/:wpId 폴백 핸들러에 가로채지지 않는다.
app.use("/api/blog/brunch", brunchRoutes)
app.use("/api/blog", blogRoutes)

app.listen(PORT, () => {
  console.log(`\n  ANTIEGG 웹 업로드 AX`)
  console.log(`  http://localhost:${PORT}`)

  // 매주 금요일 11:00 KST 자동 동기화
  cron.schedule("0 11 * * 5", async () => {
    console.log("\n[CRON] 금요일 자동 동기화 시작")
    try {
      await runScheduledSync()
    } catch (err) {
      console.error("[CRON] 자동 동기화 오류:", err)
    }
  }, { timezone: "Asia/Seoul" })

  // 매일 08:00 KST 브런치 자동 예약 — 토요일이 주 시점이고 나머지는 늦게 올라온 아티클 재시도용
  cron.schedule("0 8 * * *", async () => {
    console.log("\n[CRON] 브런치 자동 예약 실행")
    try {
      const summary = await runBrunchAutoReserve()
      console.log(
        `[CRON] 브런치 예약 완료: 예약 ${summary.reserved}, 스킵 ${summary.skipped.length}, 실패 ${summary.failures.length}` +
          (summary.sessionExpired ? " (세션 만료)" : ""),
      )
    } catch (err) {
      console.error("[CRON] 브런치 자동 예약 오류:", err)
    }
  }, { timezone: "Asia/Seoul" })

  console.log(`  CRON: 매주 금요일 11:00 KST 자동 동기화 활성화`)
  console.log(`  CRON: 매일 08:00 KST 브런치 자동 예약 활성화\n`)
})
