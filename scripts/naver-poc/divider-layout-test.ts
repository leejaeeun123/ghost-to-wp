import { chromium, type Page } from "playwright";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

const STATE_PATH = resolve(process.cwd(), ".naver-browser-state.json");
const POST_WRITE_URL =
  "https://blog.naver.com/PostWriteForm.naver?blogId=antiegg&Redirect=Write&redirect=Write&widgetTypeCall=true&directAccess=false";

const seId = (): string => `SE-${randomUUID()}`;

const labelComp = (text: string) => ({
  "@ctype": "text",
  id: seId(),
  layout: "default",
  value: [
    {
      "@ctype": "paragraph",
      id: seId(),
      nodes: [{ "@ctype": "textNode", id: seId(), value: text }],
      style: { "@ctype": "paragraphStyle", align: "center" },
    },
  ],
});

const dividerComp = (n: number) => ({
  "@ctype": "horizontalLine",
  id: seId(),
  layout: `line${n}`,
});

const ourComponents: any[] = [];
for (let n = 1; n <= 9; n++) {
  ourComponents.push(labelComp(`↓ layout = line${n} ↓`));
  ourComponents.push(dividerComp(n));
  ourComponents.push(labelComp(`↑ layout = line${n} ↑`));
}

async function main(): Promise<void> {
  if (!existsSync(STATE_PATH)) {
    console.error("[div-test] no state");
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

  console.log("[div-test] opening editor…");
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
  await page.waitForTimeout(300);
  await page.keyboard.insertText("[divider layout 진단 — 즉시 삭제]");
  await page.waitForTimeout(800);

  await page.evaluate(
    (text) => navigator.clipboard.writeText(text),
    "dummy body — swap에서 5종 divider로 교체",
  );
  await page.locator('[data-poc-target="body"]').click({ force: true });
  await page.waitForTimeout(300);
  await page.keyboard.press("Control+V");
  await page.waitForTimeout(1500);

  await page.route("**/RabbitWrite.naver*", async (route) => {
    const url = route.request().url();
    if (/AutoSave/.test(url)) return route.continue();
    const post = route.request().postData();
    if (!post) return route.continue();
    try {
      const params = new URLSearchParams(post);
      const dmStr = params.get("documentModel");
      if (!dmStr) return route.continue();
      const dm = JSON.parse(dmStr);
      const titleComp = dm.document.components[0];
      if (titleComp && titleComp["@ctype"] === "documentTitle") {
        titleComp.align = "left";
        for (const para of titleComp.title || []) {
          if (para?.style) para.style.align = "left";
        }
      }
      dm.document.components = [titleComp, ...ourComponents];
      params.set("documentModel", JSON.stringify(dm));
      console.log("[div-test] swap fired with 5 horizontalLine layouts");
      route.continue({ postData: params.toString() });
    } catch (e) {
      console.error("[div-test] swap error:", e);
      route.continue();
    }
  });

  console.log("[div-test] opening 발행 modal…");
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
  await page
    .locator('[class*="selectbox_button"]')
    .first()
    .click({ force: true });
  await page.waitForTimeout(1000);
  await page.locator(`li:has-text("CURATION")`).first().click({ force: true });
  await page.waitForTimeout(800);
  await page.locator('label:has-text("비공개")').first().click({ force: true });
  await page.waitForTimeout(800);

  console.log("[div-test] >>> CLICKING FINAL 발행 (private) <<<");
  await page
    .locator('[class*="confirm_btn"]')
    .first()
    .click({ force: true });
  await page.waitForURL(/PostView|PostList/, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(3_000);
  console.log("[div-test] final url:", page.url());

  await page.waitForTimeout(15_000);
  await browser.close();
}

main().catch((e) => {
  console.error("[div-test] failed:", e);
  process.exit(1);
});
