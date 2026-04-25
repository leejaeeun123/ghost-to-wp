import { chromium } from "playwright";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const STATE_PATH = resolve(process.cwd(), ".naver-browser-state.json");
const POST_WRITE_URL =
  "https://blog.naver.com/PostWriteForm.naver?blogId=antiegg&Redirect=Write&redirect=Write&widgetTypeCall=true&directAccess=false";

const TEST_TITLE_KR = "[PoC] dropdown 매핑 v2";
const TEST_BODY_KR = "주제 dropdown 추출 PoC. 발행 안 함.";

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

const COLLECT_VISIBLE = `
  (() => {
    var out = [];
    var els = document.querySelectorAll('button, li, [role="option"], [role="menuitem"], a, span, div');
    for (var i = 0; i < els.length && out.length < 1500; i++) {
      var el = els[i];
      var rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.height > 80) continue;
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

// dump *all* elements that contain 주제 anywhere in their text — useful when text is split into spans
const FIND_TOPIC_HOST = `
  (() => {
    var out = [];
    var els = document.querySelectorAll('*');
    for (var i = 0; i < els.length && out.length < 50; i++) {
      var el = els[i];
      var direct = '';
      // gather direct child text (avoid descendants for less noise)
      for (var j = 0; j < el.childNodes.length; j++) {
        var n = el.childNodes[j];
        if (n.nodeType === 3) direct += n.textContent;
      }
      if (!direct) continue;
      if (!/주제/.test(direct)) continue;
      var rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      out.push({
        tag: el.tagName,
        role: el.getAttribute('role'),
        className: (el.className || '').toString().slice(0, 120),
        text: (el.textContent || '').slice(0, 80),
        directText: direct.slice(0, 80),
        clickable: el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'button' || (el.style && el.style.cursor === 'pointer'),
        top: Math.round(rect.top),
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
    console.error("[dd2] no storage state");
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

  console.log("[dd2] opening editor…");
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
  console.log("[dd2] opening 발행 modal…");
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

  // ===== locate the 주제 host element =====
  console.log("[dd2] hunting for 주제 host element…");
  const topicHosts: any[] = await page.evaluate(FIND_TOPIC_HOST);
  console.log(`[dd2] found ${topicHosts.length} elements containing 주제:`);
  for (const h of topicHosts.slice(0, 15)) {
    console.log(
      "    ",
      h.tag,
      "role:",
      h.role,
      "clickable:",
      h.clickable,
      "::",
      h.directText.slice(0, 50),
      "/cls:",
      h.className.slice(0, 40),
    );
  }

  // pick the most plausible 주제 row — usually a clickable element near "주제 선택 안 함"
  // strategy: first element whose direct text contains "주제 선택"
  console.log("[dd2] snapshotting before clicking 주제…");
  const beforeTopic: any[] = await page.evaluate(COLLECT_VISIBLE);

  let topicClicked = false;
  // try multiple click strategies
  const strategies = [
    'a:has-text("주제 선택")',
    'button:has-text("주제 선택")',
    'span:has-text("주제 선택")',
    '[class*="topic"]:has-text("주제")',
    'text=주제 선택 안 함',
  ];
  for (const sel of strategies) {
    try {
      const loc = page.locator(sel).first();
      if (await loc.isVisible({ timeout: 1500 })) {
        console.log("[dd2] trying click on:", sel);
        await loc.click({ force: true, timeout: 5000 });
        topicClicked = true;
        break;
      }
    } catch (e) {
      console.log("[dd2]   strategy failed:", sel, "—", String(e).slice(0, 80));
    }
  }
  if (!topicClicked) {
    console.log("[dd2] all strategies failed — will dump topicHosts only");
  } else {
    console.log("[dd2] 주제 clicked. waiting 1.5s for panel…");
    await page.waitForTimeout(1500);
  }

  const afterTopic: any[] = await page.evaluate(COLLECT_VISIBLE);
  const newTopicItems = diffSnapshots(beforeTopic, afterTopic);
  console.log("[dd2] topic — new items:", newTopicItems.length);
  for (const it of newTopicItems.slice(0, 80)) {
    console.log("    ", it.tag, "::", it.text);
  }

  await page.screenshot({
    path: resolve(process.cwd(), ".naver-debug-dropdown-topic-v2.png"),
    fullPage: false,
  });

  writeFileSync(
    resolve(process.cwd(), ".naver-debug-dropdown-v2.json"),
    JSON.stringify({ topicHosts, topicClicked, newTopicItems }, null, 2),
    "utf8",
  );
  console.log("[dd2] dump → .naver-debug-dropdown-v2.json");

  console.log(
    "[dd2] leaving 30s — DO NOT click final 발행. Inspect the topic panel visually.",
  );
  await page.waitForTimeout(30_000);
  await browser.close();
}

main().catch((e) => {
  console.error("[dd2] failed:", e);
  process.exit(1);
});
