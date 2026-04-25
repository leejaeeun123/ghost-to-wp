import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const STATE_PATH = resolve(process.cwd(), ".naver-browser-state.json");

async function main() {
  console.log(`[bootstrap] storage state path: ${STATE_PATH}`);
  if (existsSync(STATE_PATH)) {
    console.log(
      "[bootstrap] WARNING: existing storage state file detected — it will be OVERWRITTEN after you finish login.",
    );
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "ko-KR",
  });
  const page = await context.newPage();

  console.log("[bootstrap] opening Naver login page");
  await page.goto("https://nid.naver.com/nidlogin.login", {
    waitUntil: "domcontentloaded",
  });

  console.log(`
[bootstrap] >>> ACTION REQUIRED <<<
  1. Log in with the antiegg blog operator account in the opened browser.
  2. Complete 2FA / captcha if prompted.
  3. After login, navigate to https://blog.naver.com/antiegg and confirm
     the dashboard loads correctly.
  4. Return to this terminal and press ENTER to save the session.

  Do not close the browser window manually.
`);

  await new Promise<void>((resolveWait) => {
    process.stdin.resume();
    process.stdin.once("data", () => resolveWait());
  });

  console.log("[bootstrap] saving storage state…");
  await context.storageState({ path: STATE_PATH });
  console.log(`[bootstrap] saved → ${STATE_PATH}`);
  await browser.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("[bootstrap] failed:", err);
  process.exit(1);
});
