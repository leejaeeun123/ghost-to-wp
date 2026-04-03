import type { WpPost, WpUser, WpMediaUpload } from "./types.js"

const getWpConfig = () => {
  const apiUrl = process.env.WP_API_URL
  const username = process.env.WP_USERNAME
  const appPassword = process.env.WP_APP_PASSWORD

  if (!apiUrl || !username || !appPassword) {
    throw new Error("환경변수 누락: WP_API_URL, WP_USERNAME, WP_APP_PASSWORD")
  }

  const credentials = Buffer.from(`${username}:${appPassword}`).toString("base64")
  return { apiUrl, credentials }
}

const wpFetch = async <T>(
  path: string,
  options: RequestInit = {}
): Promise<T> => {
  const { apiUrl, credentials } = getWpConfig()

  const res = await fetch(`${apiUrl}/wp-json/wp/v2/${path}`, {
    ...options,
    headers: {
      Authorization: `Basic ${credentials}`,
      ...options.headers,
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`WP API 오류 (${res.status}): ${body}`)
  }

  return res.json() as Promise<T>
}

/** WP 사용자 목록 조회 */
export const fetchWpUsers = async (): Promise<WpUser[]> => {
  const allUsers: WpUser[] = []
  let page = 1

  while (true) {
    const users = await wpFetch<WpUser[]>(`users?per_page=100&page=${page}`)
    allUsers.push(...users)
    if (users.length < 100) break
    page++
  }

  return allUsers
}

/** slug으로 기존 포스트 존재 여부 확인 */
export const findWpPostBySlug = async (slug: string): Promise<WpPost | null> => {
  const posts = await wpFetch<WpPost[]>(`posts?slug=${encodeURIComponent(slug)}&status=any`)
  return posts[0] ?? null
}

/** WP 포스트 생성 */
export const createWpPost = async (params: {
  title: string
  slug?: string
  content: string
  excerpt?: string
  status?: "draft" | "publish" | "future"
  date?: string
  categories?: number[]
  tags?: number[]
  featured_media?: number
  author?: number
}): Promise<WpPost> => {
  return wpFetch<WpPost>("posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: params.title,
      slug: params.slug,
      content: params.content,
      excerpt: params.excerpt ?? "",
      status: params.status ?? "draft",
      date: params.date,
      categories: params.categories ?? [],
      tags: params.tags ?? [],
      featured_media: params.featured_media ?? 0,
      author: params.author,
    }),
  })
}

/** WP 미디어 업로드 (이미지) */
export const uploadWpMedia = async (
  imageBuffer: Buffer,
  filename: string,
  mimeType: string
): Promise<WpMediaUpload> => {
  const { apiUrl, credentials } = getWpConfig()

  const res = await fetch(`${apiUrl}/wp-json/wp/v2/media`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      "Content-Type": mimeType,
    },
    body: new Uint8Array(imageBuffer),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`WP 미디어 업로드 실패 (${res.status}): ${body}`)
  }

  return res.json() as Promise<WpMediaUpload>
}

/** WP 태그 생성 (없으면 생성, 있으면 기존 반환) */
export const findOrCreateWpTag = async (name: string): Promise<number> => {
  const existing = await wpFetch<{ id: number }[]>(
    `tags?search=${encodeURIComponent(name)}&per_page=10`
  )
  const match = existing.find(
    (t) => t.id && name.toLowerCase() === (t as unknown as { name: string }).name?.toLowerCase()
  )
  if (match) return match.id

  try {
    const created = await wpFetch<{ id: number }>("tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
    return created.id
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const termIdMatch = msg.match(/"term_id":(\d+)/)
    if (termIdMatch) return Number(termIdMatch[1])
    throw err
  }
}
