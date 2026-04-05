/** Preview tab */
document.getElementById("btn-preview").addEventListener("click", async () => {
  const slug = App.selectedSlug
  if (!slug) return

  const btn = document.getElementById("btn-preview")
  btn.disabled = true
  btn.textContent = "Loading..."

  try {
    const data = await App.api("/preview/transform", {
      method: "POST",
      body: JSON.stringify({ slug }),
    })

    document.getElementById("preview-title").textContent = data.title
    document.getElementById("ghost-html").textContent = data.ghostHtml
    document.getElementById("wp-html").textContent = data.wpHtml

    const imageInfo = data.images.length > 0
      ? `Images (${data.images.length}): ${data.images.map((u) => u.split("/").pop()).join(", ")}`
      : "No images"
    const featureInfo = data.featureImage ? `\nFeature: ${data.featureImage.split("/").pop()}` : ""

    let notionInfo = ""
    if (data.notion) {
      const n = data.notion
      notionInfo = `\n\n📋 Notion 아티클 로드맵:\n  바이럴멘트: ${n.viralMent || "(없음)"}\n  부제목: ${n.subtitle || "(없음)"}\n  발행일: ${n.publishDate || "(없음)"}\n  상태: ${n.status || "(없음)"}\n  카테고리: ${n.categories?.join(", ") || "(없음)"}\n  키워드: ${n.keywords?.join(", ") || "(없음)"}`
    } else {
      notionInfo = "\n\n📋 Notion: 매칭 없음"
    }
    document.getElementById("preview-images").textContent = imageInfo + featureInfo + notionInfo

    // Auto-switch to preview tab
    document.querySelector('.tab[data-tab="preview"]').click()
    App.toast("Preview loaded", "success")
  } catch (err) {
    App.toast(err.message, "error")
  } finally {
    btn.disabled = false
    btn.textContent = "Preview"
  }
})
