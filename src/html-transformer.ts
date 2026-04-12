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

/** 블록이 스페이서인지 판별 (중복 제거용) */
const isSpacerBlock = (block: string): boolean =>
  block === ref(BLOCK.SPACE_40) ||
  block === ref(BLOCK.SPACE_70) ||
  block === ref(BLOCK.SPACE_20) ||
  block === ref(BLOCK.SPACE_10) ||
  block.startsWith("<!-- wp:spacer")

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

const wpHeadingH4 = (text: string): string =>
  `<!-- wp:heading {"level":4} -->\n<h4 class="wp-block-heading">${text}</h4>\n<!-- /wp:heading -->`

const wpImage = (src: string, width: number, caption?: string): string => {
  const captionHtml = caption
    ? `<figcaption><sup>${caption}</sup></figcaption>`
    : ""
  return [
    `<!-- wp:image {"align":"center","sizeSlug":"full","width":${width},"linkDestination":"none"} -->`,
    `<figure class="wp-block-image aligncenter size-full is-resized"><img decoding="async" src="${src}" alt="" style="width:${width}px"/>${captionHtml}</figure>`,
    `<!-- /wp:image -->`,
  ].join("\n")
}

/** 캡션 정규화: "출처" 포함 시 "이미지 출처 : ..." prefix 강제, < > → ' ' 치환 */
const normalizeCaption = (raw: string): string => {
  const cleaned = raw.replace(/[<>]/g, "'").trim()
  if (!cleaned) return cleaned
  if (/출처/.test(cleaned)) {
    if (cleaned.startsWith("이미지 출처")) return cleaned
    const stripped = cleaned
      .replace(/^이미지\s*/, "")
      .replace(/^출처\s*[:：]?\s*/, "")
    return `이미지 출처 : ${stripped}`
  }
  return cleaned
}

const wpQuote = (text: string, source?: string): string => {
  const sourceHtml = source ? `<br><br>_${source}` : ""
  return [
    `<!-- wp:quote -->`,
    `<blockquote class="wp-block-quote"><!-- wp:paragraph {"style":{"elements":{"link":{"color":{"text":"#9d9d9d"}}},"color":{"text":"#9d9d9d"}}} -->`,
    `<p class="has-text-color has-link-color" style="color:#9d9d9d"><em>"${text}"${sourceHtml}</em></p>`,
    `<!-- /wp:paragraph --></blockquote>`,
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

/** 행동 유도 텍스트 판별 (~하러 가기/보기, 구매/신청/확인 등) */
const isActionText = (text: string): boolean =>
  /(?:하러\s*(?:가기|보기)|가기|보기|보러|읽으러|시청하러|플레이하러|확인하러|신청하러|구매하러)\s*$/.test(text)

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

type ColumnImage = { src: string; caption?: string }

/**
 * 이미지 컬럼 내부 단일 이미지 (패턴 core/block/20329 구조)
 *
 * - id 는 0 placeholder → image-handler.enrichImageBlocks에서 실제 WP 미디어 ID로 치환
 * - img class="wp-image-{id}" 도 enrich 단계에서 주입
 */
const wpColumnImage = (img: ColumnImage): string => {
  const captionHtml = img.caption
    ? `<figcaption class="wp-element-caption"><sup>${img.caption}</sup></figcaption>`
    : ""
  return [
    `<div class="wp-block-column"><!-- wp:image {"id":0,"sizeSlug":"full","linkDestination":"none","align":"center"} -->`,
    `<figure class="wp-block-image aligncenter size-full"><img src="${img.src}" alt=""/>${captionHtml}</figure>`,
    `<!-- /wp:image --></div>`,
  ].join("\n")
}

const wpImageColumns = (left: ColumnImage, right: ColumnImage): string => [
  `<!-- wp:columns {"metadata":{"categories":[],"patternName":"core/block/20329","name":"이미지 2개 컬럼"}} -->`,
  `<div class="wp-block-columns"><!-- wp:column -->`,
  wpColumnImage(left),
  `<!-- /wp:column -->`,
  ``,
  `<!-- wp:column -->`,
  wpColumnImage(right),
  `<!-- /wp:column --></div>`,
  `<!-- /wp:columns -->`,
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
 *
 * @param ghostHtml - Ghost CMS HTML 원문
 * @param wpAuthorId - WP 사용자 ID (에디터 카드 숏코드 주입용)
 */
/**
 * [참고문헌]/[참고자료] 섹션 추출
 *
 * 원문에 해당 태그가 나오면 삭제하고, 뒤따르는 리스트 또는 연속 문단을
 * references 배열로 분리. 이후 결문 뒤 에디터카드 앞에 삽입.
 */
const extractReferences = (
  elements: ParsedElement[]
): { cleaned: ParsedElement[]; references: string[] } => {
  const references: string[] = []
  const cleaned: ParsedElement[] = []
  let inRefs = false

  for (const el of elements) {
    if (
      !inRefs &&
      el.type === "paragraph" &&
      /\[?\s*참고(?:문헌|자료)\s*\]?/.test(el.html.replace(/<[^>]+>/g, ""))
    ) {
      inRefs = true
      continue
    }
    if (inRefs) {
      if (el.type === "list") {
        references.push(...el.items)
        continue
      }
      if (el.type === "paragraph" && el.html.trim()) {
        references.push(el.html)
        continue
      }
      // 다른 요소(image/heading/hr 등)가 오면 참고문헌 종료
      inRefs = false
    }
    cleaned.push(el)
  }

  return { cleaned, references }
}

export const transformGhostToWp = (ghostHtml: string, wpAuthorId?: number): string => {
  const blocks: string[] = []
  const parser = new GhostHtmlParser(ghostHtml)
  const parsed = parser.parse()
  const { cleaned: elements, references } = extractReferences(parsed)

  let lastWasInflowLink = false
  let h3CountInSection = 0
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
          if (lastWasInflowLink) {
            // 유입링크 바로 뒤 h2: 마지막 divider 제거 + 100px 스페이서
            if (blocks[blocks.length - 1] === ref(BLOCK.DIVIDER)) blocks.pop()
            blocks.push(spacer100())
          } else {
            // 직전 블록이 구분선이면(hr 뒤 등) 자체 구분선 생략, 100px만 추가
            let hasRecentDivider = false
            for (let j = blocks.length - 1; j >= 0; j--) {
              if (isSpacerBlock(blocks[j])) continue
              if (blocks[j] === ref(BLOCK.DIVIDER)) hasRecentDivider = true
              break
            }
            if (hasRecentDivider) {
              blocks.push(spacer100())
            } else {
              blocks.push(ref(BLOCK.SPACE_40))
              blocks.push(ref(BLOCK.DIVIDER))
              blocks.push(spacer100())
            }
          }
          blocks.push(wpHeadingH2(el.text))
          blocks.push(ref(BLOCK.SPACE_40))
          h3CountInSection = 0
        } else if (el.level === 3) {
          h3CountInSection++
          // H3 연속 2개 이상이면 다음 제목 위 70px, 첫 H3은 40px
          blocks.push(h3CountInSection >= 2 ? ref(BLOCK.SPACE_70) : ref(BLOCK.SPACE_40))
          blocks.push(wpHeadingH3(el.text))
        } else {
          // level 4 (또는 그 이상)
          blocks.push(ref(BLOCK.SPACE_40))
          blocks.push(wpHeadingH4(el.text))
        }
        lastWasInflowLink = false
        break
      }

      case "paragraph": {
        if (lastWasInflowLink) {
          // 유입링크 바로 뒤 문단(결문 등): 마지막 divider 제거 + 100px 스페이서
          if (blocks[blocks.length - 1] === ref(BLOCK.DIVIDER)) blocks.pop()
          blocks.push(spacer100())
        }
        blocks.push(wpParagraph(`<p>${el.html}</p>`))
        if (el.links && el.links.length > 0) {
          const inflowLinks = el.links.map((l) => classifyInflowLink(l.href, l.text))
          if (inflowLinks.length === 1) {
            blocks.push(wpInflowLink(inflowLinks[0].href, inflowLinks[0].text))
          } else {
            blocks.push(wpInflowLinkGroup(inflowLinks))
          }
          lastWasInflowLink = true
        } else {
          lastWasInflowLink = false
        }
        break
      }

      case "image": {
        const nextEl = elements[i + 1]
        if (nextEl?.type === "image") {
          blocks.push(ref(BLOCK.SPACE_40))
          blocks.push(wpImageColumns(
            { src: el.src, caption: el.caption },
            { src: nextEl.src, caption: nextEl.caption }
          ))
          blocks.push(ref(BLOCK.SPACE_40))
          i++
          lastWasInflowLink = false
          break
        }
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
        lastWasInflowLink = false
        break
      }

      case "gallery": {
        blocks.push(ref(BLOCK.SPACE_40))
        for (let j = 0; j < el.images.length; j += 2) {
          const img1 = el.images[j]
          const img2 = el.images[j + 1]
          if (img2) {
            blocks.push(wpImageColumns(
              { src: img1.src, caption: img1.caption },
              { src: img2.src, caption: img2.caption }
            ))
          } else {
            blocks.push(wpImage(img1.src, img1.width, img1.caption))
          }
        }
        blocks.push(ref(BLOCK.SPACE_40))
        lastWasInflowLink = false
        break
      }

      case "embed": {
        blocks.push(ref(BLOCK.SPACE_40))
        blocks.push(`<!-- wp:html -->\n<div style="text-align:center">${el.html}</div>\n<!-- /wp:html -->`)
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

  // 아티클 종결 시퀀스
  // - 참고문헌 있음: (결문뒤)40 → 리스트 → 40 → divider → 20 → shortcode → 20 → tail
  // - 참고문헌 없음 + 결문종료: 40 → divider → 20 → shortcode → 20 → tail
  // - 유입링크로 종료: 유입링크의 마지막 divider 재활용 → 20 → shortcode → 20 → tail
  if (references.length > 0) {
    // 유입링크로 끝난 경우에도 참고문헌 앞에는 여백 필요 (유입링크 divider는 유지)
    blocks.push(ref(BLOCK.SPACE_40))
    blocks.push(wpList(references))
    blocks.push(ref(BLOCK.SPACE_40))
    blocks.push(ref(BLOCK.DIVIDER))
  } else if (!lastWasInflowLink) {
    blocks.push(ref(BLOCK.SPACE_40))
    blocks.push(ref(BLOCK.DIVIDER))
  }
  blocks.push(ref(BLOCK.SPACE_20))

  const templateId = wpAuthorId ? getEditorTemplateId(wpAuthorId) : null
  const shortcodeContent = templateId
    ? `[elementor-template id="${templateId}"]`
    : ""
  blocks.push(`<!-- wp:shortcode -->${shortcodeContent}<!-- /wp:shortcode -->`)

  blocks.push(ref(BLOCK.SPACE_20))
  blocks.push(ref(BLOCK.EDITOR_TAIL))

  return deduplicateBlocks(blocks).join("\n\n")
}

/**
 * 블록 배열에서 연속 중복 제거
 *
 * 1. 연속 스페이서 → 하나만 유지
 * 2. 연속 구분선 → 하나만 유지
 * 3. DIVIDER + SPACER + DIVIDER → DIVIDER 하나로 축소
 */
const deduplicateBlocks = (blocks: string[]): string[] => {
  const divider = ref(BLOCK.DIVIDER)
  const result: string[] = []

  for (const block of blocks) {
    const last = result[result.length - 1]

    // 연속 스페이서 → 하나만 유지
    if (isSpacerBlock(block) && last && isSpacerBlock(last)) continue

    // 연속 구분선 → 하나만 유지
    if (block === divider && last === divider) continue

    // DIVIDER + SPACER + DIVIDER → DIVIDER (중간 스페이서 + 두 번째 구분선 제거)
    if (block === divider && result.length >= 2) {
      if (last && isSpacerBlock(last) && result[result.length - 2] === divider) {
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
  | { type: "paragraph"; html: string; links?: Array<{ href: string; text: string }> }
  | { type: "image"; src: string; width: number; caption?: string }
  | { type: "gallery"; images: Array<{ src: string; width: number; caption?: string }> }
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

    // 빈 paragraph 제거 (이미지 사이에 끼어 컬럼 블록 합치기 방해하는 것 방지)
    const nonEmpty = elements.filter(
      (el) => !(el.type === "paragraph" && !el.html.replace(/<[^>]+>/g, "").trim())
    )
    return this.convertBoldAfterH2ToH3(this.normalizeHeadings(nonEmpty))
  }

  /**
   * H2 직후 bold 문단(p+strong) → H3로 변환
   * 예: "몸으로 느끼는 자연"(H2) + "<strong>에르네스토 네토</strong>"(p) → H3
   */
  private convertBoldAfterH2ToH3(elements: ParsedElement[]): ParsedElement[] {
    for (let i = 0; i < elements.length - 1; i++) {
      const el = elements[i]
      const next = elements[i + 1]
      if (el.type === "heading" && el.level <= 2 && next.type === "paragraph") {
        const strongMatch = next.html.match(/^<strong>([\s\S]*?)<\/strong>$/)
        if (strongMatch) {
          elements[i + 1] = { type: "heading", level: 3, text: strongMatch[1] }
        }
      }
    }
    return elements
  }

  /**
   * 헤딩 위계 정규화 (명세: h2~h4만 허용)
   *
   * - 사용된 heading level을 수집 → 가장 높은(level 값 작은) 것을 h2,
   *   그 다음을 h3, 그 다음을 h4로 강제 변환
   * - 이하 depth는 모두 h4로 쳐냄
   * - hr 뒤 첫 heading은 여전히 h2로 승격 (섹션 시작 보장)
   */
  private normalizeHeadings(elements: ParsedElement[]): ParsedElement[] {
    // 1) 사용된 level 수집 + 매핑 테이블 생성
    const usedLevels = [
      ...new Set(
        elements.filter((e) => e.type === "heading").map((e) => (e as { level: number }).level)
      ),
    ].sort((a, b) => a - b)
    const levelMap = new Map<number, number>()
    usedLevels.forEach((lv, idx) => levelMap.set(lv, Math.min(2 + idx, 4)))

    // 2) 모든 heading level을 매핑 테이블로 치환
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i]
      if (el.type === "heading") {
        const mapped = levelMap.get(el.level) ?? Math.min(Math.max(el.level, 2), 4)
        elements[i] = { type: "heading", level: mapped, text: el.text }
      }
    }

    // 3) hr 뒤 첫 heading은 h2로 승격
    let afterHr = false
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i]
      if (el.type === "hr") {
        afterHr = true
        continue
      }
      if (el.type !== "heading") {
        afterHr = false
        continue
      }
      if (afterHr && el.level > 2) {
        elements[i] = { type: "heading", level: 2, text: el.text }
      }
      afterHr = false
    }

    return elements
  }

  private splitIntoFragments(): string[] {
    // blockquote/figure 내부는 split 방지용으로 placeholder 치환
    // (내부 <p> 태그가 독립 fragment로 분리되는 문제 방지)
    const placeholders: string[] = []
    const protect = (src: string, pattern: RegExp): string =>
      src.replace(pattern, (m) => {
        placeholders.push(m)
        return `\u0000P${placeholders.length - 1}\u0000`
      })
    let working = protect(this.html, /<blockquote\b[\s\S]*?<\/blockquote>/gi)
    working = protect(working, /<figure\b[\s\S]*?<\/figure>/gi)

    const restore = (s: string): string =>
      s.replace(/\u0000P(\d+)\u0000/g, (_, idx) => placeholders[+idx] ?? "")

    return working
      .split(/(?=<(?:h[1-6]|p|hr|ul|ol|div class="kg-))|(?<=<\/(?:h[1-6]|p|ul|ol)>)|(?<=<hr\s*\/?>)|(?=\u0000P\d+\u0000)|(?<=\u0000P\d+\u0000)/i)
      .map(restore)
      .filter((f) => f.trim().length > 0)
  }

  private parseFragment(html: string): ParsedElement | null {
    if (/^<h[1-6]\b/i.test(html)) return this.parseHeading(html)
    // Ghost 갤러리 카드(figure.kg-card.kg-gallery-card)는 figure로 래핑되지만
    // 내부에 다수 이미지가 있으므로 parseFigure 대신 parseGallery로 위임
    if (/^<figure\b[^>]*class="[^"]*kg-gallery-card/i.test(html)) return this.parseGallery(html)
    if (/^<figure\b/i.test(html)) return this.parseFigure(html)
    if (/^<blockquote\b/i.test(html)) return this.parseQuote(html)
    if (/^<hr\s*\/?>/i.test(html)) return { type: "hr" }
    if (/^<[uo]l\b/i.test(html)) return this.parseList(html)
    if (/^<div class="kg-bookmark/i.test(html)) return this.parseBookmark(html)
    if (/^<div class="kg-card kg-button-card/i.test(html)) return this.parseButton(html)
    if (/^<div class="kg-card kg-gallery-card/i.test(html)) return this.parseGallery(html)
    if (/^<div class="kg-/i.test(html)) return { type: "html", html }
    if (/^<p\b/i.test(html)) return this.parseParagraph(html)

    if (html.includes("<")) return { type: "html", html }
    if (html.trim()) return { type: "paragraph", html: html.trim() }

    return null
  }

  private parseHeading(html: string): ParsedElement {
    const levelMatch = html.match(/^<h(\d)/i)
    const level = levelMatch ? parseInt(levelMatch[1]) : 2
    // 본문 헤딩에서는 < > 그대로 유지 (엔티티만 복원)
    const text = html
      .replace(/<\/?h[1-6][^>]*>/gi, "")
      .replace(/<\/?strong>/gi, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
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
        const rawCap = captionMatch
          ? captionMatch[1].replace(/<[^>]+>/g, "").replace(/&lt;/g, "'").replace(/&gt;/g, "'").trim()
          : ""
        const caption = rawCap ? normalizeCaption(rawCap) : undefined
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

    // 가로형/정방형 → 700, 세로형 → 467
    let displayWidth = 700
    if (imgWidth > 0 && imgHeight > 0) {
      displayWidth = imgHeight > imgWidth ? 467 : 700
    }

    const rawCap = captionMatch
      ? captionMatch[1].replace(/<[^>]+>/g, "").replace(/&lt;/g, "'").replace(/&gt;/g, "'").trim()
      : ""
    const caption = rawCap ? normalizeCaption(rawCap) : undefined

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

  private parseGallery(html: string): ParsedElement {
    const images: Array<{ src: string; width: number; caption?: string }> = []
    const imgPattern = /<img[^>]+src="([^"]+)"[^>]*>/gi
    let imgMatch: RegExpExecArray | null
    while ((imgMatch = imgPattern.exec(html)) !== null) {
      const imgTag = imgMatch[0]
      const src = imgMatch[1]
      const wm = imgTag.match(/width="(\d+)"/)
      const hm = imgTag.match(/height="(\d+)"/)
      const w = wm ? parseInt(wm[1]) : 0
      const h = hm ? parseInt(hm[1]) : 0
      images.push({ src, width: h > w ? 467 : 700 })
    }
    // Ghost 갤러리 카드는 전체에 대해 단일 figcaption을 가짐 → 모든 이미지에 복제
    const captionMatch = html.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i)
    if (captionMatch && images.length > 0) {
      const rawCap = captionMatch[1].replace(/<[^>]+>/g, "").replace(/&lt;/g, "'").replace(/&gt;/g, "'").trim()
      if (rawCap) {
        const cap = normalizeCaption(rawCap)
        for (const img of images) img.caption = cap
      }
    }
    if (images.length === 0) return { type: "html", html }
    return { type: "gallery", images }
  }

  private parseParagraph(html: string): ParsedElement {
    const inner = html
      .replace(/^<p[^>]*>/i, "")
      .replace(/<\/p>$/i, "")
      .trim()

    if (!inner) return { type: "paragraph", html: "" }

    // Extract inline links → 유입링크로 분리
    const linkPattern = /<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
    const links: Array<{ href: string; text: string }> = []
    let linkMatch: RegExpExecArray | null
    while ((linkMatch = linkPattern.exec(inner)) !== null) {
      links.push({ href: linkMatch[1], text: linkMatch[2].replace(/<[^>]+>/g, "").trim() })
    }

    if (links.length > 0) {
      // Remove <a> tags, keep inner text only (no inline hyperlinks in WP)
      const cleanHtml = inner.replace(/<a\s+href="[^"]*"[^>]*>([\s\S]*?)<\/a>/gi, "$1")
      return { type: "paragraph", html: cleanHtml, links }
    }

    return { type: "paragraph", html: inner }
  }
}
