import { Router } from "express"
import { fetchAllPosts, fetchPostBySlug } from "../ghost-client.js"
import type { GhostPost } from "../types.js"

export const ghostRoutes = Router()

let cachedPosts: GhostPost[] | null = null
let cacheTime = 0
const CACHE_TTL = 60_000

const getCachedPosts = async (): Promise<GhostPost[]> => {
  if (cachedPosts && Date.now() - cacheTime < CACHE_TTL) {
    return cachedPosts
  }
  cachedPosts = await fetchAllPosts()
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
