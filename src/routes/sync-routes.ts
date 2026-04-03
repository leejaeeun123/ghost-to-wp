import { Router } from "express"
import { fetchPostBySlug } from "../ghost-client.js"
import { fetchWpUsers, findWpPostBySlug, createWpPost, findOrCreateWpTag } from "../wp-client.js"
import { transformGhostToWp } from "../html-transformer.js"
import { replaceImageUrls, uploadFeatureImage } from "../image-handler.js"
import { buildAuthorMappings, resolveAuthor } from "../author-filter.js"
import { mapCategories, extractWpTags } from "../category-mapper.js"
import type { GhostPost, SyncResult } from "../types.js"

export const syncRoutes = Router()

const cleanText = (text: string): string =>
  text.replace(/&lt;/g, "\u2018").replace(/&gt;/g, "\u2019").replace(/<br\s*\/?>/gi, "<<BR>>").replace(/</g, "\u2018").replace(/>/g, "\u2019").replace(/<<BR>>/g, "<br>")

/** 텍스트를 중간 공백 기준으로 두 줄로 분리 (<br> 삽입) */
const splitToTwoLines = (text: string): string => {
  if (!text || text.includes("<br")) return text
  const trimmed = text.trim()
  const spaces: number[] = []
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === " ") spaces.push(i)
  }
  if (spaces.length === 0) return trimmed
  const mid = trimmed.length / 2
  const best = spaces.reduce((a, b) => Math.abs(a - mid) < Math.abs(b - mid) ? a : b)
  return trimmed.substring(0, best) + " <br>" + trimmed.substring(best + 1)
}

const syncOnePost = async (
  post: GhostPost,
  status: "draft" | "publish" | "future",
  scheduleDate?: string
): Promise<SyncResult> => {
  const base = { slug: post.slug, title: post.title }

  const wpUsers = await fetchWpUsers()
  const unique = [...new Map(post.authors.map((a) => [a.slug, a])).values()]
  const mappings = buildAuthorMappings(unique, wpUsers)
  const wpAuthorId = resolveAuthor(post.authors, mappings)

  if (wpAuthorId === null) {
    return { ...base, status: "skipped_no_author", reason: `작성자 "${post.authors[0]?.name}" WP 미등록` }
  }

  if (!post.html) {
    return { ...base, status: "failed", reason: "HTML 본문 없음" }
  }

  const existing = await findWpPostBySlug(post.slug)
  if (existing) {
    return { ...base, status: "skipped_duplicate", reason: `WP ID: ${existing.id}` }
  }

  const wpHtml = transformGhostToWp(post.html, wpAuthorId ?? undefined)
  const { html: finalHtml } = await replaceImageUrls(wpHtml, false)
  const featuredMediaId = await uploadFeatureImage(post.feature_image, false)
  const categories = mapCategories(post.tags)
  const wpTagNames = extractWpTags(post.tags)

  const wpTagIds: number[] = []
  for (const name of wpTagNames) {
    wpTagIds.push(await findOrCreateWpTag(name))
  }

  const excerpt = post.custom_excerpt
    ? `${splitToTwoLines(cleanText(post.custom_excerpt))} |`
    : ""

  const wpPost = await createWpPost({
    title: splitToTwoLines(cleanText(post.title)),
    slug: post.slug,
    content: finalHtml,
    excerpt,
    status,
    date: status === "future" && scheduleDate ? scheduleDate : post.published_at,
    categories,
    tags: wpTagIds,
    featured_media: featuredMediaId,
    author: wpAuthorId,
  })

  return { ...base, status: "created", wpPostId: wpPost.id }
}

syncRoutes.post("/single", async (req, res) => {
  try {
    const { slug, status = "draft", date } = req.body
    if (!slug) { res.status(400).json({ error: "slug 필수" }); return }

    const post = await fetchPostBySlug(slug)
    if (!post) { res.status(404).json({ error: "포스트 없음" }); return }

    const result = await syncOnePost(post, status, date)
    res.json({ result })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

syncRoutes.post("/batch", async (req, res) => {
  try {
    const { slugs, status = "draft" } = req.body
    if (!Array.isArray(slugs) || slugs.length === 0) {
      res.status(400).json({ error: "slugs 배열 필수" }); return
    }

    const results: SyncResult[] = []
    for (const slug of slugs) {
      try {
        const post = await fetchPostBySlug(slug)
        if (!post) {
          results.push({ slug, title: slug, status: "failed", reason: "포스트 없음" })
          continue
        }
        results.push(await syncOnePost(post, status))
      } catch (err) {
        results.push({ slug, title: slug, status: "failed", reason: err instanceof Error ? err.message : String(err) })
      }
    }
    res.json({ results })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})
