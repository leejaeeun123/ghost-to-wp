import { chromium } from "playwright";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const STATE_PATH = resolve(process.cwd(), ".naver-browser-state.json");
const POST_WRITE_URL =
  "https://blog.naver.com/PostWriteForm.naver?blogId=antiegg&Redirect=Write&redirect=Write&widgetTypeCall=true&directAccess=false";

const TEST_TITLE_KR = "한글 자동화 PoC 제목";
const TEST_BODY_KR = "한글 본문 한 줄 테스트입니다.";

const SE_PROBE = `
  (() => {
    var pickInfo = function (el) {
      if (!el) return null;
      var rect = el.getBoundingClientRect();
      return {
        tag: el.tagName,
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
    if (titleHost) titleHost.setAttribute('data-poc-target', 'title');
    if (bodyHost) bodyHost.setAttribute('data-poc-target', 'body');
    return { titleHost: pickInfo(titleHost), bodyHost: pickInfo(bodyHost) };
  })();
`;

async function main() {
  if (!existsSync(STATE_PATH)) {
    console.error("[fill-v4] no storage state at " + STATE_PATH);
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
      /(RabbitWrite|RabbitAutoSaveWrite|tokens|SuicideWord|upconvert|oglink)/.test(
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

  console.log("[fill-v4] opening editor…");
  await page.goto(POST_WRITE_URL, { waitUntil: "domcontentloaded" });
  console.log("[fill-v4] waiting 15s…");
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
  console.log("[fill-v4] titleHost:", probe.titleHost);
  console.log("[fill-v4] bodyHost :", probe.bodyHost);

  // === Method A: keyboard.insertText for the TITLE
  if (probe.titleHost) {
    try {
      console.log("[fill-v4] [A] title via keyboard.insertText…");
      await page.locator('[data-poc-target="title"]').click({ force: true });
      await page.waitForTimeout(500);
      await page.keyboard.insertText(TEST_TITLE_KR);
      console.log("[fill-v4] [A] insertText sent");
    } catch (e) {
      console.log("[fill-v4] [A] failed:", String(e).slice(0, 200));
    }
  }

  await page.waitForTimeout(1000);

  // === Method B: clipboard paste for the BODY
  if (probe.bodyHost) {
    try {
      console.log("[fill-v4] [B] copy body to clipboard, click body, Ctrl+V…");
      await page.evaluate(
        (text) => navigator.clipboard.writeText(text),
        TEST_BODY_KR,
      );
      await page.locator('[data-poc-target="body"]').click({ force: true });
      await page.waitForTimeout(500);
      await page.keyboard.press("Control+V");
      console.log("[fill-v4] [B] paste sent");
    } catch (e) {
      console.log("[fill-v4] [B] failed:", String(e).slice(0, 200));
    }
  }

  console.log("[fill-v4] waiting 20s for autosave…");
  await page.waitForTimeout(20_000);

  await page.screenshot({
    path: resolve(process.cwd(), ".naver-debug-fill-v4.png"),
    fullPage: false,
  });

  let autosaveHits = 0;
  console.log(`[fill-v4] captured ${captured.length} requests`);
  for (const c of captured) {
    if (/RabbitAutoSaveWrite/.test(c.url)) autosaveHits++;
    console.log("  " + c.method + " " + c.url.slice(0, 110));
    if (c.status) console.log("    -> " + c.status);
    if (c.bodyLen) console.log("    body length: " + c.bodyLen);
    if (c.resPreview) console.log("    res: " + c.resPreview.slice(0, 200));
  }
  console.log("[fill-v4] autosave fired:", autosaveHits);

  writeFileSync(
    resolve(process.cwd(), ".naver-debug-fill-v4.json"),
    JSON.stringify({ probe, captured, autosaveHits }, null, 2),
    "utf8",
  );
  console.log("[fill-v4] dump → .naver-debug-fill-v4.json");

  console.log(
    "[fill-v4] leaving 30s. Check: title=Method A insertText / body=Method B paste. Note which one landed correctly.",
  );
  await page.waitForTimeout(30_000);
  await browser.close();
}

main().catch((e) => {
  console.error("[fill-v4] failed:", e);
  process.exit(1);
});
