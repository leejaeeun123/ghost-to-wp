/**
 * WP 본문(rendered HTML)에서 서문 추출.
 *
 * "서문 = 본문의 첫 <hr>(구분선) 바로 전까지".
 * <hr>이 없으면 전체 본문을 반환하고 hasDivider=false 표시 (UI 경고용).
 */
export interface IntroResult {
  intro: string
  hasDivider: boolean
}

const HR_REGEX = /<hr\b[^>]*\/?>(?:\s*<\/hr>)?/i

export const extractIntroHtml = (renderedHtml: string): IntroResult => {
  if (!renderedHtml) return { intro: "", hasDivider: false }

  const match = HR_REGEX.exec(renderedHtml)
  if (!match) {
    return { intro: renderedHtml.trim(), hasDivider: false }
  }
  return {
    intro: renderedHtml.slice(0, match.index).trim(),
    hasDivider: true,
  }
}

/**
 * 서문 HTML을 네이버/브런치 에디터 붙여넣기에 적합하게 정리.
 *
 * 네이버 SmartEditor3는 inline `style`을 strip하므로 HTML 속성(`align`, `width`)을 사용한다.
 * `<figure>`도 보존되지 않을 수 있어 `<p align="center">`로 wrap한다.
 */
export const cleanIntroHtml = (html: string, imageMaxPx: number): string => {
  if (!html) return ""

  let out = html
    // HTML 코멘트 제거
    .replace(/<!--[\s\S]*?-->/g, "")
    // 중첩된 <p><p>...</p></p> 평탄화 (WP content.rendered 흔한 패턴)
    .replace(/<p>\s*<p>/gi, "<p>")
    .replace(/<\/p>\s*<\/p>/gi, "</p>")
    // 빈 wp-block-spacer div는 제거
    .replace(/<div[^>]*wp-block-spacer[^>]*><\/div>/gi, "")
    // wp-block-* 클래스 제거
    .replace(/\s*class="wp-block-[^"]*"/gi, "")
    .replace(/\s*class="wp-image-[^"]*"/gi, "")

  // <figure> → <p align="center"> 로 교체 (네이버가 figure 태그를 제대로 처리 못함)
  out = out.replace(/<figure\b[^>]*>/gi, '<p align="center">')
  out = out.replace(/<\/figure>/gi, "</p>")

  // <figcaption> → <br><font size="2" color="#888"> ... </font>
  out = out.replace(/<figcaption\b[^>]*>/gi, '<br><font size="2" color="#888">')
  out = out.replace(/<\/figcaption>/gi, "</font>")

  // <img>: inline style/width/height 제거 후 width HTML 속성 부여
  out = out.replace(/<img\b([^>]*?)\/?>/gi, (_, attrs: string) => {
    const cleaned = attrs
      .replace(/\s*style="[^"]*"/i, "")
      .replace(/\s*width="[^"]*"/i, "")
      .replace(/\s*height="[^"]*"/i, "")
    return `<img${cleaned} width="${imageMaxPx}" />`
  })

  return out.trim()
}
