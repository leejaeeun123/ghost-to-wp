import { Router } from "express"
import { fetchPostBySlug } from "../ghost-client.js"
import { fetchWpUsers, findWpPostBySlug, createWpPost, findOrCreateWpTag, setYoastMeta } from "../wp-client.js"
import { transformGhostToWp } from "../html-transformer.js"
import { replaceImageUrls, uploadFeatureImage } from "../image-handler.js"
import { buildAuthorMappings, resolveAuthor } from "../author-filter.js"
import { mapCategories, extractWpTags } from "../category-mapper.js"
import { generateEnglishSlug } from "../slug-generator.js"
import { findNotionArticle } from "../notion-client.js"
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

/** 기준일의 직전 금요일 계산 (ex. 4/13 일 → 4/10 금) */
const getPreviousFriday = (dateStr: string): string => {
  const d = new Date(dateStr)
  const day = d.getDay() // 0=일, 5=금
  const daysBack = (day + 2) % 7 || 7 // 금요일이면 7일 전
  d.setDate(d.getDate() - daysBack)
  return d.toISOString()
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

  const isGray = post.tags.some((t) => t.name === "그레이" || t.slug === "gray")

  const wpHtml = transformGhostToWp(post.html, wpAuthorId ?? undefined)
  const { html: finalHtml } = await replaceImageUrls(wpHtml, false)
  const featuredMediaId = await uploadFeatureImage(post.feature_image, false, isGray)
  const categories = mapCategories(post.tags)
  const wpTagNames = extractWpTags(post.tags)

  const wpTagIds: number[] = []
  for (const name of wpTagNames) {
    wpTagIds.push(await findOrCreateWpTag(name))
  }

  const excerpt = post.custom_excerpt
    ? splitToTwoLines(cleanText(post.custom_excerpt))
    : ""

  const englishSlug = await generateEnglishSlug(post.title, post.slug)

  // Notion 아티클 로드맵 조회 (바이럴멘트, 발행일)
  const notionArticle = await findNotionArticle(post.slug)
  if (notionArticle) {
    console.log(`  Notion 매칭: "${notionArticle.title}" (${notionArticle.status})`)
  }

  // 발행일: Notion 발행일 > 스케줄 > 직전 금요일
  const wpDate = status === "future" && scheduleDate
    ? scheduleDate
    : notionArticle?.publishDate ?? getPreviousFriday(post.published_at)

  const wpPost = await createWpPost({
    title: splitToTwoLines(cleanText(post.title)),
    slug: englishSlug,
    content: finalHtml,
    excerpt,
    status,
    date: wpDate,
    categories,
    tags: wpTagIds,
    featured_media: featuredMediaId,
    author: wpAuthorId,
  })

  // SEO + 소셜 메타 설정
  // 메타 설명: Notion 바이럴멘트 > Ghost excerpt > 빈값
  const metaDesc = notionArticle?.viralMent
    ? `${cleanText(notionArticle.viralMent)} |`
    : post.custom_excerpt ? `${cleanText(post.custom_excerpt)} |` : ""
  const primaryTag = post.tags[0]?.name ?? ""
  const socialTitle = "%%title%% %%sep%% %%sitename%% %%primary_category%%"
  const featureImageUrl = post.feature_image ?? ""

  await setYoastMeta(wpPost.id, {
    _yoast_wpseo_focuskw: primaryTag,
    _yoast_wpseo_metadesc: metaDesc,
    "_yoast_wpseo_opengraph-image": featureImageUrl,
    "_yoast_wpseo_opengraph-title": socialTitle,
    "_yoast_wpseo_opengraph-description": metaDesc,
    "_yoast_wpseo_twitter-image": featureImageUrl,
    "_yoast_wpseo_twitter-title": socialTitle,
    "_yoast_wpseo_twitter-description": metaDesc,
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
