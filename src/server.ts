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
import { runScheduledSync } from "./scheduled-sync.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
const PORT = parseInt(process.env.PORT ?? "3000", 10)

app.use(express.json())
app.use(express.static(path.join(__dirname, "public")))

app.use("/api/ghost", ghostRoutes)
app.use("/api/preview", previewRoutes)
app.use("/api/sync", syncRoutes)
app.use("/api/wp", wpRoutes)
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

  console.log(`  CRON: 매주 금요일 11:00 KST 자동 동기화 활성화\n`)
})
