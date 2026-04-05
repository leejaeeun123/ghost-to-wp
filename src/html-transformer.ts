/**
 * Ghost HTML → WordPress Block Editor HTML 변환
 *
 * ANTIEGG 워드프레��� 블록 규칙 기반:
 * - 재사용 블록 ID: DIVIDER=5701, SPACE_40=19650, SPACE_20=19912, SPACE_10=19767
 * - Gutenberg 블록 코멘트 (<!-- wp:... -->) 필수
 * - ���미지: 가로형 700px, 세로형 467px
 * - 제목(h2): 가운데 정렬, 앞에 구분선+스페이서
 * - 유입링크: 고정 시퀀스 (spacer→구분선→spacer→링크→spacer→구분선)
 * - 구분선/스페이서: 연속 반복 금지, 하나의 블록만 사용
 */

import { getEditorTemplateId } from "./editor-card.js"

/** 재사용 블록 ID (ANTIEGG WP DB 기준) */
const BLOCK = {
  DIVIDER: 5701,
  SPACE_70: 27530,
  SPACE_40: 19650,
  SPACE_20: 19912,
  SPACE_10: 19767,
  EDITOR_TAIL: 19773,
} as const

const ref = (id: number): string =>
  `<!-- wp:block {"ref":${id}} /-->`

const spacer100 = (): string =>
  `<!-- wp:spacer -->\n<div style="height:100px" aria-hidden="true" class="wp-block-spacer"></div>\n<!-- /wp:spacer -->`

const wpParagraph = (inner: string, attrs?: string): string => {
  const attrStr = attrs ? ` ${attrs}` : ""
  return `<!-- wp:paragraph${attrStr} -->\n${inner}\n<!-- /wp:paragraph -->`
}

const wpHeadingH2 = (text: string): string => {
  const formatted = text.length > 20 ? splitH2AtMiddleSpace(text) : text
  return `<!-- wp:heading {"textAlign":"center"} -->\n<h2 class="wp-block-heading has-text-align-center">${formatted}</h2>\n<!-- /wp:heading -->`
}

/** H2 텍스트가 20자 초과 시 가장 가까운 중간 공백에서 줄바꿈 */
const splitH2AtMiddleSpace = (text: string): string => {
  if (text.includes("<br")) return text
  const spaces: number[] = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] === " ") spaces.push(i)
  }
  if (spaces.length === 0) return text
  const mid = text.length / 2
  const best = spaces.reduce((a, b) => Math.abs(a - mid) < Math.abs(b - mid) ? a : b)
  return text.substring(0, best) + "<br>" + text.substring(best + 1)
}

const wpHeadingH3 = (text: string): string =>
  `<!-- wp:heading {"level":3} -->\n<h3 class="wp-block-heading">${text}</h3>\n<!-- /wp:heading -->`

const wpImage = (src: string, width: number, caption?: string): string => {
  const captionHtml = caption
    ? `<figcaption class="wp-element-caption"><sup>${caption}</sup></figcaption>`
    : ""
  return `<!-- wp:image {"align":"center","sizeSlug":"full","linkDestination":"none"} -->\n<figure class="wp-block-image aligncenter size-full is-resized"><img decoding="async" src="${src}" style="width:${width}px"/>${captionHtml}</figure>\n<!-- /wp:image -->`
}

const wpQuote = (text: string, source?: string): string => {
  const sourceHtml = source ? `<br><br><em>${source}</em>` : ""
  return [
    `<!-- wp:quote -->`,
    `<blockquote class="wp-block-quote">`,
    `<!-- wp:paragraph {"style":{"elements":{"link":{"color":{"text":"#9d9d9d"}}},"color":{"text":"#9d9d9d"}}} -->`,
    `<p class="has-text-color has-link-color" style="color:#9d9d9d">`,
    `<em>"${text}"</em>${sourceHtml}`,
    `</p>`,
    `<!-- /wp:paragraph -->`,
    `</blockquote>`,
    `<!-- /wp:quote -->`,
  ].join("\n")
}

const wpList = (items: string[]): string => {
  const lis = items.map((item) => `  <li>${item}</li>`).join("\n")
  return [
    `<!-- wp:list {"style":{"typography":{"fontSize":"14px"},"elements":{"link":{"color":{"text":"#9d9d9d"}}},"color":{"text":"#9d9d9d"}}} -->`,
    `<ul style="color:#9d9d9d;font-size:14px" class="wp-block-list has-text-color has-link-color">`,
    lis,
    `</ul>`,
    `<!-- /wp:list -->`,
  ].join("\n")
}

const wpInflowLink = (href: string, text: string): string => [
  ref(BLOCK.SPACE_40),
  ref(BLOCK.DIVIDER),
  ref(BLOCK.SPACE_20),
  `<!-- wp:paragraph {"align":"center","style":{"typography":{"fontSize":"15px"}}} -->`,
  `<p class="has-text-align-center" style="font-size:15px"><a href="${href}" target="_blank" rel="noreferrer noopener">${text}</a></p>`,
  `<!-- /wp:paragraph -->`,
  ref(BLOCK.SPACE_10),
  ref(BLOCK.DIVIDER),
].join("\n")

/** 유입링크 분류 정보 */
type InflowLinkInfo = { href: string; text: string; sortOrder: number }

/** 행동 유도 텍스트 판별 (~가기, ~보기 등) */
const isActionText = (text: string): boolean =>
  /(?:가기|보기|보러|읽으러|시청하러|플레이하러)\s*$/.test(text)

/**
 * 유입링크 분류 + WP 포맷팅
 *
 * WP 실제 패턴 기반:
 * - Instagram URL → INSTAGRAM : @username (원본 텍스트 무시)
 * - 행동 유도 텍스트(~가기/~보기) → 원본 텍스트 유지
 * - 북마크 타이틀 있음 → WEBSITE : [타이틀]
 * - 텍스트 없음(URL만) → WEBSITE : [도메인명]
 */
const classifyInflowLink = (href: string, originalText: string): InflowLinkInfo => {
  try {
    const url = new URL(href)
    const hostname = url.hostname.replace(/^www\./, "")

    // Instagram → 항상 @username 포맷
    if (hostname.includes("instagram.com")) {
      const username = url.pathname.split("/").filter(Boolean)[0] ?? ""
      return { href, text: `INSTAGRAM : @${username}`, sortOrder: 1 }
    }

    // 행동 유도 텍스트 → 원본 유지
    if (originalText && originalText !== href && isActionText(originalText)) {
      return { href, text: originalText, sortOrder: 2 }
    }

    // 북마크 타이틀 있음 → WEBSITE : 타이틀
    if (originalText && originalText !== href && !originalText.startsWith("http")) {
      return { href, text: `WEBSITE : ${originalText}`, sortOrder: 0 }
    }

    // 텍스트 없음 → WEBSITE : 도메인명
    const siteName = hostname.split(".")[0]
    return { href, text: `WEBSITE : ${siteName.charAt(0).toUpperCase()}${siteName.slice(1)}`, sortOrder: 0 }
  } catch {
    return { href, text: originalText || href, sortOrder: 2 }
  }
}

/**
 * 유입링크 그룹 렌더링
 *
 * WP 실제 패턴: 여러 링크를 하나의 <p> 안에 <br>로 연결
 * 정렬: website(0) → instagram(1) → action(2)
 */
const wpInflowLinkGroup = (links: InflowLinkInfo[]): string => {
  const sorted = [...links].sort((a, b) => a.sortOrder - b.sortOrder)
  const anchors = sorted.map(
    (link) => `<a href="${link.href}" target="_blank" rel="noreferrer noopener">${link.text}</a>`
  )
  return [
    ref(BLOCK.SPACE_40),
    ref(BLOCK.DIVIDER),
    ref(BLOCK.SPACE_20),
    `<!-- wp:paragraph {"align":"center","style":{"typography":{"fontSize":"15px"}}} -->`,
    `<p class="has-text-align-center" style="font-size:15px">${anchors.join("<br>")}</p>`,
    `<!-- /wp:paragraph -->`,
    ref(BLOCK.SPACE_10),
    ref(BLOCK.DIVIDER),
  ].join("\n")
}

const wpYouTubeEmbed = (url: string, caption?: string): string => {
  const captionHtml = caption
    ? `<figcaption class="wp-element-caption"><sup>${caption}</sup></figcaption>`
    : ""
  return [
    `<!-- wp:embed {"url":"${url}","type":"video","providerNameSlug":"youtube","responsive":true,"align":"center","className":"wp-embed-aspect-16-9 wp-has-aspect-ratio"} -->`,
    `<figure class="wp-block-embed aligncenter is-type-video is-provider-youtube wp-block-embed-youtube wp-embed-aspect-16-9 wp-has-aspect-ratio"><div class="wp-block-embed__wrapper">`,
    url,
    `</div>${captionHtml}</figure>`,
    `<!-- /wp:embed -->`,
  ].join("\n")
}

/**
 * Ghost HTML 문자열을 WP Block Editor HTML로 변환
 *
 * @param ghostHtml - Ghost CMS HTML 원문
 * @param wpAuthorId - WP 사용자 ID (에디터 카드 숏코드 주입용)
 */
export const transformGhostToWp = (ghostHtml: string, wpAuthorId?: number): string => {
  const blocks: string[] = []
  const parser = new GhostHtmlParser(ghostHtml)
  const elements = parser.parse()

  let isFirstSection = true
  let lastWasInflowLink = false
  const inflowBuffer: InflowLinkInfo[] = []

  /** 버퍼에 쌓인 유입링크를 한 블록으로 플러시 */
  const flushInflow = () => {
    if (inflowBuffer.length === 0) return
    if (inflowBuffer.length === 1) {
      blocks.push(wpInflowLink(inflowBuffer[0].href, inflowBuffer[0].text))
    } else {
      blocks.push(wpInflowLinkGroup(inflowBuffer))
    }
    inflowBuffer.length = 0
    lastWasInflowLink = true
  }

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i]

    // 유입링크가 아닌 요소를 만나면 버퍼 플러시
    if (el.type !== "bookmark" && el.type !== "button") {
      flushInflow()
    }

    switch (el.type) {
      case "heading": {
        if (el.level <= 2) {
          if (!isFirstSection && !lastWasInflowLink) {
            blocks.push(ref(BLOCK.SPACE_40))
            blocks.push(ref(BLOCK.DIVIDER))
          }
          blocks.push(spacer100())
          blocks.push(wpHeadingH2(el.text))
          blocks.push(ref(BLOCK.SPACE_40))
          isFirstSection = false
        } else {
          blocks.push(ref(BLOCK.SPACE_70))
          blocks.push(wpHeadingH3(el.text))
        }
        lastWasInflowLink = false
        break
      }

      case "paragraph": {
        blocks.push(wpParagraph(`<p>${el.html}</p>`))
        lastWasInflowLink = false
        break
      }

      case "image": {
        blocks.push(ref(BLOCK.SPACE_40))
        blocks.push(wpImage(el.src, el.width, el.caption))
        blocks.push(ref(BLOCK.SPACE_40))
        lastWasInflowLink = false
        break
      }

      case "quote": {
        blocks.push(ref(BLOCK.SPACE_40))
        blocks.push(wpQuote(el.text, el.source))
        blocks.push(ref(BLOCK.SPACE_40))
        lastWasInflowLink = false
        break
      }

      case "hr": {
        if (lastWasInflowLink) {
          break
        }

        const hasMoreHeadings = elements
          .slice(i + 1)
          .some((e) => e.type === "heading" && e.level <= 2)

        blocks.push(ref(BLOCK.SPACE_40))
        blocks.push(ref(BLOCK.DIVIDER))

        if (!hasMoreHeadings) {
          blocks.push(spacer100())
        }
        break
      }

      case "bookmark": {
        inflowBuffer.push(classifyInflowLink(el.href, el.text))
        break
      }

      case "button": {
        inflowBuffer.push(classifyInflowLink(el.href, el.text))
        break
      }

      case "list": {
        blocks.push(ref(BLOCK.SPACE_40))
        blocks.push(wpList(el.items))
        lastWasInflowLink = false
        break
      }

      case "youtube": {
        blocks.push(ref(BLOCK.SPACE_40))
        blocks.push(wpYouTubeEmbed(el.url, el.caption))
        blocks.push(ref(BLOCK.SPACE_40))
        lastWasInflowLink = false
        break
      }

      case "embed": {
        blocks.push(ref(BLOCK.SPACE_40))
        blocks.push(`<!-- wp:html -->\n<div style="text-align:center">${el.html}</div>\n<!-- /wp:html -->`)
        blocks.push(ref(BLOCK.SPACE_40))
        lastWasInflowLink = false
        break
      }

      case "html": {
        blocks.push(`<!-- wp:html -->\n${el.html}\n<!-- /wp:html -->`)
        lastWasInflowLink = false
        break
      }
    }
  }

  // 루프 종료 후 남은 유입링크 플러시
  flushInflow()

  // 아티클 종결 ��퀀스
  if (!lastWasInflowLink) {
    blocks.push(ref(BLOCK.SPACE_40))
    blocks.push(ref(BLOCK.DIVIDER))
  }
  blocks.push(ref(BLOCK.SPACE_20))

  const templateId = wpAuthorId ? getEditorTemplateId(wpAuthorId) : null
  const shortcodeContent = templateId
    ? `[elementor-template id="${templateId}"]`
    : ""
  blocks.push(`<!-- wp:shortcode -->\n${shortcodeContent}\n<!-- /wp:shortcode -->`)

  blocks.push(ref(BLOCK.SPACE_20))
  blocks.push(ref(BLOCK.EDITOR_TAIL))

  return deduplicateBlocks(blocks).join("\n\n")
}

/**
 * 블록 배열에서 연속 중복 제거
 *
 * 1. 동일한 ref 블록 연속 반복 → 하나만 유지
 * 2. DIVIDER + SPACE_40 + DIVIDER 패턴 → DIVIDER 하나로 축소
 */
const deduplicateBlocks = (blocks: string[]): string[] => {
  const divider = ref(BLOCK.DIVIDER)
  const space40 = ref(BLOCK.SPACE_40)
  const result: string[] = []

  for (const block of blocks) {
    const last = result[result.length - 1]

    // 동일한 ref 블록 연속 반복 제거
    if (last === block && block.startsWith("<!-- wp:block")) continue

    // DIVIDER + SPACE_40 + DIVIDER → DIVIDER (중간 SPACE_40 + 두 번째 DIVIDER 제거)
    if (block === divider && result.length >= 2) {
      if (last === space40 && result[result.length - 2] === divider) {
        result.pop()
        continue
      }
    }

    result.push(block)
  }

  return result
}

/** 파싱된 Ghost HTML 요소 */
type ParsedElement =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; html: string }
  | { type: "image"; src: string; width: number; caption?: string }
  | { type: "quote"; text: string; source?: string }
  | { type: "hr" }
  | { type: "bookmark"; href: string; text: string }
  | { type: "button"; href: string; text: string }
  | { type: "list"; items: string[] }
  | { type: "youtube"; url: string; caption?: string }
  | { type: "embed"; html: string }
  | { type: "html"; html: string }

/**
 * Ghost HTML 파서
 *
 * Ghost의 HTML 출력을 블록 단위로 분리.
 * Node.js 내장 기능만 사용 (외부 의존성 없음).
 */
class GhostHtmlParser {
  private html: string

  constructor(html: string) {
    this.html = html.trim()
  }

  parse(): ParsedElement[] {
    const elements: ParsedElement[] = []
    const fragments = this.splitIntoFragments()

    for (const frag of fragments) {
      const trimmed = frag.trim()
      if (!trimmed) continue

      const parsed = this.parseFragment(trimmed)
      if (parsed) elements.push(parsed)
    }

    return this.normalizeHeadings(elements)
  }

  /**
   * 헤딩 순서 정규화
   * - h3 → h2 연속 시 h2 → h3으로 교환
   * - hr 뒤 첫 헤딩은 반드시 h2
   */
  private normalizeHeadings(elements: ParsedElement[]): ParsedElement[] {
    let afterHr = false

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i]

      if (el.type === "hr") {
        afterHr = true
        continue
      }

      if (el.type !== "heading") {
        if (el.type !== "hr") afterHr = false
        continue
      }

      // hr 뒤 첫 헤딩은 h2로 승격
      if (afterHr && el.level > 2) {
        elements[i] = { ...el, level: 2 }
      }
      afterHr = false

      // 연속 헤딩에서 h3 → h2 순서면 교환
      const next = elements[i + 1]
      if (next?.type === "heading" && el.level > next.level) {
        const tmpLevel = el.level
        elements[i] = { ...elements[i], level: next.level }
        elements[i + 1] = { ...next, level: tmpLevel }
      }
    }

    return elements
  }

  private splitIntoFragments(): string[] {
    return this.html
      .split(/(?=<(?:h[1-6]|figure|blockquote|hr|ul|ol|div class="kg-))|(?<=<\/(?:h[1-6]|figure|blockquote|ul|ol)>)|(?<=<hr\s*\/?>)/i)
      .filter((f) => f.trim().length > 0)
  }

  private parseFragment(html: string): ParsedElement | null {
    if (/^<h[1-6]\b/i.test(html)) return this.parseHeading(html)
    if (/^<figure\b/i.test(html)) return this.parseFigure(html)
    if (/^<blockquote\b/i.test(html)) return this.parseQuote(html)
    if (/^<hr\s*\/?>/i.test(html)) return { type: "hr" }
    if (/^<[uo]l\b/i.test(html)) return this.parseList(html)
    if (/^<div class="kg-bookmark/i.test(html)) return this.parseBookmark(html)
    if (/^<div class="kg-card kg-button-card/i.test(html)) return this.parseButton(html)
    if (/^<div class="kg-/i.test(html)) return { type: "html", html }
    if (/^<p\b/i.test(html)) return this.parseParagraph(html)

    if (html.includes("<")) return { type: "html", html }
    if (html.trim()) return { type: "paragraph", html: html.trim() }

    return null
  }

  private parseHeading(html: string): ParsedElement {
    const levelMatch = html.match(/^<h(\d)/i)
    const level = levelMatch ? parseInt(levelMatch[1]) : 2
    const text = html
      .replace(/<\/?h[1-6][^>]*>/gi, "")
      .replace(/<\/?strong>/gi, "")
      .replace(/&lt;/g, "\u3008")
      .replace(/&gt;/g, "\u3009")
      .trim()
    return { type: "heading", level, text }
  }

  private parseFigure(html: string): ParsedElement {
    const srcMatch = html.match(/src="([^"]+)"/)
    const captionMatch = html.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i)
    const src = srcMatch?.[1] ?? ""

    const iframeMatch = html.match(/<iframe[^>]+src="([^"]+)"[^>]*>/i)
    if (iframeMatch) {
      const iframeSrc = iframeMatch[1]
      const ytMatch = iframeSrc.match(/youtube\.com\/embed\/([^?"&]+)/)
      if (ytMatch) {
        const url = `https://www.youtube.com/watch?v=${ytMatch[1]}`
        const caption = captionMatch
          ? captionMatch[1].replace(/<[^>]+>/g, "").replace(/&lt;/g, "'").replace(/&gt;/g, "'").trim()
          : undefined
        return { type: "youtube", url, caption }
      }
      return { type: "embed", html }
    }

    if (!src || !src.match(/\.(jpg|jpeg|png|gif|webp|svg)/i)) {
      return { type: "html", html }
    }

    const widthMatch = html.match(/width="(\d+)"/)
    const heightMatch = html.match(/height="(\d+)"/)
    const imgWidth = widthMatch ? parseInt(widthMatch[1]) : 0
    const imgHeight = heightMatch ? parseInt(heightMatch[1]) : 0

    let displayWidth = 700
    if (imgWidth > 0 && imgHeight > 0) {
      displayWidth = imgHeight > imgWidth ? 467 : 700
    }

    const caption = captionMatch
      ? captionMatch[1].replace(/<[^>]+>/g, "").replace(/&lt;/g, "'").replace(/&gt;/g, "'").trim()
      : undefined

    return { type: "image", src, width: displayWidth, caption }
  }

  private parseQuote(html: string): ParsedElement {
    const inner = html.replace(/<\/?blockquote[^>]*>/gi, "").trim()
    const paragraphs = inner
      .replace(/<\/?p[^>]*>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .split("\n")
      .map((s) => s.replace(/<[^>]+>/g, "").trim())
      .filter(Boolean)

    const text = paragraphs[0] ?? ""
    const source = paragraphs.length > 1 ? paragraphs[paragraphs.length - 1] : undefined

    return {
      type: "quote",
      text: text.replace(/^[""\u201C]|[""\u201D]$/g, ""),
      source,
    }
  }

  private parseList(html: string): ParsedElement {
    const items: string[] = []
    const liPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi
    let match: RegExpExecArray | null

    while ((match = liPattern.exec(html)) !== null) {
      items.push(match[1].trim())
    }

    return { type: "list", items }
  }

  private parseButton(html: string): ParsedElement {
    const hrefMatch = html.match(/href="([^"]+)"/)
    const textMatch = html.match(/class="kg-btn[^"]*">([^<]+)</)
    const href = hrefMatch?.[1] ?? ""
    const text = textMatch?.[1]?.trim() ?? href
    return { type: "button", href, text }
  }

  private parseBookmark(html: string): ParsedElement {
    const hrefMatch = html.match(/href="([^"]+)"/)
    const titleMatch = html.match(/kg-bookmark-title[^>]*>([^<]+)</)
    const href = hrefMatch?.[1] ?? ""
    const title = titleMatch?.[1] ?? href

    return { type: "bookmark", href, text: title }
  }

  private parseParagraph(html: string): ParsedElement {
    const inner = html
      .replace(/^<p[^>]*>/i, "")
      .replace(/<\/p>$/i, "")
      .trim()

    if (!inner) return { type: "paragraph", html: "" }

    const linkified = inner.replace(
      /<a\s+href="([^"]+)"[^>]*>/gi,
      '<a href="$1" target="_blank" rel="noreferrer noopener">'
    )

    return { type: "paragraph", html: linkified }
  }
}
