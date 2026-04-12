import type { WeekArticle, FormattedArticle } from "./types.js"
import { extractIntroHtml, cleanIntroHtml } from "./intro-extractor.js"

const NAVER_IMAGE_PX = 500
const ANTIEGG_HOME = "https://antiegg.kr/"
const ANTIEGG_ABOUT = "https://antiegg.kr/about/"

/**
 * 네이버 SmartEditor3 호환 마크업 헬퍼.
 *
 * SE3 sanitizer 실측 (재은님 피드백 반영):
 *  - 보존: `<font color>`, `<b>`, 평범한 `<p>` 텍스트, plaintext URL (→ OG 카드)
 *  - strip: inline `style`, `<hr>`, `<center>`, `align` (p/div), 일반 class
 *  - 테이블 우회는 폰트가 나눔고딕 15pt로 바뀌는 부작용 → 사용 안 함
 *
 * 정렬과 구분선은 SE3 자체 컴포넌트 마크업 그대로 출력.
 * SE3는 자기 자신이 만든 형식을 페이스트로 받으면 컴포넌트로 인식한다는 가정.
 */

/** SE3 정렬 단락 — SE3 자체 클래스를 그대로 사용 */
const seParagraph = (align: "left" | "right" | "center", innerHtml: string): string =>
  `<div class="se-component se-text se-l-default"><div class="se-component-content"><div class="se-section se-section-text se-l-default"><div class="se-module se-module-text"><p class="se-text-paragraph se-text-paragraph-align-${align}">${innerHtml}</p></div></div></div></div>`

/** SE3 구분선 컴포넌트 — 길이 차등은 SE3에서 발행 전 클릭으로 조정 */
const divider = (_length: 1 | 5): string =>
  `<div class="se-component se-divider se-l-default"><div class="se-component-content"><div class="se-section se-section-divider"><div class="se-module"><hr class="se-hr"></div></div></div></div>`

/** 링크 OG 카드 — 단독 단락 URL이 SE3에서 OG 카드로 자동 변환됨 */
const oglinkCard = (url: string): string =>
  `<p>${url}</p>`

const blank = (): string => `<p>&nbsp;</p>`

/** Edited by — 우측정렬, "Edited by"는 검정, 이름만 빨간색 + Bold */
const editedBy = (editor: string): string => {
  const name = editor || "(에디터 미상)"
  return seParagraph("right", `Edited by <b><font color="#f7343c">${name}</font></b>`)
}

const centerLine = (text: string, bold = false): string =>
  seParagraph("center", bold ? `<b>${text}</b>` : text)

const ctaReadFull = (): string =>
  `${centerLine("이 아티클의 본문 내용이 궁금하신가요?", true)}\n${centerLine("링크를 클릭하면 바로 읽어보실 수 있습니다.", true)}`

const ctaMoreArticles = (): string =>
  `${centerLine("이런 아티클은 어때요?")}\n${centerLine("더 많은 아티클은 ANTIEGG 사이트에서 확인하세요.")}`

const ctaAboutAntiegg = (): string =>
  `${centerLine("하루에 한 번 신선한 영감을 얻을 수 있는 곳")}\n${centerLine("프리랜서 에디터 공동체 ANTIEGG가 궁금하다면?")}`

/** 네이버 블로그 태그 자동 생성 — 보일러플레이트 + 카테고리 + Notion 카테고리/테마/키워드 + WP 태그 */
const buildNaverTags = (article: WeekArticle): string[] => {
  const merged = [
    "안티에그", "ANTIEGG", "antiegg",
    article.category,
    ...(article.notionCategories ?? []),
    ...(article.notionThemes ?? []),
    ...(article.notionKeywords ?? []),
    ...article.tags,
  ]
  return [...new Set(merged.filter(Boolean))]
}

/** 네이버 블로그 본문 HTML + 메타 생성 */
export const formatForNaver = (article: WeekArticle): FormattedArticle => {
  const { intro, hasDivider } = extractIntroHtml(article.contentHtml)
  const cleanedIntro = cleanIntroHtml(intro, NAVER_IMAGE_PX)

  const parts: string[] = [
    editedBy(article.editor),
    divider(5),
    cleanedIntro || `<p>(서문 없음)</p>`,
    divider(1),
    ctaReadFull(),
    blank(),
    oglinkCard(article.wpLink),
    blank(),
    blank(),
    divider(5),
    ctaMoreArticles(),
    blank(),
    oglinkCard(ANTIEGG_HOME),
    divider(1),
    ctaAboutAntiegg(),
    blank(),
    oglinkCard(ANTIEGG_ABOUT),
  ]

  const html = parts.join("\n")
  const notes: string[] = [
    "네이버 블로그 '주제'는 에디터에서 수동으로 선택해 주세요.",
    "대표 이미지를 블로그 배경 사진에 직접 업로드해야 합니다.",
    "구분선 길이는 SE3에서 발행 전 구분선을 클릭해 1(짧음)/5(김)로 조정해 주세요.",
    "링크는 페이스트 직후 SE3가 OG 카드(썸네일 포함)로 자동 변환합니다.",
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
      naverTags: buildNaverTags(article),
      notes,
    },
    html,
  }
}
