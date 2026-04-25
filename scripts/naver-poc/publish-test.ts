import { chromium } from "playwright";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const STATE_PATH = resolve(process.cwd(), ".naver-browser-state.json");
const POST_WRITE_URL =
  "https://blog.naver.com/PostWriteForm.naver?blogId=antiegg&Redirect=Write&redirect=Write&widgetTypeCall=true&directAccess=false";

// safety: real publish only when --publish flag is explicitly passed
const DO_PUBLISH = process.argv.includes("--publish");

const TEST_TITLE = "[자동화 PoC · 발행 후 즉시 삭제 예정]";
const TEST_BODY =
  "이 글은 ghost-to-wp 자동화 PoC가 작성한 비공개 테스트 글입니다. 발행 직후 즉시 삭제해 주세요. 카테고리: 큐레이션, 주제: 문학·책 매핑 검증용.";

const TARGET_CATEGORY = "CURATION"; // CURATION or GRAY
const TARGET_TOPIC = "문학·책"; // see project_naver_publish_mapping memory

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

async function main() {
  if (!existsSync(STATE_PATH)) {
    console.error("[pub] no storage state — run naver:bootstrap first");
    process.exit(2);
  }

  console.log(
    `[pub] mode: ${DO_PUBLISH ? "REAL PUBLISH (private)" : "DRY-RUN (stop before final 발행)"}`,
  );

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

  let publishResponse: any = null;
  page.on("response", async (res) => {
    if (/RabbitWrite\.naver/.test(res.url()) && !/AutoSave/.test(res.url())) {
      try {
        const body = await res.text();
        publishResponse = { status: res.status(), body };
        console.log("[pub] RabbitWrite response:", res.status(), body.slice(0, 400));
      } catch {}
    }
  });

  console.log("[pub] opening editor…");
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

  // ===== TITLE + BODY =====
  const seProbe: any = await page.evaluate(SE_PROBE);
  if (!seProbe.hasTitle || !seProbe.hasBody) {
    console.error("[pub] could not locate title/body host. abort.");
    await browser.close();
    process.exit(3);
  }
  await page.locator('[data-poc-target="title"]').click({ force: true });
  await page.waitForTimeout(300);
  await page.keyboard.insertText(TEST_TITLE);
  console.log("[pub] title inserted");

  await page.waitForTimeout(600);
  await page.evaluate(
    (text) => navigator.clipboard.writeText(text),
    TEST_BODY,
  );
  await page.locator('[data-poc-target="body"]').click({ force: true });
  await page.waitForTimeout(300);
  await page.keyboard.press("Control+V");
  console.log("[pub] body pasted");

  await page.waitForTimeout(1500);

  // ===== OPEN PUBLISH MODAL =====
  console.log("[pub] opening 발행 modal…");
  {
    const candidates = page.locator('button:has-text("발행")');
    const count = await candidates.count();
    let opened = false;
    for (let i = 0; i < count; i++) {
      const btn = candidates.nth(i);
      if (await btn.isVisible()) {
        await btn.click({ force: true });
        opened = true;
        break;
      }
    }
    if (!opened) throw new Error("could not open publish modal");
  }
  await page.waitForTimeout(2500);

  // ===== CATEGORY → CURATION =====
  console.log(`[pub] selecting category: ${TARGET_CATEGORY}`);
  await page
    .locator('[class*="selectbox_button"]')
    .first()
    .click({ force: true });
  await page.waitForTimeout(1000);
  await page
    .locator(`li:has-text("${TARGET_CATEGORY}")`)
    .first()
    .click({ force: true });
  console.log("[pub] category clicked");
  await page.waitForTimeout(800);

  // ===== TOPIC → 문학·책 =====
  console.log(`[pub] selecting topic: ${TARGET_TOPIC}`);
  // open the 주제 panel (anchor with text "주제 선택")
  await page.locator('a:has-text("주제 선택")').first().click({ force: true });
  await page.waitForTimeout(1500);

  // click the radio for the target topic. naver's panel renders each topic as a label/li,
  // and the radio is the input next to / inside that label. Click the visible label.
  const topicLabel = page.locator(`label:has-text("${TARGET_TOPIC}")`).first();
  await topicLabel.click({ force: true });
  console.log("[pub] topic radio clicked");
  await page.waitForTimeout(500);

  // click 확인 to apply topic selection
  await page
    .locator('button:has-text("확인")')
    .first()
    .click({ force: true });
  console.log("[pub] topic 확인 clicked");
  await page.waitForTimeout(1000);

  // ===== PRIVACY → 비공개 (value=0) =====
  console.log("[pub] forcing privacy to 비공개 (value=0)…");
  // click via the surrounding label so naver's custom radio updates correctly
  await page
    .locator('label:has-text("비공개")')
    .first()
    .click({ force: true });
  await page.waitForTimeout(800);

  // verify the radio is actually checked
  const isPrivateChecked = await page.evaluate(`
    (() => {
      var r = document.querySelector('input[name="open_type"][value="0"]');
      return r ? r.checked : null;
    })();
  `);
  console.log("[pub] 비공개 checked:", isPrivateChecked);
  if (!isPrivateChecked) {
    console.error(
      "[pub] FAILED to verify 비공개 selection — aborting before publish for safety",
    );
    await page.screenshot({
      path: resolve(process.cwd(), ".naver-debug-publish-pre.png"),
      fullPage: false,
    });
    await browser.close();
    process.exit(4);
  }

  // screenshot showing pre-publish state
  await page.screenshot({
    path: resolve(process.cwd(), ".naver-debug-publish-pre.png"),
    fullPage: false,
  });
  console.log("[pub] pre-publish screenshot saved");

  // ===== FINAL PUBLISH (only when explicitly enabled) =====
  if (DO_PUBLISH) {
    console.log("[pub] >>> CLICKING FINAL 발행 BUTTON (private) <<<");
    await page
      .locator('[class*="confirm_btn"], button:has-text("발행").confirm_btn__WEaBq')
      .first()
      .click({ force: true });
    console.log("[pub] waiting up to 30s for RabbitWrite response + redirect…");
    await page
      .waitForURL(/PostView|PostList/, { timeout: 30_000 })
      .catch(() => {});
    await page.waitForTimeout(3_000);
    console.log("[pub] final url:", page.url());
    await page.screenshot({
      path: resolve(process.cwd(), ".naver-debug-publish-post.png"),
      fullPage: false,
    });
  } else {
    console.log(
      "[pub] DRY-RUN — not clicking final 발행. Inspect the modal then close.",
    );
  }

  writeFileSync(
    resolve(process.cwd(), ".naver-debug-publish-test.json"),
    JSON.stringify(
      {
        mode: DO_PUBLISH ? "REAL" : "DRY",
        targetCategory: TARGET_CATEGORY,
        targetTopic: TARGET_TOPIC,
        isPrivateChecked,
        publishResponse,
        finalUrl: DO_PUBLISH ? page.url() : null,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(
    "[pub] leaving 30s for visual confirmation. Browser will close automatically.",
  );
  await page.waitForTimeout(30_000);
  await browser.close();
}

main().catch((e) => {
  console.error("[pub] failed:", e);
  process.exit(1);
});
