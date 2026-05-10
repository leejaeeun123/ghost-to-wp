import { chromium } from "playwright";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const STATE_PATH = resolve(process.cwd(), ".naver-browser-state.json");
const logNo = process.argv[2];
if (!logNo || !/^\d+$/.test(logNo)) {
  console.error("usage: npx tsx scripts/naver-poc/capture-existing-doc.ts <logNo>");
  process.exit(2);
}
// Try the canonical edit URL; the existing-post variant uses logNo (not originalLogNo).
const editUrl = `https://blog.naver.com/PostWriteForm.naver?blogId=antiegg&Redirect=Update&logNo=${logNo}&editorVersion=4`;

(async () => {
  if (!existsSync(STATE_PATH)) {
    console.error("[fetch] no storage state");
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: STATE_PATH,
    viewport: { width: 1280, height: 900 },
    locale: "ko-KR",
  });
  const page = await context.newPage();

  // Capture autosave (=current documentModel) and any background uploader / url-info / og calls.
  const otherRequests: Array<{ url: string; method: string; postPreview?: string; resPreview?: string }> = [];
  const dumpPath = resolve(process.cwd(), `.naver-fetch-${logNo}.json`);

  page.on("request", (req) => {
    const url = req.url();
    if (/RabbitAutoSaveWrite/.test(url)) {
      const post = req.postData();
      if (!post) return;
      const params = new URLSearchParams(post);
      const dmStr = params.get("documentModel");
      if (!dmStr) return;
      try {
        const dm = JSON.parse(dmStr);
        writeFileSync(
          dumpPath,
          JSON.stringify({ logNo, documentModel: dm, otherRequests }, null, 2),
          "utf8",
        );
        console.log(
          `[fetch] autosave captured. components=${dm.document.components.length} → ${dumpPath}`,
        );
      } catch {}
      return;
    }
    if (/(simpleUpload|photo-uploader|upload\.naver|oglink|url\/info|background)/.test(url)) {
      otherRequests.push({
        url,
        method: req.method(),
        postPreview: req.postData()?.slice(0, 400),
      });
    }
  });
  page.on("response", async (res) => {
    const url = res.url();
    if (!/(simpleUpload|photo-uploader|upload\.naver|oglink|url\/info|background)/.test(url)) return;
    try {
      const body = await res.text();
      const found = [...otherRequests].reverse().find((c) => c.url === url && !c.resPreview);
      if (found) found.resPreview = body.slice(0, 400);
    } catch {}
  });

  console.log(`[fetch] opening edit page for logNo=${logNo}…`);
  console.log(`[fetch] url: ${editUrl}`);
  await page.goto(editUrl, { waitUntil: "domcontentloaded" });
  console.log(`[fetch] landed on: ${page.url()}`);
  const titleAppeared = await page
    .waitForSelector(".se-section-documentTitle", { timeout: 60_000 })
    .then(() => true)
    .catch(() => false);
  console.log(`[fetch] title selector appeared: ${titleAppeared}`);
  console.log(`[fetch] current url after wait: ${page.url()}`);
  await page.waitForTimeout(15_000);

  // trigger autosave by typing+deleting one space in the title
  await page.locator(".se-section-documentTitle").first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(500);
  await page.keyboard.type(" ");
  await page.waitForTimeout(2000);
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(10_000);

  // Extract via SE3 internal API (now that we know the right method names).
  const directDump: any = await page.evaluate(`
    (() => {
      var safe = function(fn){ try { return fn(); } catch (e) { return { __error: String(e).slice(0,300) }; } };
      var clone = function(x){ try { return JSON.parse(JSON.stringify(x)); } catch (e) { return null; } };

      var ed = window.SmartEditor && window.SmartEditor._editors;
      if (!ed) return { error: "no editor" };
      var keys = Object.keys(ed);
      var inst = ed[keys[0]];
      if (!inst || !inst._papyrus) return { error: "no papyrus" };
      var p = inst._papyrus;

      var ds = p._documentService;
      var clStore = p._componentListStore;

      return {
        editorKey: keys[0],
        documentData: ds && typeof ds.getDocumentData === 'function'
          ? clone(safe(function(){ return ds.getDocumentData(); }))
          : null,
        documentId: ds && typeof ds.getDocumentId === 'function'
          ? safe(function(){ return ds.getDocumentId(); })
          : null,
        componentList: clStore && typeof clStore.getComponentList === 'function'
          ? clone(safe(function(){ return clStore.getComponentList(); }))
          : null,
        compListField: clStore && clStore.compList ? clone(safe(function(){
          // mobx observable list — try iterating
          var arr = clStore.compList;
          if (Array.isArray(arr)) return arr.map(function(c){ try { return c.toJSON ? c.toJSON() : c; } catch (e) { return null; } });
          if (arr && typeof arr.forEach === 'function') {
            var out = [];
            arr.forEach(function(c){ try { out.push(c.toJSON ? c.toJSON() : c); } catch (e) { out.push(null); } });
            return out;
          }
          return null;
        })) : null,
      };
    })()
  `);
  writeFileSync(
    dumpPath.replace(".json", "-direct.json"),
    JSON.stringify(directDump, null, 2),
    "utf8",
  );
  console.log(`[fetch] direct dump → ${dumpPath.replace(".json", "-direct.json")}`);

  // also dump any captured side requests at the end
  writeFileSync(
    dumpPath.replace(".json", "-other.json"),
    JSON.stringify({ otherRequests }, null, 2),
    "utf8",
  );
  console.log(`[fetch] otherRequests count=${otherRequests.length}`);
  console.log(`[fetch] done. main → ${dumpPath}`);

  await page.waitForTimeout(5_000);
  await browser.close();
})();
