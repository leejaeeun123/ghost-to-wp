import type { GhostAuthor, WpUser, AuthorMapping } from "./types.js"

/**
 * Ghost 작성자 ↔ WP 사용자 매핑 생성
 *
 * 매칭 기준 (순서대로 시도):
 * 1. slug 일치 (ghost: jaeun-lee, wp: jaeun-lee)
 * 2. 이름 일치 (ghost: 이재은, wp: 이재은)
 * 3. slug에서 하이픈 제거 후 비교
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

const findMatchingWpUser = (
  ghost: GhostAuthor,
  wpUsers: WpUser[]
): WpUser | undefined => {
  const bySlug = wpUsers.find(
    (wp) => wp.slug.toLowerCase() === ghost.slug.toLowerCase()
  )
  if (bySlug) return bySlug

  const byName = wpUsers.find(
    (wp) => wp.name.toLowerCase() === ghost.name.toLowerCase()
  )
  if (byName) return byName

  const normalized = ghost.slug.replace(/-/g, "")
  const byNormalized = wpUsers.find(
    (wp) => wp.slug.replace(/-/g, "").toLowerCase() === normalized.toLowerCase()
  )
  if (byNormalized) return byNormalized

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
