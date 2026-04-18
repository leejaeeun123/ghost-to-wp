import type {
  BrunchBlock,
  BrunchCoverBlock,
  BrunchHrBlock,
  BrunchInlineGroup,
  BrunchInlineNode,
  BrunchOpengraphBlock,
  BrunchTextBlock,
} from "./brunch-types.js"

/** HTML attribute 값 이스케이프 (data-app JSON 병기용) */
const encodeAttr = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

/** HTML 본문 텍스트 이스케이프 */
const encodeText = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/** data-app 속성 문자열 생성 — JSON → HTML-encoded 속성값 */
const dataAppAttr = (obj: unknown): string =>
  `data-app="${encodeAttr(JSON.stringify(obj))}"`

/** 인라인 노드 → HTML 재귀 렌더 */
const renderInline = (nodes: BrunchInlineNode[]): string => {
  let out = ""
  for (const n of nodes) {
    if (n.type === "br") {
      out += "<br>"
    } else if ("text" in n && typeof n.text === "string") {
      out += encodeText(n.text)
    } else if ("data" in n) {
      out += renderInlineGroup(n)
    }
  }
  return out
}

const renderInlineGroup = (group: BrunchInlineGroup): string => {
  const inner = renderInline(group.data)
  let html = inner
  if (group.styleType === "bold") html = `<b>${html}</b>`
  if (group.style?.color) {
    html = `<span style="color: ${group.style.color};">${html}</span>`
  }
  return html
}

/** 커버 블록 렌더 — cover_image 썸네일 URL은 img1.kakaocdn.net/thumb/R1280x0 래퍼 */
const renderCover = (block: BrunchCoverBlock): string => {
  const rawUrl = block.style["background-image"]
  const thumbUrl = `//img1.kakaocdn.net/thumb/R1280x0/?fname=${encodeURIComponent(rawUrl)}`
  const titleHtml = renderInline(block.title.data)
  const subTitleHtml = renderInline(block["title-sub"].data)
  const directionCls = `cover_direction_${block.align}`

  return [
    `<div class="wrap_cover cover_init">`,
    `<div class="cover_item ${directionCls} ${block.kind}" ${dataAppAttr(block)}>`,
    `<div class="cover_image" style="background-image: url(&quot;${thumbUrl}&quot;);"></div>`,
    `<div class="cover_inner"></div>`,
    `<div class="cover_cell ${directionCls}">`,
    `<h1 class="cover_title" style="font-family: &quot;Noto Sans DemiLight&quot;;">${titleHtml}</h1>`,
    `<div class="cover_sub_title" style="visibility: visible;">${subTitleHtml}</div>`,
    `</div></div></div>`,
  ].join("")
}

/** 문단/헤딩 블록 렌더 */
const renderText = (block: BrunchTextBlock): string => {
  const tag = block.size === "h2" ? "h2" : block.size === "h3" ? "h3" : "p"
  const innerHtml = renderInline(block.data)
  return `<${tag} class="wrap_item item_type_text" ${dataAppAttr(block)}>${innerHtml}</${tag}>`
}

/** 구분선 블록 렌더 */
const renderHr = (block: BrunchHrBlock): string =>
  `<div class="wrap_item item_type_hr ${block.kind}" ${dataAppAttr(block)}>` +
  `<div class="inner_wrap"><hr></div><br>` +
  `</div>`

/** OG 카드 블록 렌더 */
const renderOpengraph = (block: BrunchOpengraphBlock): string => {
  const og = block.openGraphData
  let host = ""
  try {
    host = new URL(og.url).hostname.replace(/^www\./, "")
  } catch {
    host = og.url
  }
  const image = og.image || ""
  const linkUrl = og.canonicalUrl || og.url
  return [
    `<div class="wrap_item item_type_opengraph" ${dataAppAttr(block)}>`,
    `<a target="_blank" href="${encodeAttr(linkUrl)}" class="inner_wrap">`,
    `<div class="inner_wrap_text">`,
    `<strong class="title">${encodeText(og.title)}</strong>`,
    `<p class="desc">${encodeText(og.description)}</p>`,
    `<p class="url">${encodeText(host)}</p>`,
    `</div>`,
    image
      ? `<div class="inner_wrap_og_image" style="background-image:url(${encodeAttr(image)})">&nbsp;</div>`
      : "",
    `</a></div>`,
  ].join("")
}

const renderBlock = (block: BrunchBlock): string => {
  switch (block.type) {
    case "cover":
      return renderCover(block)
    case "text":
      return renderText(block)
    case "hr":
      return renderHr(block)
    case "opengraph":
      return renderOpengraph(block)
  }
}

/**
 * 최상위 content HTML 생성.
 * 구조: wrap_cover(커버블록) + wrap_body(나머지 블록 전체)
 */
export const renderDocument = (blocks: BrunchBlock[]): string => {
  if (blocks.length === 0) return ""
  const [first, ...rest] = blocks
  if (first.type !== "cover") {
    throw new Error("brunch-renderer: 첫 블록은 반드시 cover 블록이어야 함")
  }
  const coverHtml = renderCover(first)
  const bodyHtml = rest.map(renderBlock).join("")
  return `${coverHtml}<div class="wrap_body text_align_justify">${bodyHtml}</div>`
}
