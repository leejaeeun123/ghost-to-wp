import { chromium } from "playwright";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const STATE_PATH = resolve(process.cwd(), ".naver-browser-state.json");
const POST_WRITE_URL =
  "https://blog.naver.com/PostWriteForm.naver?blogId=antiegg&Redirect=Write&redirect=Write&widgetTypeCall=true&directAccess=false";

// minimal HTML — strip SE3 wrappers, just inline style on plain <p>
const SIMPLE_HTML = `
<p style="text-align:left">왼쪽 정렬 단락 1.</p>
<p style="text-align:center">가운데 정렬 단락 2.</p>
<p style="text-align:right">오른쪽 정렬 단락 3.</p>
`.trim();

// SE3 wrapper version (what naver-formatter currently emits)
const SE_WRAPPER_HTML = `
<div class="se-component se-text se-l-default"><div class="se-component-content"><div class="se-section se-section-text se-l-default"><div class="se-module se-module-text"><p class="se-text-paragraph se-text-paragraph-align-center" style="text-align:center">SE3 wrapper 가운데 단락</p></div></div></div></div>
`.trim();

const SE_PROBE = `
  (() => {
    var titleHost = document.querySelector('.se-section-documentTitle');
    var bodyHost = null;
    var sections = document.querySelectorAll('.se-section');
    for (var i = 0; i < sections.length; i++) {
      if (!sections[i].classList.contains('se-section-documentTitle')) {
        bodyHost = sections[i];
        break;
      }
    }
    if (titleHost) titleHost.setAttribute('data-poc-target', 'title');
    if (bodyHost) bodyHost.setAttribute('data-poc-target', 'body');
    return { hasTitle: !!titleHost, hasBody: !!bodyHost };
  })();
`;

async function runVariant(label: string, html: string) {
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

  let autosavePayload: string | null = null;
  page.on("request", (req) => {
    if (/RabbitAutoSaveWrite/.test(req.url())) {
      autosavePayload = req.postData() || null;
    }
  });

  console.log(`\n========== ${label} ==========`);
  await page.goto(POST_WRITE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(15_000);
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
  await page.waitForTimeout(1500);

  const probe: any = await page.evaluate(SE_PROBE);
  if (!probe.hasBody) {
    console.log(`[${label}] no body host`);
    await browser.close();
    return null;
  }

  // type a title to satisfy autosave validation
  await page.locator('[data-poc-target="title"]').click({ force: true });
  await page.waitForTimeout(300);
  await page.keyboard.insertText(`paste-debug ${label}`);
  await page.waitForTimeout(600);

  // paste the test HTML
  await page.evaluate(async (h) => {
    const blob = new Blob([h], { type: "text/html" });
    const plain = new Blob([h.replace(/<[^>]+>/g, "")], { type: "text/plain" });
    await navigator.clipboard.write([
      new ClipboardItem({ "text/html": blob, "text/plain": plain }),
    ]);
  }, html);
  await page.locator('[data-poc-target="body"]').click({ force: true });
  await page.waitForTimeout(400);
  await page.keyboard.press("Control+V");
  await page.waitForTimeout(3000);

  // type a single character to trigger autosave (autosave fires on edit, not on paste alone)
  await page.keyboard.press("End");
  await page.keyboard.type(" ", { delay: 50 });
  await page.waitForTimeout(8_000); // wait for autosave (typically every ~2s of idle)

  // also try forcing autosave by triggering blur
  await page.locator('[data-poc-target="title"]').click({ force: true });
  await page.waitForTimeout(5000);

  await page.screenshot({
    path: resolve(process.cwd(), `.naver-debug-paste-${label}.png`),
    fullPage: false,
  });

  let documentModel = null;
  let alignsInModel: any[] = [];
  if (autosavePayload) {
    const params = new URLSearchParams(autosavePayload);
    const dmStr = params.get("documentModel");
    if (dmStr) {
      try {
        documentModel = JSON.parse(dmStr);
        const collect = (n: any) => {
          if (!n || typeof n !== "object") return;
          if (Array.isArray(n)) {
            n.forEach(collect);
            return;
          }
          if (n.style && typeof n.style.align === "string") {
            alignsInModel.push({ ctype: n["@ctype"], align: n.style.align });
          }
          for (const k of Object.keys(n)) {
            if (k !== "id") collect(n[k]);
          }
        };
        collect(documentModel);
      } catch {}
    }
  }
  console.log(`[${label}] aligns in saved documentModel:`, alignsInModel);

  writeFileSync(
    resolve(process.cwd(), `.naver-debug-paste-${label}.json`),
    JSON.stringify({ html, autosavePayload, documentModel, alignsInModel }, null, 2),
    "utf8",
  );

  await browser.close();
  return alignsInModel;
}

async function main() {
  if (!existsSync(STATE_PATH)) {
    console.error("[paste] no storage state");
    process.exit(2);
  }
  const r1 = await runVariant("simple", SIMPLE_HTML);
  const r2 = await runVariant("se-wrapper", SE_WRAPPER_HTML);
  console.log("\n=== summary ===");
  console.log("simple aligns:", r1);
  console.log("se-wrapper aligns:", r2);
}

main().catch((e) => {
  console.error("[paste] failed:", e);
  process.exit(1);
});
