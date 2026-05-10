import { chromium, type Page } from "playwright";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const STATE_PATH = resolve(process.cwd(), ".naver-browser-state.json");
const POST_WRITE_URL =
  "https://blog.naver.com/PostWriteForm.naver?blogId=antiegg&Redirect=Write&redirect=Write&widgetTypeCall=true&directAccess=false";

const DO_PUBLISH = process.argv.includes("--publish");

const TEST_TITLE = "[Plan A swap PoC · 발행 후 즉시 삭제 예정]";
const DUMMY_BODY =
  "Plan A swap 검증 본문 — 인터셉터에서 정렬·색상 보존된 트리로 교체됩니다. 발행 즉시 삭제 예정.";

// Realistic body that exercises every alignment we care about.
const REAL_BODY_HTML = `
<p style="text-align:right">Edited by <b><font color="#f7343c">재은</font></b></p>
<p style="text-align:left">서문 본문 단락 — 좌측 정렬, 기본 스타일.</p>
<p style="text-align:center"><b>이 아티클의 본문 내용이 궁금하신가요?</b></p>
<p style="text-align:center"><b>링크를 클릭하면 바로 읽어보실 수 있습니다.</b></p>
<p style="text-align:right">우측 마무리 단락 — 정렬 검증용.</p>
`.trim();

const TARGET_CATEGORY = "CURATION";
const TARGET_TOPIC = "문학·책";

// Sample tags mimicking the operational rule:
//   필수: ANTIEGG, antiegg, 안티에그
//   + Notion: 콘텐츠 종류, 카테고리, 테마, 키워드, 기타 (모두 multi_select)
// PoC uses placeholder values so we can verify naver accepts them.
const SAMPLE_TAGS = [
  "ANTIEGG",
  "antiegg",
  "안티에그",
  "큐레이션",
  "테마샘플",
  "키워드샘플",
  "콘텐츠샘플",
];

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

const UPCONVERT_FN = `
  (async (html, userId) => {
    var url = "https://upconvert.editor.naver.com/blog/html/components?documentWidth=693&userId=" + encodeURIComponent(userId);
    try {
      var res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "text/plain" },
        body: html
      });
      var text = await res.text();
      var parsed = null;
      try { parsed = JSON.parse(text); } catch (_) {}
      return { ok: res.ok, status: res.status, body: text.slice(0, 600), components: parsed };
    } catch (e) {
      return { error: String(e) };
    }
  })
`;

const RESOLVE_USER_ID_FN = `
  (() => {
    var ed = window.SmartEditor && window.SmartEditor._editors;
    if (!ed) return null;
    var keys = Object.keys(ed);
    for (var i = 0; i < keys.length; i++) {
      var inst = ed[keys[i]];
      if (inst && inst._authService && inst._authService._userId) {
        return inst._authService._userId;
      }
    }
    return null;
  })()
`;

async function main(): Promise<void> {
  if (!existsSync(STATE_PATH)) {
    console.error("[swap] no storage state");
    process.exit(2);
  }

  console.log(
    `[swap] mode: ${DO_PUBLISH ? "REAL PUBLISH (private)" : "DRY-RUN (stop before final 발행)"}`,
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

  let publishResponse: { status?: number; body?: string } | null = null;
  let publishOriginalPayload: string | null = null;
  let publishSwappedPayload: string | null = null;
  let swapDetail: any = null;

  page.on("response", async (res) => {
    if (/RabbitWrite\.naver/.test(res.url()) && !/AutoSave/.test(res.url())) {
      try {
        const body = await res.text();
        publishResponse = { status: res.status(), body };
        console.log("[swap] RabbitWrite response:", res.status(), body.slice(0, 400));
      } catch {}
    }
  });

  console.log("[swap] opening editor…");
  await page.goto(POST_WRITE_URL, { waitUntil: "domcontentloaded" });
  const titleAppeared = await page
    .waitForSelector(".se-section-documentTitle", { timeout: 60_000 })
    .then(() => true)
    .catch(() => false);
  if (!titleAppeared) {
    console.error("[swap] editor DOM never appeared");
    await browser.close();
    process.exit(3);
  }

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

  const probe: any = await page.evaluate(SE_PROBE);
  if (!probe.hasTitle || !probe.hasBody) {
    console.error("[swap] no title/body host");
    await browser.close();
    process.exit(4);
  }

  // title
  await page.locator('[data-poc-target="title"]').click({ force: true });
  await page.waitForTimeout(300);
  await page.keyboard.insertText(TEST_TITLE);
  await page.waitForTimeout(800);

  // dummy body — just enough to pass autosave validation
  await page.evaluate((text) => navigator.clipboard.writeText(text), DUMMY_BODY);
  await page.locator('[data-poc-target="body"]').click({ force: true });
  await page.waitForTimeout(300);
  await page.keyboard.press("Control+V");
  console.log("[swap] dummy body pasted");
  await page.waitForTimeout(1500);

  // upconvert real body to components (alignment-preserving)
  const userId: string | null = await page.evaluate(RESOLVE_USER_ID_FN);
  console.log("[swap] userId=", userId);
  const upconvert: any = await page.evaluate(
    `${UPCONVERT_FN}(${JSON.stringify(REAL_BODY_HTML)}, ${JSON.stringify(userId || "")})`,
  );
  console.log(
    "[swap] upconvert status:",
    upconvert.status,
    "components:",
    upconvert.components ? upconvert.components.length : "none",
  );
  if (!upconvert.components) {
    console.error("[swap] upconvert failed:", upconvert.body);
    await browser.close();
    process.exit(5);
  }
  const ourComponents = upconvert.components as any[];

  // install RabbitWrite interceptor (excluding AutoSave)
  await page.route("**/RabbitWrite.naver*", async (route) => {
    const url = route.request().url();
    if (/AutoSave/.test(url)) return route.continue();
    const post = route.request().postData();
    if (!post) return route.continue();
    publishOriginalPayload = post;

    try {
      const params = new URLSearchParams(post);
      const dmStr = params.get("documentModel");
      if (!dmStr) {
        console.warn("[swap] no documentModel in payload — passthrough");
        return route.continue();
      }
      const dm = JSON.parse(dmStr);
      const original = dm.document.components as any[];
      const titleComp = original[0];

      // Force the title (documentTitle component) to left-align. Naver paste
      // flow always produces center; we overwrite both the component-level
      // align and the inner paragraph style.
      if (titleComp && titleComp["@ctype"] === "documentTitle") {
        titleComp.align = "left";
        if (Array.isArray(titleComp.title)) {
          for (const para of titleComp.title) {
            if (para && para.style) para.style.align = "left";
          }
        }
      }

      const swapped = [titleComp, ...ourComponents];
      dm.document.components = swapped;
      params.set("documentModel", JSON.stringify(dm));
      const newBody = params.toString();
      publishSwappedPayload = newBody;
      swapDetail = {
        originalCount: original.length,
        swappedCount: swapped.length,
        ourComponentsCount: ourComponents.length,
      };
      console.log("[swap] documentModel swapped:", swapDetail);
      route.continue({ postData: newBody });
    } catch (e) {
      console.error("[swap] swap error:", e);
      route.continue();
    }
  });

  // open publish modal
  console.log("[swap] opening 발행 modal…");
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

  // category
  console.log(`[swap] selecting category ${TARGET_CATEGORY}…`);
  await page.locator('[class*="selectbox_button"]').first().click({ force: true });
  await page.waitForTimeout(1000);
  await page.locator(`li:has-text("${TARGET_CATEGORY}")`).first().click({ force: true });
  await page.waitForTimeout(800);

  // topic
  console.log(`[swap] selecting topic ${TARGET_TOPIC}…`);
  await page.locator('a:has-text("주제 선택")').first().click({ force: true });
  await page.waitForTimeout(1500);
  await page.locator(`label:has-text("${TARGET_TOPIC}")`).first().click({ force: true });
  await page.waitForTimeout(500);
  await page.locator('button:has-text("확인")').first().click({ force: true });
  await page.waitForTimeout(1000);

  // private
  await page.locator('label:has-text("비공개")').first().click({ force: true });
  await page.waitForTimeout(800);
  const isPrivateChecked = await page.evaluate(`
    (() => {
      var r = document.querySelector('input[name="open_type"][value="0"]');
      return r ? r.checked : null;
    })();
  `);
  console.log("[swap] 비공개 checked:", isPrivateChecked);
  if (!isPrivateChecked) {
    console.error("[swap] FAILED to verify 비공개 — aborting");
    await page.screenshot({ path: resolve(process.cwd(), ".naver-debug-swap-pre.png") });
    await browser.close();
    process.exit(6);
  }

  // tags
  console.log("[swap] entering tags:", SAMPLE_TAGS.join(", "));
  const tagInput = page.locator('input[placeholder*="태그"]').first();
  await tagInput.click({ force: true });
  await page.waitForTimeout(400);
  for (const tag of SAMPLE_TAGS) {
    await page.keyboard.insertText(tag);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(800);

  await page.screenshot({ path: resolve(process.cwd(), ".naver-debug-swap-pre.png") });
  console.log("[swap] pre-publish screenshot saved");

  if (DO_PUBLISH) {
    console.log("[swap] >>> CLICKING FINAL 발행 BUTTON (private + swap) <<<");
    await page
      .locator('[class*="confirm_btn"], button:has-text("발행").confirm_btn__WEaBq')
      .first()
      .click({ force: true });
    await page.waitForURL(/PostView|PostList/, { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(3_000);
    console.log("[swap] final url:", page.url());
    await page.screenshot({ path: resolve(process.cwd(), ".naver-debug-swap-post.png") });
  } else {
    console.log("[swap] DRY-RUN — not clicking final 발행. Inspect modal then close.");
  }

  writeFileSync(
    resolve(process.cwd(), ".naver-debug-swap.json"),
    JSON.stringify(
      {
        mode: DO_PUBLISH ? "REAL" : "DRY",
        userId,
        ourComponentsCount: ourComponents.length,
        ourComponentsAligns: collectAligns(ourComponents),
        swapDetail,
        isPrivateChecked,
        publishResponse,
        publishOriginalPayloadLen: publishOriginalPayload?.length ?? 0,
        publishSwappedPayloadLen: publishSwappedPayload?.length ?? 0,
        finalUrl: DO_PUBLISH ? page.url() : null,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log("[swap] dump → .naver-debug-swap.json");
  console.log("[swap] leaving 25s for visual…");
  await page.waitForTimeout(25_000);
  await browser.close();
}

function collectAligns(node: any): Array<{ ctype: string; align: string; text: string | null }> {
  const out: Array<{ ctype: string; align: string; text: string | null }> = [];
  const walk = (n: any) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (n.style && typeof n.style.align === "string") {
      out.push({
        ctype: n["@ctype"],
        align: n.style.align,
        text: n.nodes?.[0]?.value ?? null,
      });
    }
    for (const k of Object.keys(n)) if (k !== "id") walk(n[k]);
  };
  walk(node);
  return out;
}

main().catch((e) => {
  console.error("[swap] failed:", e);
  process.exit(1);
});
