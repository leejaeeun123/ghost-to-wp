import { chromium, type Page } from "playwright";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { NaverCategory } from "./blog-format/naver-category-mapper.js";
import type { NaverTopic } from "./blog-format/naver-topic-mapper.js";

const STATE_PATH = resolve(process.cwd(), ".naver-browser-state.json");
const POST_WRITE_URL =
  "https://blog.naver.com/PostWriteForm.naver?blogId=antiegg&Redirect=Write&redirect=Write&widgetTypeCall=true&directAccess=false";

// One-line stand-in to satisfy SE3 autosave validation; the real body is
// injected via the RabbitWrite swap interceptor below.
const DUMMY_BODY = "본문 자리표시자 — 인터셉터가 정렬 보존된 트리로 교체합니다.";

export interface NaverPublishOptions {
  title: string;
  bodyHtml: string;
  category: NaverCategory;
  topic: NaverTopic;
  privacy: "public" | "private";
  tags?: string[];
  /**
   * formatForNaver가 emit한 divider 종류 시퀀스 (등장 순서). swap 후처리가
   * ourComponents 안의 horizontalLine에 layout/align을 매칭 set한다.
   *  - "short" → layout:"default", align:"center"
   *  - "long"  → layout:"line1",   align:"justify"
   */
  dividerLayouts?: ("short" | "long")[];
  /**
   * 본문 안에 단독 paragraph로 등장하는 URL 시퀀스. OG API로 메타 받아 oglink
   * 컴포넌트로 변환한 후 ourComponents의 동일 URL paragraph 자리에 삽입.
   */
  oglinkUrls?: string[];
  /**
   * oglinkUrls 중 oglink 컴포넌트의 thumbnail 필드를 제거할 URL 목록.
   * (썸네일 없이 텍스트 카드로만 보여주고 싶은 URL)
   */
  noThumbnailUrls?: string[];
  headless?: boolean;
}

export interface NaverPublishResult {
  success: boolean;
  logNo?: string;
  url?: string;
  error?: string;
  swapDetail?: {
    originalCount: number;
    swappedCount: number;
    ourComponentsCount: number;
  };
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

const RESOLVE_USER_ID = `
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
      return { ok: res.ok, status: res.status, components: parsed, body: text.slice(0, 400) };
    } catch (e) {
      return { error: String(e) };
    }
  })
`;

const DISMISS_POPUPS = `
  (() => {
    var bs = document.querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) {
      var t = (bs[i].textContent || '').trim();
      if (/^(취소|닫기|×|아니오|아니요)$/.test(t) && bs[i].offsetParent !== null) {
        try { bs[i].click(); } catch (_) {}
      }
    }
  })();
`;

async function fillTitle(page: Page, title: string): Promise<void> {
  await page.locator('[data-poc-target="title"]').click({ force: true });
  await page.waitForTimeout(300);
  await page.keyboard.insertText(title);
  await page.waitForTimeout(800);
}

async function pasteDummyBody(page: Page): Promise<void> {
  await page.evaluate((text) => navigator.clipboard.writeText(text), DUMMY_BODY);
  await page.locator('[data-poc-target="body"]').click({ force: true });
  await page.waitForTimeout(300);
  await page.keyboard.press("Control+V");
  await page.waitForTimeout(1500);
}

async function upconvertBody(
  page: Page,
  html: string,
  userId: string,
): Promise<any[] | null> {
  const result: any = await page.evaluate(
    `${UPCONVERT_FN}(${JSON.stringify(html)}, ${JSON.stringify(userId)})`,
  );
  if (!result?.components || !Array.isArray(result.components)) return null;
  return result.components;
}

interface SwapHandle {
  getDetail: () => NaverPublishResult["swapDetail"];
}

async function installSwapInterceptor(
  page: Page,
  ourComponents: any[],
): Promise<SwapHandle> {
  let detail: NaverPublishResult["swapDetail"];

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
      const original = dm.document.components as any[];
      const titleComp = original[0];

      // Force documentTitle to left-align — paste flow always centers.
      if (titleComp && titleComp["@ctype"] === "documentTitle") {
        titleComp.align = "left";
        if (Array.isArray(titleComp.title)) {
          for (const para of titleComp.title) {
            if (para?.style) para.style.align = "left";
          }
        }
      }

      const swapped = [titleComp, ...ourComponents];
      dm.document.components = swapped;
      params.set("documentModel", JSON.stringify(dm));

      detail = {
        originalCount: original.length,
        swappedCount: swapped.length,
        ourComponentsCount: ourComponents.length,
      };

      // diagnostic dump — Phase 3에서 divider/oglink/documentTitle 형식 진단용
      try {
        writeFileSync(
          resolve(process.cwd(), ".naver-debug-final-swap.json"),
          JSON.stringify(
            { originalDocumentModel: JSON.parse(dmStr), swappedDocumentModel: dm },
            null,
            2,
          ),
          "utf8",
        );
      } catch {}

      route.continue({ postData: params.toString() });
    } catch (e) {
      console.error("[naver-publisher] swap error:", e);
      route.continue();
    }
  });

  return { getDetail: () => detail };
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

async function selectCategory(page: Page, category: NaverCategory): Promise<void> {
  await page.locator('[class*="selectbox_button"]').first().click({ force: true });
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
  const label = privacy === "private" ? "비공개" : "전체공개";
  await page.locator(`label:has-text("${label}")`).first().click({ force: true });
  await page.waitForTimeout(800);
  if (privacy === "private") {
    const ok = await page.evaluate(PRIVATE_CHECK);
    if (!ok) throw new Error("could not verify 비공개 selection");
  }
}

// Naver tag input rejects most special characters (#, -, _, ., etc.). The
// first rejection silently breaks all subsequent tag entries. Strip everything
// that isn't 한글/영문/숫자/공백 before submission.
function sanitizeNaverTag(tag: string): string {
  return tag.replace(/[^가-힣a-zA-Z0-9 ]/g, "").trim();
}

// SE3 OG card metadata via the platform.editor.naver.com endpoint.
// 401 "the token must not be empty" 우회: paste 흐름에서 자동 첨부되는 SE3 인증
// 헤더(se-authorization JWT + se-app-id)를 SmartEditor 인스턴스에서 추출 후 부착.
const FETCH_OG_FN = `
  (async (url) => {
    var headers = { Accept: "application/json" };

    function findInObject(obj, predicate, depth) {
      if (depth > 6 || !obj) return null;
      var keys;
      try { keys = Object.keys(obj); } catch (_) { return null; }
      for (var i = 0; i < keys.length; i++) {
        var v;
        try { v = obj[keys[i]]; } catch (_) { continue; }
        if (typeof v === "string" && predicate(v)) return v;
      }
      for (var j = 0; j < keys.length; j++) {
        var w;
        try { w = obj[keys[j]]; } catch (_) { continue; }
        if (w && typeof w === "object") {
          var r = findInObject(w, predicate, depth + 1);
          if (r) return r;
        }
      }
      return null;
    }

    var ed = window.SmartEditor && window.SmartEditor._editors;
    if (ed) {
      var firstKey = Object.keys(ed)[0];
      var inst = firstKey ? ed[firstKey] : null;
      if (inst) {
        var jwt = findInObject(inst, function (s) { return /^eyJ[A-Za-z0-9_-]+\\.eyJ/.test(s); }, 0);
        if (jwt) headers["se-authorization"] = jwt;
        var appId = findInObject(inst, function (s) { return /^SE-[A-Fa-f0-9-]{30,}/.test(s); }, 0);
        if (appId) headers["se-app-id"] = appId;
      }
    }

    var endpoint = "https://platform.editor.naver.com/api/blogpc001/v1/oglink?url=" + encodeURIComponent(url);
    try {
      var res = await fetch(endpoint, { credentials: "include", headers: headers });
      var text = await res.text();
      var parsed = null;
      try { parsed = JSON.parse(text); } catch (_) {}
      return {
        ok: res.ok,
        status: res.status,
        oglink: parsed && parsed.oglink,
        parsed: parsed,
        body: text.slice(0, 1500),
        usedHeaders: { hasAuth: !!headers["se-authorization"], hasAppId: !!headers["se-app-id"] },
      };
    } catch (e) {
      return { error: String(e) };
    }
  })
`;

async function fetchOglinkMeta(
  page: Page,
  url: string,
): Promise<{ meta: any | null; sign: string | null; raw: any }> {
  const result: any = await page.evaluate(
    `${FETCH_OG_FN}(${JSON.stringify(url)})`,
  );
  if (!result?.ok || !result.oglink?.summary) {
    return { meta: null, sign: null, raw: result };
  }
  // oglinkSign은 응답 최상위(parsed.oglinkSign)에 있음 — oglink 객체가 아니라
  // parsed에서 직접 추출. 백엔드 검증 시 oglinkSign 필수.
  const sign = result.parsed?.oglinkSign ?? null;
  return { meta: result.oglink, sign, raw: result };
}

function buildOglinkComponent(meta: any, sign: string | null): any {
  const summary = meta.summary;
  const oglink: any = {
    "@ctype": "oglink",
    id: `SE-${randomUUID()}`,
    layout: "large_image",
    align: "center",
    title: summary.title || "",
    domain: summary.domain || "",
    link: summary.url || "",
    description: summary.description || "",
    video: false,
  };
  if (summary.image?.url) {
    oglink.thumbnail = {
      "@ctype": "thumbnail",
      src: summary.image.url,
      width: summary.image.width,
      height: summary.image.height,
    };
  }
  if (sign) oglink.oglinkSign = sign;
  return oglink;
}

// In ourComponents, find text components whose value contains a paragraph that
// is exactly one of the OG-card URLs. Split that text component at the URL
// paragraph and insert the corresponding oglink component in its place.
function spliceOglinks(
  components: any[],
  urlToOglink: Map<string, any>,
): any[] {
  const out: any[] = [];
  for (const c of components) {
    if (c["@ctype"] !== "text" || !Array.isArray(c.value)) {
      out.push(c);
      continue;
    }
    let buffer: any[] = [];
    const flushBuffer = () => {
      if (buffer.length > 0) {
        out.push({ ...c, id: `SE-${randomUUID()}`, value: buffer });
        buffer = [];
      }
    };
    for (const para of c.value) {
      const text = (para?.nodes || [])
        .map((n: any) => n?.value || "")
        .join("");
      const trimmed = text.trim();
      const oglink = urlToOglink.get(trimmed);
      if (oglink) {
        flushBuffer();
        out.push(oglink);
      } else {
        buffer.push(para);
      }
    }
    flushBuffer();
  }
  return out;
}

async function fillTags(page: Page, tags: string[]): Promise<void> {
  const cleaned = Array.from(
    new Set(
      tags
        .map(sanitizeNaverTag)
        .filter((t) => t.length > 0),
    ),
  );
  if (cleaned.length === 0) return;
  const input = page.locator('input[placeholder*="태그"]').first();
  await input.click({ force: true });
  await page.waitForTimeout(400);
  for (const tag of cleaned.slice(0, 30)) {
    await page.keyboard.insertText(tag);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(800);
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

    await page.goto(POST_WRITE_URL, { waitUntil: "domcontentloaded" });
    const titleAppeared = await page
      .waitForSelector(".se-section-documentTitle", { timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    if (!titleAppeared) {
      return { success: false, error: "editor DOM never appeared (session expired?)" };
    }

    await page.evaluate(DISMISS_POPUPS);
    await page.waitForTimeout(2000);

    const probe: any = await page.evaluate(SE_PROBE);
    if (!probe.hasTitle || !probe.hasBody) {
      return { success: false, error: "no title/body host found" };
    }

    await fillTitle(page, options.title);
    await pasteDummyBody(page);

    const userId: string | null = await page.evaluate(RESOLVE_USER_ID);
    if (!userId) {
      return { success: false, error: "could not resolve userId from authService" };
    }

    const ourComponents = await upconvertBody(page, options.bodyHtml, userId);
    if (!ourComponents) {
      return { success: false, error: "upconvert API failed" };
    }

    // Post-process ourComponents:
    //  1. horizontalLine → dividerLayouts 매핑으로 layout/align 강제
    //     "short" → layout:"default", align:"center"
    //     "long"  → layout:"line1",   align:"justify"
    //  2. 본문 text 컴포넌트의 paragraph align 누락 → "left"
    //     (서체는 SE3 default로 충분하므로 강제하지 않음)
    const dividerSpec: Record<"short" | "long", { layout: string; align: string }> = {
      short: { layout: "default", align: "center" },
      long: { layout: "line1", align: "justify" },
    };
    let didx = 0;
    for (const c of ourComponents) {
      if (c["@ctype"] === "text") {
        for (const p of c.value || []) {
          const a = p?.style?.align;
          if (!a || a === "" || a === "justify") {
            if (!p.style) p.style = { "@ctype": "paragraphStyle" };
            p.style.align = "left";
          }
        }
      } else if (c["@ctype"] === "horizontalLine") {
        const kind = options.dividerLayouts?.[didx];
        if (kind && dividerSpec[kind]) {
          c.layout = dividerSpec[kind].layout;
          c.align = dividerSpec[kind].align;
        }
        didx++;
      }
    }

    // OG card replacement: fetch oglink metadata for each tracked URL and
    // splice an oglink component into ourComponents wherever that URL appears
    // as a standalone paragraph.
    let finalComponents: any[] = ourComponents;
    const oglinkFetchLog: Array<{ url: string; raw: any; matched: boolean }> = [];
    if (options.oglinkUrls?.length) {
      const urlToOglink = new Map<string, any>();
      const noThumbSet = new Set(options.noThumbnailUrls ?? []);
      for (const url of options.oglinkUrls) {
        const { meta, sign, raw } = await fetchOglinkMeta(page, url);
        oglinkFetchLog.push({ url, raw, matched: !!meta });
        if (meta) {
          const comp = buildOglinkComponent(meta, sign);
          if (noThumbSet.has(url)) delete comp.thumbnail;
          urlToOglink.set(url, comp);
        }
      }
      if (urlToOglink.size > 0) {
        finalComponents = spliceOglinks(ourComponents, urlToOglink);
      }
      // 진단용 dump — 응답 구조 / 매칭 실패 원인 추적
      try {
        writeFileSync(
          resolve(process.cwd(), ".naver-debug-oglink-fetch.json"),
          JSON.stringify(
            {
              oglinkUrls: options.oglinkUrls,
              fetchedCount: oglinkFetchLog.length,
              matchedCount: urlToOglink.size,
              log: oglinkFetchLog,
            },
            null,
            2,
          ),
          "utf8",
        );
      } catch {}
    }

    const swap = await installSwapInterceptor(page, finalComponents);

    await openPublishModal(page);
    await selectCategory(page, options.category);
    if (options.topic) await selectTopic(page, options.topic);
    await selectPrivacy(page, options.privacy);
    if (options.tags?.length) await fillTags(page, options.tags);

    await page
      .locator('[class*="confirm_btn"]')
      .first()
      .click({ force: true });

    await page.waitForURL(/PostView|PostList/, { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const finalUrl = page.url();
    const logNoMatch = finalUrl.match(/logNo=(\d+)/);

    return {
      success: !!logNoMatch,
      logNo: logNoMatch?.[1],
      url: finalUrl,
      swapDetail: swap.getDetail(),
    };
  } catch (e) {
    return { success: false, error: String(e) };
  } finally {
    await browser.close();
  }
}
