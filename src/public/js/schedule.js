/** Schedule tab */
document.getElementById("schedule-date").addEventListener("change", () => {
  App.updateScheduleSelection()
})

document.getElementById("btn-schedule").addEventListener("click", async () => {
  const slugs = App.getSyncSlugs()
  const dateInput = document.getElementById("schedule-date").value
  if (slugs.length === 0 || !dateInput) return

  const isoDate = new Date(dateInput).toISOString()
  const btn = document.getElementById("btn-schedule")
  const result = document.getElementById("schedule-result")

  btn.disabled = true
  btn.textContent = "Scheduling..."
  result.textContent = ""

  try {
    const outcomes = []

    for (const slug of slugs) {
      const data = await App.api("/sync/single", {
        method: "POST",
        body: JSON.stringify({ slug, status: "future", date: isoDate }),
      })
      outcomes.push(data.result)
    }

    const created = outcomes.filter((r) => r.status === "created")
    const failed = outcomes.filter((r) => r.status !== "created")

    let msg = `Scheduled ${created.length} article(s) for ${dateInput}`
    if (created.length > 0) {
      msg += "\n" + created.map((r) => `  ${r.title} → WP ID: ${r.wpPostId}`).join("\n")
    }
    if (failed.length > 0) {
      msg += `\n\nFailed/Skipped: ${failed.length}`
      msg += "\n" + failed.map((r) => `  ${r.title}: ${r.reason || r.status}`).join("\n")
    }

    result.textContent = msg
    App.toast(`${created.length} scheduled`, created.length > 0 ? "success" : "info")
  } catch (err) {
    result.textContent = `Error: ${err.message}`
    App.toast(err.message, "error")
  } finally {
    btn.disabled = false
    btn.textContent = "Schedule"
    App.updateScheduleSelection()
  }
})
