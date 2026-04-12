export type BlogCategory = "큐레이션" | "그레이"

/** 한 주에 발행된 아티클 한 건 (네이버/브런치 포맷터 입력) */
export interface WeekArticle {
  wpId: number
  wpLink: string
  title: string
  subtitle: string
  category: BlogCategory
  /** 디자인/컬쳐/라이프스타일 등 — #큐레이션_xx 해시태그 용 */
  subCategoryName: string
  /** 보일러플레이트 제외한 WP 태그 */
  tags: string[]
  /** WP 작성자 표시명 (Edited by) */
  editor: string
  featureImageUrl: string
  /** ISO */
  publishDate: string
  /** WP 본문 (rendered HTML) — 서문은 intro-extractor에서 추출 */
  contentHtml: string
  /** Notion 🔴 카테고리 (제공되면 네이버 태그에 합쳐짐) */
  notionCategories?: string[]
  /** Notion 🔴 테마 */
  notionThemes?: string[]
  /** Notion 🔴 키워드 */
  notionKeywords?: string[]
}

export interface ScheduledArticle extends WeekArticle {
  scheduleDay: "monday" | "tuesday"
  scheduleOrder: number
}

export interface ScheduleResult {
  weekLabel: string
  monday: ScheduledArticle[]
  tuesday: ScheduledArticle[]
}

export interface FormattedArticle {
  meta: {
    wpId: number
    title: string
    subtitle: string
    editor: string
    category: BlogCategory
    subCategoryName: string
    featureImageUrl: string
    wpLink: string
    /** 네이버 태그 (안티에그/ANTIEGG/antiegg/카테고리 + 본문 태그) */
    naverTags?: string[]
    /** 브런치 키워드 3개 */
    brunchKeywords?: string[]
    /** 사용자 안내 메모 (예: 주제 수동 선택) */
    notes: string[]
  }
  /** 클립보드에 복사할 인라인 스타일 HTML */
  html: string
}
