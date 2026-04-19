import { fetchWpPostsByDateRange, type WpPostFull } from "../wp-client.js"
import { fetchArticlesForWeek } from "../notion-client.js"
import type { WeekArticle, BlogCategory } from "./types.js"

/** 보일러플레이트 태그 — 네이버 태그 자동 생성에서는 항상 포함되므로 themes에서 제외 */
const BOILERPLATE_TAGS = new Set(["안티에그", "ANTIEGG", "antiegg", "큐레이션", "그레이"])

/** 카테고리 메타 (서브 카테고리 추출 시 제외) */
const META_CATEGORIES = new Set(["매거진", "큐레이션", "그레이"])

/** "Mon HH:MM ~ Sun HH:MM" KST 한 주 범위 (오늘 기준 ISO 문자열) */
export interface WeekRange {
  fromIso: string
  toIso: string
  mondayLabel: string
  sundayLabel: string
}

const pad = (n: number): string => String(n).padStart(2, "0")

const ymd = (y: number, m: number, d: number): string =>
  `${y}-${pad(m)}-${pad(d)}`

/**
 * 오늘(KST) 기준 "다가오는 브런치 발행 주" 계산.
 * 월/화면 이번 주 월요일, 수~일이면 다음 주 월요일을 반환해 UI가 늘 다음 발행 타겟을 보여주도록.
 */
export const getCurrentKstWeek = (): WeekRange => {
  const todayKstStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
  const [y, m, d] = todayKstStr.split("-").map(Number)
  const dateUtc = new Date(Date.UTC(y, m - 1, d))
  const dayOfWeek = dateUtc.getUTCDay() // 0=일, 1=월 ... 6=토
  let mondayOffset: number
  if (dayOfWeek === 1) mondayOffset = 0            // Mon → today
  else if (dayOfWeek === 2) mondayOffset = -1      // Tue → yesterday (this Mon)
  else if (dayOfWeek === 0) mondayOffset = 1       // Sun → tomorrow (next Mon)
  else mondayOffset = (1 - dayOfWeek + 7) % 7      // Wed-Sat → next Mon

  const monday = new Date(dateUtc)
  monday.setUTCDate(dateUtc.getUTCDate() + mondayOffset)
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)

  const mondayLabel = ymd(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate())
  const sundayLabel = ymd(sunday.getUTCFullYear(), sunday.getUTCMonth() + 1, sunday.getUTCDate())

  return {
    fromIso: `${mondayLabel}T00:00:00+09:00`,
    toIso: `${sundayLabel}T23:59:59+09:00`,
    mondayLabel,
    sundayLabel,
  }
}

/** 임의 월요일 기준 한 주 범위 (mondayYmd 예: "2026-04-13") */
export const getWeekRangeFromMonday = (mondayYmd: string): WeekRange => {
  const [y, m, d] = mondayYmd.split("-").map(Number)
  const monday = new Date(Date.UTC(y, m - 1, d))
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)

  const sundayLabel = ymd(sunday.getUTCFullYear(), sunday.getUTCMonth() + 1, sunday.getUTCDate())
  return {
    fromIso: `${mondayYmd}T00:00:00+09:00`,
    toIso: `${sundayLabel}T23:59:59+09:00`,
    mondayLabel: mondayYmd,
    sundayLabel,
  }
}

const stripHtml = (html: string): string =>
  html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    // HTML numeric entities (WP의 typographic quotes 등) — 브런치 제목 30자 제한 회피
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim()

/** WpPostFull → WeekArticle 변환 */
const toWeekArticle = (post: WpPostFull): WeekArticle | null => {
  const terms = post._embedded?.["wp:term"] ?? []
  const flatTerms = terms.flat()
  const categoryNames = flatTerms.filter((t) => t.taxonomy === "category").map((t) => t.name)
  const tagNames = flatTerms.filter((t) => t.taxonomy === "post_tag").map((t) => t.name)

  let category: BlogCategory | null = null
  if (categoryNames.includes("그레이")) category = "그레이"
  else if (categoryNames.includes("큐레이션")) category = "큐레이션"
  if (!category) return null // 큐레이션/그레이 외 글은 블로그 자동화 대상 아님

  const subCategoryName = categoryNames.find((n) => !META_CATEGORIES.has(n)) ?? ""

  const editor = post._embedded?.author?.[0]?.name ?? ""
  const featureImageUrl = post._embedded?.["wp:featuredmedia"]?.[0]?.source_url ?? ""

  const tags = tagNames.filter((t) => !BOILERPLATE_TAGS.has(t))

  return {
    wpId: post.id,
    wpLink: post.link,
    title: stripHtml(post.title.rendered),
    subtitle: stripHtml(post.excerpt.rendered),
    category,
    subCategoryName,
    tags,
    editor,
    featureImageUrl,
    publishDate: post.date,
    contentHtml: post.content.rendered,
  }
}

/** 매칭용 제목 정규화 (공백/대소문자/줄바꿈 무시) */
const normalizeTitle = (s: string): string =>
  s.replace(/<br\s*\/?>/gi, "").replace(/\s+/g, "").toLowerCase()

/**
 * 한 주의 발행 아티클 fetch.
 *
 * 데이터: WP REST API (본문/이미지/카테고리/태그/작성자)
 * 순서: Notion 아티클 로드맵 DB 순서 (Notion fetch 실패 시 발행일 오름차순 fallback)
 */
export const fetchWeekArticles = async (range: WeekRange): Promise<WeekArticle[]> => {
  const posts = await fetchWpPostsByDateRange(range.fromIso, range.toIso)
  const wpArticles: WeekArticle[] = []
  for (const p of posts) {
    const a = toWeekArticle(p)
    if (a) wpArticles.push(a)
  }

  // Notion DB 순서로 정렬 시도 + Notion 메타 enrichment
  const notionArticles = await fetchArticlesForWeek(range.mondayLabel, range.sundayLabel)

  if (notionArticles.length === 0) {
    wpArticles.sort((a, b) => a.publishDate.localeCompare(b.publishDate))
    return wpArticles
  }

  const notionByTitle = new Map<string, { index: number; categories: string[]; themes: string[]; keywords: string[] }>()
  notionArticles.forEach((n, i) =>
    notionByTitle.set(normalizeTitle(n.title), {
      index: i,
      categories: n.categories,
      themes: n.themes,
      keywords: n.keywords,
    })
  )

  const matched: WeekArticle[] = []
  const unmatched: WeekArticle[] = []
  for (const a of wpArticles) {
    const meta = notionByTitle.get(normalizeTitle(a.title))
    if (meta) {
      matched.push({
        ...a,
        notionCategories: meta.categories,
        notionThemes: meta.themes,
        notionKeywords: meta.keywords,
      })
    } else {
      unmatched.push(a)
    }
  }

  matched.sort((a, b) => {
    const ai = notionByTitle.get(normalizeTitle(a.title))?.index ?? 999
    const bi = notionByTitle.get(normalizeTitle(b.title))?.index ?? 999
    return ai - bi
  })

  // 매칭 실패는 발행일 순으로 끝에 추가
  unmatched.sort((a, b) => a.publishDate.localeCompare(b.publishDate))
  return [...matched, ...unmatched]
}
