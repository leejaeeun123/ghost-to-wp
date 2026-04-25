import { chromium } from "playwright";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const STATE_PATH = resolve(process.cwd(), ".naver-browser-state.json");
const POST_WRITE_URL =
  "https://blog.naver.com/PostWriteForm.naver?blogId=antiegg&Redirect=Write&redirect=Write&widgetTypeCall=true&directAccess=false";

const PATTERNS: Array<{ label: string; html: string }> = [
  {
    label: "A. inline style",
    html: `<p style="text-align:center">A 가운데 정렬 (inline style)</p>`,
  },
  {
    label: "B. align attribute",
    html: `<p align="center">B 가운데 정렬 (align attr)</p>`,
  },
  {
    label: "C. <center> wrapper",
    html: `<center><p>C 가운데 정렬 (center 태그)</p></center>`,
  },
  {
    label: "D. SE3 component class",
    html: `<div class="se-component se-text se-l-default"><div class="se-component-content"><div class="se-section se-section-text se-l-default"><div class="se-module se-module-text"><p class="se-text-paragraph se-text-paragraph-align-center" style="text-align:center">D SE3 컴포넌트 마크업</p></div></div></div></div>`,
  },
  {
    label: "E. div + p",
    html: `<div style="text-align:center"><p>E div wrapper + p</p></div>`,
  },
  {
    label: "F. inline + class",
    html: `<p class="se-text-paragraph se-text-paragraph-align-center" style="text-align:center">F class+inline</p>`,
  },
];

async function main() {
  if (!existsSync(STATE_PATH)) {
    console.error("[diag] no storage state");
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: STATE_PATH,
    viewport: { width: 1280, height: 900 },
    locale: "ko-KR",
  });
  const page = await context.newPage();

  console.log("[diag] opening editor (needed to acquire valid session for upconvert)…");
  await page.goto(POST_WRITE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(15_000);

  const results: any[] = [];
  for (const p of PATTERNS) {
    console.log(`\n[diag] pattern ${p.label}`);
    const result = await page.evaluate(async (html) => {
      const url =
        "https://upconvert.editor.naver.com/blog/html/components?documentWidth=693&userId=miraculum951107";
      try {
        const res = await fetch(url, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "text/plain" },
          body: html,
        });
        const text = await res.text();
        return { ok: res.ok, status: res.status, body: text };
      } catch (e) {
        return { error: String(e) };
      }
    }, p.html);

    let parsed = null;
    let alignsFound: string[] = [];
    if (result.body) {
      try {
        parsed = JSON.parse(result.body);
        // recursively collect any "align" properties
        const collect = (node: any) => {
          if (!node || typeof node !== "object") return;
          if (Array.isArray(node)) {
            node.forEach(collect);
            return;
          }
          if (node.style && typeof node.style.align === "string") {
            alignsFound.push(node.style.align);
          }
          if (typeof node.align === "string") {
            alignsFound.push(`(node)${node.align}`);
          }
          for (const k of Object.keys(node)) {
            if (k !== "id" && k !== "@ctype") collect(node[k]);
          }
        };
        collect(parsed);
      } catch {}
    }
    console.log("  status:", result.status, "aligns:", alignsFound.length ? alignsFound : "(none)");
    if (parsed) {
      console.log("  preview:", JSON.stringify(parsed).slice(0, 300));
    } else if (result.body) {
      console.log("  raw:", result.body.slice(0, 300));
    }

    results.push({ pattern: p.label, html: p.html, alignsFound, parsed });
  }

  writeFileSync(
    resolve(process.cwd(), ".naver-debug-align-diagnose.json"),
    JSON.stringify(results, null, 2),
    "utf8",
  );
  console.log("\n[diag] dump → .naver-debug-align-diagnose.json");

  await browser.close();
}

main().catch((e) => {
  console.error("[diag] failed:", e);
  process.exit(1);
});
