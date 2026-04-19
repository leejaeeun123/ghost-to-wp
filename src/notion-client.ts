/**
 * Notion API 클라이언트 — 아티클 로드맵 DB 연동
 *
 * Ghost 아티클의 메타데이터를 Notion DB에서 조회:
 * - 바이럴 멘트 → Yoast 메타 설명
 * - 발행일 → WP 발행일
 * - 부제목 → 메타 설명 폴백
 *
 * 매칭: Square CMS URL 필드에서 Ghost 슬러그 검색
 */

export interface NotionArticle {
  pageId?: string
  title: string
  viralMent: string
  subtitle: string
  publishDate: string | null
  status: string
  squareCmsUrl: string
  categories: string[]
  keywords: string[]
  themes: string[]
  extras: string[]
}

const getNotionConfig = (): { apiKey: string; dbId: string } | null => {
  const apiKey = process.env.NOTION_API_KEY
  const dbId = process.env.NOTION_ARTICLE_DB_ID
  if (!apiKey || !dbId) return null
  return { apiKey, dbId }
}

interface NotionQueryResponse {
  results: Array<{ properties: Record<string, unknown> }>
  has_more: boolean
  next_cursor: string | null
}

const notionFetch = async <T>(
  path: string,
  apiKey: string,
  options: RequestInit = {}
): Promise<T> => {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Notion-Version": "2022-06-28",
      ...options.headers,
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Notion API 오류 (${res.status}): ${body}`)
  }

  return res.json() as Promise<T>
}

/** Square CMS URL에서 Ghost 슬러그 추출 */
const extractSlugFromUrl = (url: string): string => {
  if (!url) return ""
  const cleaned = url
    .replace(/^https?:\/\//, "")
    .replace(/^square\.antiegg\.kr\//, "")
    .replace(/\/$/, "")
  return cleaned.split("/").pop() ?? ""
}

/** Notion 페이지 properties → NotionArticle 변환 */
const extractArticle = (props: Record<string, any>): NotionArticle => ({
  title: props["아티클 제목"]?.title?.[0]?.plain_text ?? "",
  viralMent: (props["바이럴 멘트"]?.rich_text ?? [])
    .map((t: { plain_text: string }) => t.plain_text)
    .join(""),
  subtitle: props["부제목"]?.rich_text?.[0]?.plain_text ?? "",
  publishDate: props["발행일"]?.date?.start ?? null,
  status: props["상태"]?.select?.name ?? "",
  squareCmsUrl: props["Square CMS"]?.url ?? "",
  categories: props["🔴 카테고리"]?.multi_select?.map((s: { name: string }) => s.name) ?? [],
  keywords: props["🔴 키워드"]?.multi_select?.map((s: { name: string }) => s.name) ?? [],
  themes: props["🔴 테마"]?.multi_select?.map((s: { name: string }) => s.name) ?? [],
  extras: props["기타"]?.multi_select?.map((s: { name: string }) => s.name) ?? [],
})

/**
 * Ghost 슬러그로 Notion 아티클 로드맵 DB 검색
 *
 * Square CMS URL에 슬러그가 포함된 항목을 찾음.
 * Notion API filter (url.contains)를 사용하여 서버 사이드 필터링.
 */
export const findNotionArticle = async (
  ghostSlug: string
): Promise<NotionArticle | null> => {
  const config = getNotionConfig()
  if (!config) return null

  try {
    const data = await notionFetch<NotionQueryResponse>(
      `/databases/${config.dbId}/query`,
      config.apiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filter: {
            property: "Square CMS",
            url: { contains: ghostSlug },
          },
          page_size: 5,
        }),
      }
    )

    if (data.results.length === 0) return null

    // 정확한 슬러그 매칭 (substring 오탐 방지)
    for (const page of data.results) {
      const props = page.properties as Record<string, any>
      const urlSlug = extractSlugFromUrl(props["Square CMS"]?.url ?? "")
      if (urlSlug === ghostSlug) {
        return extractArticle(props)
      }
    }

    // 정확 매칭 실패 시 첫 결과 반환
    return extractArticle(data.results[0].properties as Record<string, any>)
  } catch (err) {
    console.error(`  Notion 조회 실패 (${ghostSlug}):`, err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * 발행일 범위로 Notion 아티클 조회 (자동 동기화용)
 * Square CMS URL이 있는 항목만 반환 (Ghost에 존재하는 아티클)
 */
export const fetchArticlesForWeek = async (
  fromDate: string,
  toDate: string
): Promise<NotionArticle[]> => {
  const config = getNotionConfig()
  if (!config) {
    console.log("  Notion 환경변수 미설정 — 자동 동기화 불가")
    return []
  }

  try {
    const data = await notionFetch<NotionQueryResponse>(
      `/databases/${config.dbId}/query`,
      config.apiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filter: {
            and: [
              { property: "발행일", date: { on_or_after: fromDate } },
              { property: "발행일", date: { on_or_before: toDate } },
              { property: "Square CMS", url: { is_not_empty: true } },
            ],
          },
        }),
      }
    )

    return data.results.map((page) => ({
      ...extractArticle(page.properties as Record<string, any>),
      pageId: (page as unknown as { id: string }).id,
    }))
  } catch (err) {
    console.error("Notion 주간 조회 실패:", err instanceof Error ? err.message : err)
    return []
  }
}

/** Notion 페이지에 댓글 추가 (WP 발행 링크 등) */
export const addNotionComment = async (
  pageId: string,
  url: string
): Promise<boolean> => {
  const config = getNotionConfig()
  if (!config) return false

  try {
    await notionFetch<unknown>(
      "/comments",
      config.apiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parent: { page_id: pageId },
          rich_text: [
            { text: { content: "WP 예약 발행 링크: " } },
            { text: { content: url, link: { url } } },
          ],
        }),
      }
    )
    return true
  } catch (err) {
    console.error(`  Notion 댓글 실패 (${pageId}):`, err instanceof Error ? err.message : err)
    return false
  }
}

/** Notion 페이지에 임의의 rich_text 댓글 추가 — 멘션/링크 자유 구성용 */
export const addNotionRichComment = async (
  pageId: string,
  richText: Array<Record<string, unknown>>,
): Promise<boolean> => {
  const config = getNotionConfig()
  if (!config) return false
  try {
    await notionFetch<unknown>("/comments", config.apiKey, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parent: { page_id: pageId }, rich_text: richText }),
    })
    return true
  } catch (err) {
    console.error(`  Notion 댓글 실패 (${pageId}):`, err instanceof Error ? err.message : err)
    return false
  }
}

/**
 * Notion DB 전체 조회 (웹 어드민 용)
 * 최근 수정순으로 반환
 */
export const fetchAllNotionArticles = async (): Promise<NotionArticle[]> => {
  const config = getNotionConfig()
  if (!config) return []

  try {
    const articles: NotionArticle[] = []
    let cursor: string | undefined

    do {
      const body: Record<string, unknown> = {
        page_size: 100,
        sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      }
      if (cursor) body.start_cursor = cursor

      const data = await notionFetch<NotionQueryResponse>(
        `/databases/${config.dbId}/query`,
        config.apiKey,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      )

      for (const page of data.results) {
        articles.push(extractArticle(page.properties as Record<string, any>))
      }

      cursor = data.has_more ? (data.next_cursor ?? undefined) : undefined
    } while (cursor)

    return articles
  } catch (err) {
    console.error("Notion 전체 조회 실패:", err instanceof Error ? err.message : err)
    return []
  }
}
