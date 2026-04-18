import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"

export interface BrunchSession {
  cookie: string
  csrfToken: string
  /** 저장 시점 ISO — 만료 추적용 */
  savedAt: string
}

const DEFAULT_SESSION_PATH = resolve(process.cwd(), ".brunch-session.json")

const getSessionPath = (): string =>
  process.env.BRUNCH_SESSION_FILE || DEFAULT_SESSION_PATH

/**
 * Chrome/Whale/Edge "Copy as cURL (bash|cmd)" 출력에서 cookie + x-csrf-token 추출.
 *
 * 지원 포맷:
 *   - `-H 'name: value'`        (bash 기본)
 *   - `-H "name: value"`        (cmd 또는 bash)
 *   - `-H $'name: value'`       (bash ANSI-C 이스케이프)
 *   - `-b 'cookie_string'`      (쿠키 전용 플래그 폴백)
 *   - 라인 연속: `\`(bash) 또는 `^`(cmd) 또는 `` ` ``(PowerShell)
 */
export const parseCurl = (curl: string): BrunchSession => {
  if (!curl || !curl.toLowerCase().includes("brunch.co.kr")) {
    throw new Error("cURL 문자열이 비어있거나 brunch.co.kr 도메인이 아닙니다.")
  }

  const normalized = curl
    .replace(/\r\n/g, "\n")
    .replace(/\\\n/g, " ")
    .replace(/\^\n/g, " ")
    .replace(/`\n/g, " ")
    .replace(/\^"/g, '"')

  const headers = new Map<string, string>()

  const tokenPattern = /(-H|-b|--header|--cookie)\s+(\$?)(['"])([\s\S]*?)(?<!\\)\3/g
  let m: RegExpExecArray | null
  while ((m = tokenPattern.exec(normalized))) {
    const flag = m[1]
    let raw = m[4].replace(/'\\''/g, "'").replace(/\\"/g, '"')
    if (flag === "-b" || flag === "--cookie") {
      headers.set("cookie", raw.trim())
      continue
    }
    const colonIdx = raw.indexOf(":")
    if (colonIdx < 0) continue
    const name = raw.slice(0, colonIdx).trim().toLowerCase()
    const value = raw.slice(colonIdx + 1).trim()
    if (name) headers.set(name, value)
  }

  const cookie = headers.get("cookie")
  const csrf = headers.get("x-csrf-token")

  if (!cookie) {
    const found = [...headers.keys()].join(", ") || "(없음)"
    throw new Error(
      `cURL에 'cookie' 헤더를 찾지 못했습니다. 파싱된 헤더 목록: ${found}. ` +
        `Chrome DevTools에서 "Copy as cURL (bash)"로 복사했는지 확인해주세요. ` +
        `Windows cmd 포맷이면 "Copy as cURL (cmd)" 대신 bash를 선택하세요.`,
    )
  }
  if (!csrf) {
    throw new Error(
      "cURL에 'x-csrf-token' 헤더가 없습니다. 브런치 write 페이지(/v1/article/temp 등) 요청의 cURL을 복사해주세요. " +
        "단순 조회 API는 csrf 토큰이 없을 수 있습니다.",
    )
  }

  return {
    cookie,
    csrfToken: csrf,
    savedAt: new Date().toISOString(),
  }
}

export const saveSession = (session: BrunchSession): void => {
  const path = getSessionPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(session, null, 2), "utf8")
}

export const loadSession = (): BrunchSession | null => {
  const envCookie = process.env.BRUNCH_COOKIE
  const envCsrf = process.env.BRUNCH_CSRF_TOKEN
  if (envCookie && envCsrf) {
    return { cookie: envCookie, csrfToken: envCsrf, savedAt: "env" }
  }

  const path = getSessionPath()
  if (!existsSync(path)) return null
  try {
    const raw = readFileSync(path, "utf8")
    const parsed = JSON.parse(raw) as BrunchSession
    if (!parsed.cookie || !parsed.csrfToken) return null
    return parsed
  } catch {
    return null
  }
}

export const sessionStatus = (): { exists: boolean; savedAt: string | null; source: "env" | "file" | "none" } => {
  if (process.env.BRUNCH_COOKIE && process.env.BRUNCH_CSRF_TOKEN) {
    return { exists: true, savedAt: null, source: "env" }
  }
  const session = loadSession()
  if (session) return { exists: true, savedAt: session.savedAt, source: "file" }
  return { exists: false, savedAt: null, source: "none" }
}
