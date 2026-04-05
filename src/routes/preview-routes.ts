import { Router } from "express"
import { fetchPostBySlug } from "../ghost-client.js"
import { fetchWpUsers } from "../wp-client.js"
import { buildAuthorMappings, resolveAuthor } from "../author-filter.js"
import { transformGhostToWp } from "../html-transformer.js"
import { findNotionArticle } from "../notion-client.js"

export const previewRoutes = Router()

previewRoutes.post("/transform", async (req, res) => {
  try {
    const { slug } = req.body
    if (!slug) {
      res.status(400).json({ error: "slug 필수" })
      return
    }

    const post = await fetchPostBySlug(slug)
    if (!post) {
      res.status(404).json({ error: "포스트를 찾을 수 없습니다" })
      return
    }

    if (!post.html) {
      res.status(400).json({ error: "포스트에 HTML 본문이 없습니다" })
      return
    }

    const wpUsers = await fetchWpUsers()
    const unique = [...new Map(post.authors.map((a) => [a.slug, a])).values()]
    const mappings = buildAuthorMappings(unique, wpUsers)
    const wpAuthorId = resolveAuthor(post.authors, mappings)

    const wpHtml = transformGhostToWp(post.html, wpAuthorId ?? undefined)

    const imagePattern = /src="(https?:\/\/[^"]+\.(jpg|jpeg|png|gif|webp|svg)[^"]*)"/gi
    const images: string[] = []
    let match: RegExpExecArray | null
    while ((match = imagePattern.exec(post.html)) !== null) {
      images.push(match[1])
    }

    // Notion 아티클 로드맵 조회
    const notionArticle = await findNotionArticle(slug)

    res.json({
      title: post.title,
      ghostHtml: post.html,
      wpHtml,
      images,
      featureImage: post.feature_image,
      notion: notionArticle,
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})
