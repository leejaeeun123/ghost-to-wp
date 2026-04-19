import sharp from "sharp"
import type { WeekArticle } from "./types.js"
import type {
  BrunchArticleDraft,
  BrunchOpengraphData,
  BrunchTagCandidates,
} from "./brunch-types.js"
import { BRUNCH_INITIAL_PLACEHOLDER, formatForBrunch } from "./brunch-formatter.js"
import {
  BrunchSessionExpiredError,
  getUrlInfo,
  keywordRecommend,
  keywordSuggest,
  publishArticleImmediate,
  publishArticleReservedNew,
  tempCreate,
  tempDelete,
  uploadImage,
  type BrunchImmediatePayload,
  type BrunchKeyword,
  type BrunchNewReservedPayload,
} from "../brunch-client.js"
import type { BrunchSession } from "../brunch-session.js"

const ANTIEGG_HOME_URL = "https://antiegg.kr/"
const ANTIEGG_ABOUT_URL = "https://antiegg.kr/about/"
const BRUNCH_PROFILE_ID = "antiegg"

export interface BrunchPreparedArticle {
  article: WeekArticle
  draft: BrunchArticleDraft
  /** 자동 선정된 테마·키워드 후보 검증 결과 */
  validated: { theme: (BrunchKeyword | null)[]; keyword: (BrunchKeyword | null)[] }
  /** 브런치 추천 태그 전체 목록 (기타 태그 선택용) */
  recommended: BrunchKeyword[]
  /** 커버 이미지 원본 버퍼 (발행 시 재사용) */
  coverBuffer: Buffer
  coverMime: string
  coverWidth: number
  coverHeight: number
}

const fetchImageBuffer = async (url: string): Promise<{ buffer: Buffer; mime: string }> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`커버 이미지 다운로드 실패 (HTTP ${res.status}): ${url}`)
  const arr = new Uint8Array(await res.arrayBuffer())
  const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg"
  return { buffer: Buffer.from(arr), mime }
}

/**
 * 페이지 HTML을 직접 받아 og:* / twitter:* meta를 파싱.
 * 브런치 /v2/url/info가 antiegg.kr에서 자주 500이 떠 폴백 소스로 사용.
 */
interface DirectOg { title?: string; description?: string; image?: string; canonicalUrl?: string }
const fetchDirectOg = async (url: string): Promise<DirectOg> => {
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; AntieggBrunchBot/1.0; +https://antiegg.kr/)",
        accept: "text/html,application/xhtml+xml",
      },
    })
    if (!res.ok) return {}
    const html = await res.text()
    const head = html.slice(0, 120_000)
    const pick = (prop: string): string | undefined => {
      const attrPattern = `(?:property|name)=["']${prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`
      const r1 = new RegExp(`<meta\\s+${attrPattern}\\s+content=["']([^"']*)["']`, "i")
      const r2 = new RegExp(`<meta\\s+content=["']([^"']*)["']\\s+${attrPattern}`, "i")
      return head.match(r1)?.[1] || head.match(r2)?.[1]
    }
    return {
      title: pick("og:title") || pick("twitter:title"),
      description: pick("og:description") || pick("twitter:description"),
      image: pick("og:image") || pick("twitter:image"),
      canonicalUrl: pick("og:url"),
    }
  } catch {
    return {}
  }
}

/** 브런치 OG + 직접 파싱 OG 병합. 브런치가 hostname만 준 경우 직접 파싱 결과로 덮어쓴다. */
const mergeOg = (
  base: BrunchOpengraphData,
  direct: DirectOg,
  finalFallbacks: Partial<DirectOg> = {},
): BrunchOpengraphData => {
  const hostname = (() => {
    try { return new URL(base.url).hostname.replace(/^www\./, "") } catch { return base.url }
  })()
  const baseTitleIsHostname = base.title && base.title === hostname
  const title =
    (!baseTitleIsHostname && base.title) ||
    direct.title ||
    finalFallbacks.title ||
    base.title
  const description = base.description || direct.description || finalFallbacks.description || ""
  const image = base.image || direct.image || finalFallbacks.image || ""
  const canonicalUrl = base.canonicalUrl || direct.canonicalUrl || base.url
  return { title, description, url: base.url, canonicalUrl, image }
}

const matchingKeyword = (candidate: string, results: BrunchKeyword[]): BrunchKeyword | null => {
  if (!results.length) return null
  const norm = (s: string) => s.trim().toLowerCase()
  const exact = results.find((r) => norm(r.keyword) === norm(candidate))
  return exact || null
}

const validateCandidates = async (
  session: BrunchSession,
  candidates: BrunchTagCandidates,
): Promise<{ theme: (BrunchKeyword | null)[]; keyword: (BrunchKeyword | null)[] }> => {
  const validate = async (list: string[]): Promise<(BrunchKeyword | null)[]> =>
    Promise.all(
      list.map(async (q) => {
        const results = await keywordSuggest(session, q)
        return matchingKeyword(q, results)
      }),
    )
  const [theme, keyword] = await Promise.all([
    validate(candidates.themes),
    validate(candidates.keywords),
  ])
  return { theme, keyword }
}

/**
 * 발행 준비: OG 카드 수집 → plainContent 생성 → 키워드 추천/검증.
 * 커버 이미지는 다운로드만(+ 사이즈 측정) 하고, 업로드는 publish 단계에서 수행.
 */
export const prepareBrunchArticle = async (
  session: BrunchSession,
  article: WeekArticle,
): Promise<BrunchPreparedArticle> => {
  const [
    { buffer: coverBuffer, mime: coverMime },
    ogWpRaw,
    ogHomeRaw,
    ogAboutRaw,
    directWp,
    directHome,
    directAbout,
  ] = await Promise.all([
    fetchImageBuffer(article.featureImageUrl),
    getUrlInfo(session, article.wpLink),
    getUrlInfo(session, ANTIEGG_HOME_URL),
    getUrlInfo(session, ANTIEGG_ABOUT_URL),
    fetchDirectOg(article.wpLink),
    fetchDirectOg(ANTIEGG_HOME_URL),
    fetchDirectOg(ANTIEGG_ABOUT_URL),
  ])
  const ogWp = mergeOg(ogWpRaw, directWp, {
    title: article.title,
    image: article.featureImageUrl,
    description: article.subtitle,
  })
  const ogHome = mergeOg(ogHomeRaw, directHome)
  const ogAbout = mergeOg(ogAboutRaw, directAbout)

  const meta = await sharp(coverBuffer).metadata()
  const coverWidth = meta.width || 2000
  const coverHeight = meta.height || 1334

  const draft = formatForBrunch(article, {
    coverUrl: article.featureImageUrl,
    coverWidth,
    coverHeight,
    ogCards: { wpArticle: ogWp, antieggHome: ogHome, antieggAbout: ogAbout },
  })

  const [validated, recommend] = await Promise.all([
    validateCandidates(session, draft.tagCandidates),
    keywordRecommend(session, draft.plainContent, 0),
  ])

  return {
    article,
    draft,
    validated,
    recommended: recommend.flat,
    coverBuffer,
    coverMime,
    coverWidth,
    coverHeight,
  }
}

export type BrunchPublishMode = "reserved" | "published"

export interface BrunchPublishOptions {
  /** "reserved" = 예약발행 / "published" = 즉시발행 */
  mode: BrunchPublishMode
  /** 예약발행 시 UNIX ms. 즉시발행이면 무시(현재시각 사용) */
  publishRequestTime?: number
  /** 최종 태그 3개 (sequence는 publisher가 부여) */
  keywords: BrunchKeyword[]
}

export interface BrunchPublishResult {
  articleNo: number
  url: string
}

/**
 * 본 발행: 커버 업로드 → content HTML 최종화 → temp 생성 → 예약발행 → temp 삭제.
 */
export const publishBrunchArticle = async (
  session: BrunchSession,
  prepared: BrunchPreparedArticle,
  opts: BrunchPublishOptions,
): Promise<BrunchPublishResult> => {
  if (opts.keywords.length === 0) {
    throw new Error("태그 1개 이상 필요합니다.")
  }

  // 브런치 실제 플로우를 재현: cover_text + 빈 body로 드래프트 생성 → articleNo 확보
  // 이 단계에서는 kakaocdn URL이 없으므로 cover_full은 불가.
  const { articleNo: tempArticleNo } = await tempCreate(session, BRUNCH_INITIAL_PLACEHOLDER, 0)

  const uploaded = await uploadImage(
    session,
    prepared.coverBuffer,
    "cover.jpg",
    prepared.coverMime,
    tempArticleNo,
  )

  const finalDraft = formatForBrunch(prepared.article, {
    coverUrl: uploaded.url,
    coverWidth: prepared.coverWidth,
    coverHeight: prepared.coverHeight,
    ogCards: {
      wpArticle: pickOg(prepared, "wp"),
      antieggHome: pickOg(prepared, "home"),
      antieggAbout: pickOg(prepared, "about"),
    },
  })
  // 실제 브런치는 업데이트 호출에서도 articleNo=0을 body에 담음 (세션으로 WIP 식별).
  await tempCreate(session, finalDraft.contentHtml, 0)

  const coverImages = [
    {
      // 브런치는 images의 width/height를 문자열로 기대 (HAR 실측)
      width: String(prepared.coverWidth) as unknown as number,
      height: String(prepared.coverHeight) as unknown as number,
      type: "cover" as const,
      url: uploaded.url,
    },
  ]
  // 브런치 실측 필드 순서: {sequence, no, keyword}
  const keywords = opts.keywords.slice(0, 3).map((k, i) => ({
    sequence: i + 1,
    no: k.no,
    keyword: k.keyword,
  }))

  try {
    if (opts.mode === "published") {
      // 즉시발행: POST /v1/article (articleNo 없음, status="publish")
      const immediatePayload: BrunchImmediatePayload = {
        title: finalDraft.title,
        subTitle: finalDraft.subTitle,
        content: finalDraft.contentHtml,
        contentSummary: finalDraft.contentSummary,
        images: coverImages,
        videos: [],
        keywords,
        commentWritable: true,
        profileId: BRUNCH_PROFILE_ID,
      }
      // 즉시발행은 세션의 현재 WIP 드래프트(tempArticleNo)를 그대로 발행물로 전환.
      // 응답에서 articleNo가 안 나오면 tempArticleNo를 최종값으로 사용.
      let newArticleNo = tempArticleNo
      try {
        const result = await publishArticleImmediate(session, immediatePayload)
        if (result.articleNo > 0) newArticleNo = result.articleNo
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!/articleNo를 찾지 못했/.test(msg)) throw err
        // 파싱만 실패한 경우 tempArticleNo를 그대로 사용
      }
      // 즉시발행 성공 시 temp 삭제는 불필요 (draft가 article로 전환됨). 실패해도 무시.
      return {
        articleNo: newArticleNo,
        url: `https://brunch.co.kr/@${BRUNCH_PROFILE_ID}/${newArticleNo}`,
      }
    }

    // 예약발행: POST /v1/article (articleNo 없음, status="reserved")
    // tempCreate가 새 articleNo를 할당하지 않으므로 즉시발행과 동일한 신규 생성 엔드포인트 사용.
    const reservedPayload: BrunchNewReservedPayload = {
      title: finalDraft.title,
      subTitle: finalDraft.subTitle,
      content: finalDraft.contentHtml,
      contentSummary: finalDraft.contentSummary,
      images: coverImages,
      videos: [],
      keywords,
      commentWritable: true,
      membershipPromotionEnabled: false,
      profileId: BRUNCH_PROFILE_ID,
      publishRequestTime: opts.publishRequestTime ?? Date.now() + 60_000,
    }
    let reservedArticleNo = tempArticleNo
    try {
      const result = await publishArticleReservedNew(session, reservedPayload)
      if (result.articleNo > 0) reservedArticleNo = result.articleNo
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!/articleNo를 찾지 못했/.test(msg)) throw err
    }
    return {
      articleNo: reservedArticleNo,
      url: `https://brunch.co.kr/@${BRUNCH_PROFILE_ID}/${reservedArticleNo}`,
    }
  } catch (err) {
    await tempDelete(session, tempArticleNo).catch(() => undefined)
    throw err
  }
}

const pickOg = (
  prepared: BrunchPreparedArticle,
  which: "wp" | "home" | "about",
): BrunchOpengraphData => {
  const first = prepared.draft.blocks.find((b) => b.type === "opengraph")
  // draft에 OG 블록이 순서대로 3개 있으므로 blocks에서 뽑으면 되지만,
  // 재-format 시 동일 데이터가 필요하므로 prepared에서 직접 접근.
  if (!first || first.type !== "opengraph") {
    throw new Error("prepared draft에 OG 블록이 없음")
  }
  const ogs = prepared.draft.blocks.filter((b) => b.type === "opengraph")
  const order: Record<"wp" | "home" | "about", number> = { wp: 0, home: 1, about: 2 }
  const idx = order[which]
  const block = ogs[idx]
  if (!block || block.type !== "opengraph") {
    throw new Error(`OG 블록 ${which} (index ${idx})을 찾지 못함`)
  }
  return block.openGraphData
}

export { BrunchSessionExpiredError }
