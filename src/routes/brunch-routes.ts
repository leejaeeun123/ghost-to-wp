import { Router, type Response } from "express"
import {
  prepareBrunchArticle,
  publishBrunchArticle,
  type BrunchPreparedArticle,
} from "../blog-format/brunch-publisher.js"
import { runBrunchAutoReserve } from "../blog-format/brunch-auto-publish.js"
import { listReserved } from "../blog-format/brunch-publish-state.js"
import { BrunchSessionExpiredError, type BrunchKeyword } from "../brunch-client.js"
import { loadSession, parseCurl, saveSession, sessionStatus } from "../brunch-session.js"
import { findArticle, loadWeek } from "./blog-week-cache.js"

export const brunchRoutes = Router()

/** prepare ↔ publish 사이 15분 동안 커버 버퍼와 포맷 결과를 캐시 */
interface PreparedEntry {
  prepared: BrunchPreparedArticle
  cachedAt: number
}
const preparedCache = new Map<string, PreparedEntry>()
const PREPARED_TTL_MS = 15 * 60 * 1000

const cacheKey = (wpId: number, mondayKey: string): string => `${wpId}:${mondayKey}`

const requireSession = () => {
  const session = loadSession()
  if (!session) {
    throw new BrunchSessionExpiredError(
      "브런치 세션이 없습니다. 먼저 세션을 갱신해주세요 (F12 → Network → api.brunch.co.kr 요청 우클릭 → Copy as cURL → 세션 갱신 폼에 붙여넣기).",
    )
  }
  return session
}

const sendError = (res: Response, err: unknown): void => {
  if (err instanceof BrunchSessionExpiredError) {
    res.status(401).json({ error: err.message })
    return
  }
  res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
}

/** POST /session — body: { curl: string } */
brunchRoutes.post("/session", (req, res) => {
  try {
    const curl = typeof req.body?.curl === "string" ? req.body.curl : ""
    if (!curl) {
      res.status(400).json({ error: "body.curl (string) 필수" })
      return
    }
    const session = parseCurl(curl)
    saveSession(session)
    res.json({ success: true, savedAt: session.savedAt })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

/** GET /session — 세션 존재 여부 확인 */
brunchRoutes.get("/session", (_req, res) => {
  res.json(sessionStatus())
})

/** POST /prepare/:wpId — 발행 준비 (태그 후보 + 추천 반환) */
brunchRoutes.post("/prepare/:wpId", async (req, res) => {
  try {
    const wpId = Number(req.params.wpId)
    if (!Number.isFinite(wpId)) {
      res.status(400).json({ error: "wpId 숫자 필수" })
      return
    }
    const session = requireSession()
    const monday = typeof req.query.monday === "string" ? req.query.monday : undefined
    const { articles } = await loadWeek(monday)
    const article = findArticle(articles, wpId)
    if (!article) {
      res.status(404).json({ error: `주간 아티클에 wpId ${wpId} 없음` })
      return
    }

    const prepared = await prepareBrunchArticle(session, article)
    preparedCache.set(cacheKey(wpId, monday ?? "current"), {
      prepared,
      cachedAt: Date.now(),
    })

    res.json({
      wpId: article.wpId,
      title: article.title,
      subtitle: article.subtitle,
      editor: article.editor,
      category: article.category,
      subCategoryName: article.subCategoryName,
      featureImageUrl: article.featureImageUrl,
      coverSize: { width: prepared.coverWidth, height: prepared.coverHeight },
      contentSummary: prepared.draft.contentSummary,
      notes: prepared.draft.notes,
      tagCandidates: prepared.draft.tagCandidates,
      validated: prepared.validated,
      recommended: prepared.recommended,
    })
  } catch (err) {
    sendError(res, err)
  }
})

/** POST /publish/:wpId — body: { publishRequestTime, keywords[] } */
brunchRoutes.post("/publish/:wpId", async (req, res) => {
  try {
    const wpId = Number(req.params.wpId)
    if (!Number.isFinite(wpId)) {
      res.status(400).json({ error: "wpId 숫자 필수" })
      return
    }
    const mode = req.body?.mode === "published" ? "published" : "reserved"
    const publishRequestTime = Number(req.body?.publishRequestTime)
    const keywords = req.body?.keywords as BrunchKeyword[] | undefined
    if (mode === "reserved" && !Number.isFinite(publishRequestTime)) {
      res.status(400).json({ error: "예약발행에는 publishRequestTime (UNIX ms)이 필수입니다." })
      return
    }
    if (!Array.isArray(keywords) || keywords.length === 0) {
      res.status(400).json({ error: "keywords 배열 (>=1) 필수" })
      return
    }
    const session = requireSession()
    const monday = typeof req.query.monday === "string" ? req.query.monday : undefined
    const mondayKey = monday ?? "current"
    const entry = preparedCache.get(cacheKey(wpId, mondayKey))
    if (!entry || Date.now() - entry.cachedAt > PREPARED_TTL_MS) {
      res.status(400).json({
        error: "prepare 캐시가 만료되었거나 없습니다. /prepare를 먼저 호출해주세요.",
      })
      return
    }
    const result = await publishBrunchArticle(session, entry.prepared, {
      mode,
      publishRequestTime: mode === "reserved" ? publishRequestTime : undefined,
      keywords,
    })
    preparedCache.delete(cacheKey(wpId, mondayKey))
    res.json({ success: true, ...result })
  } catch (err) {
    sendError(res, err)
  }
})

/** POST /auto-reserve — 수동 트리거. query ?monday=YYYY-MM-DD로 특정 주 지정 가능. */
brunchRoutes.post("/auto-reserve", async (req, res) => {
  try {
    const monday = typeof req.query.monday === "string" ? req.query.monday : undefined
    const summary = await runBrunchAutoReserve(monday)
    res.json(summary)
  } catch (err) {
    sendError(res, err)
  }
})

/** GET /reserved — 지금까지 자동/수동으로 예약 등록된 아티클 목록 */
brunchRoutes.get("/reserved", (_req, res) => {
  res.json({ list: listReserved() })
})
