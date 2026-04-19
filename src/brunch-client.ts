import { writeFileSync } from "node:fs"
import type { BrunchSession } from "./brunch-session.js"
import type {
  BrunchCoverImage,
  BrunchOpengraphData,
} from "./blog-format/brunch-types.js"

const API_BASE = "https://api.brunch.co.kr"
const REFERER = "https://brunch.co.kr/write"
const ORIGIN = "https://brunch.co.kr"

export class BrunchSessionExpiredError extends Error {
  constructor(message = "브런치 세션이 만료되었습니다. cURL을 다시 복사해 세션을 갱신해주세요.") {
    super(message)
    this.name = "BrunchSessionExpiredError"
  }
}

export interface BrunchKeyword {
  no: number
  keyword: string
}

export interface BrunchPublishPayload {
  title: string
  subTitle: string
  content: string
  contentSummary: string
  images: Array<BrunchCoverImage & { type: "cover" }>
  videos: unknown[]
  keywords: Array<BrunchKeyword & { sequence: number }>
  commentWritable: boolean
  membershipPromotionEnabled: boolean
  profileId: string
  /** 예약발행: "reserved" */
  status: "reserved"
  /** UNIX ms (예약발행 시점) */
  publishRequestTime: number
  articleNo: number
}

export interface BrunchImmediatePayload {
  title: string
  subTitle: string
  content: string
  contentSummary: string
  images: Array<BrunchCoverImage & { type: "cover" }>
  videos: unknown[]
  keywords: Array<BrunchKeyword & { sequence: number }>
  commentWritable: boolean
  profileId: string
}

export interface BrunchNewReservedPayload {
  title: string
  subTitle: string
  content: string
  contentSummary: string
  images: Array<BrunchCoverImage & { type: "cover" }>
  videos: unknown[]
  keywords: Array<BrunchKeyword & { sequence: number }>
  commentWritable: boolean
  membershipPromotionEnabled: boolean
  profileId: string
  publishRequestTime: number
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"

const baseHeaders = (session: BrunchSession): Record<string, string> => ({
  accept: "application/json, text/javascript, */*; q=0.01",
  "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  origin: ORIGIN,
  referer: REFERER,
  "user-agent": USER_AGENT,
  "sec-ch-ua": '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-site",
  "x-csrf-token": session.csrfToken,
  cookie: session.cookie,
})

const unwrap = (json: unknown): unknown => {
  if (json && typeof json === "object" && "data" in (json as Record<string, unknown>)) {
    return (json as { data: unknown }).data
  }
  return json
}

const callJson = async <T = unknown>(
  session: BrunchSession,
  path: string,
  init: RequestInit,
): Promise<T> => {
  const res = await fetch(`${API_BASE}${path}`, init)
  if (res.status === 401 || res.status === 403) {
    throw new BrunchSessionExpiredError()
  }
  const text = await res.text()
  let parsed: unknown
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    throw new Error(`브런치 API 응답을 JSON으로 해석할 수 없습니다: ${text.slice(0, 200)}`)
  }
  if (!res.ok || (parsed && typeof parsed === "object" && (parsed as { code?: number }).code && (parsed as { code: number }).code >= 400)) {
    // 실패 시 요청 body를 디버그 파일로 덤프 (content 비교용)
    if (path.includes("/v1/article") && typeof init.body === "string") {
      try {
        const params = new URLSearchParams(init.body)
        const content = params.get("content")
        if (content) {
          writeFileSync(`${process.cwd()}/brunch-failed-content.html`, content, "utf8")
        }
        // 전체 payload도 덤프 (content 외 필드 확인용)
        const allFields: Record<string, string> = {}
        for (const k of params.keys()) {
          const v = params.get(k) ?? ""
          allFields[k] = v.length > 500 ? `[len=${v.length}] ${v.slice(0, 300)}...` : v
        }
        writeFileSync(
          `${process.cwd()}/brunch-failed-payload.json`,
          JSON.stringify({ path, fields: allFields }, null, 2),
          "utf8",
        )
      } catch {}
    }
    const code = (parsed as { code?: number })?.code ?? res.status
    throw new Error(`브런치 API ${path} 실패 (HTTP ${code}): ${JSON.stringify(parsed).slice(0, 300)}`)
  }
  return unwrap(parsed) as T
}

const urlencoded = (fields: Record<string, string | number>): string => {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(fields)) params.append(k, String(v))
  return params.toString()
}

/**
 * temp 저장 — 응답에 articleNo가 없으면 `/v1/article/temp/0` GET으로 현재 WIP의 articleNo 조회.
 */
export const tempCreate = async (
  session: BrunchSession,
  content: string,
  articleNo = 0,
): Promise<{ articleNo: number }> => {
  const body = urlencoded({ content, articleNo })
  const data = await callJson<{ articleNo?: number } | number | null>(
    session,
    "/v1/article/temp",
    {
      method: "POST",
      headers: {
        ...baseHeaders(session),
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body,
    },
  )

  // 1) body에 articleNo가 들어있는 경우
  if (data && typeof data === "object" && typeof (data as { articleNo?: unknown }).articleNo === "number") {
    return { articleNo: (data as { articleNo: number }).articleNo }
  }
  // 2) data가 숫자 그 자체
  if (typeof data === "number") {
    return { articleNo: data }
  }
  // 3) 이미 articleNo를 알고 있었으면 그대로 사용 (update)
  if (articleNo > 0) {
    return { articleNo }
  }
  // 4) 응답에 없으면 여러 폴백 엔드포인트 시도
  const probes: Array<{ label: string; path: string }> = [
    { label: "temp/0", path: "/v1/article/temp/0" },
    { label: "my articles", path: "/v1/article/@antiegg" },
    { label: "history/new", path: "/v1/history/new" },
    { label: "brunchbook draft", path: "/v1/brunchbook/@antiegg/draft" },
  ]
  const probeResults: Record<string, unknown> = {}
  for (const p of probes) {
    try {
      const r = await callJson<unknown>(session, p.path, {
        method: "GET",
        headers: baseHeaders(session),
      })
      probeResults[p.label] = r
      const found = deepFindArticleNo(r)
      if (found > 0) return { articleNo: found }
    } catch (e) {
      probeResults[p.label] = `(error) ${e instanceof Error ? e.message : String(e)}`
    }
  }

  // 디버깅용: 모든 probe 응답을 파일로 덤프
  const dumpPath = `${process.cwd()}/brunch-articleno-debug.json`
  try {
    writeFileSync(dumpPath, JSON.stringify({ tempResponse: data, probes: probeResults }, null, 2), "utf8")
  } catch {}
  throw new Error(
    `temp 저장은 성공했지만 articleNo를 찾지 못했습니다. 디버그 덤프: ${dumpPath}. ` +
      `tempResponse=${JSON.stringify(data)}`,
  )
}

/** 객체 트리에서 articleNo (숫자, 0 초과) 재귀 탐색 */
const deepFindArticleNo = (v: unknown, depth = 0): number => {
  if (depth > 5 || v == null) return 0
  if (typeof v === "number" && v > 0) return 0 // 최상위 숫자는 무시 (컨텍스트 모름)
  if (Array.isArray(v)) {
    for (const item of v) {
      const n = deepFindArticleNo(item, depth + 1)
      if (n > 0) return n
    }
    return 0
  }
  if (typeof v === "object") {
    const rec = v as Record<string, unknown>
    if (typeof rec.articleNo === "number" && rec.articleNo > 0) return rec.articleNo
    if (typeof rec.no === "number" && rec.no > 0 && (rec.status === "draft" || rec.type === "article" || rec.articleTitle)) {
      return rec.no
    }
    for (const key of Object.keys(rec)) {
      const n = deepFindArticleNo(rec[key], depth + 1)
      if (n > 0) return n
    }
  }
  return 0
}

const pickArticleNo = (obj: unknown): number => {
  if (!obj || typeof obj !== "object") return 0
  const rec = obj as Record<string, unknown>
  if (typeof rec.articleNo === "number") return rec.articleNo
  if (typeof rec.no === "number") return rec.no
  if (rec.article && typeof (rec.article as Record<string, unknown>).articleNo === "number") {
    return (rec.article as { articleNo: number }).articleNo
  }
  return 0
}

export const tempDelete = async (session: BrunchSession, articleNo: number): Promise<void> => {
  await callJson(session, `/v1/article/temp/${articleNo}`, {
    method: "DELETE",
    headers: baseHeaders(session),
  })
}

export const publishArticle = async (
  session: BrunchSession,
  payload: BrunchPublishPayload,
): Promise<void> => {
  const body = urlencoded({
    title: payload.title,
    subTitle: payload.subTitle,
    content: payload.content,
    contentSummary: payload.contentSummary,
    images: JSON.stringify(payload.images),
    videos: JSON.stringify(payload.videos),
    keywords: JSON.stringify(payload.keywords),
    commentWritable: String(payload.commentWritable),
    publishRequestTime: payload.publishRequestTime,
    membershipPromotionEnabled: String(payload.membershipPromotionEnabled),
    profileId: payload.profileId,
    status: payload.status,
    articleNo: payload.articleNo,
  })
  const path = `/v1/article/${payload.articleNo}`
  const options = {
    method: "POST" as const,
    headers: {
      ...baseHeaders(session),
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body,
  }
  // 500 "잠시 후 다시 시도" 대응: 3회까지 재시도, 지수 백오프
  let lastErr: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await callJson(session, path, options)
      return
    } catch (err) {
      lastErr = err
      const msg = err instanceof Error ? err.message : String(err)
      if (!/500|일시적|잠시 후|HTTP 5\d\d/.test(msg)) break
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
    }
  }
  throw lastErr
}

/**
 * 즉시발행 — HAR 실측: POST /v1/article (articleNo 없음), status="publish".
 * 예약과 달리 path에 articleNo 없음, body에도 articleNo/publishRequestTime/membershipPromotionEnabled 제외.
 * 응답에서 새로 발행된 articleNo 반환.
 */
export const publishArticleImmediate = async (
  session: BrunchSession,
  payload: BrunchImmediatePayload,
): Promise<{ articleNo: number }> => {
  const body = urlencoded({
    title: payload.title,
    subTitle: payload.subTitle,
    content: payload.content,
    contentSummary: payload.contentSummary,
    images: JSON.stringify(payload.images),
    videos: JSON.stringify(payload.videos),
    keywords: JSON.stringify(payload.keywords),
    commentWritable: String(payload.commentWritable),
    profileId: payload.profileId,
    status: "publish",
  })
  const data = await callJson<unknown>(session, "/v1/article", {
    method: "POST",
    headers: {
      ...baseHeaders(session),
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body,
  })
  const articleNo = findArticleNoInResponse(data)
  if (articleNo > 0) return { articleNo }
  // 폴백: 최근 발행 목록에서 title 일치 항목(없으면 max no) 조회
  try {
    const recent = await callJson<unknown>(
      session,
      `/v1/article/@${payload.profileId}?status=published`,
      { method: "GET", headers: baseHeaders(session) },
    )
    const matched = pickArticleNoByTitle(recent, payload.title)
    if (matched > 0) return { articleNo: matched }
  } catch {}
  throw new Error("즉시발행 성공했지만 articleNo를 찾지 못했습니다.")
}

/**
 * 신규 예약발행 — POST /v1/article (articleNo 없음), status="reserved".
 * 기존 `publishArticle`은 path에 articleNo가 필요해 이미 생성된 draft에만 쓰지만,
 * 이 함수는 즉시발행과 동일하게 새 아티클을 생성하면서 reserved로 등록.
 */
export const publishArticleReservedNew = async (
  session: BrunchSession,
  payload: BrunchNewReservedPayload,
): Promise<{ articleNo: number }> => {
  const body = urlencoded({
    title: payload.title,
    subTitle: payload.subTitle,
    content: payload.content,
    contentSummary: payload.contentSummary,
    images: JSON.stringify(payload.images),
    videos: JSON.stringify(payload.videos),
    keywords: JSON.stringify(payload.keywords),
    commentWritable: String(payload.commentWritable),
    publishRequestTime: payload.publishRequestTime,
    membershipPromotionEnabled: String(payload.membershipPromotionEnabled),
    profileId: payload.profileId,
    status: "reserved",
  })
  const data = await callJson<unknown>(session, "/v1/article", {
    method: "POST",
    headers: {
      ...baseHeaders(session),
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body,
  })
  const articleNo = findArticleNoInResponse(data)
  if (articleNo > 0) return { articleNo }
  // 폴백: 최근 예약발행 목록에서 title 일치 항목(없으면 max no) 조회
  try {
    const recent = await callJson<unknown>(
      session,
      `/v1/article/@${payload.profileId}?status=reserved`,
      { method: "GET", headers: baseHeaders(session) },
    )
    const matched = pickArticleNoByTitle(recent, payload.title)
    if (matched > 0) return { articleNo: matched }
  } catch {}
  throw new Error("예약발행 성공했지만 articleNo를 찾지 못했습니다.")
}

/**
 * 브런치 `/v1/article/@{profileId}?status=...` 응답에서 title이 일치하는 항목의 no 반환.
 * 일치 항목 없으면 max no 반환(fallback).
 */
const pickArticleNoByTitle = (data: unknown, title: string): number => {
  const list = extractArticleList(data)
  if (list.length === 0) return 0
  const normalize = (s: string) => s.trim().replace(/\s+/g, " ")
  const target = normalize(title)
  const match = list.find((it) => normalize(String(it.title ?? "")) === target)
  if (match && typeof match.no === "number") return match.no
  // fallback: 가장 큰 no (브런치 articleNo는 auto-increment)
  let maxNo = 0
  for (const it of list) if (typeof it.no === "number" && it.no > maxNo) maxNo = it.no
  return maxNo
}

const extractArticleList = (v: unknown): Array<Record<string, unknown>> => {
  if (!v || typeof v !== "object") return []
  const rec = v as Record<string, unknown>
  const candidates: unknown[] = [
    rec.list,
    rec.data && typeof rec.data === "object" ? (rec.data as Record<string, unknown>).list : undefined,
  ]
  for (const c of candidates) {
    if (Array.isArray(c)) return c.filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
  }
  return []
}

/** 응답 트리에서 articleNo 또는 no(>0) 추출. articleNo 우선. */
const findArticleNoInResponse = (v: unknown, depth = 0): number => {
  if (depth > 6 || v == null) return 0
  if (Array.isArray(v)) {
    for (const item of v) {
      const n = findArticleNoInResponse(item, depth + 1)
      if (n > 0) return n
    }
    return 0
  }
  if (typeof v === "object") {
    const rec = v as Record<string, unknown>
    if (typeof rec.articleNo === "number" && rec.articleNo > 0) return rec.articleNo
    if (typeof rec.no === "number" && rec.no > 0) return rec.no
    for (const key of Object.keys(rec)) {
      const n = findArticleNoInResponse(rec[key], depth + 1)
      if (n > 0) return n
    }
  }
  return 0
}

/**
 * 브런치 /v2/upload — multipart. 실제 브런치는 x-csrf-token 없이 쿠키만으로 호출.
 * fileType="cover"는 커버 이미지용. articleNo는 가능하면 실제 값, 아니면 0.
 */
export const uploadImage = async (
  session: BrunchSession,
  buffer: Buffer,
  filename: string,
  mimeType: string,
  _articleNo = 0,
): Promise<{ url: string; width?: number; height?: number; raw: unknown }> => {
  // 실측 payload (HAR+DevTools): type=image, file=<binary> — 정확히 2개 필드
  const form = new FormData()
  form.append("type", "image")
  form.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType }), filename)

  const headers = baseHeaders(session)
  headers["accept"] = "*/*"

  const data = await callJson<Record<string, unknown>>(session, "/v2/upload", {
    method: "POST",
    headers,
    body: form,
  })
  const url =
    (data?.url as string | undefined) ||
    (data?.path as string | undefined) ||
    (data?.imageUrl as string | undefined) ||
    ((data?.data as Record<string, unknown> | undefined)?.url as string | undefined)
  if (!url) {
    throw new Error(
      `이미지 업로드 응답에서 URL을 찾을 수 없습니다: ${JSON.stringify(data).slice(0, 300)}`,
    )
  }
  return {
    url,
    width: typeof data.width === "number" ? data.width : undefined,
    height: typeof data.height === "number" ? data.height : undefined,
    raw: data,
  }
}

/**
 * 브런치 /v2/url/info — 실패하면 최소 fallback 데이터 반환.
 * 1회 재시도 후에도 실패 시 URL 그대로 title에 넣음.
 */
export const getUrlInfo = async (
  session: BrunchSession,
  url: string,
): Promise<BrunchOpengraphData> => {
  const q = new URLSearchParams({ url })
  const call = () =>
    callJson<Partial<BrunchOpengraphData>>(session, `/v2/url/info?${q.toString()}`, {
      method: "GET",
      headers: baseHeaders(session),
    })
  let data: Partial<BrunchOpengraphData> | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      data = await call()
      break
    } catch (err) {
      if (attempt === 1) {
        console.warn(`[brunch] url/info 실패 (${url}) — fallback 사용:`, err instanceof Error ? err.message : err)
      } else {
        await new Promise((r) => setTimeout(r, 500))
      }
    }
  }
  const hostname = (() => {
    try { return new URL(url).hostname.replace(/^www\./, "") } catch { return url }
  })()
  return {
    title: data?.title || hostname,
    description: data?.description || "",
    url: data?.url || url,
    canonicalUrl: data?.canonicalUrl || url,
    image: data?.image || "",
  }
}

export const keywordSuggest = async (
  session: BrunchSession,
  q: string,
): Promise<BrunchKeyword[]> => {
  const url = `/v1/keyword/suggest?${new URLSearchParams({ q }).toString()}`
  const data = await callJson<unknown>(session, url, {
    method: "GET",
    headers: baseHeaders(session),
  })
  if (Array.isArray(data)) return data as BrunchKeyword[]
  if (data && typeof data === "object" && Array.isArray((data as { list?: unknown[] }).list)) {
    return (data as { list: BrunchKeyword[] }).list
  }
  return []
}

export const keywordRecommend = async (
  session: BrunchSession,
  plainContent: string,
  articleNo = 0,
): Promise<{ raw: unknown; flat: BrunchKeyword[] }> => {
  const form = new FormData()
  form.append("plainContent", plainContent)
  form.append("articleNo", String(articleNo))
  const data = await callJson<unknown>(session, "/v1/keyword/recommend", {
    method: "POST",
    headers: baseHeaders(session),
    body: form,
  })
  const flat: BrunchKeyword[] = []
  const walk = (v: unknown): void => {
    if (!v) return
    if (Array.isArray(v)) return v.forEach(walk)
    if (typeof v === "object") {
      const obj = v as Record<string, unknown>
      if (typeof obj.keyword === "string" && typeof obj.no === "number") {
        flat.push({ no: obj.no, keyword: obj.keyword })
        return
      }
      for (const key of Object.keys(obj)) walk(obj[key])
    }
  }
  walk(data)
  return { raw: data, flat }
}
