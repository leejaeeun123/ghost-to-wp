/** Shared state and API client */
const App = {
  selectedSlug: null,
  selectedSlugs: new Set(),

  async api(path, options = {}) {
    const res = await fetch(`/api${path}`, {
      headers: { "Content-Type": "application/json", ...options.headers },
      ...options,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    return data
  },

  toast(msg, type = "info") {
    const el = document.getElementById("toast")
    el.textContent = msg
    el.className = `toast ${type}`
    setTimeout(() => el.classList.add("hidden"), 3000)
  },

  select(slug) {
    this.selectedSlug = slug
    document.getElementById("preview-title").textContent = slug
    document.getElementById("btn-preview").disabled = false
    this.updateSyncSelection()
    this.updateScheduleSelection()
  },

  updateSyncSelection() {
    const count = this.selectedSlugs.size
    const label = count > 0
      ? `${count} articles selected`
      : this.selectedSlug ? `1 article: ${this.selectedSlug}` : "No articles selected"
    document.getElementById("sync-selection").textContent = label
  },

  updateScheduleSelection() {
    const count = this.selectedSlugs.size
    const slug = this.selectedSlug
    const has = count > 0 || slug
    document.getElementById("schedule-selection").textContent =
      count > 0 ? `${count} articles selected` : slug ? `1 article: ${slug}` : "No articles selected"
    document.getElementById("btn-schedule").disabled = !has || !document.getElementById("schedule-date").value
  },

  getSyncSlugs() {
    if (this.selectedSlugs.size > 0) return [...this.selectedSlugs]
    if (this.selectedSlug) return [this.selectedSlug]
    return []
  },
}

/** Tab navigation */
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"))
    document.querySelectorAll(".tab-content").forEach((s) => s.classList.remove("active"))
    btn.classList.add("active")
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active")
  })
})
