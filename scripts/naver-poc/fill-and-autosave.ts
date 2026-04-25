import { chromium } from "playwright";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const STATE_PATH = resolve(process.cwd(), ".naver-browser-state.json");
const POST_WRITE_URL =
  "https://blog.naver.com/PostWriteForm.naver?blogId=antiegg&Redirect=Write&redirect=Write&widgetTypeCall=true&directAccess=false";

const TEST_TITLE = "[PoC] Playwright 자동화 검증 — 제목 테스트";
const TEST_BODY =
  "이것은 ghost-to-wp 자동화 PoC가 작성한 본문입니다. 임시저장 동작 검증용. 곧 삭제됩니다.";

// helpers run inside the page so we keep them as raw strings
const FIND_TITLE_SELECTOR = `
  (() => {
    var selectors = [
      'input[placeholder*="제목"]',
      'textarea[placeholder*="제목"]',
      '[data-testid="title"]',
      '.se-title-text [contenteditable="true"]',
      '.se-documentTitle [contenteditable="true"]',
      '.se-title [contenteditable="true"]',
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el) return { selector: selectors[i], tag: el.tagName, isCE: el.getAttribute('contenteditable') === 'true' };
    }
    // fallback: scan every contenteditable for the first one whose placeholder text mentions 제목
    var ces = document.querySelectorAll('[contenteditable="true"]');
    for (var j = 0; j < ces.length; j++) {
      var ph = ces[j].getAttribute('data-placeholder') || ces[j].getAttribute('placeholder') || '';
      var text = ces[j].textContent || '';
      if (/제목/.test(ph) || /제목/.test(text)) {
        return { selector: '[contenteditable="true"]:nth-of-type(' + (j+1) + ')', tag: ces[j].tagName, isCE: true, fallbackIndex: j };
      }
    }
    return null;
  })();
`;

const COUNT_CONTENTEDITABLES = `
  (() => {
    var ces = document.querySelectorAll('[contenteditable="true"]');
    var info = [];
    for (var i = 0; i < ces.length && i < 10; i++) {
      var el = ces[i];
      info.push({
        index: i,
        placeholder: el.getAttribute('data-placeholder') || el.getAttribute('placeholder') || null,
        ariaLabel: el.getAttribute('aria-label') || null,
        className: (el.className || '').toString().slice(0, 120),
        text: (el.textContent || '').slice(0, 60),
        boundingHeight: el.getBoundingClientRect().height,
      });
    }
    return { count: ces.length, info: info };
  })();
`;

async function main() {
  if (!existsSync(STATE_PATH)) {
    console.error("[fill] no storage state at " + STATE_PATH);
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

  console.log("[fill] opening editor…");
  await page.goto(POST_WRITE_URL, { waitUntil: "domcontentloaded" });
  console.log("[fill] waiting 15s for editor bootstrap…");
  await page.waitForTimeout(15_000);

  // dismiss any first-load overlays/popups that block input
  // common naver popups: 임시저장 복원 / 도움말
  console.log("[fill] checking for popups to dismiss…");
  const dismissResult = await page.evaluate(`
    (() => {
      var results = [];
      // close any "취소" / "닫기" buttons in modals
      var buttons = document.querySelectorAll('button');
      for (var i = 0; i < buttons.length; i++) {
        var t = (buttons[i].textContent || '').trim();
        if (/^(취소|닫기|×)$/.test(t) && buttons[i].offsetParent !== null) {
          try { buttons[i].click(); results.push('clicked: ' + t); } catch (_) {}
        }
      }
      return results;
    })();
  `);
  console.log("[fill] dismiss result:", dismissResult);
  await page.waitForTimeout(1500);

  // === diagnostics: list contenteditables so we can see what to type into
  const ceInfo = await page.evaluate(COUNT_CONTENTEDITABLES);
  console.log("[fill] contenteditables on page:");
  console.log(JSON.stringify(ceInfo, null, 2));

  const titleInfo = await page.evaluate(FIND_TITLE_SELECTOR);
  console.log("[fill] title selector hit:", titleInfo);

  // === enter title and body via simulated keyboard so SE3 reacts naturally
  // strategy: click into the first contenteditable that looks like the title row,
  // type, then press Tab/Enter to move to body and type body.
  console.log("[fill] focusing presumed title contenteditable (index 0)…");
  try {
    const ces = page.locator('[contenteditable="true"]');
    const first = ces.first();
    await first.click({ timeout: 5000 });
    await page.keyboard.type(TEST_TITLE, { delay: 25 });
    console.log("[fill] typed title");
  } catch (e) {
    console.log("[fill] title typing failed:", String(e).slice(0, 200));
  }

  await page.waitForTimeout(800);

  console.log("[fill] tab into body and type sample body…");
  try {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(400);
    await page.keyboard.type(TEST_BODY, { delay: 15 });
    console.log("[fill] typed body");
  } catch (e) {
    console.log("[fill] body typing failed:", String(e).slice(0, 200));
  }

  // SE3 autosave normally fires every few seconds while typing; wait long enough
  console.log("[fill] waiting 20s to let autosave fire…");
  await page.waitForTimeout(20_000);

  console.log("[fill] taking screenshot…");
  await page.screenshot({
    path: resolve(process.cwd(), ".naver-debug-fill.png"),
    fullPage: false,
  });

  console.log(`[fill] captured ${captured.length} background requests`);
  let autosaveHits = 0;
  for (const c of captured) {
    if (/RabbitAutoSaveWrite/.test(c.url)) autosaveHits++;
    console.log("  " + c.method + " " + c.url.slice(0, 110));
    if (c.status) console.log("    -> " + c.status);
    if (c.bodyLen) console.log("    body length: " + c.bodyLen);
    if (c.resPreview) console.log("    res: " + c.resPreview.slice(0, 200));
  }
  console.log(`[fill] autosave calls fired: ${autosaveHits}`);

  const debugPath = resolve(process.cwd(), ".naver-debug-fill.json");
  writeFileSync(
    debugPath,
    JSON.stringify(
      { ceInfo, titleInfo, dismissResult, captured, autosaveHits },
      null,
      2,
    ),
    "utf8",
  );
  console.log("[fill] full dump → " + debugPath);

  console.log(
    "[fill] leaving browser open 30s — DO NOT click 발행. Just observe whether the title and body actually appear in the editor.",
  );
  await page.waitForTimeout(30_000);
  await browser.close();
}

main().catch((e) => {
  console.error("[fill] failed:", e);
  process.exit(1);
});
