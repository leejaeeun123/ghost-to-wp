import { chromium } from "playwright";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const STATE_PATH = resolve(process.cwd(), ".naver-browser-state.json");
const POST_WRITE_URL =
  "https://blog.naver.com/PostWriteForm.naver?blogId=antiegg&Redirect=Write&redirect=Write&widgetTypeCall=true&directAccess=false";

const TEST_TITLE = "Playwright 자동화 PoC 제목";
const TEST_BODY = "본문 한 줄 테스트입니다.";

// dump SE3-related anchors so we know exactly where to type
const SE_PROBE = `
  (() => {
    var __name = function (fn) { return fn; };
    var pickInfo = function (el) {
      if (!el) return null;
      var rect = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        contenteditable: el.getAttribute('contenteditable'),
        ariaHidden: el.getAttribute('aria-hidden'),
        className: (el.className || '').toString().slice(0, 140),
        placeholder: el.getAttribute('placeholder') || el.getAttribute('data-placeholder') || null,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        top: Math.round(rect.top),
        text: (el.textContent || '').slice(0, 80),
      };
    };

    var result = { classes: {}, visibleInputs: [], pickedTitle: null, pickedBody: null };

    var classNames = [
      'se-documentTitle','se-section-documentTitle','se-title-text',
      'se-text','se-text-paragraph','se-component','se-section','se-module','se-module-text',
      'se-canvas','se-papyrus','se-content','se-document'
    ];
    for (var i = 0; i < classNames.length; i++) {
      var cls = classNames[i];
      var els = document.querySelectorAll('.' + cls);
      var entry = { count: els.length };
      if (els.length) entry.first = pickInfo(els[0]);
      result.classes[cls] = entry;
    }

    // collect every contenteditable that is not aria-hidden and has size > 0
    var ces = document.querySelectorAll('[contenteditable="true"]');
    for (var j = 0; j < ces.length; j++) {
      var el = ces[j];
      var rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (el.getAttribute('aria-hidden') === 'true') continue;
      result.visibleInputs.push(pickInfo(el));
    }

    // pick title = first .se-documentTitle [contenteditable] OR closest match
    var titleEl =
      document.querySelector('.se-documentTitle [contenteditable="true"]') ||
      document.querySelector('.se-section-documentTitle [contenteditable="true"]') ||
      document.querySelector('.se-title-text [contenteditable="true"]');
    result.pickedTitle = titleEl ? pickInfo(titleEl) : null;

    // pick body = first contenteditable inside a non-title se-component/text
    var bodyEl = null;
    var comps = document.querySelectorAll('.se-component');
    for (var k = 0; k < comps.length; k++) {
      var c = comps[k];
      if (c.classList.contains('se-documentTitle')) continue;
      var inner = c.querySelector('[contenteditable="true"]');
      if (inner && inner.getAttribute('aria-hidden') !== 'true') {
        var rb = inner.getBoundingClientRect();
        if (rb.width > 0 && rb.height > 0) {
          bodyEl = inner;
          break;
        }
      }
    }
    result.pickedBody = bodyEl ? pickInfo(bodyEl) : null;

    // expose elements via data-poc attribute so playwright can target them
    if (titleEl) titleEl.setAttribute('data-poc-target', 'title');
    if (bodyEl) bodyEl.setAttribute('data-poc-target', 'body');

    return result;
  })();
`;

async function main() {
  if (!existsSync(STATE_PATH)) {
    console.error("[fill-v2] no storage state at " + STATE_PATH);
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: STATE_PATH,
    viewport: { width: 1280, height: 900 },
    locale: "ko-KR",
  });
  const page = await context.newPage();

  const captured: Array<{
    url: string;
    method: string;
    status?: number;
    bodyLen?: number;
    resPreview?: string;
  }> = [];
  page.on("request", (req) => {
    const url = req.url();
    if (
      /(RabbitWrite|RabbitAutoSaveWrite|ncpt\.naver\.com|upconvert\.editor|photo-uploader|simpleUpload|tokens|oglink|SuicideWord)/.test(
        url,
      )
    ) {
      captured.push({
        url,
        method: req.method(),
        bodyLen: req.postData()?.length,
      });
    }
  });
  page.on("response", async (res) => {
    const url = res.url();
    if (/(RabbitAutoSaveWrite|RabbitWrite|tokens)/.test(url)) {
      try {
        const body = await res.text();
        const found = [...captured].reverse().find((c) => c.url === url && !c.resPreview);
        if (found) {
          found.status = res.status();
          found.resPreview = body.slice(0, 400);
        }
      } catch {}
    }
  });

  console.log("[fill-v2] opening editor…");
  await page.goto(POST_WRITE_URL, { waitUntil: "domcontentloaded" });
  console.log("[fill-v2] waiting 15s for editor bootstrap…");
  await page.waitForTimeout(15_000);

  // Naver shows a "임시저장된 글이 있습니다 — 불러오기/취소" modal on second entry.
  // Always pick "취소" so we start fresh, then close any other lingering popups.
  console.log("[fill-v2] dismissing draft-restore + other popups…");
  const dismissResult = await page.evaluate(`
    (() => {
      var clicked = [];
      var buttons = document.querySelectorAll('button');
      for (var i = 0; i < buttons.length; i++) {
        var t = (buttons[i].textContent || '').trim();
        if (/^(취소|닫기|×|아니오|아니요|안불러오기|不\\\\u8f7d)$/.test(t) && buttons[i].offsetParent !== null) {
          try { buttons[i].click(); clicked.push(t); } catch (_) {}
        }
      }
      return clicked;
    })();
  `);
  console.log("[fill-v2] dismissed:", dismissResult);
  await page.waitForTimeout(1500);

  console.log("[fill-v2] probing SE3 selectors…");
  const probeResult: any = await page.evaluate(SE_PROBE);
  console.log("[fill-v2] picked title:", probeResult.pickedTitle);
  console.log("[fill-v2] picked body :", probeResult.pickedBody);
  console.log(
    "[fill-v2] visible contenteditable count:",
    probeResult.visibleInputs.length,
  );
  console.log(
    "[fill-v2] se-class counts:",
    Object.fromEntries(
      Object.entries(probeResult.classes).map(([k, v]: any) => [k, v.count]),
    ),
  );

  if (!probeResult.pickedTitle || !probeResult.pickedBody) {
    console.error(
      "[fill-v2] could not locate title/body — see dump for classes available",
    );
  } else {
    // === fill title via insertText (IME-safe) ===
    try {
      await page.locator('[data-poc-target="title"]').click({ force: true });
      await page.waitForTimeout(300);
      await page.keyboard.insertText(TEST_TITLE);
      console.log("[fill-v2] title inserted");
    } catch (e) {
      console.log("[fill-v2] title insert failed:", String(e).slice(0, 200));
    }

    await page.waitForTimeout(800);

    // === fill body ===
    try {
      await page.locator('[data-poc-target="body"]').click({ force: true });
      await page.waitForTimeout(300);
      await page.keyboard.insertText(TEST_BODY);
      console.log("[fill-v2] body inserted");
    } catch (e) {
      console.log("[fill-v2] body insert failed:", String(e).slice(0, 200));
    }
  }

  console.log("[fill-v2] waiting 20s for autosave…");
  await page.waitForTimeout(20_000);

  await page.screenshot({
    path: resolve(process.cwd(), ".naver-debug-fill-v2.png"),
    fullPage: false,
  });

  let autosaveHits = 0;
  console.log(`[fill-v2] captured ${captured.length} background requests`);
  for (const c of captured) {
    if (/RabbitAutoSaveWrite/.test(c.url)) autosaveHits++;
    console.log("  " + c.method + " " + c.url.slice(0, 110));
    if (c.status) console.log("    -> " + c.status);
    if (c.bodyLen) console.log("    body length: " + c.bodyLen);
    if (c.resPreview) console.log("    res: " + c.resPreview.slice(0, 200));
  }
  console.log("[fill-v2] autosave fired:", autosaveHits);

  writeFileSync(
    resolve(process.cwd(), ".naver-debug-fill-v2.json"),
    JSON.stringify({ probeResult, dismissResult, captured, autosaveHits }, null, 2),
    "utf8",
  );
  console.log("[fill-v2] dump saved → .naver-debug-fill-v2.json");

  console.log("[fill-v2] leaving browser open 30s — DO NOT click 발행. Observe whether title/body landed correctly.");
  await page.waitForTimeout(30_000);
  await browser.close();
}

main().catch((e) => {
  console.error("[fill-v2] failed:", e);
  process.exit(1);
});
