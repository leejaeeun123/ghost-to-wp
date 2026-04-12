/** 브런치 탭 */
const BlogBrunch = {
  PLATFORM: "brunch",
  schedule: null,
  formatted: new Map(),
  completed: Blog.loadCompleted("brunch"),

  async loadWeek(fresh = false) {
    const url = fresh ? "/blog/week?fresh=1" : "/blog/week"
    try {
      const data = await App.api(url)
      this.schedule = data.schedule
      document.getElementById("blog-brunch-week").textContent =
        `${data.range.weekLabel} · 총 ${data.total}건`
      this.render()
    } catch (err) {
      App.toast(err.message, "error")
    }
  },

  render() {
    const list = document.getElementById("blog-brunch-list")
    list.innerHTML = ""
    if (!this.schedule) return

    Blog.renderScheduleGroup(
      list, this.PLATFORM, "monday",
      "📅 월요일 20:00 발행",
      this.schedule.monday,
      (wpId) => this.select(wpId),
      this.completed
    )
    Blog.renderScheduleGroup(
      list, this.PLATFORM, "tuesday",
      "📅 화요일 20:00 발행",
      this.schedule.tuesday,
      (wpId) => this.select(wpId),
      this.completed
    )
  },

  async select(wpId) {
    document.querySelectorAll("#blog-brunch-list .blog-row.selected").forEach((r) => r.classList.remove("selected"))
    const row = document.querySelector(`#blog-brunch-list .blog-row[data-wp-id="${wpId}"]`)
    if (row) row.classList.add("selected")

    let formatted = this.formatted.get(wpId)
    if (!formatted) {
      try {
        formatted = await App.api(`/blog/brunch/${wpId}`)
        this.formatted.set(wpId, formatted)
      } catch (err) {
        App.toast(err.message, "error")
        return
      }
    }
    this.renderPreview(formatted)
  },

  renderPreview(formatted) {
    const root = document.getElementById("blog-brunch-preview")
    const m = formatted.meta
    const kwHtml = (m.brunchKeywords || []).map((k) => `<span class="blog-tag">${Blog.esc(k)}</span>`).join("")
    const notesHtml = (m.notes || []).map((n) => `<li>${Blog.esc(n)}</li>`).join("")

    root.innerHTML = `
      <div class="blog-preview-header">
        <div>
          <div class="blog-preview-title">${Blog.esc(m.title)}</div>
          <div class="blog-preview-subtitle">${Blog.esc(m.subtitle)}</div>
        </div>
        <button id="btn-blog-brunch-copy" class="blog-copy-btn">본문 복사</button>
      </div>

      <div class="blog-preview-meta">
        <div class="blog-meta-row"><span class="blog-meta-label">카테고리</span><span>${Blog.esc(m.category)}${m.subCategoryName ? " · " + Blog.esc(m.subCategoryName) : ""}</span></div>
        <div class="blog-meta-row"><span class="blog-meta-label">에디터</span><span>${Blog.esc(m.editor)}</span></div>
        <div class="blog-meta-row"><span class="blog-meta-label">커버 이미지</span>${m.featureImageUrl ? `<a href="${m.featureImageUrl}" target="_blank">${Blog.esc(m.featureImageUrl)}</a>` : "(없음)"}</div>
        <div class="blog-meta-row"><span class="blog-meta-label">WP 링크</span><a href="${m.wpLink}" target="_blank">${Blog.esc(m.wpLink)}</a></div>
        <div class="blog-meta-row"><span class="blog-meta-label">키워드 (3개)</span><div class="blog-tags">${kwHtml}</div></div>
      </div>

      ${notesHtml ? `<ul class="blog-notes">${notesHtml}</ul>` : ""}

      ${m.featureImageUrl ? `<div class="blog-feature-img"><img src="${m.featureImageUrl}" alt="" /></div>` : ""}

      <div class="blog-rendered-label">미리보기</div>
      <div class="blog-rendered">${formatted.html}</div>
    `

    document.getElementById("btn-blog-brunch-copy").addEventListener("click", async (e) => {
      const btn = e.target
      btn.disabled = true
      const ok = await Blog.copyHtml(formatted.html, m.title + "\n" + m.subtitle)
      btn.disabled = false
      if (ok) {
        App.toast("본문 HTML 복사 완료 — 브런치 에디터에 붙여넣기", "success")
      } else {
        App.toast("복사 실패 — 콘솔 확인", "error")
      }
    })
  },
}

document.getElementById("btn-blog-brunch-refresh").addEventListener("click", () => BlogBrunch.loadWeek(true))

let blogBrunchLoaded = false
document.querySelector('.tab[data-tab="blog-brunch"]').addEventListener("click", () => {
  if (!blogBrunchLoaded) {
    blogBrunchLoaded = true
    BlogBrunch.loadWeek()
  }
})
