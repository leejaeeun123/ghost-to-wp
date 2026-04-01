/** Sync tab */
const Sync = {
  async run(status) {
    const slugs = App.getSyncSlugs()
    if (slugs.length === 0) {
      App.toast("No articles selected", "error")
      return
    }

    const progress = document.getElementById("sync-progress")
    const tbody = document.querySelector("#sync-results tbody")
    tbody.innerHTML = ""
    progress.textContent = `Syncing ${slugs.length} article(s) as ${status}...`

    document.getElementById("btn-sync-draft").disabled = true
    document.getElementById("btn-sync-publish").disabled = true

    try {
      let results

      if (slugs.length === 1) {
        const data = await App.api("/sync/single", {
          method: "POST",
          body: JSON.stringify({ slug: slugs[0], status }),
        })
        results = [data.result]
      } else {
        const data = await App.api("/sync/batch", {
          method: "POST",
          body: JSON.stringify({ slugs, status }),
        })
        results = data.results
      }

      for (const r of results) {
        const tr = document.createElement("tr")
        const wpLink = r.wpPostId ? `<a href="https://antiegg.kr/wp-admin/post.php?post=${r.wpPostId}&action=edit" target="_blank">${r.wpPostId}</a>` : "-"
        tr.innerHTML = `
          <td>${this.escapeHtml(r.title)}</td>
          <td class="status-${r.status}">${r.status}</td>
          <td>${wpLink}</td>
          <td>${r.reason || ""}</td>
        `
        tbody.appendChild(tr)
      }

      const created = results.filter((r) => r.status === "created").length
      const skipped = results.filter((r) => r.status.startsWith("skipped")).length
      const failed = results.filter((r) => r.status === "failed").length
      progress.textContent = `Done: ${created} created, ${skipped} skipped, ${failed} failed`
      App.toast(`Sync complete: ${created} created`, created > 0 ? "success" : "info")
    } catch (err) {
      progress.textContent = `Error: ${err.message}`
      App.toast(err.message, "error")
    } finally {
      document.getElementById("btn-sync-draft").disabled = false
      document.getElementById("btn-sync-publish").disabled = false
    }
  },

  escapeHtml(str) {
    const div = document.createElement("div")
    div.textContent = str
    return div.innerHTML
  },
}

document.getElementById("btn-sync-draft").addEventListener("click", () => Sync.run("draft"))
document.getElementById("btn-sync-publish").addEventListener("click", () => Sync.run("publish"))
