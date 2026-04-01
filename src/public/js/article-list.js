/** Article list tab */
const ArticleList = {
  posts: [],

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
      document.getElementById("article-count").textContent = `${data.total} articles`
    } catch (err) {
      App.toast(err.message, "error")
    }
  },

  render() {
    const tbody = document.querySelector("#article-table tbody")
    tbody.innerHTML = ""

    const authors = new Set()

    for (const p of this.posts) {
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

      tbody.appendChild(tr)
    }

    this.populateAuthorFilter(authors)
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
