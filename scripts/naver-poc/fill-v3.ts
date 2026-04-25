import { chromium } from "playwright";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const STATE_PATH = resolve(process.cwd(), ".naver-browser-state.json");
const POST_WRITE_URL =
  "https://blog.naver.com/PostWriteForm.naver?blogId=antiegg&Redirect=Write&redirect=Write&widgetTypeCall=true&directAccess=false";

// English first to factor out the IME variable
const TEST_TITLE = "PoC Title ABC 123";
const TEST_BODY = "PoC body line one. Two three.";

const SE_PROBE = `
  (() => {
    var pickInfo = function (el) {
      if (!el) return null;
      var rect = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        contenteditable: el.getAttribute('contenteditable'),
        ariaHidden: el.getAttribute('aria-hidden'),
        className: (el.className || '').toString().slice(0, 140),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        top: Math.round(rect.top),
        text: (el.textContent || '').slice(0, 80),
      };
    };

    var titleHost = document.querySelector('.se-section-documentTitle') || document.querySelector('.se-documentTitle');
    var bodyHost = null;
    var sections = document.querySelectorAll('.se-section');
    for (var i = 0; i < sections.length; i++) {
      if (!sections[i].classList.contains('se-section-documentTitle')) {
        bodyHost = sections[i];
        break;
      }
    }
    if (!bodyHost) {
      var components = document.querySelectorAll('.se-component');
      for (var j = 0; j < components.length; j++) {
        if (!components[j].classList.contains('se-documentTitle')) {
          bodyHost = components[j];
          break;
        }
      }
    }

    if (titleHost) titleHost.setAttribute('data-poc-target', 'title');
    if (bodyHost) bodyHost.setAttribute('data-poc-target', 'body');

    return {
      titleHost: pickInfo(titleHost),
      bodyHost: pickInfo(bodyHost),
      titleHostInner: titleHost ? titleHost.innerHTML.slice(0, 400) : null,
      bodyHostInner: bodyHost ? bodyHost.innerHTML.slice(0, 400) : null,
    };
  })();
`;

async function main() {
  if (!existsSync(STATE_PATH)) {
    console.error("[fill-v3] no storage state at " + STATE_PATH);
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
      /(RabbitWrite|RabbitAutoSaveWrite|ncpt\.naver\.com|tokens|SuicideWord|upconvert)/.test(
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

  console.log("[fill-v3] opening editor…");
  await page.goto(POST_WRITE_URL, { waitUntil: "domcontentloaded" });
  console.log("[fill-v3] waiting 15s for editor bootstrap…");
  await page.waitForTimeout(15_000);

  console.log("[fill-v3] dismissing popups…");
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

  console.log("[fill-v3] probing title/body host elements…");
  const probe: any = await page.evaluate(SE_PROBE);
  console.log("[fill-v3] titleHost:", probe.titleHost);
  console.log("[fill-v3] bodyHost :", probe.bodyHost);

  if (!probe.titleHost) {
    console.error(
      "[fill-v3] could not find title host — see dump for HTML structure",
    );
  }

  // === Method 1: click .se-section-documentTitle directly + keyboard.type (English)
  if (probe.titleHost) {
    try {
      console.log("[fill-v3] method 1 — click title host + keyboard.type (English)…");
      await page.locator('[data-poc-target="title"]').click({ force: true });
      await page.waitForTimeout(500);
      await page.keyboard.type(TEST_TITLE, { delay: 30 });
      console.log("[fill-v3] title typing complete");
    } catch (e) {
      console.log("[fill-v3] title click/type failed:", String(e).slice(0, 200));
    }
  }

  await page.waitForTimeout(1000);

  if (probe.bodyHost) {
    try {
      console.log("[fill-v3] click body host + keyboard.type (English)…");
      await page.locator('[data-poc-target="body"]').click({ force: true });
      await page.waitForTimeout(500);
      await page.keyboard.type(TEST_BODY, { delay: 30 });
      console.log("[fill-v3] body typing complete");
    } catch (e) {
      console.log("[fill-v3] body click/type failed:", String(e).slice(0, 200));
    }
  }

  console.log("[fill-v3] waiting 20s for autosave…");
  await page.waitForTimeout(20_000);

  await page.screenshot({
    path: resolve(process.cwd(), ".naver-debug-fill-v3.png"),
    fullPage: false,
  });

  let autosaveHits = 0;
  console.log(`[fill-v3] captured ${captured.length} background requests`);
  for (const c of captured) {
    if (/RabbitAutoSaveWrite/.test(c.url)) autosaveHits++;
    console.log("  " + c.method + " " + c.url.slice(0, 110));
    if (c.status) console.log("    -> " + c.status);
    if (c.bodyLen) console.log("    body length: " + c.bodyLen);
    if (c.resPreview) console.log("    res: " + c.resPreview.slice(0, 200));
  }
  console.log("[fill-v3] autosave fired:", autosaveHits);

  writeFileSync(
    resolve(process.cwd(), ".naver-debug-fill-v3.json"),
    JSON.stringify({ probe, captured, autosaveHits }, null, 2),
    "utf8",
  );
  console.log("[fill-v3] dump → .naver-debug-fill-v3.json");

  console.log(
    "[fill-v3] leaving browser open 30s — DO NOT publish. Watch where 'PoC Title ABC 123' and the body text land.",
  );
  await page.waitForTimeout(30_000);
  await browser.close();
}

main().catch((e) => {
  console.error("[fill-v3] failed:", e);
  process.exit(1);
});
