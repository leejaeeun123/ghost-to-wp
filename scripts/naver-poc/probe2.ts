import { chromium } from "playwright";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const STATE_PATH = resolve(process.cwd(), ".naver-browser-state.json");
const POST_WRITE_URL =
  "https://blog.naver.com/PostWriteForm.naver?blogId=antiegg&Redirect=Write&redirect=Write&widgetTypeCall=true&directAccess=false";

// page.evaluate body kept as a string so esbuild does not transform it
// (avoids the __name shim leaking into the browser context).
const INSPECT_FN = `
  (() => {
    var __name = function (fn) { return fn; };
    var describe = function (obj, depth, maxDepth) {
      depth = depth || 0;
      maxDepth = maxDepth == null ? 2 : maxDepth;
      if (obj === null || obj === undefined) return obj;
      if (typeof obj !== "object" && typeof obj !== "function") return typeof obj;
      if (depth > maxDepth) return "(deep)";
      var out = {};
      var keys;
      try { keys = Object.keys(obj).slice(0, 50); } catch (_) { return "(unenumerable)"; }
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        try {
          var v = obj[k];
          if (typeof v === "function") {
            out[k] = "fn(" + v.length + ")";
          } else if (typeof v === "object" && v !== null) {
            out[k] = describe(v, depth + 1, maxDepth);
          } else if (typeof v === "string" && v.length > 60) {
            out[k] = v.slice(0, 60) + "…";
          } else {
            out[k] = v;
          }
        } catch (_) {
          out[k] = "(throws)";
        }
      }
      return out;
    };

    var result = {};
    result.windowKeys = Object.keys(window).filter(function (k) {
      return /(naver|editor|smart|SE_|blog|publish|token|ncaptcha|store)/i.test(k);
    });
    result.naver = describe(window.naver, 0, 3);
    result.SmartEditor = describe(window.SmartEditor, 0, 3);
    result.__se_editor_jsonp = describe(window.__se_editor_jsonp, 0, 2);
    result.PhotoEditorApp = describe(window.PhotoEditorApp, 0, 2);

    // hunt for publish-like functions across window
    var pubHits = [];
    var winKeys = Object.keys(window);
    for (var i = 0; i < winKeys.length; i++) {
      var k = winKeys[i];
      try {
        var v = window[k];
        if (typeof v === "object" && v !== null) {
          var inner = Object.keys(v).slice(0, 100);
          for (var j = 0; j < inner.length; j++) {
            var ik = inner[j];
            try {
              if (
                /publish|registerPost|sendPost|writePost|submit/i.test(ik) &&
                typeof v[ik] === "function"
              ) {
                pubHits.push(k + "." + ik);
              }
            } catch (_) {}
          }
        }
      } catch (_) {}
    }
    result.publishCandidates = pubHits.slice(0, 80);

    // search localStorage / sessionStorage for token-shaped values
    var scanStorage = function (storage) {
      var found = {};
      for (var i = 0; i < storage.length; i++) {
        var k = storage.key(i);
        if (!k) continue;
        var v = storage.getItem(k) || "";
        if (/token|ncpt/i.test(k) || /[A-Za-z0-9+/=]{32,}={0,2}/.test(v)) {
          found[k] = v.length > 80 ? v.slice(0, 80) + "…" : v;
        }
      }
      return found;
    };
    result.localStorage = scanStorage(localStorage);
    result.sessionStorage = scanStorage(sessionStorage);

    return result;
  })();
`;

async function main() {
  if (!existsSync(STATE_PATH)) {
    console.error("[probe2] no storage state at " + STATE_PATH);
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: STATE_PATH,
    viewport: { width: 1280, height: 900 },
    locale: "ko-KR",
  });
  const page = await context.newPage();

  const captured: Array<{
    url: string;
    method: string;
    status?: number;
    postPreview?: string;
    resPreview?: string;
  }> = [];
  page.on("request", (req) => {
    const url = req.url();
    if (
      /(RabbitWrite|RabbitAutoSaveWrite|ncpt\.naver\.com|upconvert\.editor|photo-uploader|simpleUpload|tokens|oglink|SuicideWord)/.test(
        url,
      )
    ) {
      captured.push({
        url,
        method: req.method(),
        postPreview: req.postData()?.slice(0, 400),
      });
    }
  });
  page.on("response", async (res) => {
    const url = res.url();
    if (/(RabbitWrite|ncpt\.naver\.com\/v2\/tokens|SuicideWord)/.test(url)) {
      try {
        const body = await res.text();
        const found = [...captured].reverse().find((c) => c.url === url && !c.resPreview);
        if (found) {
          found.status = res.status();
          found.resPreview = body.slice(0, 800);
        }
      } catch {}
    }
  });

  console.log("[probe2] opening editor…");
  await page.goto(POST_WRITE_URL, { waitUntil: "domcontentloaded" });
  console.log("[probe2] waiting 15s for editor bootstrap…");
  await page.waitForTimeout(15_000);

  let inspect: unknown = null;
  try {
    console.log("[probe2] inspecting SmartEditor / naver globals…");
    inspect = await page.evaluate(INSPECT_FN);
    console.log("[probe2] inspection succeeded");
  } catch (e) {
    console.error("[probe2] inspect failed:", String(e).slice(0, 400));
    inspect = { error: String(e) };
  }

  // List frames so we know whether SE3 lives inside an iframe
  const frames = page.frames();
  const frameInfo = frames.map((f) => f.url().slice(0, 160));
  console.log("[probe2] frame count: " + frames.length);
  for (const u of frameInfo) console.log("  frame: " + u);

  console.log("[probe2] captured " + captured.length + " background requests");
  for (const c of captured) {
    console.log("  " + c.method + " " + c.url);
    if (c.status) console.log("    -> " + c.status);
    if (c.postPreview) console.log("    body: " + c.postPreview.slice(0, 160));
    if (c.resPreview) console.log("    res:  " + c.resPreview.slice(0, 160));
  }

  const debugPath = resolve(process.cwd(), ".naver-debug-probe2.json");
  writeFileSync(
    debugPath,
    JSON.stringify({ inspect, frames: frameInfo, captured }, null, 2),
    "utf8",
  );
  console.log("[probe2] full dump → " + debugPath);

  console.log("[probe2] leaving browser open 30s for visual inspection…");
  await page.waitForTimeout(30_000);
  await browser.close();
}

main().catch((e) => {
  console.error("[probe2] failed:", e);
  process.exit(1);
});
