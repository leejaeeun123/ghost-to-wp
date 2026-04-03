/** Article list tab */
const ArticleList = {
  posts: [],
  searchQuery: "",

  async load() {
    const params = new URLSearchParams()
    const after = document.getElementById("filter-after").value
    const before = document.getElementById("filter-before").value
    const author = document.getElementById("filter-author").value
    if (after) params.set("after", after)
    if (before) params.set("before", before)
    if (author) params.set("author", author)

    try {
      const data = await App.api(`/ghost/posts?${params}`)
      this.posts = data.posts
      this.render()
    } catch (err) {
      App.toast(err.message, "error")
    }
  },

  getFilteredPosts() {
    if (!this.searchQuery) return this.posts
    const q = this.searchQuery.toLowerCase()
    return this.posts.filter((p) => {
      const title = p.title?.toLowerCase() ?? ""
      const author = p.authors?.[0]?.name?.toLowerCase() ?? ""
      return title.includes(q) || author.includes(q)
    })
  },

  render() {
    const tbody = document.querySelector("#article-table tbody")
    tbody.innerHTML = ""

    const authors = new Set()
    const filtered = this.getFilteredPosts()

    for (const p of filtered) {
      const authorName = p.authors?.[0]?.name ?? "-"
      authors.add(authorName)
      const date = p.published_at?.substring(0, 10) ?? "-"
      const tags = (p.tags ?? []).map((t) => `<span class="tag">${t.name}</span>`).join("")

      const tr = document.createElement("tr")
      tr.dataset.slug = p.slug
      if (App.selectedSlug === p.slug) tr.classList.add("selected")

      tr.innerHTML = `
        <td><input type="checkbox" class="row-check" data-slug="${p.slug}" ${App.selectedSlugs.has(p.slug) ? "checked" : ""}></td>
        <td class="title-cell">${this.escapeHtml(p.title)}</td>
        <td>${this.escapeHtml(authorName)}</td>
        <td>${date}</td>
        <td>${tags}</td>
        <td><button class="btn-row-draft" data-slug="${p.slug}">Draft</button></td>
      `

      tr.querySelector(".title-cell").addEventListener("click", () => {
        document.querySelectorAll("#article-table tr.selected").forEach((r) => r.classList.remove("selected"))
        tr.classList.add("selected")
        App.select(p.slug)
      })

      tr.querySelector(".row-check").addEventListener("change", (e) => {
        if (e.target.checked) App.selectedSlugs.add(p.slug)
        else App.selectedSlugs.delete(p.slug)
        App.updateSyncSelection()
        App.updateScheduleSelection()
      })

      tr.querySelector(".btn-row-draft").addEventListener("click", async (e) => {
        e.stopPropagation()
        const btn = e.target
        btn.disabled = true
        btn.textContent = "..."
        try {
          const data = await App.api("/sync/single", {
            method: "POST",
            body: JSON.stringify({ slug: p.slug, status: "draft" }),
          })
          const r = data.result
          if (r.status === "created") {
            btn.textContent = `WP #${r.wpPostId}`
            btn.classList.add("done")
            App.toast(`Draft created: ${r.title}`, "success")
          } else {
            btn.textContent = r.status.replace("skipped_", "")
            btn.classList.add("skipped")
            App.toast(`${r.title}: ${r.reason || r.status}`, "info")
          }
        } catch (err) {
          btn.textContent = "Error"
          btn.classList.add("failed")
          App.toast(err.message, "error")
        }
      })

      tbody.appendChild(tr)
    }

    this.populateAuthorFilter(authors)
    document.getElementById("article-count").textContent =
      `${filtered.length}${filtered.length !== this.posts.length ? ` / ${this.posts.length}` : ""} articles`
  },

  populateAuthorFilter(authors) {
    const select = document.getElementById("filter-author")
    const current = select.value
    select.innerHTML = '<option value="">All</option>'
    for (const name of [...authors].sort()) {
      const opt = document.createElement("option")
      opt.value = name
      opt.textContent = name
      if (name === current) opt.selected = true
      select.appendChild(opt)
    }
  },

  escapeHtml(str) {
    const div = document.createElement("div")
    div.textContent = str
    return div.innerHTML
  },
}

// Search
const searchInput = document.getElementById("search-input")
let searchTimer = null
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    ArticleList.searchQuery = searchInput.value.trim()
    ArticleList.render()
  }, 200)
})

document.getElementById("btn-filter").addEventListener("click", () => ArticleList.load())
document.getElementById("btn-refresh").addEventListener("click", async () => {
  await App.api("/ghost/cache/clear", { method: "POST" })
  ArticleList.load()
})
document.getElementById("select-all").addEventListener("change", (e) => {
  const checked = e.target.checked
  document.querySelectorAll(".row-check").forEach((cb) => {
    cb.checked = checked
    if (checked) App.selectedSlugs.add(cb.dataset.slug)
    else App.selectedSlugs.delete(cb.dataset.slug)
  })
  App.updateSyncSelection()
  App.updateScheduleSelection()
})

ArticleList.load()
