import { Router } from "express"
import { fetchWpUsers } from "../wp-client.js"
import { fetchAllPosts } from "../ghost-client.js"
import { buildAuthorMappings } from "../author-filter.js"

export const wpRoutes = Router()

wpRoutes.get("/users", async (_req, res) => {
  try {
    const wpUsers = await fetchWpUsers()
    const posts = await fetchAllPosts()

    const allAuthors = posts.flatMap((p) => p.authors)
    const unique = [...new Map(allAuthors.map((a) => [a.slug, a])).values()]
    const mappings = buildAuthorMappings(unique, wpUsers)

    const unmapped = unique.filter(
      (a) => !mappings.find((m) => m.ghostSlug === a.slug)
    )

    res.json({
      wpUsers: wpUsers.length,
      authorMappings: mappings,
      unmappedAuthors: unmapped.map((a) => ({ name: a.name, slug: a.slug })),
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})
