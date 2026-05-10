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
    /**
     * 네이버 horizontalLine 컴포넌트 종류 시퀀스. formatForNaver가 emit한 divider 순서와 동일.
     * swap 인터셉터가 ourComponents 안의 horizontalLine을 등장 순서대로 이 배열의 값에 매칭하여
     * 각각 layout/align을 set한다.
     *  - "short" → layout:"default", align:"center"  (짧은 가로 막대, 가운데 정렬)
     *  - "long"  → layout:"line1",   align:"justify" (긴 실선, 양쪽 폭)
     */
    naverDividerLayouts?: ("short" | "long")[]
    /**
     * 본문 안에 단독 paragraph로 등장하는 URL 시퀀스. swap 흐름에서 OG API
     * (platform.editor.naver.com/api/blogpc001/v1/oglink)를 호출해 oglink 컴포넌트로
     * 변환한 후, 같은 URL을 가진 paragraph를 oglink 컴포넌트로 교체한다.
     */
    naverOglinkUrls?: string[]
    /**
     * naverOglinkUrls 중 썸네일 없이 카드만 보여주고 싶은 URL.
     * (예: antiegg.kr 홈은 텍스트 카드로만 표시) publisher가 이 URL의 oglink
     * 컴포넌트에서 thumbnail 필드를 제거.
     */
    naverNoThumbnailUrls?: string[]
    /** 브런치 키워드 3개 */
    brunchKeywords?: string[]
    /** 사용자 안내 메모 (예: 주제 수동 선택) */
    notes: string[]
  }
  /** 클립보드에 복사할 인라인 스타일 HTML */
  html: string
}
