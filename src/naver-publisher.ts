import { chromium, type Page } from "playwright";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { NaverCategory } from "./blog-format/naver-category-mapper.js";
import type { NaverTopic } from "./blog-format/naver-topic-mapper.js";

const STATE_PATH = resolve(process.cwd(), ".naver-browser-state.json");
const POST_WRITE_URL =
  "https://blog.naver.com/PostWriteForm.naver?blogId=antiegg&Redirect=Write&redirect=Write&widgetTypeCall=true&directAccess=false";

export interface NaverPublishOptions {
  title: string;
  bodyHtml: string; // SE3-compatible HTML produced by naver-formatter.ts
  category: NaverCategory;
  topic: NaverTopic;
  privacy: "public" | "private";
  tags?: string[];
  headless?: boolean;
}

export interface NaverPublishResult {
  success: boolean;
  logNo?: string;
  url?: string;
  error?: string;
  publishedAligns?: Array<{ ctype: string; align: string }>;
}

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

const PRIVATE_CHECK = `
  (() => {
    var r = document.querySelector('input[name="open_type"][value="0"]');
    return r ? r.checked : null;
  })();
`;

async function dismissPopups(page: Page): Promise<void> {
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
}

// SE3 paste handler ignores its own align CSS classes. Inject inline
// `style="text-align:X"` so the upconvert pipeline picks it up.
function ensureInlineAlign(html: string): string {
  return html.replace(
    /<p\b[^>]*?class="[^"]*\bse-text-paragraph-align-(left|right|center|justify)\b[^"]*"[^>]*>/g,
    (match, align) => {
      if (/style="[^"]*text-align/i.test(match)) return match;
      if (/style="[^"]*"/.test(match)) {
        return match.replace(
          /style="([^"]*)"/,
          (_m, s) => `style="${s}; text-align:${align}"`,
        );
      }
      return match.replace(/<p\b/, `<p style="text-align:${align}"`);
    },
  );
}

async function fillTitleAndBodyHtml(
  page: Page,
  title: string,
  bodyHtml: string,
): Promise<boolean> {
  const probe: any = await page.evaluate(SE_PROBE);
  if (!probe.hasTitle || !probe.hasBody) return false;

  // title via insertText (IME-safe)
  await page.locator('[data-poc-target="title"]').click({ force: true });
  await page.waitForTimeout(300);
  await page.keyboard.insertText(title);
  await page.waitForTimeout(600);

  // body via HTML clipboard paste so SE3 routes it through upconvert.editor.naver.com
  const normalized = ensureInlineAlign(bodyHtml);
  await page.evaluate(async (html) => {
    const blob = new Blob([html], { type: "text/html" });
    const plainBlob = new Blob([html.replace(/<[^>]+>/g, "")], {
      type: "text/plain",
    });
    const item = new ClipboardItem({
      "text/html": blob,
      "text/plain": plainBlob,
    });
    await navigator.clipboard.write([item]);
  }, normalized);

  await page.locator('[data-poc-target="body"]').click({ force: true });
  await page.waitForTimeout(400);
  await page.keyboard.press("Control+V");
  await page.waitForTimeout(2500);
  return true;
}

async function openPublishModal(page: Page): Promise<void> {
  const candidates = page.locator('button:has-text("발행")');
  const count = await candidates.count();
  for (let i = 0; i < count; i++) {
    const btn = candidates.nth(i);
    if (await btn.isVisible()) {
      await btn.click({ force: true });
      await page.waitForTimeout(2500);
      return;
    }
  }
  throw new Error("could not open publish modal");
}

async function selectCategory(
  page: Page,
  category: NaverCategory,
): Promise<void> {
  await page
    .locator('[class*="selectbox_button"]')
    .first()
    .click({ force: true });
  await page.waitForTimeout(1000);
  await page.locator(`li:has-text("${category}")`).first().click({ force: true });
  await page.waitForTimeout(800);
}

async function selectTopic(
  page: Page,
  topic: Exclude<NaverTopic, null>,
): Promise<void> {
  await page.locator('a:has-text("주제 선택")').first().click({ force: true });
  await page.waitForTimeout(1500);
  await page.locator(`label:has-text("${topic}")`).first().click({ force: true });
  await page.waitForTimeout(500);
  await page.locator('button:has-text("확인")').first().click({ force: true });
  await page.waitForTimeout(1000);
}

async function selectPrivacy(
  page: Page,
  privacy: "public" | "private",
): Promise<void> {
  if (privacy === "private") {
    await page
      .locator('label:has-text("비공개")')
      .first()
      .click({ force: true });
    await page.waitForTimeout(800);
    const ok = await page.evaluate(PRIVATE_CHECK);
    if (!ok) throw new Error("could not verify 비공개 selection");
  } else {
    // 전체공개 — already default, but click to be explicit
    await page
      .locator('label:has-text("전체공개")')
      .first()
      .click({ force: true });
    await page.waitForTimeout(500);
  }
}

async function fillTags(page: Page, tags: string[]): Promise<void> {
  if (tags.length === 0) return;
  const input = page.locator('input[placeholder*="태그 입력"]').first();
  await input.click({ force: true });
  for (const tag of tags.slice(0, 30)) {
    await page.keyboard.insertText(tag);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
  }
}

export async function publishToNaver(
  options: NaverPublishOptions,
): Promise<NaverPublishResult> {
  if (!existsSync(STATE_PATH)) {
    return { success: false, error: `missing ${STATE_PATH} — run naver:bootstrap` };
  }

  const browser = await chromium.launch({ headless: options.headless ?? false });
  try {
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

    let publishRedirectUrl: string | null = null;
    let publishRequestPayload: string | null = null;
    page.on("request", (req) => {
      if (
        /RabbitWrite\.naver/.test(req.url()) &&
        !/AutoSave/.test(req.url())
      ) {
        publishRequestPayload = req.postData() || null;
      }
    });
    page.on("response", async (res) => {
      if (/RabbitWrite\.naver/.test(res.url()) && !/AutoSave/.test(res.url())) {
        try {
          const body = await res.text();
          const m = body.match(/"redirectUrl"\s*:\s*"([^"]+)"/);
          if (m) publishRedirectUrl = m[1];
        } catch {}
      }
    });

    await page.goto(POST_WRITE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(15_000);
    await dismissPopups(page);

    const filled = await fillTitleAndBodyHtml(
      page,
      options.title,
      options.bodyHtml,
    );
    if (!filled) {
      return { success: false, error: "could not locate SE3 editor host elements" };
    }

    await openPublishModal(page);
    await selectCategory(page, options.category);

    if (options.topic) await selectTopic(page, options.topic);
    await selectPrivacy(page, options.privacy);
    if (options.tags?.length) await fillTags(page, options.tags);

    await page
      .locator('[class*="confirm_btn"]')
      .first()
      .click({ force: true });

    await page
      .waitForURL(/PostView|PostList/, { timeout: 30_000 })
      .catch(() => {});
    await page.waitForTimeout(2000);

    const finalUrl = publishRedirectUrl || page.url();
    const logNoMatch = finalUrl.match(/logNo=(\d+)/);

    // extract aligns from the actual publish payload for debugging
    const publishedAligns: Array<{ ctype: string; align: string }> = [];
    if (publishRequestPayload) {
      try {
        const params = new URLSearchParams(publishRequestPayload);
        const dmStr = params.get("documentModel");
        if (dmStr) {
          const dm = JSON.parse(dmStr);
          const collect = (n: any) => {
            if (!n || typeof n !== "object") return;
            if (Array.isArray(n)) {
              n.forEach(collect);
              return;
            }
            if (n.style && typeof n.style.align === "string") {
              publishedAligns.push({
                ctype: n["@ctype"],
                align: n.style.align,
              });
            }
            for (const k of Object.keys(n)) {
              if (k !== "id") collect(n[k]);
            }
          };
          collect(dm);
        }
      } catch {}
    }

    return {
      success: !!logNoMatch,
      logNo: logNoMatch?.[1],
      url: finalUrl,
      publishedAligns,
    };
  } catch (e) {
    return { success: false, error: String(e) };
  } finally {
    await browser.close();
  }
}
