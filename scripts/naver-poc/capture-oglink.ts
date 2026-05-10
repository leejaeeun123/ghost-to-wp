import { chromium } from "playwright";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const STATE_PATH = resolve(process.cwd(), ".naver-browser-state.json");
const POST_WRITE_URL =
  "https://blog.naver.com/PostWriteForm.naver?blogId=antiegg&Redirect=Write&redirect=Write&widgetTypeCall=true&directAccess=false";
const URL_TO_PASTE = "https://antiegg.kr/33926/";

(async () => {
  if (!existsSync(STATE_PATH)) {
    console.error("[oglink] no state");
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: STATE_PATH,
    viewport: { width: 1280, height: 900 },
    locale: "ko-KR",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "https://blog.naver.com",
  });
  const page = await context.newPage();

  const captures: Array<any> = [];
  const dumpPath = resolve(process.cwd(), ".naver-debug-oglink.json");
  const persist = () => {
    try {
      writeFileSync(dumpPath, JSON.stringify({ captures }, null, 2), "utf8");
    } catch {}
  };

  page.on("request", (req) => {
    const url = req.url();
    if (
      /(oglink|url[\/-]info|getInfo|link\/api|api\/v[12]\/url|getOg|antiegg\.kr)/i.test(
        url,
      ) ||
      /(simpleUpload|photo-uploader|upload\.naver)/i.test(url)
    ) {
      captures.push({
        url,
        method: req.method(),
        headers: req.headers(),
        postPreview: req.postData()?.slice(0, 600),
        ts: Date.now(),
      });
      persist();
    }
  });
  page.on("response", async (res) => {
    const url = res.url();
    if (
      !/(oglink|url[\/-]info|getInfo|link\/api|getOg|simpleUpload|photo-uploader|upload\.naver|antiegg\.kr)/i.test(
        url,
      )
    )
      return;
    try {
      const body = await res.text();
      const target = [...captures]
        .reverse()
        .find((c) => c.url === url && !c.resPreview);
      if (target) {
        target.status = res.status();
        target.resPreview = body.slice(0, 1500);
      }
      persist();
    } catch {}
  });

  console.log("[oglink] opening editor…");
  await page.goto(POST_WRITE_URL, { waitUntil: "domcontentloaded" });
  await page
    .waitForSelector(".se-section-documentTitle", { timeout: 60_000 })
    .catch(() => {});
  await page.evaluate(`
    (() => {
      var bs = document.querySelectorAll('button');
      for (var i = 0; i < bs.length; i++) {
        var t = (bs[i].textContent || '').trim();
        if (/^(취소|닫기|×|아니오|아니요)$/.test(t) && bs[i].offsetParent !== null) {
          try { bs[i].click(); } catch (_) {}
        }
      }
    })();
  `);
  await page.waitForTimeout(2000);

  await page.evaluate(`
    (() => {
      var titleHost = document.querySelector('.se-section-documentTitle');
      if (titleHost) titleHost.setAttribute('data-poc-target', 'title');
      var sections = document.querySelectorAll('.se-section');
      for (var i = 0; i < sections.length; i++) {
        if (!sections[i].classList.contains('se-section-documentTitle')) {
          sections[i].setAttribute('data-poc-target', 'body');
          break;
        }
      }
    })();
  `);

  await page.locator('[data-poc-target="title"]').click({ force: true });
  await page.keyboard.insertText("[oglink 진단]");
  await page.waitForTimeout(800);

  // paste a URL — SE3 should auto-convert to oglink card via API call
  console.log(`[oglink] pasting URL: ${URL_TO_PASTE}`);
  await page.evaluate(
    (url) => navigator.clipboard.writeText(url),
    URL_TO_PASTE,
  );
  await page.locator('[data-poc-target="body"]').click({ force: true });
  await page.waitForTimeout(300);
  await page.keyboard.press("Control+V");
  await page.waitForTimeout(10_000);

  console.log(`[oglink] captures: ${captures.length}`);
  for (const c of captures) {
    console.log(`  ${c.method} ${c.url}`);
    if (c.status) console.log(`    -> ${c.status}`);
    if (c.postPreview) console.log(`    body: ${c.postPreview.slice(0, 200)}`);
    if (c.resPreview) console.log(`    res:  ${c.resPreview.slice(0, 200)}`);
  }

  persist();
  console.log(`[oglink] dump → ${dumpPath}`);

  await page.waitForTimeout(15_000);
  await browser.close();
})();
