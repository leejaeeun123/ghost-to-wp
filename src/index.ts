import "dotenv/config"
import { fetchAllPosts, fetchPostBySlug } from "./ghost-client.js"
import { fetchWpUsers, findWpPostBySlug, createWpPost, findOrCreateWpTag } from "./wp-client.js"
import { transformGhostToWp } from "./html-transformer.js"
import { replaceImageUrls, uploadFeatureImage } from "./image-handler.js"
import { buildAuthorMappings, resolveAuthor } from "./author-filter.js"
import { mapCategories, extractWpTags } from "./category-mapper.js"
import type { GhostPost, SyncResult, SyncOptions } from "./types.js"

const parseArgs = (): SyncOptions => {
  const args = process.argv.slice(2)
  return {
    dryRun: args.includes("--dry-run"),
    all: args.includes("--all"),
    slug: args.find((_, i, a) => a[i - 1] === "--slug"),
    status: args.includes("--publish") ? "publish" : "draft",
  }
}

const log = (msg: string) => console.log(msg)
const divider = () => log("─".repeat(60))

const syncPost = async (
  post: GhostPost,
  authorMappings: ReturnType<typeof buildAuthorMappings>,
  options: SyncOptions
): Promise<SyncResult> => {
  const base = { slug: post.slug, title: post.title }

  const wpAuthorId = resolveAuthor(post.authors, authorMappings)
  if (wpAuthorId === null) {
    return {
      ...base,
      status: "skipped_no_author",
      reason: `Ghost 작성자 "${post.authors[0]?.name ?? "없음"}"이 WP에 없음`,
    }
  }

  if (!post.html) {
    return {
      ...base,
      status: "failed",
      reason: "Ghost 포스트에 HTML 본문이 없음",
    }
  }

  const existing = await findWpPostBySlug(post.slug)
  if (existing) {
    return {
      ...base,
      status: "skipped_duplicate",
      reason: `WP에 동일 slug 존재 (ID: ${existing.id})`,
    }
  }

  log(`  HTML 변환 중...`)
  const wpHtml = transformGhostToWp(post.html)

  log(`  이미지 처리 중... (${options.dryRun ? "dry-run" : "업로드"})`)
  const { html: finalHtml, uploadedCount } = await replaceImageUrls(wpHtml, options.dryRun)
  log(`  이미지 ${uploadedCount}개 처리`)

  log(`  대표 이미지 처리 중...`)
  const featuredMediaId = await uploadFeatureImage(post.feature_image, options.dryRun)

  const categories = mapCategories(post.tags)
  const wpTagNames = extractWpTags(post.tags)

  log(`  카테고리: [${categories.join(", ")}]`)
  log(`  태그: [${wpTagNames.join(", ")}]`)

  if (options.dryRun) {
    log(`  [DRY-RUN] WP 포스트 생성 건너뜀`)
    return { ...base, status: "created", reason: "dry-run" }
  }

  const wpTagIds: number[] = []
  for (const tagName of wpTagNames) {
    const tagId = await findOrCreateWpTag(tagName)
    wpTagIds.push(tagId)
  }

  const cleanTitle = post.title.replace(/&lt;/g, "'").replace(/&gt;/g, "'").replace(/</g, "'").replace(/>/g, "'")
  const cleanExcerpt = (post.custom_excerpt ?? "").replace(/&lt;/g, "'").replace(/&gt;/g, "'").replace(/</g, "'").replace(/>/g, "'")

  const wpPost = await createWpPost({
    title: cleanTitle,
    content: finalHtml,
    excerpt: cleanExcerpt,
    status: options.status,
    date: post.published_at,
    categories,
    tags: wpTagIds,
    featured_media: featuredMediaId,
    author: wpAuthorId,
  })

  return { ...base, status: "created", wpPostId: wpPost.id }
}

const main = async () => {
  const options = parseArgs()

  log("")
  log("Ghost → WordPress 아티클 동기화")
  divider()
  log(`모드: ${options.dryRun ? "DRY-RUN (미리보기)" : "실제 동기화"}`)
  log(`상태: ${options.status}`)
  if (options.slug) log(`대상: ${options.slug}`)
  divider()

  log("\n[1/3] Ghost 포스트 로딩...")
  let posts: GhostPost[]

  if (options.slug) {
    const post = await fetchPostBySlug(options.slug)
    if (!post) {
      log(`  오류: slug "${options.slug}" 포스트를 찾을 수 없습니다.`)
      process.exit(1)
    }
    posts = [post]
  } else {
    posts = await fetchAllPosts()
  }
  log(`  Ghost 포스트 ${posts.length}개 로드 완료`)

  log("\n[2/3] WP 사용자 로딩 + 작성자 매핑...")
  const wpUsers = await fetchWpUsers()
  log(`  WP 사용자 ${wpUsers.length}명 로드`)

  const allGhostAuthors = posts.flatMap((p) => p.authors)
  const uniqueAuthors = [...new Map(allGhostAuthors.map((a) => [a.slug, a])).values()]
  const authorMappings = buildAuthorMappings(uniqueAuthors, wpUsers)

  log(`  작성자 매핑: ${authorMappings.length}/${uniqueAuthors.length}명`)
  for (const m of authorMappings) {
    log(`    ${m.ghostName} (Ghost) → ${m.wpUsername} (WP, ID:${m.wpUserId})`)
  }

  const unmapped = uniqueAuthors.filter(
    (a) => !authorMappings.find((m) => m.ghostSlug === a.slug)
  )
  if (unmapped.length > 0) {
    log(`  매핑 안 됨 (이전 제외):`)
    for (const a of unmapped) {
      log(`    ${a.name} (${a.slug})`)
    }
  }

  log("\n[3/3] 포스트 동기화...")
  divider()

  const results: SyncResult[] = []

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i]
    log(`\n[${i + 1}/${posts.length}] "${post.title}" (${post.slug})`)

    try {
      const result = await syncPost(post, authorMappings, options)
      results.push(result)

      if (result.status === "created") {
        log(`  --> 성공${result.wpPostId ? ` (WP ID: ${result.wpPostId})` : ""}`)
      } else {
        log(`  --> ${result.status}: ${result.reason}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      results.push({ slug: post.slug, title: post.title, status: "failed", reason: msg })
      log(`  --> 실패: ${msg}`)
    }
  }

  divider()
  log("\n결과 요약")
  divider()

  const created = results.filter((r) => r.status === "created")
  const skippedDupe = results.filter((r) => r.status === "skipped_duplicate")
  const skippedAuth = results.filter((r) => r.status === "skipped_no_author")
  const failed = results.filter((r) => r.status === "failed")

  log(`  생성: ${created.length}건`)
  log(`  스킵 (중복): ${skippedDupe.length}건`)
  log(`  스킵 (작성자 미등록): ${skippedAuth.length}건`)
  log(`  실패: ${failed.length}건`)

  if (failed.length > 0) {
    log("\n실패 상세:")
    for (const f of failed) {
      log(`  - ${f.title}: ${f.reason}`)
    }
  }

  log("")
}

main().catch((err) => {
  console.error("치명적 오류:", err)
  process.exit(1)
})
