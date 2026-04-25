import { chromium } from "playwright";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const STATE_PATH = resolve(process.cwd(), ".naver-browser-state.json");
const POST_WRITE_URL =
  "https://blog.naver.com/PostWriteForm.naver?blogId=antiegg&Redirect=Write&redirect=Write&widgetTypeCall=true&directAccess=false";

async function main() {
  if (!existsSync(STATE_PATH)) {
    console.error(
      `[probe] no storage state found at ${STATE_PATH}. Run bootstrap-session first.`,
    );
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: STATE_PATH,
    viewport: { width: 1280, height: 900 },
    locale: "ko-KR",
  });
  const page = await context.newPage();

  // capture every Rabbit*/ncpt/upconvert request that fires while the page boots
  const captured: Array<{
    url: string;
    method: string;
    postDataPreview?: string;
    responsePreview?: string;
    status?: number;
  }> = [];
  page.on("request", (req) => {
    const url = req.url();
    if (
      /(RabbitWrite|RabbitAutoSaveWrite|ncpt\.naver\.com|upconvert\.editor|photo-uploader|simpleUpload|tokens)/.test(
        url,
      )
    ) {
      captured.push({
        url,
        method: req.method(),
        postDataPreview: req.postData()?.slice(0, 600) ?? undefined,
      });
    }
  });
  page.on("response", async (res) => {
    const url = res.url();
    if (
      /(RabbitWrite|ncpt\.naver\.com\/v2\/tokens|photo-uploader\/session-key)/.test(
        url,
      )
    ) {
      try {
        const body = await res.text();
        const match = captured
          .reverse()
          .find((c) => c.url === url && c.responsePreview === undefined);
        captured.reverse();
        if (match) {
          match.status = res.status();
          match.responsePreview = body.slice(0, 600);
        }
      } catch {
        /* ignore */
      }
    }
  });

  console.log("[probe] opening PostWriteForm.naver…");
  await page.goto(POST_WRITE_URL, { waitUntil: "domcontentloaded" });

  // give the SE3 editor a generous bootstrap window (NCPT, autosave, etc.)
  console.log("[probe] waiting 12s for editor bootstrap…");
  await page.waitForTimeout(12_000);

  // === 1. Verify session is alive — read auth state from page context
  console.log("[probe] checking page-side auth signals…");
  const pageInfo = await page.evaluate(async () => {
    const out: Record<string, unknown> = {};
    out.location = location.href;
    out.title = document.title;
    out.cookies = document.cookie.length;
    // hunt for any pre-rendered token in the document
    const html = document.documentElement.outerHTML;
    const m = html.match(/tokenId["'\s:=]+([A-Za-z0-9+/=_-]{20,80})/);
    out.tokenIdInHtml = m ? m[1].slice(0, 60) : null;
    // look for global stores Naver editor exposes
    out.globalKeys = Object.keys(window).filter((k) =>
      /(naver|editor|smartEditor|SE_|blog)/i.test(k),
    );
    return out;
  });
  console.log("[probe] page info:", pageInfo);

  // === 2. Cheap auth check via in-page fetch
  console.log("[probe] running in-page fetch (BlogTagListInfo) to verify auth…");
  const authProbe = await page.evaluate(async () => {
    try {
      const res = await fetch(
        "https://blog.naver.com/BlogTagListInfo.naver?blogId=antiegg&logNoList=&logType=mylog",
        { credentials: "include" },
      );
      const txt = await res.text();
      return { ok: res.ok, status: res.status, bodyLen: txt.length, sample: txt.slice(0, 200) };
    } catch (e) {
      return { error: String(e) };
    }
  });
  console.log("[probe] auth probe result:", authProbe);

  // === 3. Dump captured background traffic
  console.log(`[probe] captured ${captured.length} background requests:`);
  for (const c of captured) {
    console.log(`  ${c.method} ${c.url}`);
    if (c.status) console.log(`    -> ${c.status}`);
    if (c.postDataPreview)
      console.log(`    postData: ${c.postDataPreview.slice(0, 200)}`);
    if (c.responsePreview)
      console.log(`    response: ${c.responsePreview.slice(0, 200)}`);
  }

  const debugPath = resolve(process.cwd(), ".naver-debug-probe.json");
  writeFileSync(
    debugPath,
    JSON.stringify({ pageInfo, authProbe, captured }, null, 2),
    "utf8",
  );
  console.log(`[probe] full dump saved → ${debugPath}`);

  console.log("[probe] leaving browser open 30s for visual inspection…");
  await page.waitForTimeout(30_000);
  await browser.close();
}

main().catch((err) => {
  console.error("[probe] failed:", err);
  process.exit(1);
});
