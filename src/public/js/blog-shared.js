/** 블로그/브런치 탭 공통 헬퍼 */
const Blog = {
  esc(s) {
    const div = document.createElement("div")
    div.textContent = s ?? ""
    return div.innerHTML
  },

  /** HTML 클립보드 복사 (text/html + text/plain 동시) */
  async copyHtml(html, plainFallback) {
    const htmlBlob = new Blob([html], { type: "text/html" })
    const textBlob = new Blob([plainFallback || html.replace(/<[^>]+>/g, "")], { type: "text/plain" })
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "text/html": htmlBlob, "text/plain": textBlob }),
      ])
      return true
    } catch (err) {
      console.error("clipboard write failed:", err)
      try {
        await navigator.clipboard.writeText(html)
        return true
      } catch (e) {
        return false
      }
    }
  },

  /** 월/화 스케줄 카드 그룹 렌더링 */
  renderScheduleGroup(container, platform, day, label, articles, onSelect, completedSet) {
    const group = document.createElement("div")
    group.className = "blog-day-group"
    group.innerHTML = `<h3 class="blog-day-title">${label}</h3>`

    if (articles.length === 0) {
      const empty = document.createElement("p")
      empty.className = "blog-day-empty"
      empty.textContent = "(없음)"
      group.appendChild(empty)
      container.appendChild(group)
      return
    }

    for (const a of articles) {
      const row = document.createElement("div")
      row.className = "blog-row"
      row.dataset.wpId = a.wpId
      const isDone = completedSet.has(String(a.wpId))
      if (isDone) row.classList.add("done")

      const subTag = a.category === "그레이"
        ? "그레이"
        : `큐레이션${a.subCategoryName ? " · " + a.subCategoryName : ""}`

      row.innerHTML = `
        <label class="blog-row-check">
          <input type="checkbox" class="blog-done-check" ${isDone ? "checked" : ""} />
        </label>
        <div class="blog-row-body">
          <div class="blog-row-title">${this.esc(a.title)}</div>
          <div class="blog-row-meta">
            <span class="blog-row-cat ${a.category === "그레이" ? "gray" : "curation"}">${this.esc(subTag)}</span>
            <span class="blog-row-editor">Edited by ${this.esc(a.editor)}</span>
          </div>
        </div>
      `
      row.addEventListener("click", (e) => {
        if (e.target.classList.contains("blog-done-check")) return
        onSelect(a.wpId)
      })
      row.querySelector(".blog-done-check").addEventListener("change", (e) => {
        const id = String(a.wpId)
        if (e.target.checked) completedSet.add(id)
        else completedSet.delete(id)
        row.classList.toggle("done", e.target.checked)
        Blog.persistCompleted(platform, completedSet)
      })
      group.appendChild(row)
    }

    container.appendChild(group)
  },

  /** localStorage 발행 완료 추적 */
  loadCompleted(platform) {
    try {
      const raw = localStorage.getItem(`blog-done-${platform}`)
      return new Set(raw ? JSON.parse(raw) : [])
    } catch {
      return new Set()
    }
  },
  /** platform별 set save */
  persistCompleted(platform, set) {
    try {
      localStorage.setItem(`blog-done-${platform}`, JSON.stringify([...set]))
    } catch {}
  },
}
