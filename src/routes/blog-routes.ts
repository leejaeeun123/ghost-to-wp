import { Router } from "express"
import {
  fetchWeekArticles,
  getCurrentKstWeek,
  getWeekRangeFromMonday,
  distributeWeek,
  formatForNaver,
  formatForBrunch,
} from "../blog-format/index.js"
import type { WeekArticle } from "../blog-format/index.js"

export const blogRoutes = Router()

/** 메모리 캐시 — 주 단위, 5분 TTL */
const weekCache = new Map<string, { articles: WeekArticle[]; cachedAt: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000

const loadWeek = async (mondayYmd?: string): Promise<{
  range: ReturnType<typeof getCurrentKstWeek>
  articles: WeekArticle[]
}> => {
  const range = mondayYmd ? getWeekRangeFromMonday(mondayYmd) : getCurrentKstWeek()
  const cached = weekCache.get(range.mondayLabel)
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return { range, articles: cached.articles }
  }
  const articles = await fetchWeekArticles(range)
  weekCache.set(range.mondayLabel, { articles, cachedAt: Date.now() })
  return { range, articles }
}

const findArticle = (articles: WeekArticle[], wpId: number): WeekArticle | undefined =>
  articles.find((a) => a.wpId === wpId)

/** GET /api/blog/week?monday=YYYY-MM-DD&fresh=1 */
blogRoutes.get("/week", async (req, res) => {
  try {
    const monday = typeof req.query.monday === "string" ? req.query.monday : undefined
    if (req.query.fresh === "1" && monday) weekCache.delete(monday)
    if (req.query.fresh === "1" && !monday) weekCache.delete(getCurrentKstWeek().mondayLabel)

    const { range, articles } = await loadWeek(monday)
    const weekLabel = `${range.mondayLabel} ~ ${range.sundayLabel}`
    const schedule = distributeWeek(articles, weekLabel)

    res.json({
      range: { ...range, weekLabel },
      total: articles.length,
      schedule,
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

/** GET /api/blog/naver/:wpId?monday=YYYY-MM-DD */
blogRoutes.get("/naver/:wpId", async (req, res) => {
  try {
    const wpId = Number(req.params.wpId)
    if (!Number.isFinite(wpId)) {
      res.status(400).json({ error: "wpId 숫자 필수" })
      return
    }
    const monday = typeof req.query.monday === "string" ? req.query.monday : undefined
    const { articles } = await loadWeek(monday)
    const article = findArticle(articles, wpId)
    if (!article) {
      res.status(404).json({ error: `주간 아티클에 wpId ${wpId} 없음` })
      return
    }
    res.json(formatForNaver(article))
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

/** GET /api/blog/brunch/:wpId?monday=YYYY-MM-DD */
blogRoutes.get("/brunch/:wpId", async (req, res) => {
  try {
    const wpId = Number(req.params.wpId)
    if (!Number.isFinite(wpId)) {
      res.status(400).json({ error: "wpId 숫자 필수" })
      return
    }
    const monday = typeof req.query.monday === "string" ? req.query.monday : undefined
    const { articles } = await loadWeek(monday)
    const article = findArticle(articles, wpId)
    if (!article) {
      res.status(404).json({ error: `주간 아티클에 wpId ${wpId} 없음` })
      return
    }
    res.json(formatForBrunch(article))
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})
