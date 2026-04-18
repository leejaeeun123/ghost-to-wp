import { Router } from "express"
import {
  distributeWeek,
  formatForNaver,
  getCurrentKstWeek,
} from "../blog-format/index.js"
import { clearWeekCache, findArticle, loadWeek } from "./blog-week-cache.js"

export const blogRoutes = Router()

/** GET /api/blog/week?monday=YYYY-MM-DD&fresh=1 */
blogRoutes.get("/week", async (req, res) => {
  try {
    const monday = typeof req.query.monday === "string" ? req.query.monday : undefined
    if (req.query.fresh === "1") clearWeekCache(monday)

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

/**
 * 구 GET /api/blog/brunch/:wpId 는 클립보드 복사 방식 전용이었음.
 * 브런치는 API 기반 자동 발행으로 전환되어 /api/blog/brunch/session, prepare, publish로 대체됨.
 */
blogRoutes.get("/brunch/:wpId", (_req, res) => {
  res.status(410).json({
    error: "폐기됨. /api/blog/brunch/prepare/:wpId + /publish/:wpId 로 대체",
  })
})

export { getCurrentKstWeek }
