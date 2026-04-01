import { Router } from "express"
import { fetchAllPosts, fetchPostBySlug } from "../ghost-client.js"
import { fetchWpUsers } from "../wp-client.js"
import { buildAuthorMappings } from "../author-filter.js"
import type { GhostPost } from "../types.js"

export const ghostRoutes = Router()

let cachedPosts: GhostPost[] | null = null
let cacheTime = 0
const CACHE_TTL = 60_000

const getCachedPosts = async (): Promise<GhostPost[]> => {
  if (cachedPosts && Date.now() - cacheTime < CACHE_TTL) {
    return cachedPosts
  }
  const allPosts = await fetchAllPosts()
  const wpUsers = await fetchWpUsers()
  const allAuthors = [...new Map(allPosts.flatMap((p) => p.authors).map((a) => [a.slug, a])).values()]
  const mappings = buildAuthorMappings(allAuthors, wpUsers)
  const mappedSlugs = new Set(mappings.map((m) => m.ghostSlug))

  cachedPosts = allPosts.filter((p) => p.authors.some((a) => mappedSlugs.has(a.slug)))
  cacheTime = Date.now()
  return cachedPosts
}

ghostRoutes.get("/posts", async (_req, res) => {
  try {
    const { author, after, before } = _req.query
    let posts = await getCachedPosts()

    if (author) {
      posts = posts.filter((p) =>
        p.authors.some((a) => a.slug === author || a.name === author)
      )
    }
    if (after) {
      const afterDate = new Date(after as string)
      posts = posts.filter((p) => new Date(p.published_at) >= afterDate)
    }
    if (before) {
      const beforeDate = new Date(before as string)
      posts = posts.filter((p) => new Date(p.published_at) <= beforeDate)
    }

    res.json({ posts, total: posts.length })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

ghostRoutes.get("/posts/:slug", async (req, res) => {
  try {
    const post = await fetchPostBySlug(req.params.slug)
    if (!post) {
      res.status(404).json({ error: "포스트를 찾을 수 없습니다" })
      return
    }
    res.json({ post })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

/** 캐시 무효화 (수동) */
ghostRoutes.post("/cache/clear", (_req, res) => {
  cachedPosts = null
  cacheTime = 0
  res.json({ ok: true })
})
