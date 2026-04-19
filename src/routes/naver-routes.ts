/**
 * Naver OAuth 콜백 + 상태 확인 엔드포인트.
 *
 * 플로우:
 *   1. GET /auth/start       → 302로 네이버 인증 페이지로 이동
 *   2. (네이버 로그인/동의)
 *   3. GET /auth/callback?code=..&state=..  → 토큰 교환 후 저장, UI로 복귀
 *   4. GET /status           → 토큰 유효성 확인
 */
import { Router } from "express"
import { randomBytes } from "node:crypto"
import {
  buildAuthUrl,
  exchangeCode,
  naverTokenStatus,
  NaverAuthExpiredError,
  writePost,
} from "../naver-client.js"

export const naverRoutes = Router()

// state 값은 in-memory로 보관 (서버 재시작되면 재인증 필요 — 일회성이라 문제없음)
const pendingStates = new Set<string>()

naverRoutes.get("/status", (_req, res) => {
  res.json(naverTokenStatus())
})

naverRoutes.get("/auth/start", (req, res) => {
  const state = randomBytes(16).toString("hex")
  pendingStates.add(state)
  // 15분 후 자동 제거
  setTimeout(() => pendingStates.delete(state), 15 * 60 * 1000)
  const force = req.query.force === "1"
  res.redirect(buildAuthUrl(state, force))
})

naverRoutes.get("/auth/callback", async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : ""
  const state = typeof req.query.state === "string" ? req.query.state : ""
  const error = typeof req.query.error === "string" ? req.query.error : ""
  if (error) {
    res.status(400).send(`<p>Naver 인증 실패: ${error}</p>`)
    return
  }
  if (!code || !state || !pendingStates.has(state)) {
    res.status(400).send("<p>유효하지 않은 callback입니다.</p>")
    return
  }
  pendingStates.delete(state)
  try {
    await exchangeCode(code, state)
    res.redirect("/naver-auth.html?ok=1")
  } catch (err) {
    res.status(500).send(`<p>토큰 교환 실패: ${err instanceof Error ? err.message : String(err)}</p>`)
  }
})

/** POST /test-publish — 수동 테스트 발행 (작은 포스트). body: { title, contents, categoryNo? } */
naverRoutes.post("/test-publish", async (req, res) => {
  try {
    const title = typeof req.body?.title === "string" ? req.body.title : ""
    const contents = typeof req.body?.contents === "string" ? req.body.contents : ""
    if (!title || !contents) {
      res.status(400).json({ error: "title, contents 필수" })
      return
    }
    const result = await writePost({
      title,
      contents,
      categoryNo: typeof req.body?.categoryNo === "number" ? req.body.categoryNo : undefined,
    })
    res.json(result)
  } catch (err) {
    if (err instanceof NaverAuthExpiredError) {
      res.status(401).json({ error: err.message })
      return
    }
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})
