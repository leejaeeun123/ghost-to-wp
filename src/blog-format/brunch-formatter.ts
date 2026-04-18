import type { WeekArticle } from "./types.js"
import type {
  BrunchArticleDraft,
  BrunchBlock,
  BrunchFormatInput,
  BrunchInlineNode,
  BrunchTagCandidates,
  BrunchTextBlock,
} from "./brunch-types.js"
import {
  bold,
  buildBlankLine,
  buildCover,
  buildHr,
  buildOpengraph,
  buildParagraph,
  colored,
  extractPlainText,
  inline,
  inlineBr,
} from "./brunch-blocks.js"
import { renderDocument } from "./brunch-renderer.js"
import { extractIntroHtml } from "./intro-extractor.js"

const ANTIEGG_HOME_URL = "https://antiegg.kr/"
const ANTIEGG_ABOUT_URL = "https://antiegg.kr/about/"

const CATEGORY_GRAY_HEX = "#959595"
const EDITOR_NAME_HEX = "#f6665b"

/** 해시태그 헤딩 — <h2><b>#큐레이션_xx</b></h2> */
const hashtagHeadingBlock = (article: WeekArticle): BrunchTextBlock => {
  const tag =
    article.category === "그레이"
      ? "#그레이"
      : `#큐레이션${article.subCategoryName ? "_" + article.subCategoryName : ""}`
  return {
    type: "text",
    data: [bold(tag)],
    size: "h2",
  }
}

/** 카테고리 안내문 — 회색 */
const categoryIntroBlock = (article: WeekArticle): BrunchTextBlock => {
  const text =
    article.category === "그레이"
      ? "문화예술을 둘러싼 다양한 질문을 던지고 탐구합니다."
      : "문화예술계 내 유용한 정보들을 소개합니다."
  return buildParagraph(colored(text, CATEGORY_GRAY_HEX))
}

/** Edited by {이름} — 이름만 볼드+주황 */
const editedByBlock = (editorName: string): BrunchTextBlock => {
  const name = editorName || "(에디터 미상)"
  return buildParagraph([
    inline("Edited by "),
    colored(bold(name), EDITOR_NAME_HEX),
  ])
}

const ctaReadFullBlock = (): BrunchTextBlock =>
  buildParagraph([
    bold("이 아티클의 본문 내용이 궁금하신가요?"),
    inlineBr(),
    bold("링크를 클릭하면 바로 읽어보실 수 있습니다."),
  ])

const ctaMoreArticlesBlock = (): BrunchTextBlock =>
  buildParagraph([
    inline("이런 아티클은 어때요?"),
    inlineBr(),
    inline("더 많은 아티클은 ANTIEGG 사이트에서 확인하세요."),
  ])

const ctaAboutAntieggBlock = (): BrunchTextBlock =>
  buildParagraph([
    inline("하루에 한 번 신선한 영감을 얻을 수 있는 곳"),
    inlineBr(),
    inline("프리랜서 에디터 공동체 ANTIEGG가 궁금하다면?"),
  ])

/**
 * WP 서문 HTML → Brunch 문단 블록들.
 * MVP: `<p>` 추출 + `<br>` 줄바꿈 유지. 이미지/figure는 일단 제외 (재은님 워크플로우상 서문은 텍스트 위주).
 */
/** HTML entity 완전 디코드 — &#8220; 같은 숫자 entity도 포함 */
const decodeEntities = (s: string): string =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")

const introToBlocks = (introHtml: string): BrunchTextBlock[] => {
  if (!introHtml) return []
  const cleaned = introHtml.replace(/<!--[\s\S]*?-->/g, "")
  const out: BrunchTextBlock[] = []
  const pRe = /<p\b[^>]*>([\s\S]*?)<\/p>/gi
  let m: RegExpExecArray | null
  while ((m = pRe.exec(cleaned))) {
    const inner = m[1]
    const decoded = decodeEntities(
      inner.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""),
    )
    const lines = decoded.split("\n").map((s) => s.trim())
    const nodes: BrunchInlineNode[] = []
    let hasContent = false
    lines.forEach((line, i) => {
      if (i > 0) nodes.push(inlineBr())
      if (line) {
        nodes.push(inline(line))
        hasContent = true
      }
    })
    if (hasContent) out.push(buildParagraph(nodes))
  }
  return out
}

/** 태그 후보 선정 (테마 우선, 부족하면 키워드 보충 — 총 2개) */
const selectTagCandidates = (article: WeekArticle): BrunchTagCandidates => {
  const themes = (article.notionThemes || []).filter(Boolean)
  const keywords = (article.notionKeywords || []).filter(Boolean)
  if (themes.length >= 2) return { themes: themes.slice(0, 2), keywords: [] }
  if (themes.length === 1) return { themes: [themes[0]], keywords: keywords.slice(0, 1) }
  return { themes: [], keywords: keywords.slice(0, 2) }
}

const truncate = (text: string, max: number): string =>
  text.length <= max ? text : text.slice(0, max - 1) + "…"

/**
 * WeekArticle + IO 결과(커버 업로드 URL, OG 카드) → BrunchArticleDraft.
 * 순수 함수. IO는 publisher 책임.
 */
/**
 * 브런치가 새 글 생성 직후 보내는 최소 content와 동일한 placeholder.
 * cover_text(빈 커버) + 빈 <br> 문단. tempCreate 첫 호출 시 사용.
 */
export const BRUNCH_INITIAL_PLACEHOLDER =
  '<div class="wrap_cover cover_init"><div class="cover_item cover_direction_left cover_text" ' +
  'data-app="{&quot;type&quot;:&quot;cover&quot;,&quot;kind&quot;:&quot;cover_text&quot;,&quot;align&quot;:&quot;left&quot;,' +
  '&quot;title&quot;:{&quot;style&quot;:{},&quot;data&quot;:[]},' +
  '&quot;title-sub&quot;:{&quot;style&quot;:{},&quot;data&quot;:[]},' +
  '&quot;plain&quot;:{&quot;title&quot;:&quot;&quot;,&quot;title-sub&quot;:&quot;&quot;}}">' +
  '<div class="cover_image"></div><div class="cover_inner"></div>' +
  '<div class="cover_cell cover_direction_left">' +
  '<h1 class="cover_title" style="visibility: visible;"></h1>' +
  '<div class="cover_sub_title" style="visibility: visible;"></div>' +
  '</div></div></div>' +
  '<div class="wrap_body text_align_left">' +
  '<p class="wrap_item item_type_text" data-app="{&quot;type&quot;:&quot;text&quot;,&quot;data&quot;:[{&quot;type&quot;:&quot;br&quot;}]}"><br></p>' +
  '</div>'

export const formatForBrunch = (
  article: WeekArticle,
  input: BrunchFormatInput,
): BrunchArticleDraft => {
  const { intro, hasDivider } = extractIntroHtml(article.contentHtml)
  const introBlocks = introToBlocks(intro)

  const cover = buildCover({
    title: article.title,
    subTitle: article.subtitle,
    coverUrl: input.coverUrl,
    width: input.coverWidth,
    height: input.coverHeight,
  })

  const blocks: BrunchBlock[] = [
    cover,
    hashtagHeadingBlock(article),
    categoryIntroBlock(article),
    buildBlankLine(),
    buildHr("hr_type_6"),
    editedByBlock(article.editor),
    buildHr("hr_type_6"),
    ...(introBlocks.length ? introBlocks : [buildParagraph("(서문 없음)")]),
    buildBlankLine(),
    buildHr("hr_type_1"),
    ctaReadFullBlock(),
    buildOpengraph(input.ogCards.wpArticle),
    buildBlankLine(),
    buildBlankLine(),
    buildHr("hr_type_6"),
    ctaMoreArticlesBlock(),
    buildOpengraph(input.ogCards.antieggHome),
    buildHr("hr_type_1"),
    ctaAboutAntieggBlock(),
    buildOpengraph(input.ogCards.antieggAbout),
  ]

  const contentHtml = renderDocument(blocks)
  const plainContent = extractPlainText(blocks)
  const contentSummary = truncate(plainContent, 200)

  const tagCandidates = selectTagCandidates(article)

  const notes: string[] = []
  if (!hasDivider) {
    notes.push("WP 본문에서 구분선(<hr>)을 찾지 못해 전체 본문을 서문으로 처리했습니다. 검토 필요.")
  }
  if (!introBlocks.length) {
    notes.push("서문이 비어있습니다. (서문 없음) 자리표시자가 들어갔어요.")
  }

  return {
    title: article.title,
    subTitle: article.subtitle,
    blocks,
    contentHtml,
    contentSummary,
    plainContent,
    coverImage: {
      width: input.coverWidth,
      height: input.coverHeight,
      url: input.coverUrl,
    },
    tagCandidates,
    notes,
  }
}
