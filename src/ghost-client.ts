import jwt from "jsonwebtoken"
import type { GhostPost } from "./types.js"

const getGhostConfig = () => {
  const apiUrl = process.env.GHOST_API_URL
  const adminKey = process.env.GHOST_ADMIN_API_KEY

  if (!apiUrl || !adminKey) {
    throw new Error("환경변수 누락: GHOST_API_URL, GHOST_ADMIN_API_KEY")
  }

  const [id, secret] = adminKey.split(":")
  if (!id || !secret) {
    throw new Error("GHOST_ADMIN_API_KEY 형식 오류 — {id}:{secret} 형식이어야 합니다")
  }

  return { apiUrl, id, secret }
}

/** Ghost Admin API JWT 토큰 생성 (5분 유효) */
const createGhostToken = (): string => {
  const { id, secret } = getGhostConfig()

  const iat = Math.floor(Date.now() / 1000)
  const header = { alg: "HS256" as const, typ: "JWT", kid: id }
  const payload = { iat, exp: iat + 300, aud: "/admin/" }

  return jwt.sign(payload, Buffer.from(secret, "hex"), { header })
}

const ghostFetch = async <T>(path: string): Promise<T> => {
  const { apiUrl } = getGhostConfig()
  const token = createGhostToken()

  const res = await fetch(`${apiUrl}/ghost/api/admin/${path}`, {
    headers: { Authorization: `Ghost ${token}` },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Ghost API 오류 (${res.status}): ${body}`)
  }

  return res.json() as Promise<T>
}

/** published 포스트 전체 조회 (페이지네이션 자동 처리) */
export const fetchAllPosts = async (): Promise<GhostPost[]> => {
  const allPosts: GhostPost[] = []
  let page = 1
  const limit = 50

  while (true) {
    const data = await ghostFetch<{
      posts: GhostPost[]
      meta: { pagination: { pages: number } }
    }>(`posts/?include=tags,authors&formats=html&limit=${limit}&page=${page}&filter=status:published`)

    allPosts.push(...data.posts)

    if (page >= data.meta.pagination.pages) break
    page++
  }

  return allPosts
}

/** 특정 slug의 포스트 조회 */
export const fetchPostBySlug = async (slug: string): Promise<GhostPost | null> => {
  try {
    const data = await ghostFetch<{ posts: GhostPost[] }>(
      `posts/slug/${slug}/?include=tags,authors&formats=html`
    )
    return data.posts[0] ?? null
  } catch {
    return null
  }
}
