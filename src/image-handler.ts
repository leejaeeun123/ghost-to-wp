import sharp from "sharp"
import { uploadWpMedia } from "./wp-client.js"
import type { WpMediaUpload } from "./types.js"

interface ImageDimensions {
  width: number
  height: number
}

/**
 * 이미지 URL에서 다운로드 → WP 미디어 라이브러리 업로드
 * → 새 WP URL 반환
 */
export const downloadAndUpload = async (
  imageUrl: string
): Promise<WpMediaUpload> => {
  const res = await fetch(imageUrl)
  if (!res.ok) {
    throw new Error(`이미지 다운로드 실패: ${imageUrl} (${res.status})`)
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get("content-type") ?? "image/jpeg"
  const filename = extractFilename(imageUrl)

  return uploadWpMedia(buffer, filename, contentType)
}

/**
 * 이미지 URL에서 파일명 추출
 */
const extractFilename = (url: string): string => {
  const pathname = new URL(url).pathname
  const segments = pathname.split("/")
  const last = segments[segments.length - 1] ?? "image.jpg"
  return decodeURIComponent(last)
}

/**
 * HTML 본문 내 Ghost 이미지 URL을 WP URL로 교체
 *
 * Ghost 이미지: square.antiegg.kr/content/images/...
 * → WP 미디어 라이브러리 URL로 교체
 */
export const replaceImageUrls = async (
  html: string,
  dryRun: boolean
): Promise<{ html: string; uploadedCount: number }> => {
  const ghostImagePattern = /https?:\/\/square\.antiegg\.kr\/content\/images\/[^\s"')]+/g
  const matches = [...new Set(html.match(ghostImagePattern) ?? [])]

  if (matches.length === 0) return { html, uploadedCount: 0 }

  const urlMap = new Map<string, string>()

  for (const ghostUrl of matches) {
    if (dryRun) {
      urlMap.set(ghostUrl, `[DRY-RUN:${extractFilename(ghostUrl)}]`)
      continue
    }

    try {
      const uploaded = await downloadAndUpload(ghostUrl)
      urlMap.set(ghostUrl, uploaded.source_url)
    } catch (err) {
      console.error(`  이미지 업로드 실패: ${ghostUrl}`, err)
      urlMap.set(ghostUrl, ghostUrl)
    }
  }

  let result = html
  for (const [original, replacement] of urlMap) {
    result = result.replaceAll(original, replacement)
  }

  return {
    html: result,
    uploadedCount: dryRun ? 0 : matches.length,
  }
}

/**
 * 대표 이미지(feature_image) 업로드 → WP 미디어 ID 반환
 * grayscale=true 시 흑백 변환 후 업로드 (그레이 카테고리용)
 */
export const uploadFeatureImage = async (
  featureImageUrl: string | null,
  dryRun: boolean,
  grayscale = false
): Promise<number> => {
  if (!featureImageUrl) return 0
  if (dryRun) return 0

  try {
    if (grayscale) {
      const uploaded = await downloadGrayscaleAndUpload(featureImageUrl)
      return uploaded.id
    }
    const uploaded = await downloadAndUpload(featureImageUrl)
    return uploaded.id
  } catch (err) {
    console.error(`  대표 이미지 업로드 실패: ${featureImageUrl}`, err)
    return 0
  }
}

/**
 * 이미지 다운로드 → 흑백 변환 → WP 업로드
 */
const downloadGrayscaleAndUpload = async (
  imageUrl: string
): Promise<WpMediaUpload> => {
  const res = await fetch(imageUrl)
  if (!res.ok) {
    throw new Error(`이미지 다운로드 실패: ${imageUrl} (${res.status})`)
  }

  const original = Buffer.from(await res.arrayBuffer())
  const grayscaled = await sharp(original).grayscale().jpeg({ quality: 90 }).toBuffer()
  const filename = extractFilename(imageUrl).replace(/\.[^.]+$/, ".jpg")

  return uploadWpMedia(grayscaled, filename, "image/jpeg")
}

/**
 * 이미지 방향 판별 (가로형/세로형/정방형)
 * → WP 블록에서 width 결정에 사용
 *
 * 가로형(w > h): 700px
 * 세로형(h > w): 467px
 * 정방형(w = h): 700px
 */
export const getImageWidth = (width: number, height: number): number => {
  if (height > width) return 467
  return 700
}
