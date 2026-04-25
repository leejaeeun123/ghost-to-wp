import { chromium } from "playwright";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const STATE_PATH = resolve(process.cwd(), ".naver-browser-state.json");
const POST_WRITE_URL =
  "https://blog.naver.com/PostWriteForm.naver?blogId=antiegg&Redirect=Write&redirect=Write&widgetTypeCall=true&directAccess=false";

const TEST_TITLE_KR = "[PoC] 발행 모달 검증";
const TEST_BODY_KR = "발행 모달 진입 테스트. 실제 발행은 하지 않습니다.";

const SE_PROBE = `
  (() => {
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
    return { hasTitle: !!titleHost, hasBody: !!bodyHost };
  })();
`;

const MODAL_PROBE = `
  (() => {
    var pick = function (el) {
      if (!el) return null;
      var rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      return {
        tag: el.tagName,
        type: el.type || null,
        name: el.name || null,
        id: el.id || null,
        className: (el.className || '').toString().slice(0, 120),
        ariaLabel: el.getAttribute('aria-label'),
        role: el.getAttribute('role'),
        text: (el.textContent || '').slice(0, 60),
        checked: el.checked,
        value: typeof el.value === 'string' ? el.value.slice(0, 60) : el.value,
        placeholder: el.getAttribute('placeholder'),
      };
    };
    var picks = function (selector) {
      var els = document.querySelectorAll(selector);
      var out = [];
      for (var i = 0; i < els.length && out.length < 30; i++) {
        var info = pick(els[i]);
        if (info) out.push(info);
      }
      return out;
    };

    return {
      buttonsAll: picks('button'),
      inputs: picks('input'),
      selects: picks('select'),
      labels: picks('label'),
      // common naver layer patterns
      layers: picks('[class*="layer_"], [class*="Layer_"], [class*="popup_"], [role="dialog"]'),
      // anything that looks like a publish-options panel
      publishPanels: picks('[class*="publish"], [class*="post_op"], [class*="release"]'),
    };
  })();
`;

async function main() {
  if (!existsSync(STATE_PATH)) {
    console.error("[modal] no storage state at " + STATE_PATH);
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

  const captured: Array<{ url: string; method: string; status?: number }> = [];
  page.on("request", (req) => {
    const url = req.url();
    if (
      /(RabbitWrite|RabbitAutoSaveWrite|tokens|SuicideWord|upconvert|categoryList|directoryList|tag)/.test(
        url,
      )
    ) {
      captured.push({ url, method: req.method() });
    }
  });
  page.on("response", async (res) => {
    const url = res.url();
    if (/(RabbitWrite|tokens)/.test(url)) {
      const found = [...captured].reverse().find((c) => c.url === url && !c.status);
      if (found) found.status = res.status();
    }
  });

  console.log("[modal] opening editor…");
  await page.goto(POST_WRITE_URL, { waitUntil: "domcontentloaded" });
  console.log("[modal] waiting 15s…");
  await page.waitForTimeout(15_000);

  // dismiss popups
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
  console.log("[modal] SE probe:", seProbe);

  // fill title via insertText
  if (seProbe.hasTitle) {
    await page.locator('[data-poc-target="title"]').click({ force: true });
    await page.waitForTimeout(400);
    await page.keyboard.insertText(TEST_TITLE_KR);
    console.log("[modal] title inserted");
  }
  await page.waitForTimeout(800);

  // paste body
  if (seProbe.hasBody) {
    await page.evaluate(
      (text) => navigator.clipboard.writeText(text),
      TEST_BODY_KR,
    );
    await page.locator('[data-poc-target="body"]').click({ force: true });
    await page.waitForTimeout(400);
    await page.keyboard.press("Control+V");
    console.log("[modal] body pasted");
  }
  await page.waitForTimeout(2000);

  // === click 발행 button (top-right, green)
  console.log("[modal] looking for top-level 발행 button…");
  let modalOpened = false;
  try {
    // Naver header has a button containing the literal text "발행"
    const candidates = page.locator(
      'button:has-text("발행"), [role="button"]:has-text("발행")',
    );
    const count = await candidates.count();
    console.log("[modal] 발행-text button count:", count);
    if (count > 0) {
      // pick the first visible one
      for (let i = 0; i < count; i++) {
        const btn = candidates.nth(i);
        if (await btn.isVisible()) {
          console.log("[modal] clicking 발행 button #" + i);
          await btn.click({ force: true });
          modalOpened = true;
          break;
        }
      }
    }
  } catch (e) {
    console.log("[modal] 발행 click failed:", String(e).slice(0, 200));
  }

  if (modalOpened) {
    console.log("[modal] waiting 3s for modal to render…");
    await page.waitForTimeout(3000);
    await page.screenshot({
      path: resolve(process.cwd(), ".naver-debug-publish-modal.png"),
      fullPage: false,
    });
    console.log("[modal] modal screenshot saved");
  } else {
    await page.screenshot({
      path: resolve(process.cwd(), ".naver-debug-publish-modal.png"),
      fullPage: false,
    });
  }

  // probe whatever is on screen now
  console.log("[modal] probing modal/page elements…");
  const modalProbe: any = await page.evaluate(MODAL_PROBE);
  console.log("[modal] button count :", modalProbe.buttonsAll.length);
  console.log("[modal] input count  :", modalProbe.inputs.length);
  console.log("[modal] label count  :", modalProbe.labels.length);
  console.log("[modal] layer count  :", modalProbe.layers.length);
  console.log(
    "[modal] publish-panel count:",
    modalProbe.publishPanels.length,
  );

  // print interesting buttons/labels (publish-related text)
  const interestingText =
    /(공개|비공개|이웃|발행|예약|카테고리|태그|댓글|공감|검색|확인|취소)/;
  console.log("[modal] interesting buttons:");
  for (const b of modalProbe.buttonsAll) {
    if (interestingText.test(b.text || "") || interestingText.test(b.ariaLabel || "")) {
      console.log("    ", b.text || b.ariaLabel, "::", b.className);
    }
  }
  console.log("[modal] interesting labels/inputs:");
  for (const lbl of modalProbe.labels) {
    if (interestingText.test(lbl.text || "")) {
      console.log("    label:", lbl.text);
    }
  }
  for (const inp of modalProbe.inputs) {
    if (
      interestingText.test(inp.placeholder || "") ||
      interestingText.test(inp.ariaLabel || "") ||
      inp.type === "radio" ||
      inp.type === "checkbox"
    ) {
      console.log(
        "    input:",
        inp.type,
        inp.name,
        inp.value,
        inp.checked ? "(checked)" : "",
        inp.placeholder || inp.ariaLabel || "",
      );
    }
  }

  writeFileSync(
    resolve(process.cwd(), ".naver-debug-publish-modal.json"),
    JSON.stringify({ seProbe, modalOpened, captured, modalProbe }, null, 2),
    "utf8",
  );
  console.log("[modal] full dump → .naver-debug-publish-modal.json");

  console.log(
    "[modal] leaving browser open 30s — DO NOT click final 발행 button. Observe the modal and note where 비공개/카테고리/태그 etc. live.",
  );
  await page.waitForTimeout(30_000);
  await browser.close();
}

main().catch((e) => {
  console.error("[modal] failed:", e);
  process.exit(1);
});
