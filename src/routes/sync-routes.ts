import { Router } from "express"
import { fetchPostBySlug } from "../ghost-client.js"
import { fetchWpUsers, findWpPostBySlug, createWpPost, findOrCreateWpTag, setYoastMeta } from "../wp-client.js"
import { transformGhostToWp } from "../html-transformer.js"
import { replaceImageUrls, uploadFeatureImage } from "../image-handler.js"
import { buildAuthorMappings, resolveAuthor } from "../author-filter.js"
import { mapCategories, extractWpTags, mapCategoriesFromNotion } from "../category-mapper.js"
import { generateEnglishSlug } from "../slug-generator.js"
import { findNotionArticle } from "../notion-client.js"
import type { GhostPost, SyncResult } from "../types.js"

export const syncRoutes = Router()

const cleanText = (text: string): string =>
  text.replace(/&lt;/g, "\u2018").replace(/&gt;/g, "\u2019").replace(/<br\s*\/?>/gi, "<<BR>>").replace(/</g, "\u2018").replace(/>/g, "\u2019").replace(/<<BR>>/g, "<br>")

/** 이모지/픽토그램 제거 */
const stripEmoji = (text: string): string =>
  text.replace(/\p{Extended_Pictographic}/gu, "").replace(/\s+/g, " ").trim()

/** maxLen 이내에서 마지막 완성 문장까지 자름 */
const truncateToLastSentence = (text: string, maxLen: number): string => {
  if (text.length <= maxLen) return text
  const sliced = text.slice(0, maxLen)
  const enders = [".", "!", "?", "。", "…", "”", "\""]
  let lastEnd = -1
  for (const e of enders) {
    const idx = sliced.lastIndexOf(e)
    if (idx > lastEnd) lastEnd = idx
  }
  if (lastEnd > 0) return sliced.slice(0, lastEnd + 1).trim()
  const lastSpace = sliced.lastIndexOf(" ")
  return (lastSpace > 0 ? sliced.slice(0, lastSpace) : sliced).trim()
}

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

export const syncOnePost = async (
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

  // Notion 아티클 로드맵 조회 (바이럴멘트, 발행일, 카테고리)
  const notionArticle = await findNotionArticle(post.slug)
  if (notionArticle) {
    console.log(`  Notion 매칭: "${notionArticle.title}" (${notionArticle.status})`)
  }

  // 그레이 판별: Notion 카테고리 우선, Ghost 태그 폴백
  const isGray = notionArticle?.categories.some((c) => c === "그레이" || c.toUpperCase() === "GRAY")
    ?? post.tags.some((t) => t.name === "그레이" || t.name.toUpperCase() === "GRAY" || t.slug.startsWith("gray"))

  const wpHtml = transformGhostToWp(post.html, wpAuthorId ?? undefined)
  const { html: finalHtml } = await replaceImageUrls(wpHtml, false)
  const featuredMediaId = await uploadFeatureImage(post.feature_image, false, isGray)

  // 카테고리: Notion 기준 (매거진+큐레이션+카테고리), Ghost 폴백
  const { categoryIds: categories, primaryId: primaryCategoryId } = notionArticle?.categories.length
    ? mapCategoriesFromNotion(notionArticle.categories)
    : { categoryIds: mapCategories(post.tags), primaryId: 0 }

  // 태그: Ghost 태그 + Notion 테마/키워드/기타
  const ghostTagNames = extractWpTags(post.tags)
  const notionTagNames = [
    ...(notionArticle?.themes ?? []),
    ...(notionArticle?.keywords ?? []),
    ...(notionArticle?.extras ?? []),
  ]
  const allTagNames = [...new Set([...ghostTagNames, ...notionTagNames])]

  const wpTagIds: number[] = []
  for (const name of allTagNames) {
    wpTagIds.push(await findOrCreateWpTag(name))
  }

  const excerpt = post.custom_excerpt
    ? splitToTwoLines(cleanText(post.custom_excerpt))
    : ""

  const englishSlug = await generateEnglishSlug(post.title, post.slug)

  // 발행일: Notion 발행일 > 스케줄 > 직전 금요일
  const rawDate = status === "future" && scheduleDate
    ? scheduleDate
    : notionArticle?.publishDate ?? getPreviousFriday(post.published_at)
  // Notion 날짜("2026-04-13")는 시간이 없어 WP가 거부 → KST 오전 7:50 발행
  const wpDate = rawDate.includes("T") ? rawDate : rawDate + "T07:50:00"

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
  // 초점 키프레이즈: 제목에 포함된 키워드 우선
  const titleClean = cleanText(post.title)
  const allKeywords = [...(notionArticle?.keywords ?? []), ...(notionArticle?.themes ?? []), ...post.tags.map((t) => t.name)]
  const focusKw = allKeywords.find((kw) => titleClean.includes(kw)) ?? allKeywords[0] ?? ""

  // 메타 설명: 부제목 | 바이럴멘트 (최대 140자)
  // - 바이럴멘트의 이모지는 삭제
  // - 글자 수 초과 시 바이럴멘트의 마지막 완성 문장까지 다듬어서 자름
  const subtitle = notionArticle?.subtitle ? cleanText(notionArticle.subtitle) : (post.custom_excerpt ? cleanText(post.custom_excerpt) : "")
  const viralRaw = notionArticle?.viralMent ? cleanText(notionArticle.viralMent) : ""
  const viralMent = stripEmoji(viralRaw)
  let metaDesc = ""
  if (subtitle && viralMent) {
    const full = `${subtitle} | ${viralMent}`
    metaDesc = truncateToLastSentence(full, 140)
  } else {
    metaDesc = truncateToLastSentence(subtitle || viralMent, 140)
  }

  const socialTitle = "%%title%% %%sep%% %%sitename%% %%primary_category%%"
  const featureImageUrl = post.feature_image ?? ""

  await setYoastMeta(wpPost.id, {
    _yoast_wpseo_focuskw: focusKw,
    _yoast_wpseo_metadesc: metaDesc,
    _yoast_wpseo_primary_category: String(primaryCategoryId),
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
