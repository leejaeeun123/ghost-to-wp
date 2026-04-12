import type { WeekArticle, FormattedArticle } from "./types.js"
import { extractIntroHtml, cleanIntroHtml } from "./intro-extractor.js"

const BRUNCH_IMAGE_PX = 700
const ANTIEGG_HOME = "https://antiegg.kr/"
const ANTIEGG_ABOUT = "https://antiegg.kr/about/"

const divider = (weight: 1 | 5): string =>
  `<hr style="border:0;border-top:${weight === 5 ? 6 : 1}px solid #333;margin:32px 0" />`

const centerLink = (url: string): string =>
  `<p style="text-align:center"><a href="${url}" target="_blank" rel="noopener">${url}</a></p>`

const blank = (): string => `<p>&nbsp;</p>`

/** #큐레이션_컬쳐 또는 #그레이 — 제목2 + Bold */
const hashtagHeading = (article: WeekArticle): string => {
  const tag = article.category === "그레이"
    ? "#그레이"
    : `#큐레이션${article.subCategoryName ? "_" + article.subCategoryName : ""}`
  return `<h2><strong>${tag}</strong></h2>`
}

/** 카테고리 안내 문구 (회색) */
const categoryIntroLine = (article: WeekArticle): string => {
  const text = article.category === "그레이"
    ? "문화예술을 둘러싼 다양한 질문을 던지고 탐구합니다."
    : "문화예술계 내 유용한 정보들을 소개합니다."
  return `<p style="color:#888">${text}</p>`
}

const editedBy = (editor: string): string =>
  `<p style="text-align:left"><strong style="color:#ff8c00">Edited by ${editor || "(에디터 미상)"}</strong></p>`

const ctaReadFull = (): string =>
  `<p style="text-align:left"><strong>이 아티클의 본문 내용이 궁금하신가요?<br>링크를 클릭하면 바로 읽어보실 수 있습니다.</strong></p>`

const ctaMoreArticles = (): string =>
  `<p style="text-align:left">이런 아티클은 어때요?<br>더 많은 아티클은 ANTIEGG 사이트에서 확인하세요.</p>`

const ctaAboutAntiegg = (): string =>
  `<p style="text-align:left">하루에 한 번 신선한 영감을 얻을 수 있는 곳<br>프리랜서 에디터 공동체 ANTIEGG가 궁금하다면?</p>`

/** 브런치 키워드 3개 — 카테고리/서브카테고리/첫번째 태그 */
const buildBrunchKeywords = (article: WeekArticle): string[] => {
  const candidates: string[] = []
  if (article.category) candidates.push(article.category)
  if (article.subCategoryName) candidates.push(article.subCategoryName)
  for (const tag of article.tags) {
    if (candidates.length >= 3) break
    if (!candidates.includes(tag)) candidates.push(tag)
  }
  return candidates.slice(0, 3)
}

export const formatForBrunch = (article: WeekArticle): FormattedArticle => {
  const { intro, hasDivider } = extractIntroHtml(article.contentHtml)
  const cleanedIntro = cleanIntroHtml(intro, BRUNCH_IMAGE_PX)

  const parts: string[] = [
    hashtagHeading(article),
    categoryIntroLine(article),
    blank(),
    divider(5),
    editedBy(article.editor),
    divider(5),
    cleanedIntro || `<p>(서문 없음)</p>`,
    blank(),
    divider(1),
    ctaReadFull(),
    centerLink(article.wpLink),
    blank(),
    blank(),
    divider(5),
    ctaMoreArticles(),
    centerLink(ANTIEGG_HOME),
    blank(),
    divider(1),
    ctaAboutAntiegg(),
    centerLink(ANTIEGG_ABOUT),
  ]

  const html = parts.join("\n")
  const notes: string[] = [
    "브런치 커버 이미지(풀 높이)를 직접 업로드해 주세요.",
    "본문 정렬은 양쪽정렬로 설정해 주세요.",
  ]
  if (!hasDivider) {
    notes.push("WP 본문에서 구분선(<hr>)을 찾지 못해 전체 본문을 서문으로 처리했습니다. 확인 필요.")
  }

  return {
    meta: {
      wpId: article.wpId,
      title: article.title,
      subtitle: article.subtitle,
      editor: article.editor,
      category: article.category,
      subCategoryName: article.subCategoryName,
      featureImageUrl: article.featureImageUrl,
      wpLink: article.wpLink,
      brunchKeywords: buildBrunchKeywords(article),
      notes,
    },
    html,
  }
}
