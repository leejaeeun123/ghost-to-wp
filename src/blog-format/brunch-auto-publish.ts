/**
 * 브런치 자동 예약발행 — 토요일 아침 cron + 매일 재시도로 금요일 이후 지연 아티클까지 보장.
 *
 * 흐름:
 *   1. 다가오는 브런치 발행 주(월) 계산
 *   2. WP에서 해당 주 아티클 로드 → 월/화 분배
 *   3. 아직 예약 안 된 아티클만 prepare → 태그 자동 선정 → mode=reserved 발행
 *   4. 세션 만료 시 Notion 댓글로 @이재은 멘션 + 중단
 */
import { BrunchSessionExpiredError, type BrunchKeyword } from "../brunch-client.js"
import { loadSession } from "../brunch-session.js"
import type { ScheduledArticle } from "./types.js"
import { distributeWeek } from "./schedule-distributor.js"
import { fetchWeekArticles, getWeekRangeFromMonday } from "./week-fetcher.js"
import { prepareBrunchArticle, publishBrunchArticle } from "./brunch-publisher.js"
import { getReservedEntry, markReserved } from "./brunch-publish-state.js"
import {
  addNotionRichComment,
  fetchArticlesForWeek,
  type NotionArticle,
} from "../notion-client.js"

/** 오늘(KST) 기준 다음 브런치 발행 주의 월요일(YYYY-MM-DD). 월/화면 이번 주, 그 외에는 다음 월요일. */
export const getUpcomingBrunchMonday = (nowMs: number = Date.now()): string => {
  const kst = new Date(nowMs).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
  const [y, m, d] = kst.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const dow = dt.getUTCDay() // 0=일 1=월 2=화 … 6=토
  let offset: number
  if (dow === 1) offset = 0
  else if (dow === 2) offset = -1
  else if (dow === 0) offset = 1
  else offset = (1 - dow + 7) % 7
  dt.setUTCDate(dt.getUTCDate() + offset)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

const computePublishTime = (
  mondayYmd: string,
  day: "monday" | "tuesday",
): number => {
  const monday = new Date(`${mondayYmd}T19:00:00+09:00`).getTime()
  return day === "monday" ? monday : monday + 24 * 60 * 60 * 1000
}

/** UI defaultSelection과 동일 로직 — 테마 2 → 키워드 2까지 → 추천 1. 에디터 이름은 제외. */
const selectThreeKeywords = (
  validated: { theme: (BrunchKeyword | null)[]; keyword: (BrunchKeyword | null)[] },
  recommended: BrunchKeyword[],
  editorName: string,
): BrunchKeyword[] => {
  const seen = new Set<number>()
  const picked: BrunchKeyword[] = []
  const normalizedEditor = editorName.trim().toLowerCase()
  const add = (k: BrunchKeyword | null): void => {
    if (!k || picked.length >= 3 || seen.has(k.no)) return
    if (normalizedEditor && k.keyword.trim().toLowerCase() === normalizedEditor) return
    seen.add(k.no)
    picked.push(k)
  }
  for (const t of validated.theme) if (picked.length < 2) add(t)
  for (const k of validated.keyword) if (picked.length < 2) add(k)
  for (const r of recommended) if (picked.length < 3) add(r)
  return picked
}

export interface AutoReserveSummary {
  mondayLabel: string
  weekLabel: string
  attempted: number
  reserved: number
  skipped: Array<{ wpId: number; reason: string }>
  failures: Array<{ wpId: number; message: string }>
  sessionExpired: boolean
  notionNotified: boolean
}

export const runBrunchAutoReserve = async (
  mondayOverride?: string,
): Promise<AutoReserveSummary> => {
  const mondayLabel = mondayOverride ?? getUpcomingBrunchMonday()
  const range = getWeekRangeFromMonday(mondayLabel)
  const weekLabel = `${range.mondayLabel} ~ ${range.sundayLabel}`
  const articles = await fetchWeekArticles(range)
  const schedule = distributeWeek(articles, weekLabel)
  const ordered: ScheduledArticle[] = [...schedule.monday, ...schedule.tuesday]

  const summary: AutoReserveSummary = {
    mondayLabel: range.mondayLabel,
    weekLabel,
    attempted: 0,
    reserved: 0,
    skipped: [],
    failures: [],
    sessionExpired: false,
    notionNotified: false,
  }

  const session = loadSession()
  if (!session) {
    summary.sessionExpired = true
    summary.notionNotified = await notifySessionExpired(range.mondayLabel, range.sundayLabel)
    return summary
  }

  for (const article of ordered) {
    const prev = getReservedEntry(article.wpId)
    if (prev) {
      summary.skipped.push({
        wpId: article.wpId,
        reason: `이미 예약됨 (brunch #${prev.brunchArticleNo})`,
      })
      continue
    }
    summary.attempted += 1
    try {
      const prepared = await prepareBrunchArticle(session, article)
      const keywords = selectThreeKeywords(
        prepared.validated,
        prepared.recommended,
        article.editor,
      )
      if (keywords.length === 0) {
        summary.skipped.push({ wpId: article.wpId, reason: "태그 후보 없음" })
        continue
      }
      const publishAt = computePublishTime(range.mondayLabel, article.scheduleDay)
      const pub = await publishBrunchArticle(session, prepared, {
        mode: "reserved",
        publishRequestTime: publishAt,
        keywords,
      })
      markReserved({
        wpId: article.wpId,
        brunchArticleNo: pub.articleNo,
        brunchUrl: pub.url,
        reservedAt: Date.now(),
        publishAt,
        scheduleDay: article.scheduleDay,
        weekLabel,
      })
      summary.reserved += 1
    } catch (err) {
      if (err instanceof BrunchSessionExpiredError) {
        summary.sessionExpired = true
        summary.notionNotified = await notifySessionExpired(
          range.mondayLabel,
          range.sundayLabel,
        )
        break
      }
      summary.failures.push({
        wpId: article.wpId,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return summary
}

/**
 * 세션 만료 알림 — WP 링크 댓글을 남기는 Notion 페이지와 동일한 페이지들에 "@이재은 …" 댓글 추가.
 * 이번 주 Notion 아티클 전체에 동일 댓글을 올림. 한 곳이라도 성공하면 true.
 */
const notifySessionExpired = async (
  mondayLabel: string,
  sundayLabel: string,
): Promise<boolean> => {
  let pages: NotionArticle[] = []
  try {
    pages = await fetchArticlesForWeek(mondayLabel, sundayLabel)
  } catch {
    return false
  }
  const targets = pages.map((a) => a.pageId).filter((id): id is string => !!id)
  if (targets.length === 0) {
    console.warn("[BRUNCH AUTO] 세션 만료 — Notion 페이지 찾지 못해 알림 스킵")
    return false
  }
  const richText: Array<Record<string, unknown>> = [
    { text: { content: "@이재은 " } },
    {
      text: {
        content:
          "🚨 브런치 세션 만료 — 갱신 필요. 웹 업로드 AX > 브런치 탭 > 세션 갱신에서 cURL 붙여넣기 해주세요. (자동 예약이 실패한 아티클은 다음 실행에서 재시도됩니다)",
      },
    },
  ]
  let anyOk = false
  for (const pageId of targets) {
    const ok = await addNotionRichComment(pageId, richText)
    if (ok) anyOk = true
  }
  return anyOk
}
