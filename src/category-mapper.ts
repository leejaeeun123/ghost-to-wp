import type { GhostTag, CategoryMapping } from "./types.js"

/**
 * Ghost 태그 → WP 카테고리 매핑 테이블
 *
 * Ghost의 primary tag(첫 번째 태그)을 WP 카테고리에 매핑.
 * 모든 포스트에 "매거진"(25) 카테고리 자동 추가.
 */
const CATEGORY_MAP: CategoryMapping[] = [
  { ghostTag: "아트", wpCategoryId: 112, wpCategoryName: "아트" },
  { ghostTag: "컬쳐", wpCategoryId: 122, wpCategoryName: "칼처" },
  { ghostTag: "큐레이션", wpCategoryId: 77, wpCategoryName: "큐레이션" },
  { ghostTag: "그레이", wpCategoryId: 78, wpCategoryName: "그레이" },
  { ghostTag: "브랜드", wpCategoryId: 3251, wpCategoryName: "브랜드" },
  { ghostTag: "플레이스", wpCategoryId: 3252, wpCategoryName: "플레이스" },
  { ghostTag: "피플", wpCategoryId: 3253, wpCategoryName: "피플" },
  { ghostTag: "디자인", wpCategoryId: 113, wpCategoryName: "디자인" },
  { ghostTag: "라이프스타일", wpCategoryId: 125, wpCategoryName: "라이프스타일" },
  { ghostTag: "미디어", wpCategoryId: 120, wpCategoryName: "미디어" },
]

/** 공통 카테고리: 모든 포스트에 자동 추가 */
const MAGAZINE_CATEGORY_ID = 25

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
    }
  }

  return [...categoryIds]
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
