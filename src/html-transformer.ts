/**
 * Ghost HTML → WordPress Block Editor HTML 변환
 *
 * ANTIEGG 워드프레스 블록 규칙 기반:
 * - 재사용 블록 ID: DIVIDER=5701, SPACE_40=19650, SPACE_20=19912, SPACE_10=19767
 * - Gutenberg 블록 코멘트 (<!-- wp:... -->) 필수
 * - 이미지: 가로형 700px, 세로형 467px
 * - 제목(h2): 가운데 정렬, 앞에 구분선+스페이서
 * - 유입링크: 고정 시퀀스 (spacer→구분선→spacer→링크→spacer→구분선)
 */

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

const wpHeadingH2 = (text: string): string =>
  `<!-- wp:heading {"textAlign":"center"} -->\n<h2 class="wp-block-heading has-text-align-center">${text}</h2>\n<!-- /wp:heading -->`

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
  `<p class="has-text-align-center" style="font-size:15px">`,
  `<a href="${href}" target="_blank" rel="noreferrer noopener">${text}</a>`,
  `</p>`,
  `<!-- /wp:paragraph -->`,
  ref(BLOCK.SPACE_10),
  ref(BLOCK.DIVIDER),
].join("\n")

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
 */
export const transformGhostToWp = (ghostHtml: string): string => {
  const blocks: string[] = []
  const parser = new GhostHtmlParser(ghostHtml)
  const elements = parser.parse()

  let isFirstSection = true
  let lastWasInflowLink = false

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i]

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
          blocks.push(ref(BLOCK.SPACE_40))
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
          // 유입링크가 이미 구분선으로 끝나므로 hr 스킵
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
        blocks.push(wpInflowLink(el.href, el.text))
        lastWasInflowLink = true
        break
      }

      case "button": {
        blocks.push(wpInflowLink(el.href, el.text))
        lastWasInflowLink = true
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

  // 아티클 종결 시퀀스 (고정)
  if (!lastWasInflowLink) {
    blocks.push(ref(BLOCK.SPACE_40))
    blocks.push(ref(BLOCK.DIVIDER))
  }
  blocks.push(ref(BLOCK.SPACE_20))
  blocks.push(`<!-- wp:shortcode -->\n<!-- /wp:shortcode -->`)
  blocks.push(ref(BLOCK.SPACE_20))
  blocks.push(ref(BLOCK.EDITOR_TAIL))

  return blocks.join("\n\n")
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
