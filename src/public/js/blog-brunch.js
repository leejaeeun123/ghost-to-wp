/** 브런치 자동 발행 탭 — API 세션 + prepare/publish 플로우 */
const BlogBrunch = {
  PLATFORM: "brunch",
  schedule: null,
  prepared: new Map(),
  completed: Blog.loadCompleted("brunch"),
  mondayQuery: null,
  weekLabel: null,

  async init() {
    await this.refreshSession()
    await this.loadWeek()
  },

  async refreshSession() {
    const bar = document.getElementById("brunch-session-bar")
    try {
      const s = await App.api("/blog/brunch/session")
      if (s.exists && s.source === "env") {
        bar.className = "brunch-session-bar ok"
        bar.innerHTML = `<span>✓ 세션: 환경변수 사용 중</span>`
      } else if (s.exists && s.source === "file") {
        const when = s.savedAt ? new Date(s.savedAt).toLocaleString("ko-KR") : "?"
        bar.className = "brunch-session-bar ok"
        bar.innerHTML = `<span>✓ 세션 저장됨 (${when})</span><button id="btn-brunch-session-open">세션 갱신</button>`
      } else {
        bar.className = "brunch-session-bar warn"
        bar.innerHTML = `<span>⚠ 브런치 세션 없음 — 발행 전에 갱신 필요</span><button id="btn-brunch-session-open">세션 갱신</button>`
      }
      const openBtn = document.getElementById("btn-brunch-session-open")
      if (openBtn) openBtn.addEventListener("click", () => this.openSessionModal())
    } catch (err) {
      bar.className = "brunch-session-bar warn"
      bar.textContent = `세션 조회 실패: ${err.message}`
    }
  },

  openSessionModal() {
    const modal = document.getElementById("brunch-session-modal")
    const ta = document.getElementById("brunch-session-curl")
    ta.value = ""
    modal.classList.remove("hidden")
    ta.focus()
  },
  closeSessionModal() {
    document.getElementById("brunch-session-modal").classList.add("hidden")
  },
  async saveSession() {
    const curl = document.getElementById("brunch-session-curl").value.trim()
    if (!curl) { App.toast("cURL 문자열을 붙여넣어 주세요", "error"); return }
    try {
      await App.api("/blog/brunch/session", { method: "POST", body: JSON.stringify({ curl }) })
      App.toast("세션 저장 완료", "success")
      this.closeSessionModal()
      await this.refreshSession()
    } catch (err) {
      App.toast(`세션 저장 실패: ${err.message}`, "error")
    }
  },

  async loadWeek(fresh = false) {
    const url = fresh ? "/blog/week?fresh=1" : "/blog/week"
    try {
      const data = await App.api(url)
      this.schedule = data.schedule
      this.mondayQuery = data.range.mondayLabel
      this.weekLabel = data.range.weekLabel
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
    Blog.renderScheduleGroup(list, this.PLATFORM, "monday", "📅 월요일 19:00 발행",
      this.schedule.monday, (id) => this.select(id, "monday"), this.completed)
    Blog.renderScheduleGroup(list, this.PLATFORM, "tuesday", "📅 화요일 19:00 발행",
      this.schedule.tuesday, (id) => this.select(id, "tuesday"), this.completed)
  },

  async select(wpId, scheduleDay) {
    document.querySelectorAll("#blog-brunch-list .blog-row.selected").forEach((r) => r.classList.remove("selected"))
    const row = document.querySelector(`#blog-brunch-list .blog-row[data-wp-id="${wpId}"]`)
    if (row) row.classList.add("selected")

    const root = document.getElementById("blog-brunch-preview")
    root.innerHTML = `<p class="blog-preview-empty">발행 준비 중... (이미지 다운로드, 추천 태그 조회)</p>`

    try {
      const data = await App.api(`/blog/brunch/prepare/${wpId}?monday=${this.mondayQuery}`, { method: "POST", body: "{}" })
      this.prepared.set(wpId, { data, scheduleDay })
      this.renderPreview(wpId)
    } catch (err) {
      root.innerHTML = `<p class="blog-preview-empty error">준비 실패: ${Blog.esc(err.message)}</p>`
    }
  },

  /** 태그 풀 생성 — validated 테마/키워드 (non-null) + recommended 전체, no 기준 dedupe */
  buildTagPool(prep) {
    const seen = new Set()
    const pool = []
    const add = (kw, origin) => {
      if (!kw || seen.has(kw.no)) return
      seen.add(kw.no)
      pool.push({ ...kw, origin })
    }
    for (const k of (prep.validated.theme || [])) add(k, "theme")
    for (const k of (prep.validated.keyword || [])) add(k, "keyword")
    for (const k of (prep.recommended || [])) add(k, "recommended")
    return pool
  },

  defaultSelection(pool) {
    const byOrigin = (o) => pool.filter((k) => k.origin === o)
    const sel = []
    for (const k of byOrigin("theme")) { if (sel.length < 2) sel.push(k.no) }
    for (const k of byOrigin("keyword")) { if (sel.length < 2) sel.push(k.no) }
    const rec = byOrigin("recommended").find((k) => !sel.includes(k.no))
    if (rec) sel.push(rec.no)
    return sel
  },

  renderPreview(wpId) {
    const entry = this.prepared.get(wpId)
    if (!entry) return
    const { data: prep, scheduleDay } = entry
    const root = document.getElementById("blog-brunch-preview")
    const pool = this.buildTagPool(prep)
    if (!pool.length) {
      // 태그 후보가 하나도 없으면 경고 + 발행 버튼 비활성
    }
    const selected = new Set(this.defaultSelection(pool))

    const tagChips = pool.map((k) => `
      <label class="brunch-tag-chip" data-no="${k.no}">
        <input type="checkbox" ${selected.has(k.no) ? "checked" : ""} value="${k.no}">
        <span class="brunch-tag-name">${Blog.esc(k.keyword)}</span>
        <span class="brunch-tag-origin">${k.origin}</span>
      </label>
    `).join("")

    const scheduleInput = this.buildScheduleInput(wpId, scheduleDay)
    const notesHtml = (prep.notes || []).map((n) => `<li>${Blog.esc(n)}</li>`).join("")

    root.innerHTML = `
      <div class="blog-preview-header">
        <div>
          <div class="blog-preview-title">${Blog.esc(prep.title)}</div>
          <div class="blog-preview-subtitle">${Blog.esc(prep.subtitle)}</div>
        </div>
      </div>
      <div class="blog-preview-meta">
        <div class="blog-meta-row"><span class="blog-meta-label">카테고리</span><span>${Blog.esc(prep.category)}${prep.subCategoryName ? " · " + Blog.esc(prep.subCategoryName) : ""}</span></div>
        <div class="blog-meta-row"><span class="blog-meta-label">에디터</span><span>${Blog.esc(prep.editor)}</span></div>
        <div class="blog-meta-row"><span class="blog-meta-label">커버</span><span>${prep.coverSize.width}×${prep.coverSize.height}</span></div>
        <div class="blog-meta-row"><span class="blog-meta-label">요약</span><span>${Blog.esc(prep.contentSummary)}</span></div>
      </div>
      ${notesHtml ? `<ul class="blog-notes">${notesHtml}</ul>` : ""}
      ${prep.featureImageUrl ? `<div class="blog-feature-img"><img src="${prep.featureImageUrl}" alt="" /></div>` : ""}

      <h4 class="brunch-section-title">태그 (정확히 3개 선택)</h4>
      <div class="brunch-tag-pool" id="brunch-tag-pool-${wpId}">${tagChips || "<p>후보 없음</p>"}</div>

      <h4 class="brunch-section-title">발행 방식</h4>
      <div class="brunch-mode-row">
        <label><input type="radio" name="brunch-mode-${wpId}" value="reserved" checked> 예약발행</label>
        <label><input type="radio" name="brunch-mode-${wpId}" value="published"> 즉시발행</label>
      </div>
      ${scheduleInput}

      <button id="brunch-publish-${wpId}" class="brunch-publish-btn" disabled>예약 발행</button>
      <div class="brunch-publish-status" id="brunch-status-${wpId}"></div>
    `

    const pub = document.getElementById(`brunch-publish-${wpId}`)
    const scheduleSel = document.getElementById(`brunch-schedule-${wpId}`)
    const getMode = () =>
      (root.querySelector(`input[name="brunch-mode-${wpId}"]:checked`) || {}).value || "reserved"
    const updateBtn = () => {
      const checked = root.querySelectorAll(`#brunch-tag-pool-${wpId} input[type=checkbox]:checked`).length
      const mode = getMode()
      pub.disabled = checked !== 3
      pub.textContent = mode === "published"
        ? `즉시 발행 (${checked}/3 선택됨)`
        : `예약 발행 (${checked}/3 선택됨)`
      scheduleSel.disabled = mode === "published"
      scheduleSel.style.opacity = mode === "published" ? "0.4" : "1"
    }
    root.querySelectorAll(`#brunch-tag-pool-${wpId} input[type=checkbox]`).forEach((cb) => {
      cb.addEventListener("change", () => {
        const checked = root.querySelectorAll(`#brunch-tag-pool-${wpId} input[type=checkbox]:checked`)
        if (checked.length > 3) { cb.checked = false }
        updateBtn()
      })
    })
    root.querySelectorAll(`input[name="brunch-mode-${wpId}"]`).forEach((r) => {
      r.addEventListener("change", updateBtn)
    })
    updateBtn()
    pub.addEventListener("click", () => this.publish(wpId, pool, getMode()))
  },

  /**
   * datetime-local 입력. 브런치 API는 분 단위 예약을 거부하므로 정각(:00)만 허용.
   * step=3600, min=다음 정각, 기본값=해당 요일 19:00(미래일 때만) / 과거면 다음 정각.
   */
  buildScheduleInput(wpId, scheduleDay) {
    const monday = new Date(this.mondayQuery + "T19:00:00+09:00").getTime()
    const tuesday = monday + 24 * 60 * 60 * 1000
    const candidate = scheduleDay === "tuesday" ? tuesday : monday
    const now = Date.now()
    const HOUR_MS = 60 * 60 * 1000
    const nextHour = Math.ceil((now + 1) / HOUR_MS) * HOUR_MS
    const valueMs = candidate > nextHour ? candidate : nextHour
    const fmt = (ms) => {
      const d = new Date(ms)
      const pad = (n) => String(n).padStart(2, "0")
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`
    }
    return `<input type="datetime-local" id="brunch-schedule-${wpId}" class="brunch-schedule-select" min="${fmt(nextHour)}" value="${fmt(valueMs)}" step="3600" />`
  },

  async publish(wpId, pool, mode = "reserved") {
    const root = document.getElementById("blog-brunch-preview")
    const status = document.getElementById(`brunch-status-${wpId}`)
    const checked = Array.from(root.querySelectorAll(`#brunch-tag-pool-${wpId} input:checked`)).map((cb) => Number(cb.value))
    if (checked.length !== 3) { App.toast("태그 3개를 선택해주세요", "error"); return }
    const keywords = checked.map((no) => {
      const kw = pool.find((k) => k.no === no)
      return { no: kw.no, keyword: kw.keyword }
    })
    const body = { mode, keywords }
    if (mode === "reserved") {
      const raw = document.getElementById(`brunch-schedule-${wpId}`).value
      const d = raw ? new Date(raw) : null
      if (!d || isNaN(d.getTime())) { App.toast("예약 시각을 선택해주세요", "error"); return }
      // 브런치는 정각만 허용 → 분/초/ms 0으로 고정
      d.setMinutes(0, 0, 0)
      const ms = d.getTime()
      if (ms <= Date.now()) { App.toast("예약 시각은 현재 이후여야 합니다 (정각만 가능)", "error"); return }
      body.publishRequestTime = ms
    }
    const btn = document.getElementById(`brunch-publish-${wpId}`)
    btn.disabled = true
    status.textContent = mode === "published" ? "즉시 발행 중..." : "예약 발행 중..."

    try {
      const res = await App.api(`/blog/brunch/publish/${wpId}?monday=${this.mondayQuery}`, {
        method: "POST",
        body: JSON.stringify(body),
      })
      const label = mode === "published" ? "즉시 발행" : "예약 발행"
      status.innerHTML = `✓ ${label} 완료: <a href="${res.url}" target="_blank">${Blog.esc(res.url)}</a>`
      App.toast(`브런치 ${label} 완료`, "success")
      this.completed.add(String(wpId))
      Blog.persistCompleted(this.PLATFORM, this.completed)
      const row = document.querySelector(`#blog-brunch-list .blog-row[data-wp-id="${wpId}"]`)
      if (row) { row.classList.add("done"); row.querySelector(".blog-done-check").checked = true }
    } catch (err) {
      status.textContent = `발행 실패: ${err.message}`
      App.toast(`발행 실패: ${err.message}`, "error")
      btn.disabled = false
    }
  },
}

document.getElementById("btn-blog-brunch-refresh").addEventListener("click", () => BlogBrunch.loadWeek(true))
document.getElementById("btn-brunch-session-cancel").addEventListener("click", () => BlogBrunch.closeSessionModal())
document.getElementById("btn-brunch-session-save").addEventListener("click", () => BlogBrunch.saveSession())

let blogBrunchLoaded = false
document.querySelector('.tab[data-tab="blog-brunch"]').addEventListener("click", () => {
  if (!blogBrunchLoaded) { blogBrunchLoaded = true; BlogBrunch.init() }
})
