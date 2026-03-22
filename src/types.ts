/** Ghost Admin API 포스트 */
export interface GhostPost {
  id: string
  uuid: string
  title: string
  slug: string
  html: string
  feature_image: string | null
  custom_excerpt: string | null
  published_at: string
  updated_at: string
  tags: GhostTag[]
  authors: GhostAuthor[]
  status: string
}

export interface GhostTag {
  id: string
  name: string
  slug: string
}

export interface GhostAuthor {
  id: string
  name: string
  slug: string
  email: string | null
}

/** WordPress REST API */
export interface WpUser {
  id: number
  slug: string
  name: string
  username?: string
}

export interface WpPost {
  id: number
  link: string
  slug: string
  title: { rendered: string }
  status: string
}

export interface WpMediaUpload {
  id: number
  source_url: string
}

/** 동기화 결과 */
export interface SyncResult {
  slug: string
  title: string
  status: "created" | "skipped_duplicate" | "skipped_no_author" | "failed"
  wpPostId?: number
  reason?: string
}

/** CLI 옵션 */
export interface SyncOptions {
  dryRun: boolean
  all: boolean
  slug?: string
  status: "draft" | "publish"
}

/** 카테고리 매핑 */
export interface CategoryMapping {
  ghostTag: string
  wpCategoryId: number
  wpCategoryName: string
}

/** 작성자 매핑 */
export interface AuthorMapping {
  ghostSlug: string
  ghostName: string
  wpUserId: number
  wpUsername: string
}
