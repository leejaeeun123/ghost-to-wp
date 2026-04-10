/**
 * 자동 동기화 — 매주 금요일 11:00 KST 실행
 *
 * 1. Notion 아티클 로드맵에서 발행일이 이번 주(토~다음 금) 범위인 아티클 조회
 * 2. 각 아티클의 Ghost 슬러그로 Ghost 포스트 fetch
 * 3. WP에 draft로 동기화 (syncOnePost 재사용)
 *
 * 실행 방법:
 *   - 서버 내장 cron (server.ts)
 *   - GitHub Actions cron
 *   - 수동: npx tsx src/scheduled-sync.ts
 */

import "dotenv/config"
import { fetchArticlesForWeek, addNotionComment } from "./notion-client.js"
import { fetchPostBySlug } from "./ghost-client.js"
import { syncOnePost } from "./routes/sync-routes.js"
import type { SyncResult } from "./types.js"

/** Square CMS URL에서 Ghost 슬러그 추출 */
const extractSlug = (url: string): string => {
  if (!url) return ""
  return url
    .replace(/^https?:\/\//, "")
    .replace(/^square\.antiegg\.kr\//, "")
    .replace(/\/$/, "")
    .split("/")
    .pop() ?? ""
}

/** 현재 KST 날짜 문자열 (YYYY-MM-DD) */
const getKSTDate = (): string =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })

export const runScheduledSync = async (): Promise<SyncResult[]> => {
  const today = getKSTDate()
  const todayDate = new Date(today + "T00:00:00+09:00")

  // 대상 범위: 토요일(today+1) ~ 다음 금요일(today+7)
  const from = new Date(todayDate)
  from.setDate(todayDate.getDate() + 1)
  const to = new Date(todayDate)
  to.setDate(todayDate.getDate() + 7)

  const fromStr = from.toISOString().split("T")[0]
  const toStr = to.toISOString().split("T")[0]

  console.log(`\n[자동 동기화] 실행일: ${today} (금요일)`)
  console.log(`  대상 발행일: ${fromStr} ~ ${toStr}`)

  const articles = await fetchArticlesForWeek(fromStr, toStr)
  console.log(`  Notion 아티클 ${articles.length}개 발견`)

  if (articles.length === 0) {
    console.log("  → 동기화할 아티클 없음\n")
    return []
  }

  const results: SyncResult[] = []
  let created = 0
  let skipped = 0
  let failed = 0

  for (const article of articles) {
    const slug = extractSlug(article.squareCmsUrl)
    if (!slug) {
      console.log(`  [스킵] "${article.title}" — Ghost URL 없음`)
      skipped++
      continue
    }

    console.log(`\n  "${article.title}" (${slug}, 발행일: ${article.publishDate})`)

    try {
      const post = await fetchPostBySlug(slug)
      if (!post) {
        console.log(`    → Ghost 포스트 없음`)
        results.push({ slug, title: article.title, status: "failed", reason: "Ghost 포스트 없음" })
        failed++
        continue
      }

      const result = await syncOnePost(post, "future")
      results.push(result)

      if (result.status === "created") {
        console.log(`    → WP 예약 발행 (ID: ${result.wpPostId})`)
        // Notion 댓글에 WP 링크 추가
        if (article.pageId && result.wpPostId) {
          const wpLink = `${process.env.WP_API_URL ?? "https://antiegg.kr"}/?p=${result.wpPostId}`
          const ok = await addNotionComment(article.pageId, wpLink)
          console.log(`    → Notion 댓글 ${ok ? "완료" : "실패"}`)
        }
        created++
      } else {
        console.log(`    → ${result.status}: ${result.reason}`)
        skipped++
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      console.log(`    → 실패: ${reason}`)
      results.push({ slug, title: article.title, status: "failed", reason })
      failed++
    }
  }

  console.log(`\n[자동 동기화 완료] 생성: ${created}, 스킵: ${skipped}, 실패: ${failed}\n`)
  return results
}

// CLI 직접 실행 지원
import { fileURLToPath } from "url"
const __filename = fileURLToPath(import.meta.url)
if (process.argv[1] === __filename || process.argv[1]?.endsWith("scheduled-sync.ts")) {
  runScheduledSync().catch((err) => {
    console.error("자동 동기화 오류:", err)
    process.exit(1)
  })
}
