import { chromium, type Page } from "playwright";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const STATE_PATH = resolve(process.cwd(), ".naver-browser-state.json");
const POST_WRITE_URL =
  "https://blog.naver.com/PostWriteForm.naver?blogId=antiegg&Redirect=Write&redirect=Write&widgetTypeCall=true&directAccess=false";

// One-paragraph fixtures with a unique marker so we can match them in the
// autosave documentModel without ambiguity.
const CASES: Array<{ label: string; html: string; expected: string; marker: string }> = [
  { label: "right",  html: '<p style="text-align:right">A_RIGHT 단일 우측 단락</p>',  expected: "right",  marker: "A_RIGHT" },
  { label: "center", html: '<p style="text-align:center">B_CENTER 단일 가운데 단락</p>', expected: "center", marker: "B_CENTER" },
  { label: "left",   html: '<p style="text-align:left">C_LEFT 단일 좌측 단락</p>',   expected: "left",   marker: "C_LEFT" },
];

async function pasteHtml(page: Page, html: string): Promise<void> {
  await page.evaluate(async (h) => {
    const htmlBlob = new Blob([h], { type: "text/html" });
    const plainBlob = new Blob([h.replace(/<[^>]+>/g, "")], { type: "text/plain" });
    await navigator.clipboard.write([
      new ClipboardItem({ "text/html": htmlBlob, "text/plain": plainBlob }),
    ]);
  }, html);
  await page.keyboard.press("Control+V");
  await page.waitForTimeout(1500);
}

async function main(): Promise<void> {
  if (!existsSync(STATE_PATH)) {
    console.error("[single] no storage state");
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

  let autosavePayload: string | null = null;
  page.on("request", (req) => {
    if (/RabbitAutoSaveWrite/.test(req.url())) {
      autosavePayload = req.postData() || null;
    }
  });

  console.log("[single] opening editor…");
  await page.goto(POST_WRITE_URL, { waitUntil: "domcontentloaded" });
  const titleAppeared = await page
    .waitForSelector(".se-section-documentTitle", { timeout: 60_000 })
    .then(() => true)
    .catch(() => false);
  if (!titleAppeared) {
    console.error("[single] editor DOM never appeared");
    await page.screenshot({ path: resolve(process.cwd(), ".naver-debug-single-no-dom.png") });
    await browser.close();
    process.exit(3);
  }

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
  await page.waitForTimeout(2000);

  // tag title + body for clicking
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

  // title
  await page.locator('[data-poc-target="title"]').click({ force: true });
  await page.waitForTimeout(300);
  await page.keyboard.insertText("single-paste-test");
  await page.waitForTimeout(800);

  // body focus
  await page.locator('[data-poc-target="body"]').click({ force: true });
  await page.waitForTimeout(800);

  // sequential single paragraph pastes; Enter between to force a new paragraph
  for (const c of CASES) {
    console.log(`[single] paste ${c.label} (expected align=${c.expected})`);
    await pasteHtml(page, c.html);
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
  }

  // trigger autosave by typing one extra char and blurring to title
  await page.waitForTimeout(2000);
  await page.keyboard.type(" ", { delay: 50 });
  await page.waitForTimeout(8_000);
  await page.locator('[data-poc-target="title"]').click({ force: true });
  await page.waitForTimeout(5_000);

  await page.screenshot({ path: resolve(process.cwd(), ".naver-debug-single-paste.png") });

  // parse autosave model
  let documentModel: any = null;
  const aligns: Array<{ ctype: string; align: string; text: string | null }> = [];
  if (autosavePayload) {
    const params = new URLSearchParams(autosavePayload);
    const dmStr = params.get("documentModel");
    if (dmStr) {
      try {
        documentModel = JSON.parse(dmStr);
        const collect = (n: any): void => {
          if (!n || typeof n !== "object") return;
          if (Array.isArray(n)) { n.forEach(collect); return; }
          if (n.style && typeof n.style.align === "string") {
            const text = n.nodes?.[0]?.value ?? null;
            aligns.push({ ctype: n["@ctype"], align: n.style.align, text });
          }
          for (const k of Object.keys(n)) if (k !== "id") collect(n[k]);
        };
        collect(documentModel);
      } catch {}
    }
  }
  console.log("[single] aligns:", JSON.stringify(aligns, null, 2));

  console.log("\n[single] verdict per case:");
  let allPass = true;
  for (const c of CASES) {
    const found = aligns.find(a => a.text?.includes(c.marker));
    const pass = found?.align === c.expected;
    if (!pass) allPass = false;
    console.log(`  ${c.label}: expected=${c.expected}, actual=${found?.align ?? "MISSING"}  ${pass ? "OK" : "FAIL"}`);
  }
  console.log(`\n[single] OVERALL: ${allPass ? "PASS — single-paragraph paste preserves alignment" : "FAIL — alignment lost"}`);

  writeFileSync(
    resolve(process.cwd(), ".naver-debug-single-paste.json"),
    JSON.stringify({ aligns, documentModel, autosavePayload }, null, 2),
    "utf8",
  );
  console.log("[single] dump → .naver-debug-single-paste.json");

  await page.waitForTimeout(15_000);
  await browser.close();
}

main().catch((e) => {
  console.error("[single] failed:", e);
  process.exit(1);
});
