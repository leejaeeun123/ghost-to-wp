import { chromium } from "playwright";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const STATE_PATH = resolve(process.cwd(), ".naver-browser-state.json");
const POST_WRITE_URL =
  "https://blog.naver.com/PostWriteForm.naver?blogId=antiegg&Redirect=Write&redirect=Write&widgetTypeCall=true&directAccess=false";

(async () => {
  if (!existsSync(STATE_PATH)) {
    console.error("[capture] no storage state — run naver:bootstrap first");
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: STATE_PATH,
    viewport: { width: 1280, height: 900 },
    locale: "ko-KR",
  });
  const page = await context.newPage();

  const captures: Array<{ ts: number; horizontalLines: any[] }> = [];
  page.on("request", (req) => {
    if (!/RabbitAutoSaveWrite/.test(req.url())) return;
    const post = req.postData();
    if (!post) return;
    try {
      const params = new URLSearchParams(post);
      const dmStr = params.get("documentModel");
      if (!dmStr) return;
      const dm = JSON.parse(dmStr);
      const horizontals = (dm.document?.components || []).filter(
        (c: any) => c["@ctype"] === "horizontalLine",
      );
      captures.push({ ts: Date.now(), horizontalLines: horizontals });
      console.log(
        `[capture] autosave snapshot — ${horizontals.length} horizontalLine(s):`,
      );
      console.log(JSON.stringify(horizontals, null, 2));
      // 즉시 파일에도 저장 — 사용자가 일찍 종료해도 데이터 보존
      try {
        writeFileSync(
          resolve(process.cwd(), ".naver-debug-toolbar-divider.json"),
          JSON.stringify({ captures }, null, 2),
          "utf8",
        );
      } catch {}
    } catch {}
  });

  console.log("[capture] opening editor…");
  await page.goto(POST_WRITE_URL, { waitUntil: "domcontentloaded" });
  await page
    .waitForSelector(".se-section-documentTitle", { timeout: 60_000 })
    .catch(() => {});
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

  console.log(`
[capture] >>> 사용자 액션 필요 <<<
  1. 제목에 아무 글자나 입력 (autosave 통과용)
  2. 본문에 임의 텍스트 한 줄
  3. 본문 끝에 toolbar의 "구분선" 클릭 → 첫 번째 옵션(짧은 가로 막대) 클릭
  4. 그 다음 줄에 또 "구분선" 클릭 → 두 번째 옵션(긴 실선) 클릭
  5. 5~10초 기다리면 autosave 자동 fire — 우리가 layout 값 캡처
  6. 발행하지 마세요. 그냥 두면 됩니다.

  완료까지 3분 대기. autosave 캡처될 때마다 위에 출력됩니다.
`);

  await page.waitForTimeout(180_000);

  writeFileSync(
    resolve(process.cwd(), ".naver-debug-toolbar-divider.json"),
    JSON.stringify({ captures }, null, 2),
    "utf8",
  );
  console.log(`\n[capture] saved ${captures.length} snapshots → .naver-debug-toolbar-divider.json`);
  await browser.close();
})();
