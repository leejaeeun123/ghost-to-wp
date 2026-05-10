import type { GhostTag, CategoryMapping } from "./types.js"

/**
 * Ghost 태그 → WP 카테고리 매핑 테이블
 *
 * Ghost의 primary tag(첫 번째 태그)을 WP 카테고리에 매핑.
 * 모든 포스트에 "매거진"(25) 카테고리 자동 추가.
 */
const CURATION_CATEGORY_ID = 77

const CATEGORY_MAP: CategoryMapping[] = [
  // 큐레이션 하위 카테고리
  { ghostTag: "아트", wpCategoryId: 112, wpCategoryName: "아트", parentId: CURATION_CATEGORY_ID },
  { ghostTag: "컬쳐", wpCategoryId: 122, wpCategoryName: "컬쳐", parentId: CURATION_CATEGORY_ID },
  { ghostTag: "브랜드", wpCategoryId: 3251, wpCategoryName: "브랜드", parentId: CURATION_CATEGORY_ID },
  { ghostTag: "플레이스", wpCategoryId: 3252, wpCategoryName: "플레이스", parentId: CURATION_CATEGORY_ID },
  { ghostTag: "라이프스타일", wpCategoryId: 125, wpCategoryName: "라이프스타일", parentId: CURATION_CATEGORY_ID },
  { ghostTag: "피플", wpCategoryId: 3253, wpCategoryName: "피플", parentId: CURATION_CATEGORY_ID },
  { ghostTag: "디자인", wpCategoryId: 113, wpCategoryName: "디자인", parentId: CURATION_CATEGORY_ID },
  { ghostTag: "미디어", wpCategoryId: 120, wpCategoryName: "미디어", parentId: CURATION_CATEGORY_ID },
  // 큐레이션 자체
  { ghostTag: "큐레이션", wpCategoryId: 77, wpCategoryName: "큐레이션" },
  // 독립 카테고리
  { ghostTag: "그레이", wpCategoryId: 78, wpCategoryName: "그레이" },
  { ghostTag: "브랜디드", wpCategoryId: 999, wpCategoryName: "브랜디드" },
]

/** 공통 카테고리: 모든 포스트에 자동 추가 */
const MAGAZINE_CATEGORY_ID = 25
const GRAY_CATEGORY_ID = 78

/**
 * Ghost 태그 배열 → WP 카테고리 ID 배열로 변환
 *
 * - Ghost primary tag (첫 번째) → WP 카테고리 매핑
 * - 매거진(25) 항상 포함
 * - 매핑되지 않는 태그는 무시 (WP 태그로 별도 처리)
 */
export const mapCategories = (ghostTags: GhostTag[]): number[] => {
  const categoryIds = new Set<number>([MAGAZINE_CATEGORY_ID])

  for (const tag of ghostTags) {
    const mapping = CATEGORY_MAP.find(
      (m) => m.ghostTag === tag.name || m.ghostTag.toLowerCase() === tag.name.toLowerCase()
    )
    if (mapping) {
      categoryIds.add(mapping.wpCategoryId)
      if (mapping.parentId) categoryIds.add(mapping.parentId)
    }
  }

  return [...categoryIds]
}

/**
 * 그레이 아티클 전용 카테고리 (매거진 + 그레이만, 🔴 카테고리는 매칭하지 않음)
 *
 * 호출자에서 그레이 판별이 끝난 뒤 사용. Notion/Ghost 어느 쪽이 그레이를 알려도 동일하게 적용.
 */
export const GRAY_CATEGORY_RESULT: { categoryIds: number[]; primaryId: number } = {
  categoryIds: [MAGAZINE_CATEGORY_ID, GRAY_CATEGORY_ID],
  primaryId: GRAY_CATEGORY_ID,
}

/**
 * Notion 카테고리 기반 WP 카테고리 매핑 + primary 카테고리
 *
 * - 일반: 매거진 + 큐레이션 + Notion 카테고리
 * - 그레이(forceGray 또는 카테고리 내에 그레이/GRAY 존재): 매거진 + 그레이 (🔴 카테고리 매칭 안 함)
 * - primary = Notion 첫 번째 카테고리 (순서 기준)
 */
export const mapCategoriesFromNotion = (
  notionCategories: string[],
  forceGray = false
): { categoryIds: number[]; primaryId: number } => {
  const isGray =
    forceGray ||
    notionCategories.some(
      (c) => c.trim() === "그레이" || c.trim().toUpperCase() === "GRAY"
    )

  if (isGray) {
    return GRAY_CATEGORY_RESULT
  }

  const categoryIds = new Set<number>([MAGAZINE_CATEGORY_ID, CURATION_CATEGORY_ID])
  let primaryId = CURATION_CATEGORY_ID

  for (let i = 0; i < notionCategories.length; i++) {
    const catName = notionCategories[i]
    const mapping = CATEGORY_MAP.find(
      (m) =>
        m.wpCategoryName === catName ||
        m.ghostTag === catName ||
        m.ghostTag.toLowerCase() === catName.toLowerCase()
    )
    if (mapping) {
      categoryIds.add(mapping.wpCategoryId)
      if (i === 0) primaryId = mapping.wpCategoryId
    }
  }

  return { categoryIds: [...categoryIds], primaryId }
}

/**
 * Ghost 태그 중 카테고리 매핑에 해당하지 않는 태그만 반환
 * → WP 태그로 생성할 대상
 */
export const extractWpTags = (ghostTags: GhostTag[]): string[] => {
  const categoryTagNames = new Set(CATEGORY_MAP.map((m) => m.ghostTag.toLowerCase()))

  return ghostTags
    .filter((tag) => !categoryTagNames.has(tag.name.toLowerCase()))
    .map((tag) => tag.name)
}
