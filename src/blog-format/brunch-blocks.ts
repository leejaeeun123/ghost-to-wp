import type {
  BrunchBlock,
  BrunchCoverBlock,
  BrunchHrBlock,
  BrunchInlineGroup,
  BrunchInlineLeaf,
  BrunchInlineNode,
  BrunchOpengraphBlock,
  BrunchOpengraphData,
  BrunchQuotationBlock,
  BrunchTextBlock,
} from "./brunch-types.js"

/** 인라인 노드 빌더 */
export const inline = (text: string): BrunchInlineLeaf => ({ type: "text", text })
export const inlineBr = (): { type: "br" } => ({ type: "br" })

const wrapGroup = (data: BrunchInlineNode[]): BrunchInlineGroup => ({
  type: "text",
  data,
})

export const bold = (child: BrunchInlineNode | string): BrunchInlineGroup => {
  const data: BrunchInlineNode[] = typeof child === "string" ? [inline(child)] : [child]
  return { type: "text", data, styleType: "bold" }
}

export const colored = (
  child: BrunchInlineNode | BrunchInlineNode[] | string,
  color: string,
): BrunchInlineGroup => {
  let data: BrunchInlineNode[]
  if (typeof child === "string") data = [inline(child)]
  else if (Array.isArray(child)) data = child
  else data = [child]
  return { type: "text", data, style: { color } }
}

/**
 * 브런치 커버 제목 자동 줄바꿈.
 * 공백이 있으면 중앙에 가장 가까운 공백에서 두 줄로 나눈다.
 * 공백이 없거나 너무 짧으면(8자 이하) 한 줄 유지.
 */
const splitTitleAtMiddle = (title: string): string[] => {
  if (title.length <= 8) return [title]
  const spaces: number[] = []
  for (let i = 0; i < title.length; i++) if (title[i] === " ") spaces.push(i)
  if (spaces.length === 0) return [title]
  const mid = title.length / 2
  let best = spaces[0]
  let bestDist = Math.abs(best - mid)
  for (const idx of spaces) {
    const d = Math.abs(idx - mid)
    if (d < bestDist) { best = idx; bestDist = d }
  }
  return [title.slice(0, best), title.slice(best + 1)]
}

/** 블록 빌더 */
export const buildCover = (args: {
  title: string
  subTitle: string
  coverUrl: string
  width: number
  height: number
}): BrunchCoverBlock => {
  const lines = splitTitleAtMiddle(args.title)
  const titleData: BrunchInlineNode[] = []
  lines.forEach((ln, i) => {
    if (i > 0) titleData.push(inlineBr())
    titleData.push(inline(ln))
  })
  const subData: BrunchInlineNode[] = [inline(args.subTitle)]
  return {
    type: "cover",
    kind: "cover_full",
    align: "left",
    title: {
      style: { "font-family": "Noto Sans DemiLight" },
      data: titleData,
      text: args.title,
    },
    "title-sub": {
      style: {},
      data: subData,
      text: args.subTitle,
    },
    // HAR 실측: plain.title은 줄바꿈 제거하고 공백도 없이 단순 concat
    plain: { title: lines.join(""), "title-sub": args.subTitle },
    style: { "background-image": args.coverUrl },
    width: args.width,
    height: args.height,
  }
}

export const buildHeading = (
  inner: BrunchInlineNode | BrunchInlineNode[],
  size: "h2" | "h3" = "h2",
): BrunchTextBlock => {
  const data: BrunchInlineNode[] = Array.isArray(inner) ? inner : [inner]
  return { type: "text", data, size }
}

export const buildParagraph = (
  inner: BrunchInlineNode | BrunchInlineNode[] | string,
): BrunchTextBlock => {
  let data: BrunchInlineNode[]
  if (typeof inner === "string") data = [inline(inner)]
  else if (Array.isArray(inner)) data = inner
  else data = [inner]
  return { type: "text", data }
}

/** 빈 줄 — data: [{type:br}] 만 있는 text 블록 */
export const buildBlankLine = (): BrunchTextBlock => ({
  type: "text",
  data: [inlineBr()],
})

export const buildHr = (kind: BrunchHrBlock["kind"] = "hr_type_6"): BrunchHrBlock => ({
  type: "hr",
  kind,
})

/** 브런치 인용문 블록. HAR 실측상 data 끝에 {type:"br"}이 붙는 관습을 따른다. */
export const buildQuotation = (
  inner: BrunchInlineNode | BrunchInlineNode[] | string,
  kind: BrunchQuotationBlock["kind"] = "bar",
): BrunchQuotationBlock => {
  let data: BrunchInlineNode[]
  if (typeof inner === "string") data = [inline(inner)]
  else if (Array.isArray(inner)) data = [...inner]
  else data = [inner]
  const last = data[data.length - 1]
  if (!last || last.type !== "br") data.push(inlineBr())
  return { type: "quotation", kind, data }
}

export const buildOpengraph = (data: BrunchOpengraphData): BrunchOpengraphBlock => ({
  type: "opengraph",
  openGraphData: data,
})

/** BrunchBlock[]에서 plain text 추출 (contentSummary / plainContent 용) */
export const extractPlainText = (blocks: BrunchBlock[]): string => {
  const parts: string[] = []
  const walkInline = (nodes: BrunchInlineNode[]): string => {
    let out = ""
    for (const n of nodes) {
      if (n.type === "br") out += " "
      else if ("text" in n && typeof n.text === "string") out += n.text
      else if ("data" in n && Array.isArray(n.data)) out += walkInline(n.data)
    }
    return out
  }
  for (const b of blocks) {
    if (b.type === "cover") {
      parts.push(b.title.text)
      parts.push(b["title-sub"].text)
    } else if (b.type === "text") {
      parts.push(walkInline(b.data))
    } else if (b.type === "quotation") {
      parts.push(walkInline(b.data))
    } else if (b.type === "opengraph") {
      parts.push(b.openGraphData.url)
    }
    // hr는 플레인 텍스트에 기여 안함
  }
  return parts.filter((p) => p && p.trim()).join(" ").replace(/\s+/g, " ").trim()
}

export type { BrunchBlock }
