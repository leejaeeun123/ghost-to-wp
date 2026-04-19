/**
 * Naver OAuth 2.0 + Blog writePost API 래퍼.
 *
 * 토큰은 `.naver-tokens.json` (프로젝트 루트, gitignore)에 저장.
 * access_token은 1시간 TTL이므로 만료되면 refresh_token으로 자동 갱신.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const TOKEN_FILE = join(process.cwd(), ".naver-tokens.json")
const AUTH_BASE = "https://nid.naver.com/oauth2.0"
const API_BASE = "https://openapi.naver.com"

const REDIRECT_URI =
  process.env.NAVER_REDIRECT_URI ||
  "http://localhost:3000/api/naver/auth/callback"

export class NaverAuthExpiredError extends Error {
  constructor(message = "네이버 OAuth 토큰이 만료되었고 갱신도 실패했습니다. 재연결 필요.") {
    super(message)
    this.name = "NaverAuthExpiredError"
  }
}

export interface NaverTokens {
  accessToken: string
  refreshToken: string
  /** UNIX ms — 만료 60초 전에 refresh 시도 */
  expiresAt: number
  savedAt: number
}

const getClientId = (): string => process.env.NAVER_CLIENT_ID ?? ""
const getClientSecret = (): string => process.env.NAVER_CLIENT_SECRET ?? ""

const loadTokens = (): NaverTokens | null => {
  if (!existsSync(TOKEN_FILE)) return null
  try {
    return JSON.parse(readFileSync(TOKEN_FILE, "utf8")) as NaverTokens
  } catch {
    return null
  }
}

const saveTokens = (t: NaverTokens): void => {
  writeFileSync(TOKEN_FILE, JSON.stringify(t, null, 2), "utf8")
}

export const naverTokenStatus = (): { exists: boolean; expiresInSec?: number; savedAt?: number } => {
  const t = loadTokens()
  if (!t) return { exists: false }
  return {
    exists: true,
    expiresInSec: Math.max(0, Math.floor((t.expiresAt - Date.now()) / 1000)),
    savedAt: t.savedAt,
  }
}

/** 인증 URL — 브라우저로 이동시키면 네이버가 콜백으로 code+state 반환.
 *  force=true면 이전 동의 여부와 무관하게 동의 화면을 다시 띄움 (심사 캡처용).
 */
export const buildAuthUrl = (state: string, force = false): string => {
  const params: Record<string, string> = {
    response_type: "code",
    client_id: getClientId(),
    redirect_uri: REDIRECT_URI,
    state,
  }
  if (force) params.auth_type = "reauthenticate"
  return `${AUTH_BASE}/authorize?${new URLSearchParams(params).toString()}`
}

interface NaverTokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: string
  error?: string
  error_description?: string
}

const expiresInToAt = (expiresInSec: string | number): number =>
  Date.now() + Number(expiresInSec) * 1000

/** code를 토큰으로 교환하고 파일에 저장 */
export const exchangeCode = async (code: string, state: string): Promise<NaverTokens> => {
  const p = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: getClientId(),
    client_secret: getClientSecret(),
    code,
    state,
  })
  const res = await fetch(`${AUTH_BASE}/token?${p.toString()}`)
  const data = (await res.json()) as NaverTokenResponse
  if (data.error || !data.access_token) {
    throw new Error(`Naver token 교환 실패: ${data.error_description || data.error || JSON.stringify(data)}`)
  }
  const tokens: NaverTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: expiresInToAt(data.expires_in),
    savedAt: Date.now(),
  }
  saveTokens(tokens)
  return tokens
}

/** refresh_token으로 access_token 갱신 */
export const refreshAccessToken = async (): Promise<NaverTokens> => {
  const current = loadTokens()
  if (!current) throw new NaverAuthExpiredError("저장된 토큰이 없습니다.")
  const p = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: getClientId(),
    client_secret: getClientSecret(),
    refresh_token: current.refreshToken,
  })
  const res = await fetch(`${AUTH_BASE}/token?${p.toString()}`)
  const data = (await res.json()) as NaverTokenResponse
  if (data.error || !data.access_token) {
    throw new NaverAuthExpiredError(
      `토큰 갱신 실패: ${data.error_description || data.error || JSON.stringify(data)}`,
    )
  }
  const tokens: NaverTokens = {
    accessToken: data.access_token,
    // refresh_token은 재발급되지 않을 수 있음 — 있으면 교체, 없으면 기존 유지
    refreshToken: data.refresh_token || current.refreshToken,
    expiresAt: expiresInToAt(data.expires_in),
    savedAt: Date.now(),
  }
  saveTokens(tokens)
  return tokens
}

/** access_token 자동 확보 — 만료 60초 전에는 refresh */
const getValidAccessToken = async (): Promise<string> => {
  const t = loadTokens()
  if (!t) throw new NaverAuthExpiredError("토큰이 저장돼있지 않습니다. OAuth 재연결 필요.")
  if (t.expiresAt - Date.now() > 60_000) return t.accessToken
  const refreshed = await refreshAccessToken()
  return refreshed.accessToken
}

export interface NaverWritePostInput {
  title: string
  contents: string
  categoryNo?: number
}

export interface NaverWritePostResult {
  logNo?: string
  postUrl?: string
  raw: unknown
}

/**
 * 블로그 글 발행 — POST /blog/writePost.json.
 * 멀티파트 form 필드: title, contents. access_token은 Authorization 헤더.
 */
export const writePost = async (input: NaverWritePostInput): Promise<NaverWritePostResult> => {
  const accessToken = await getValidAccessToken()
  const form = new FormData()
  form.append("title", input.title)
  form.append("contents", input.contents)
  if (typeof input.categoryNo === "number") form.append("categoryNo", String(input.categoryNo))

  const res = await fetch(`${API_BASE}/blog/writePost.json`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  })
  const text = await res.text()
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { parsed = text }
  if (res.status === 401) {
    throw new NaverAuthExpiredError(`401 Unauthorized: ${text.slice(0, 200)}`)
  }
  if (!res.ok) {
    throw new Error(`Naver writePost 실패 (HTTP ${res.status}): ${text.slice(0, 400)}`)
  }
  const data = parsed as Record<string, unknown>
  const result = (data?.result ?? data) as Record<string, unknown>
  return {
    logNo: (result?.logNo as string | undefined) ?? undefined,
    postUrl: (result?.postUrl as string | undefined) ?? undefined,
    raw: parsed,
  }
}
