import type { GhostAuthor, WpUser, AuthorMapping } from "./types.js"

/**
 * Ghost 작성자 ↔ WP 사용자 매핑 생성
 *
 * 매칭 기준:
 * 1. 풀 네임 완전 일치 (대소문자/앞뒤 공백 무시) — 1순위
 * 2. 동명이인 발생 시(같은 이름의 WP 사용자가 2명 이상) 슬러그로 disambiguate
 * 3. 풀 네임 불일치 시 매칭 실패 (슬러그 단독 폴백 X — 부분 슬러그가 다른 에디터를 잘못 매칭하는 원인)
 *
 * 매칭 안 되는 Ghost 작성자의 글은 이전 대상에서 제외.
 */
export const buildAuthorMappings = (
  ghostAuthors: GhostAuthor[],
  wpUsers: WpUser[]
): AuthorMapping[] => {
  const mappings: AuthorMapping[] = []

  for (const ghost of ghostAuthors) {
    const wpUser = findMatchingWpUser(ghost, wpUsers)
    if (wpUser) {
      mappings.push({
        ghostSlug: ghost.slug,
        ghostName: ghost.name,
        wpUserId: wpUser.id,
        wpUsername: wpUser.slug,
      })
    }
  }

  return mappings
}

const normalizeName = (name: string): string => name.trim().toLowerCase()

const findMatchingWpUser = (
  ghost: GhostAuthor,
  wpUsers: WpUser[]
): WpUser | undefined => {
  const ghostName = normalizeName(ghost.name)
  if (!ghostName) return undefined

  const sameName = wpUsers.filter((wp) => normalizeName(wp.name) === ghostName)

  if (sameName.length === 1) return sameName[0]

  // 동명이인: 슬러그로 추가 disambiguation
  if (sameName.length > 1) {
    const ghostSlug = ghost.slug.toLowerCase()
    const ghostSlugFlat = ghost.slug.replace(/-/g, "").toLowerCase()
    return sameName.find(
      (wp) =>
        wp.slug.toLowerCase() === ghostSlug ||
        wp.slug.replace(/-/g, "").toLowerCase() === ghostSlugFlat
    )
  }

  return undefined
}

/**
 * Ghost 포스트의 첫 번째 작성자가 WP에 등록되어 있는지 확인
 * → WP user ID 반환, 없으면 null
 */
export const resolveAuthor = (
  ghostAuthors: GhostAuthor[],
  authorMappings: AuthorMapping[]
): number | null => {
  if (ghostAuthors.length === 0) return null

  const primary = ghostAuthors[0]
  const mapping = authorMappings.find(
    (m) => m.ghostSlug === primary.slug || m.ghostName === primary.name
  )

  return mapping?.wpUserId ?? null
}
