/**
 * 브런치 자동 예약 — GitHub Actions cron 진입점
 *
 * 흐름:
 *   1. 다가오는 브런치 발행 주(월)의 WP 아티클 로드
 *   2. 월/화 분배
 *   3. 아직 예약 안 된 아티클만 brunch에 mode="reserved"로 발행 (월 19:00 / 화 19:00)
 *   4. 세션 만료 시 Notion 댓글 알림 + 비-0 종료 (재은님이 GitHub Secrets 갱신해야 함)
 *
 * 실행 방법:
 *   - GitHub Actions cron (auto-brunch.yml)
 *   - 서버 내장 cron (server.ts, 매일 08:00 KST)
 *   - 수동: npx tsx src/scheduled-brunch.ts
 */

import "dotenv/config"
import { runBrunchAutoReserve } from "./blog-format/brunch-auto-publish.js"

export const runScheduledBrunch = async (): Promise<number> => {
  console.log("\n[브런치 자동 예약] 시작")
  const summary = await runBrunchAutoReserve()
  console.log(
    `  대상 주: ${summary.weekLabel} (월요일 ${summary.mondayLabel})`,
  )
  console.log(
    `  시도 ${summary.attempted}건 / 예약 ${summary.reserved}건 / 스킵 ${summary.skipped.length}건 / 실패 ${summary.failures.length}건`,
  )

  for (const s of summary.skipped) {
    console.log(`  [스킵] wpId=${s.wpId} — ${s.reason}`)
  }
  for (const f of summary.failures) {
    console.log(`  [실패] wpId=${f.wpId} — ${f.message}`)
  }

  if (summary.sessionExpired) {
    console.error(
      `\n  ⚠ 브런치 세션 만료 — Notion 알림 ${summary.notionNotified ? "발송됨" : "발송 실패"}.`,
    )
    console.error(
      "    GitHub Secrets의 BRUNCH_COOKIE / BRUNCH_CSRF_TOKEN 을 갱신해주세요.",
    )
    return 2
  }

  if (summary.failures.length > 0) {
    return 1
  }

  console.log("\n[브런치 자동 예약 완료]\n")
  return 0
}

// CLI 직접 실행 지원
import { fileURLToPath } from "url"
const __filename = fileURLToPath(import.meta.url)
if (
  process.argv[1] === __filename ||
  process.argv[1]?.endsWith("scheduled-brunch.ts")
) {
  runScheduledBrunch()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error("브런치 자동 예약 오류:", err)
      process.exit(1)
    })
}
