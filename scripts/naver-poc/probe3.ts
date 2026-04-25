import { chromium } from "playwright";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const STATE_PATH = resolve(process.cwd(), ".naver-browser-state.json");
const POST_WRITE_URL =
  "https://blog.naver.com/PostWriteForm.naver?blogId=antiegg&Redirect=Write&redirect=Write&widgetTypeCall=true&directAccess=false";

// All evaluate bodies are strings to avoid esbuild's __name shim leaking into the
// browser context. Keep them ES5-flavoured for the same reason.
const INSPECT_FN = `
  (() => {
    var __name = function (fn) { return fn; };

    var ACTION_RE = /(register|commit|save|submit|publish|send|finalize|persist|write|generate|refresh|fetchToken|getToken|requestToken|registerPost|writePost|registerArticle)/i;

    // collect ALL method names on an object including its prototype chain
    var collectMethods = function (obj) {
      var methods = [];
      var seen = {};
      var current = obj;
      var depth = 0;
      while (current && depth < 8) {
        var keys;
        try { keys = Object.getOwnPropertyNames(current); } catch (_) { break; }
        for (var i = 0; i < keys.length; i++) {
          var k = keys[i];
          if (seen[k]) continue;
          seen[k] = true;
          try {
            var v = current[k];
            if (typeof v === "function") {
              methods.push({ name: k, depth: depth, length: v.length });
            }
          } catch (_) {}
        }
        try { current = Object.getPrototypeOf(current); } catch (_) { break; }
        depth++;
      }
      return methods;
    };

    var actionMethods = function (obj) {
      var all = collectMethods(obj);
      return all.filter(function (m) { return ACTION_RE.test(m.name); });
    };

    var ed = (window).SmartEditor && window.SmartEditor._editors && window.SmartEditor._editors.blogpc001;
    if (!ed) return { error: "no editor instance" };

    var result = {
      editorKeys: Object.keys(ed),
      authServiceMethods: actionMethods(ed._authService || {}),
      authServiceAllMethods: collectMethods(ed._authService || {}).map(function(m){return m.name;}),
      documentServiceMethods: actionMethods(ed._documentService || {}),
      editingServiceMethods: actionMethods(ed._editingService || {}),
      papyrusMethods: actionMethods(ed._papyrus || {}),
      papyrusKeys: ed._papyrus ? Object.keys(ed._papyrus) : [],
      commandManagerKeys: ed._commandManager && ed._commandManager._commandMap ? Object.keys(ed._commandManager._commandMap).slice(0, 200) : [],
      configAgentMethods: ed._authService && ed._authService._configAgent ? actionMethods(ed._authService._configAgent) : [],
      tokenStoreKeys: ed._authService && ed._authService._tokenStore ? Object.keys(ed._authService._tokenStore) : [],
      tokenStoreMethods: ed._authService && ed._authService._tokenStore ? collectMethods(ed._authService._tokenStore).map(function(m){return m.name;}) : [],
      authServiceShape: ed._authService ? {
        appCode: ed._authService._appCode,
        userId: ed._authService._userId,
        endPoint: ed._authService._endPoint,
        tokenStorePresent: !!ed._authService._tokenStore,
      } : null,
    };

    // hunt every prototype across the editor for methods that look like publish triggers
    var deepHits = [];
    var stack = [{ path: "ed", obj: ed }];
    var visited = new WeakSet();
    var maxNodes = 60;
    var nodes = 0;
    while (stack.length && nodes < maxNodes) {
      var node = stack.shift();
      nodes++;
      if (!node.obj || typeof node.obj !== "object" || visited.has(node.obj)) continue;
      try { visited.add(node.obj); } catch (_) {}
      var ms = actionMethods(node.obj);
      for (var i = 0; i < ms.length; i++) {
        deepHits.push(node.path + "." + ms[i].name + " (depth " + ms[i].depth + ")");
      }
      var keys;
      try { keys = Object.keys(node.obj); } catch (_) { keys = []; }
      for (var j = 0; j < keys.length; j++) {
        var v;
        try { v = node.obj[keys[j]]; } catch (_) { continue; }
        if (v && typeof v === "object" && !visited.has(v) && keys[j].charAt(0) === "_") {
          stack.push({ path: node.path + "." + keys[j], obj: v });
        }
      }
    }
    result.deepActionMethods = deepHits.slice(0, 200);

    return result;
  })();
`;

const PROBE_TOKEN_FN = `
  (async () => {
    try {
      var res = await fetch("//blog.naver.com/RabbitTokenGenerate.naver", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "appCode=blogpc001",
      });
      var txt = await res.text();
      return { ok: res.ok, status: res.status, body: txt.slice(0, 600) };
    } catch (e) {
      return { error: String(e) };
    }
  })();
`;

const TRY_AUTH_FN = `
  (async () => {
    try {
      var ed = window.SmartEditor._editors.blogpc001;
      var auth = ed._authService;
      var out = {};
      // try every plausible getter name on _authService and report what comes back
      var names = [
        "fetchToken","getToken","requestToken","refreshToken","generateToken",
        "fetch","get","request","refresh","generate","getCsrfToken","csrfToken",
        "getAuthToken","createToken","newToken"
      ];
      for (var i = 0; i < names.length; i++) {
        var n = names[i];
        var fn = auth && auth[n];
        if (typeof fn === "function") {
          try {
            var v = fn.call(auth);
            if (v && typeof v.then === "function") {
              v = await v;
            }
            out[n] = { ok: true, value: typeof v === "string" ? v.slice(0, 80) : v };
          } catch (err) {
            out[n] = { ok: false, error: String(err).slice(0, 200) };
          }
        }
      }
      // also probe the tokenStore directly
      var ts = auth && auth._tokenStore;
      if (ts) {
        for (var j = 0; j < names.length; j++) {
          var nm = names[j];
          var fn2 = ts[nm];
          if (typeof fn2 === "function") {
            try {
              var v2 = fn2.call(ts);
              if (v2 && typeof v2.then === "function") v2 = await v2;
              out["tokenStore." + nm] = { ok: true, value: typeof v2 === "string" ? v2.slice(0, 80) : v2 };
            } catch (e2) {
              out["tokenStore." + nm] = { ok: false, error: String(e2).slice(0, 200) };
            }
          }
        }
      }
      return out;
    } catch (e) {
      return { error: String(e) };
    }
  })();
`;

async function main() {
  if (!existsSync(STATE_PATH)) {
    console.error("[probe3] no storage state at " + STATE_PATH);
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
      /(RabbitWrite|RabbitAutoSaveWrite|RabbitTokenGenerate|ncpt\.naver\.com|tokens|upconvert\.editor|photo-uploader|simpleUpload|oglink|SuicideWord)/.test(
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
    if (
      /(RabbitWrite|RabbitTokenGenerate|ncpt\.naver\.com\/v2\/tokens|SuicideWord)/.test(
        url,
      )
    ) {
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

  console.log("[probe3] opening editor…");
  await page.goto(POST_WRITE_URL, { waitUntil: "domcontentloaded" });
  console.log("[probe3] waiting 15s for editor bootstrap…");
  await page.waitForTimeout(15_000);

  let inspect: unknown = null;
  let directTokenProbe: unknown = null;
  let authMethodProbe: unknown = null;

  try {
    console.log("[probe3] inspecting editor methods (prototype chain)…");
    inspect = await page.evaluate(INSPECT_FN);
    console.log("[probe3] inspection succeeded");
  } catch (e) {
    console.error("[probe3] inspect failed:", String(e).slice(0, 400));
    inspect = { error: String(e) };
  }

  try {
    console.log("[probe3] direct fetch to RabbitTokenGenerate.naver…");
    directTokenProbe = await page.evaluate(PROBE_TOKEN_FN);
    console.log("[probe3] direct token probe:", directTokenProbe);
  } catch (e) {
    console.error("[probe3] direct token probe failed:", String(e).slice(0, 400));
  }

  try {
    console.log("[probe3] trying every plausible token-getter on _authService…");
    authMethodProbe = await page.evaluate(TRY_AUTH_FN);
    console.log("[probe3] auth method probe (truncated):");
    const printable = JSON.stringify(authMethodProbe, null, 2);
    console.log(printable.length > 2000 ? printable.slice(0, 2000) + "…" : printable);
  } catch (e) {
    console.error("[probe3] auth method probe failed:", String(e).slice(0, 400));
  }

  console.log(`[probe3] captured ${captured.length} background requests`);
  for (const c of captured) {
    console.log(`  ${c.method} ${c.url}`);
    if (c.status) console.log(`    -> ${c.status}`);
    if (c.postPreview) console.log(`    body: ${c.postPreview.slice(0, 160)}`);
    if (c.resPreview) console.log(`    res:  ${c.resPreview.slice(0, 160)}`);
  }

  const debugPath = resolve(process.cwd(), ".naver-debug-probe3.json");
  writeFileSync(
    debugPath,
    JSON.stringify(
      { inspect, directTokenProbe, authMethodProbe, captured },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`[probe3] full dump → ${debugPath}`);

  console.log("[probe3] leaving browser open 20s for visual inspection…");
  await page.waitForTimeout(20_000);
  await browser.close();
}

main().catch((e) => {
  console.error("[probe3] failed:", e);
  process.exit(1);
});
