import type { WeekArticle, FormattedArticle } from "./types.js"
import { extractIntroHtml, cleanIntroHtml } from "./intro-extractor.js"

const BRUNCH_IMAGE_PX = 700
const ANTIEGG_HOME = "https://antiegg.kr/"
const ANTIEGG_ABOUT = "https://antiegg.kr/about/"

/**
 * 브런치 sanitizer는 네이버 SE3보다 엄격하다 (재은님 실측):
 *  - strip: inline `style`, `<h2>`, `<strong>`(클래스 동반 시), `<hr>`, 모든 class
 *  - 보존: 평범한 `<p>` 텍스트, `<br>`, plaintext URL → OG 카드, `<font color>`, `<b>`
 *
 * 구분선은 `<hr>`/테이블 모두 strip되므로 Unicode 막대 문자(━)로 대체.
 */

/** 브런치 내부 구분선과 동일한 bare <hr>. 길이/굵기는 발행 전 수동 조정. */
const divider = (_length: 1 | 5): string => `<hr>`

const centerLink = (url: string): string =>
  `<p>${url}</p>`

const blank = (): string => `<p>&nbsp;</p>`

/** #큐레이션_컬쳐 또는 #그레이 — Bold만 적용 (h2 strip됨) */
const hashtagHeading = (article: WeekArticle): string => {
  const tag = article.category === "그레이"
    ? "#그레이"
    : `#큐레이션${article.subCategoryName ? "_" + article.subCategoryName : ""}`
  return `<p><b>${tag}</b></p>`
}

/** 카테고리 안내 문구 — 회색 #959595 (브런치 본문 회색 톤 실측치) */
const categoryIntroLine = (article: WeekArticle): string => {
  const text = article.category === "그레이"
    ? "문화예술을 둘러싼 다양한 질문을 던지고 탐구합니다."
    : "문화예술계 내 유용한 정보들을 소개합니다."
  return `<p><font color="#959595">${text}</font></p>`
}

const editedBy = (editor: string): string => {
  const name = editor || "(에디터 미상)"
  return `<p>Edited by <b><font color="#ff8c00">${name}</font></b></p>`
}

const ctaReadFull = (): string =>
  `<p><b>이 아티클의 본문 내용이 궁금하신가요?<br>링크를 클릭하면 바로 읽어보실 수 있습니다.</b></p>`

const ctaMoreArticles = (): string =>
  `<p>이런 아티클은 어때요?<br>더 많은 아티클은 ANTIEGG 사이트에서 확인하세요.</p>`

const ctaAboutAntiegg = (): string =>
  `<p>하루에 한 번 신선한 영감을 얻을 수 있는 곳<br>프리랜서 에디터 공동체 ANTIEGG가 궁금하다면?</p>`

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
    "구분선 길이/굵기는 발행 전 브런치에서 수동 조정해 주세요.",
    "#큐레이션_xx 해시태그는 평문으로 들어가니 발행 전 H2 + Bold로 변경해 주세요.",
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
