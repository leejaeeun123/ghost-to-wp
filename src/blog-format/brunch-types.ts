/**
 * 브런치 에디터 내부 포맷 타입.
 * 실제 api.brunch.co.kr 페이로드 역공학 결과 (HAR 캡처 2026-04-18 기준).
 *
 * content 필드는 HTML이지만, 각 블록에 data-app="{...JSON...}"로 구조화된 JSON을 병기한다.
 * 서버는 둘 중 data-app JSON을 source of truth로 사용한다고 추정.
 */

/** 인라인 텍스트 노드 (text.data[] 원소) */
export type BrunchInlineLeaf = { type: "text"; text: string }
export type BrunchInlineBr = { type: "br" }
export type BrunchInlineGroup = {
  type: "text"
  data: BrunchInlineNode[]
  style?: { color?: string }
  styleType?: "bold"
}
export type BrunchInlineNode = BrunchInlineLeaf | BrunchInlineBr | BrunchInlineGroup

/** 커버 블록 — 매 아티클 상단 필수 */
export interface BrunchCoverBlock {
  type: "cover"
  kind: "cover_full"
  align: "left" | "center" | "right"
  title: {
    style: { "font-family"?: string }
    data: BrunchInlineNode[]
    text: string
  }
  "title-sub": {
    style: Record<string, string>
    data: BrunchInlineNode[]
    text: string
  }
  plain: { title: string; "title-sub": string }
  style: { "background-image": string }
  width: number
  height: number
}

/** 문단 / 헤딩 블록 */
export interface BrunchTextBlock {
  type: "text"
  data: BrunchInlineNode[]
  size?: "h2" | "h3"
}

/** 구분선 블록 — kind는 hr_type_1~6 (실측 6종 존재) */
export interface BrunchHrBlock {
  type: "hr"
  kind: "hr_type_1" | "hr_type_2" | "hr_type_3" | "hr_type_4" | "hr_type_5" | "hr_type_6"
}

/** OG 카드 블록 — /v2/url/info 응답을 embed */
export interface BrunchOpengraphData {
  title: string
  description: string
  url: string
  canonicalUrl?: string
  image?: string
}
export interface BrunchOpengraphBlock {
  type: "opengraph"
  openGraphData: BrunchOpengraphData
}

export type BrunchBlock =
  | BrunchCoverBlock
  | BrunchTextBlock
  | BrunchHrBlock
  | BrunchOpengraphBlock

/** 커버 이미지 메타 — /v2/upload 응답을 저장 */
export interface BrunchCoverImage {
  width: number
  height: number
  url: string
}

/** 태그 후보 (publisher가 /v1/keyword/suggest로 검증 후 확정) */
export interface BrunchTagCandidates {
  themes: string[]
  keywords: string[]
}

/** 포매터 최종 출력 — publisher가 API로 전송할 페이로드 재료 */
export interface BrunchArticleDraft {
  title: string
  subTitle: string
  blocks: BrunchBlock[]
  contentHtml: string
  contentSummary: string
  plainContent: string
  coverImage: BrunchCoverImage
  tagCandidates: BrunchTagCandidates
  notes: string[]
}

/** publisher로 전달되는 IO 결과 번들 (formatter는 pure 함수) */
export interface BrunchFormatInput {
  coverUrl: string
  coverWidth: number
  coverHeight: number
  ogCards: {
    wpArticle: BrunchOpengraphData
    antieggHome: BrunchOpengraphData
    antieggAbout: BrunchOpengraphData
  }
}
