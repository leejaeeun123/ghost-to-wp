import { chromium } from "playwright";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const STATE_PATH = resolve(process.cwd(), ".naver-browser-state.json");
const POST_WRITE_URL =
  "https://blog.naver.com/PostWriteForm.naver?blogId=antiegg&Redirect=Write&redirect=Write&widgetTypeCall=true&directAccess=false";

// Same multi-paragraph alignment fixture as paste-debug.ts so the failure mode
// is directly comparable. Adds a Edited-by-style line to confirm right-align.
const TEST_HTML = `
<p style="text-align:right">Edited by <b><font color="#f7343c">재은</font></b></p>
<p style="text-align:left">왼쪽 정렬 단락 1.</p>
<p style="text-align:center">가운데 정렬 단락 2.</p>
<p style="text-align:right">오른쪽 정렬 단락 3.</p>
<p style="text-align:center"><b>가운데 + 볼드</b></p>
`.trim();

const TITLE_PROBE_FN = `
  (() => {
    var titleHost = document.querySelector('.se-section-documentTitle');
    if (titleHost) titleHost.setAttribute('data-poc-target', 'title');
    return { hasTitle: !!titleHost };
  })();
`;

// Find any SmartEditor instance regardless of appCode key. probe3 saw
// blogpc001 but the key may vary, and SmartEditor may be a function with
// _editors as a static-like map.
const FIND_EDITOR_FN = `
  (() => {
    var w = window;
    var globals = Object.keys(w).filter(function(k){ return /smart|editor|naver|blog|SE/i.test(k); }).slice(0, 60);
    var seInfo = null;
    if (w.SmartEditor) {
      seInfo = {
        type: typeof w.SmartEditor,
        ownKeys: Object.keys(w.SmartEditor).slice(0, 40),
        editorsType: typeof w.SmartEditor._editors,
        editorsKeys: w.SmartEditor._editors ? Object.keys(w.SmartEditor._editors) : null,
      };
    }
    var picked = null;
    if (w.SmartEditor && w.SmartEditor._editors) {
      var keys = Object.keys(w.SmartEditor._editors);
      for (var i = 0; i < keys.length; i++) {
        var ed = w.SmartEditor._editors[keys[i]];
        if (ed && ed._commandManager) {
          picked = keys[i];
          break;
        }
      }
    }
    return { globals: globals, seInfo: seInfo, picked: picked };
  })();
`;

const INSPECT_INSERT_FN = `
  ((appCode) => {
    var ed = window.SmartEditor && window.SmartEditor._editors && window.SmartEditor._editors[appCode];
    if (!ed) return { error: "no editor for appCode=" + appCode };
    var cm = ed._commandManager;
    if (!cm) return { error: "no commandManager" };
    var map = cm._commandMap || {};
    var ic = map.insertComponents;
    var out = {
      commandManagerKeys: Object.keys(cm),
      commandMapKeys: Object.keys(map),
      insertComponentsType: typeof ic,
      cmRunType: typeof cm.run,
      cmExecuteType: typeof cm.execute,
      userId: ed._authService && ed._authService._userId
    };
    if (typeof ic === "function") {
      out.insertComponentsLength = ic.length;
      out.insertComponentsSource = String(ic).slice(0, 600);
    } else if (ic && typeof ic === "object") {
      out.insertComponentsObjectKeys = Object.keys(ic);
      var proto = Object.getPrototypeOf(ic);
      out.insertComponentsProtoKeys = proto ? Object.getOwnPropertyNames(proto) : [];
      var methods = {};
      var allKeys = out.insertComponentsObjectKeys.concat(out.insertComponentsProtoKeys);
      for (var i = 0; i < allKeys.length; i++) {
        var k = allKeys[i];
        try {
          var v = ic[k];
          if (typeof v === "function") {
            methods[k] = { length: v.length, src: String(v).slice(0, 400) };
          }
        } catch (_) {}
      }
      out.insertComponentsMethods = methods;
    }
    return out;
  })
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

const INJECT_FN = `
  (async (components, appCode) => {
    var ed = window.SmartEditor._editors[appCode];
    var cm = ed._commandManager;
    var map = cm._commandMap || {};
    var ic = map.insertComponents;
    var instance = ic && ic._instance;
    var instanceShape = null;
    if (instance) {
      var ownKeys = Object.getOwnPropertyNames(instance);
      var proto = Object.getPrototypeOf(instance);
      var protoKeys = proto ? Object.getOwnPropertyNames(proto) : [];
      var instanceMethodSrcs = {};
      for (var i = 0; i < protoKeys.length; i++) {
        var k = protoKeys[i];
        try {
          var v = instance[k];
          if (typeof v === "function" && /insert|append|prepend|delete|component/i.test(k)) {
            instanceMethodSrcs[k] = String(v).slice(0, 500);
          }
        } catch (_) {}
      }
      instanceShape = {
        ctorName: instance.constructor && instance.constructor.name,
        ownKeys: ownKeys.slice(0, 40),
        protoKeys: protoKeys.slice(0, 60),
        relevantMethodSrcs: instanceMethodSrcs
      };
    }

    var attempts = [];
    var tries = [
      { label: "ic.run(components)", fn: function(){ return ic.run(components); } },
      { label: "ic.run({ components })", fn: function(){ return ic.run({ components: components }); } },
      { label: "ic.run(components, 0)", fn: function(){ return ic.run(components, 0); } },
      { label: "ic.run(components, { offset: 0 })", fn: function(){ return ic.run(components, { offset: 0 }); } },
      { label: "ic._method.call(ic._instance, components)", fn: function(){ return ic._method.call(ic._instance, components); } },
      { label: "map.appendComponents.run(components)", fn: function(){ return map.appendComponents.run(components); } }
    ];
    for (var i = 0; i < tries.length; i++) {
      var t = tries[i];
      try {
        var r = t.fn();
        if (r && typeof r.then === "function") r = await r;
        attempts.push({ label: t.label, ok: true, resultPreview: typeof r === "object" ? "object" : String(r).slice(0, 200) });
        return { firstNonThrow: t.label, instanceShape: instanceShape, attempts: attempts };
      } catch (e) {
        attempts.push({ label: t.label, ok: false, error: String(e).slice(0, 200), stack: (e && e.stack || "").slice(0, 800) });
      }
    }
    return { firstNonThrow: null, instanceShape: instanceShape, attempts: attempts };
  })
`;

async function main() {
  if (!existsSync(STATE_PATH)) {
    console.error("[inject] no storage state at " + STATE_PATH);
    process.exit(2);
  }
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: STATE_PATH,
    viewport: { width: 1280, height: 900 },
    locale: "ko-KR",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();

  let autosavePayload: string | null = null;
  page.on("request", (req) => {
    if (/RabbitAutoSaveWrite/.test(req.url())) {
      autosavePayload = req.postData() || null;
    }
  });

  console.log("[inject] opening editor…");
  await page.goto(POST_WRITE_URL, { waitUntil: "domcontentloaded" });

  // Wait for editor DOM (independent of SmartEditor JS init).
  console.log("[inject] waiting for .se-section-documentTitle…");
  const titleAppeared = await page
    .waitForSelector(".se-section-documentTitle", { timeout: 60_000 })
    .then(() => true)
    .catch(() => false);
  if (!titleAppeared) {
    const diag = await page.evaluate(`
      ({
        url: location.href,
        title: document.title,
        bodyHead: (document.body && document.body.innerText || "").slice(0, 400),
        seCount: document.querySelectorAll(".se-section").length,
        loginHints: !!document.querySelector('input[name="id"], #id_line, .input_login')
      })
    `);
    console.error("[inject] DOM never reached editor. diag:", JSON.stringify(diag, null, 2));
    await page.screenshot({
      path: resolve(process.cwd(), ".naver-debug-inject-no-dom.png"),
    });
    await browser.close();
    process.exit(5);
  }

  // Dismiss any 도움말 / 취소 / 닫기 popups so editor JS can finish initializing.
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

  // Click into the title to nudge SmartEditor to fully attach.
  await page.evaluate(TITLE_PROBE_FN);
  await page.locator('[data-poc-target="title"]').click({ force: true });
  await page.waitForTimeout(300);
  await page.keyboard.insertText("inject-components PoC");
  await page.waitForTimeout(1500);

  console.log("[inject] discovering SmartEditor instance…");
  const finder: any = await page.evaluate(FIND_EDITOR_FN);
  console.log("[inject] finder result:", JSON.stringify(finder, null, 2).slice(0, 800));
  if (!finder.picked) {
    console.error("[inject] no SmartEditor instance with _commandManager found. abort.");
    writeFileSync(
      resolve(process.cwd(), ".naver-debug-inject.json"),
      JSON.stringify({ finder, autosavePayload }, null, 2),
      "utf8",
    );
    await page.screenshot({
      path: resolve(process.cwd(), ".naver-debug-inject-no-editor.png"),
    });
    await browser.close();
    process.exit(4);
  }
  const appCode: string = finder.picked;
  console.log("[inject] using appCode=" + appCode);

  console.log("[inject] inspecting insertComponents signature…");
  const inspect: any = await page.evaluate(
    `(${INSPECT_INSERT_FN.replace("`", "\\`")})(${JSON.stringify(appCode)})`,
  );
  console.log(JSON.stringify(inspect, null, 2).slice(0, 1400));

  const userId = inspect.userId || "miraculum951107";
  console.log("[inject] upconverting test HTML (userId=" + userId + ")…");
  const upconvert: any = await page.evaluate(
    `${UPCONVERT_FN}(${JSON.stringify(TEST_HTML)}, ${JSON.stringify(userId)})`,
  );
  console.log(
    "[inject] upconvert status:",
    upconvert.status,
    "components:",
    upconvert.components ? upconvert.components.length : "none",
  );
  if (!upconvert.components) {
    console.error("[inject] upconvert failed — body:", upconvert.body);
    await browser.close();
    process.exit(3);
  }

  // Move caret into the body section so insertComponents has a valid selection.
  console.log("[inject] focusing body section…");
  await page.evaluate(`
    (() => {
      var sections = document.querySelectorAll('.se-section');
      for (var i = 0; i < sections.length; i++) {
        if (!sections[i].classList.contains('se-section-documentTitle')) {
          sections[i].setAttribute('data-poc-target', 'body');
          break;
        }
      }
    })();
  `);
  await page.locator('[data-poc-target="body"]').click({ force: true });
  await page.waitForTimeout(800);

  console.log("[inject] attempting injection…");
  const result: any = await page.evaluate(
    `${INJECT_FN}(${JSON.stringify(upconvert.components)}, ${JSON.stringify(appCode)})`,
  );
  console.log("[inject] injection result:", JSON.stringify(result, null, 2));

  // force autosave: tap a key and blur the title
  await page.waitForTimeout(2000);
  await page.keyboard.press("End");
  await page.keyboard.type(" ", { delay: 50 });
  await page.waitForTimeout(8_000);
  await page.locator('[data-poc-target="title"]').click({ force: true });
  await page.waitForTimeout(5_000);

  await page.screenshot({
    path: resolve(process.cwd(), ".naver-debug-inject.png"),
    fullPage: false,
  });

  let documentModel: any = null;
  const alignsInModel: Array<{ ctype: string; align: string }> = [];
  if (autosavePayload) {
    const params = new URLSearchParams(autosavePayload);
    const dmStr = params.get("documentModel");
    if (dmStr) {
      try {
        documentModel = JSON.parse(dmStr);
        const collect = (n: any) => {
          if (!n || typeof n !== "object") return;
          if (Array.isArray(n)) {
            n.forEach(collect);
            return;
          }
          if (n.style && typeof n.style.align === "string") {
            alignsInModel.push({ ctype: n["@ctype"], align: n.style.align });
          }
          for (const k of Object.keys(n)) if (k !== "id") collect(n[k]);
        };
        collect(documentModel);
      } catch {}
    }
  }
  console.log("[inject] aligns in saved documentModel:", alignsInModel);

  writeFileSync(
    resolve(process.cwd(), ".naver-debug-inject.json"),
    JSON.stringify(
      { inspect, upconvert, result, documentModel, alignsInModel, autosavePayload },
      null,
      2,
    ),
    "utf8",
  );
  console.log("[inject] dump → .naver-debug-inject.json");

  console.log("[inject] leaving 20s for visual confirmation…");
  await page.waitForTimeout(20_000);
  await browser.close();
}

main().catch((e) => {
  console.error("[inject] failed:", e);
  process.exit(1);
});
