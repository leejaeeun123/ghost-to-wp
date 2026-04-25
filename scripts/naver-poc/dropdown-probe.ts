import { chromium } from "playwright";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const STATE_PATH = resolve(process.cwd(), ".naver-browser-state.json");
const POST_WRITE_URL =
  "https://blog.naver.com/PostWriteForm.naver?blogId=antiegg&Redirect=Write&redirect=Write&widgetTypeCall=true&directAccess=false";

const TEST_TITLE_KR = "[PoC] dropdown 매핑";
const TEST_BODY_KR = "발행 옵션 dropdown 추출 PoC. 발행 안 함.";

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

// Snapshot every visible interactive element so we can diff before/after dropdown click
const COLLECT_VISIBLE = `
  (() => {
    var out = [];
    var els = document.querySelectorAll('button, li, [role="option"], [role="menuitem"], [role="listbox"] *, a, span[class*="select"], div[class*="option"]');
    for (var i = 0; i < els.length && out.length < 800; i++) {
      var el = els[i];
      var rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.height > 80) continue;  // skip large blocks
      var text = (el.textContent || '').replace(/\\s+/g, ' ').trim();
      if (!text || text.length > 60) continue;
      out.push({
        tag: el.tagName,
        role: el.getAttribute('role'),
        className: (el.className || '').toString().slice(0, 100),
        text: text,
        top: Math.round(rect.top),
        left: Math.round(rect.left),
      });
    }
    return out;
  })();
`;

function diffSnapshots(before: any[], after: any[]) {
  const beforeKeys = new Set(
    before.map((b) => `${b.tag}|${b.text}|${b.top}|${b.left}`),
  );
  return after.filter(
    (a) => !beforeKeys.has(`${a.tag}|${a.text}|${a.top}|${a.left}`),
  );
}

async function main() {
  if (!existsSync(STATE_PATH)) {
    console.error("[dropdown] no storage state");
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

  console.log("[dropdown] opening editor…");
  await page.goto(POST_WRITE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(15_000);

  // dismiss any leftover popups
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

  // fill so 발행 button activates
  const seProbe: any = await page.evaluate(SE_PROBE);
  if (seProbe.hasTitle) {
    await page.locator('[data-poc-target="title"]').click({ force: true });
    await page.waitForTimeout(300);
    await page.keyboard.insertText(TEST_TITLE_KR);
  }
  await page.waitForTimeout(600);
  if (seProbe.hasBody) {
    await page.evaluate(
      (text) => navigator.clipboard.writeText(text),
      TEST_BODY_KR,
    );
    await page.locator('[data-poc-target="body"]').click({ force: true });
    await page.waitForTimeout(300);
    await page.keyboard.press("Control+V");
  }
  await page.waitForTimeout(1500);

  // open publish modal
  console.log("[dropdown] opening 발행 modal…");
  const candidates = page.locator('button:has-text("발행")');
  const count = await candidates.count();
  for (let i = 0; i < count; i++) {
    const btn = candidates.nth(i);
    if (await btn.isVisible()) {
      await btn.click({ force: true });
      break;
    }
  }
  await page.waitForTimeout(2500);

  // ===== CATEGORY dropdown =====
  console.log("[dropdown] snapshotting before clicking category…");
  const beforeCategory: any[] = await page.evaluate(COLLECT_VISIBLE);

  console.log("[dropdown] clicking category selectbox…");
  let categoryClicked = false;
  try {
    await page.locator("button.selectbox_button__jb1Dt").first().click({ force: true });
    categoryClicked = true;
  } catch (e) {
    console.log(
      "[dropdown] category click via class failed:",
      String(e).slice(0, 160),
    );
    try {
      await page
        .locator('[class*="selectbox_button"]')
        .first()
        .click({ force: true });
      categoryClicked = true;
    } catch (e2) {
      console.log(
        "[dropdown] category fallback failed:",
        String(e2).slice(0, 160),
      );
    }
  }
  await page.waitForTimeout(1200);

  const afterCategory: any[] = await page.evaluate(COLLECT_VISIBLE);
  const newCategoryItems = diffSnapshots(beforeCategory, afterCategory);
  console.log(
    "[dropdown] category — new items appeared after click:",
    newCategoryItems.length,
  );
  for (const it of newCategoryItems.slice(0, 60)) {
    console.log("    ", it.tag, "::", it.text, " (cls:", it.className.slice(0, 40), ")");
  }

  await page.screenshot({
    path: resolve(process.cwd(), ".naver-debug-dropdown-category.png"),
    fullPage: false,
  });

  // close dropdown by Escape
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);

  // ===== TOPIC (주제) =====
  console.log("[dropdown] snapshotting before clicking 주제…");
  const beforeTopic: any[] = await page.evaluate(COLLECT_VISIBLE);

  console.log("[dropdown] clicking 주제 selectbox…");
  let topicClicked = false;
  try {
    // "주제 선택" text-based approach
    await page
      .locator('button:has-text("주제"), [role="button"]:has-text("주제")')
      .first()
      .click({ force: true });
    topicClicked = true;
  } catch (e) {
    console.log("[dropdown] topic click failed:", String(e).slice(0, 160));
  }
  await page.waitForTimeout(1500);

  const afterTopic: any[] = await page.evaluate(COLLECT_VISIBLE);
  const newTopicItems = diffSnapshots(beforeTopic, afterTopic);
  console.log("[dropdown] topic — new items:", newTopicItems.length);
  for (const it of newTopicItems.slice(0, 80)) {
    console.log("    ", it.tag, "::", it.text);
  }

  await page.screenshot({
    path: resolve(process.cwd(), ".naver-debug-dropdown-topic.png"),
    fullPage: false,
  });

  writeFileSync(
    resolve(process.cwd(), ".naver-debug-dropdown.json"),
    JSON.stringify(
      {
        seProbe,
        categoryClicked,
        topicClicked,
        newCategoryItems,
        newTopicItems,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log("[dropdown] dump → .naver-debug-dropdown.json");

  console.log(
    "[dropdown] leaving 30s for visual inspection — DO NOT click final 발행.",
  );
  await page.waitForTimeout(30_000);
  await browser.close();
}

main().catch((e) => {
  console.error("[dropdown] failed:", e);
  process.exit(1);
});
