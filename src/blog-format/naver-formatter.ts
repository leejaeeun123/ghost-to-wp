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

/**
 * SE3 정렬 단락. upconvert API는 class+inline style 둘 다 있어야 정렬 인식
 * (align-diagnose F 패턴 검증). class만으론 align: justify로 normalize됨.
 */
const seParagraph = (align: "left" | "right" | "center", innerHtml: string): string =>
  `<div class="se-component se-text se-l-default"><div class="se-component-content"><div class="se-section se-section-text se-l-default"><div class="se-module se-module-text"><p class="se-text-paragraph se-text-paragraph-align-${align}" style="text-align:${align}">${innerHtml}</p></div></div></div></div>`

type DividerKind = "short" | "long";

/**
 * SE3 구분선 컴포넌트 placeholder. 실제 layout/align 적용은 swap 인터셉터가 담당.
 *  - "short" → layout:"default", align:"center" (짧은 가로 막대, 가운데)
 *  - "long"  → layout:"line1",   align:"justify" (긴 실선, 양쪽)
 */
const divider = (_kind: DividerKind): string =>
  `<div class="se-component se-divider se-l-default"><div class="se-component-content"><div class="se-section se-section-divider"><div class="se-module"><hr class="se-hr"></div></div></div></div>`

/**
 * 링크 단락 — 가운데 정렬. paste flow에선 plaintext URL이 OG 카드로 자동
 * 변환되지만, swap 흐름에선 paste handler를 거치지 않으므로 텍스트 링크로
 * 남는다. OG 카드 변환은 별도 oglink 컴포넌트 직접 빌드가 필요(Phase 3).
 */
const oglinkCard = (url: string): string =>
  seParagraph("center", url)

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

/**
 * 네이버 블로그 태그 자동 생성.
 *
 * 정상 흐름: sync-routes.ts가 Notion 4필드(🔴 카테고리·🔴 테마·🔴 키워드·기타)를 WP 태그로 통합 동기화.
 * 따라서 article.tags 하나로 충분.
 *
 * 단, sync-routes.ts 수정 이전에 동기화된 아티클은 🔴 카테고리가 WP 태그에 없을 수 있어
 * article.notionCategories를 폴백으로 직접 합쳐 누락 방지. Set dedup으로 중복 제거됨.
 *   필수: ANTIEGG, antiegg, 안티에그
 *   + article.category(큐레이션|그레이) prefix
 *   + ...article.notionCategories (기존 동기화 아티클 폴백)
 *   + ...article.tags
 */
const buildNaverTags = (article: WeekArticle): string[] => {
  const merged = [
    "ANTIEGG", "antiegg", "안티에그",
    article.category,
    ...(article.notionCategories ?? []),
    ...article.tags,
  ]
  return [...new Set(merged.filter(Boolean))]
}

/** 단락 사이에 빈 줄을 끼워 가독성 확보 (서문용) */
const spaceParagraphs = (html: string): string =>
  html.replace(/<\/p>\s*<(p|figure)/g, "</p><p>&nbsp;</p><$1")

/** 네이버 블로그 본문 HTML + 메타 생성 */
export const formatForNaver = (article: WeekArticle): FormattedArticle => {
  const { intro, hasDivider } = extractIntroHtml(article.contentHtml)
  const cleanedIntro = spaceParagraphs(cleanIntroHtml(intro, NAVER_IMAGE_PX))

  // 사용자 명시 구분선 순서: 긴 실선 → 짧은 가로 → 긴 실선 → 짧은 가로
  const naverDividerLayouts: DividerKind[] = []
  const pushDivider = (k: DividerKind): string => {
    naverDividerLayouts.push(k)
    return divider(k)
  }

  // OG 카드로 변환할 URL 시퀀스 (등장 순서). swap 흐름에서 oglink 컴포넌트로 교체.
  const naverOglinkUrls: string[] = []
  // 썸네일 제외하고 텍스트 카드로만 보여줄 URL (재은님 요청: antiegg.kr 홈)
  const naverNoThumbnailUrls: string[] = [ANTIEGG_HOME]
  const pushOglink = (url: string): string => {
    naverOglinkUrls.push(url)
    return oglinkCard(url)
  }

  const parts: string[] = [
    editedBy(article.editor),
    pushDivider("long"),
    cleanedIntro || `<p>(서문 없음)</p>`,
    pushDivider("short"),
    ctaReadFull(),
    blank(),
    pushOglink(article.wpLink),
    blank(),
    blank(),
    pushDivider("long"),
    ctaMoreArticles(),
    blank(),
    pushOglink(ANTIEGG_HOME),
    pushDivider("short"),
    ctaAboutAntiegg(),
    blank(),
    pushOglink(ANTIEGG_ABOUT),
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
      naverDividerLayouts,
      naverOglinkUrls,
      naverNoThumbnailUrls,
      notes,
    },
    html,
  }
}
