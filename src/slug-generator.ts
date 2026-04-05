/**
 * 한글 제목 → 영어 슬러그 생성
 *
 * Google Cloud Translation API로 번역 후 slugify.
 * API 키 미설정 또는 실패 시 Ghost 기존 slug 사용.
 */

const GOOGLE_API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY ?? ""

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")

const translateToEnglish = async (text: string): Promise<string | null> => {
  if (!GOOGLE_API_KEY) return null

  try {
    const url = `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_API_KEY}`
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: text, source: "ko", target: "en", format: "text" }),
    })

    if (!res.ok) return null

    const data = (await res.json()) as {
      data: { translations: { translatedText: string }[] }
    }
    return data.data.translations[0]?.translatedText ?? null
  } catch {
    return null
  }
}

/**
 * 한글 제목에서 영어 슬러그 생성
 *
 * @param title - 아티클 제목 (한글)
 * @param fallbackSlug - 번역 실패 시 사용할 Ghost 기존 slug
 */
export const generateEnglishSlug = async (
  title: string,
  fallbackSlug: string
): Promise<string> => {
  const translated = await translateToEnglish(title)
  if (!translated) return fallbackSlug

  const slug = slugify(translated)
  return slug || fallbackSlug
}
