/** 네이버 블로그 탭 */
const BlogNaver = {
  PLATFORM: "naver",
  schedule: null,
  formatted: new Map(), // wpId -> FormattedArticle
  completed: Blog.loadCompleted("naver"),
  mondayQuery: null,

  async loadWeek(fresh = false, mondayOverride = null) {
    const monday = mondayOverride ?? this.mondayQuery
    const params = []
    if (monday) params.push(`monday=${monday}`)
    if (fresh) params.push("fresh=1")
    const url = "/blog/week" + (params.length ? "?" + params.join("&") : "")
    try {
      const data = await App.api(url)
      this.schedule = data.schedule
      this.mondayQuery = data.range.mondayLabel
      this.formatted.clear()
      document.getElementById("blog-naver-week").textContent =
        `${data.range.weekLabel} · 총 ${data.total}건`
      this.render()
    } catch (err) {
      App.toast(err.message, "error")
    }
  },

  shiftWeek(days) {
    if (!this.mondayQuery) return
    const d = new Date(this.mondayQuery + "T00:00:00+09:00")
    d.setUTCDate(d.getUTCDate() + days)
    const pad = (n) => String(n).padStart(2, "0")
    const next = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
    this.loadWeek(false, next)
  },

  render() {
    const list = document.getElementById("blog-naver-list")
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
    document.querySelectorAll("#blog-naver-list .blog-row.selected").forEach((r) => r.classList.remove("selected"))
    const row = document.querySelector(`#blog-naver-list .blog-row[data-wp-id="${wpId}"]`)
    if (row) row.classList.add("selected")

    let formatted = this.formatted.get(wpId)
    if (!formatted) {
      try {
        const q = this.mondayQuery ? `?monday=${this.mondayQuery}` : ""
        formatted = await App.api(`/blog/naver/${wpId}${q}`)
        this.formatted.set(wpId, formatted)
      } catch (err) {
        App.toast(err.message, "error")
        return
      }
    }
    this.renderPreview(formatted)
  },

  renderPreview(formatted) {
    const root = document.getElementById("blog-naver-preview")
    const m = formatted.meta
    const tagsHtml = (m.naverTags || []).map((t) => `<span class="blog-tag">${Blog.esc(t)}</span>`).join("")
    const notesHtml = (m.notes || []).map((n) => `<li>${Blog.esc(n)}</li>`).join("")

    root.innerHTML = `
      <div class="blog-preview-header">
        <div>
          <div class="blog-preview-title">${Blog.esc(m.title)}</div>
          <div class="blog-preview-subtitle">${Blog.esc(m.subtitle)}</div>
        </div>
        <button id="btn-blog-naver-copy" class="blog-copy-btn">본문 복사</button>
      </div>

      <div class="blog-preview-meta">
        <div class="blog-meta-row"><span class="blog-meta-label">카테고리</span><span>${Blog.esc(m.category)}${m.subCategoryName ? " · " + Blog.esc(m.subCategoryName) : ""}</span></div>
        <div class="blog-meta-row"><span class="blog-meta-label">에디터</span><span>${Blog.esc(m.editor)}</span></div>
        <div class="blog-meta-row"><span class="blog-meta-label">대표 이미지</span>${m.featureImageUrl ? `<a href="${m.featureImageUrl}" target="_blank">${Blog.esc(m.featureImageUrl)}</a>` : "(없음)"}</div>
        <div class="blog-meta-row"><span class="blog-meta-label">WP 링크</span><a href="${m.wpLink}" target="_blank">${Blog.esc(m.wpLink)}</a></div>
        <div class="blog-meta-row"><span class="blog-meta-label">태그</span><div class="blog-tags">${tagsHtml}</div></div>
      </div>

      ${notesHtml ? `<ul class="blog-notes">${notesHtml}</ul>` : ""}

      ${m.featureImageUrl ? `<div class="blog-feature-img"><img src="${m.featureImageUrl}" alt="" /></div>` : ""}

      <div class="blog-rendered-label">미리보기</div>
      <div class="blog-rendered">${formatted.html}</div>
    `

    document.getElementById("btn-blog-naver-copy").addEventListener("click", async (e) => {
      const btn = e.target
      btn.disabled = true
      const ok = await Blog.copyHtml(formatted.html, m.title + "\n" + m.subtitle)
      btn.disabled = false
      if (ok) {
        App.toast("본문 HTML 복사 완료 — 네이버 블로그 에디터에 붙여넣기", "success")
      } else {
        App.toast("복사 실패 — 콘솔 확인", "error")
      }
    })
  },
}

document.getElementById("btn-blog-naver-refresh").addEventListener("click", () => BlogNaver.loadWeek(true))
document.getElementById("btn-blog-naver-prev").addEventListener("click", () => BlogNaver.shiftWeek(-7))
document.getElementById("btn-blog-naver-next").addEventListener("click", () => BlogNaver.shiftWeek(7))

// 첫 탭 클릭 시 lazy load
let blogNaverLoaded = false
document.querySelector('.tab[data-tab="blog-naver"]').addEventListener("click", () => {
  if (!blogNaverLoaded) {
    blogNaverLoaded = true
    BlogNaver.loadWeek()
  }
})
