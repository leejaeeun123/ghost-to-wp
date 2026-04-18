import type {
  BrunchBlock,
  BrunchCoverBlock,
  BrunchHrBlock,
  BrunchInlineGroup,
  BrunchInlineLeaf,
  BrunchInlineNode,
  BrunchOpengraphBlock,
  BrunchOpengraphData,
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

/** 블록 빌더 */
export const buildCover = (args: {
  title: string
  subTitle: string
  coverUrl: string
  width: number
  height: number
}): BrunchCoverBlock => {
  const titleData: BrunchInlineNode[] = [inline(args.title)]
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
    plain: { title: args.title, "title-sub": args.subTitle },
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
    } else if (b.type === "opengraph") {
      parts.push(b.openGraphData.url)
    }
    // hr는 플레인 텍스트에 기여 안함
  }
  return parts.filter((p) => p && p.trim()).join(" ").replace(/\s+/g, " ").trim()
}

export type { BrunchBlock }
