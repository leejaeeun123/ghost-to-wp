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
  const filename = ensureExtension(extractFilename(imageUrl), contentType)

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

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
}

/**
 * 파일명에 확장자가 없으면 content-type 기반으로 추가
 * (Unsplash 등 확장자 없는 URL 대응)
 */
const ensureExtension = (filename: string, contentType: string): string => {
  if (/\.[a-zA-Z0-9]{2,5}$/.test(filename)) return filename
  const ext = MIME_TO_EXT[contentType] ?? ".jpg"
  return filename + ext
}

/**
 * HTML 본문 내 Ghost 이미지 URL을 WP URL로 교체 + wp:image 블록에 WP 미디어 ID 주입
 *
 * Ghost 이미지: square.antiegg.kr/content/images/...
 * → WP 미디어 라이브러리 URL로 교체
 * → 해당 <!-- wp:image --> 블록의 JSON "id" + <img class="wp-image-{id}"> 주입
 */
export const replaceImageUrls = async (
  html: string,
  dryRun: boolean
): Promise<{ html: string; uploadedCount: number }> => {
  const ghostImagePattern = /https?:\/\/square\.antiegg\.kr\/content\/images\/[^\s"')]+/g
  const matches = [...new Set(html.match(ghostImagePattern) ?? [])]

  if (matches.length === 0) return { html, uploadedCount: 0 }

  const urlMap = new Map<string, string>()
  const idMap = new Map<string, number>() // wp-url → wp 미디어 ID

  for (const ghostUrl of matches) {
    if (dryRun) {
      urlMap.set(ghostUrl, `[DRY-RUN:${extractFilename(ghostUrl)}]`)
      continue
    }

    try {
      const uploaded = await downloadAndUpload(ghostUrl)
      urlMap.set(ghostUrl, uploaded.source_url)
      idMap.set(uploaded.source_url, uploaded.id)
    } catch (err) {
      console.error(`  이미지 업로드 실패: ${ghostUrl}`, err)
      urlMap.set(ghostUrl, ghostUrl)
    }
  }

  let result = html
  for (const [original, replacement] of urlMap) {
    result = result.replaceAll(original, replacement)
  }

  // wp:image 블록에 id/class 주입
  result = enrichImageBlocks(result, idMap)

  return {
    html: result,
    uploadedCount: dryRun ? 0 : matches.length,
  }
}

/**
 * 각 <!-- wp:image JSON --><figure><img/>...</figure><!-- /wp:image --> 블록을 스캔하여
 * - JSON에 "id": WP 미디어 ID 주입
 * - <img>에 class="wp-image-{id}" 주입 (기존 class와 병합)
 *
 * idMap에 없는 블록은 원본 그대로 유지.
 */
const enrichImageBlocks = (html: string, idMap: Map<string, number>): string => {
  if (idMap.size === 0) return html
  const blockPattern = /<!-- wp:image (\{[^}]*\}) -->\s*(<figure[^>]*>)(<img[^>]*?\/?>)([\s\S]*?<\/figure>)\s*<!-- \/wp:image -->/g
  return html.replace(blockPattern, (match, jsonStr, figureOpen, imgTag, figureTail) => {
    const srcMatch = imgTag.match(/src="([^"]+)"/)
    if (!srcMatch) return match
    const id = idMap.get(srcMatch[1])
    if (!id) return match

    let json: Record<string, unknown>
    try {
      json = JSON.parse(jsonStr)
    } catch {
      return match
    }
    json.id = id

    let newImgTag: string
    if (/class="/.test(imgTag)) {
      newImgTag = imgTag.replace(/class="([^"]*)"/, (_m: string, cls: string) => {
        const merged = cls.trim() ? `${cls.trim()} wp-image-${id}` : `wp-image-${id}`
        return `class="${merged}"`
      })
    } else {
      // self-closing 토큰 바로 앞에 class 삽입
      newImgTag = imgTag.replace(/\/?>\s*$/, ` class="wp-image-${id}"/>`)
    }

    return `<!-- wp:image ${JSON.stringify(json)} -->\n${figureOpen}${newImgTag}${figureTail}\n<!-- /wp:image -->`
  })
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
