import { publishToNaver } from "../../src/naver-publisher.js";
import { mapToNaverCategory } from "../../src/blog-format/naver-category-mapper.js";
import { mapToNaverTopic } from "../../src/blog-format/naver-topic-mapper.js";

// SE3-compatible HTML sample exercising 5종 정렬 (좌·중·우 + bold + divider).
// upconvert API는 class만으론 align을 인식 못함 (align-diagnose 검증).
// production naver-formatter.ts와 동일하게 class + inline style 둘 다 부여.
const SAMPLE_HTML = `
<div class="se-component se-text se-l-default"><div class="se-component-content"><div class="se-section se-section-text se-l-default"><div class="se-module se-module-text"><p class="se-text-paragraph se-text-paragraph-align-right" style="text-align:right">Edited by <b><font color="#f7343c">재은</font></b></p></div></div></div></div>
<div class="se-component se-text se-l-default"><div class="se-component-content"><div class="se-section se-section-text se-l-default"><div class="se-module se-module-text"><p class="se-text-paragraph se-text-paragraph-align-left" style="text-align:left">이 글은 ghost-to-wp 자동화 PoC가 작성한 <b>비공개 테스트</b> 글입니다. 발행 직후 즉시 삭제해 주세요.</p></div></div></div></div>
<div class="se-component se-divider se-l-default"><div class="se-component-content"><div class="se-section se-section-divider"><div class="se-module"><hr class="se-hr"></div></div></div></div>
<div class="se-component se-text se-l-default"><div class="se-component-content"><div class="se-section se-section-text se-l-default"><div class="se-module se-module-text"><p class="se-text-paragraph se-text-paragraph-align-center" style="text-align:center"><b>가운데 정렬 검증 단락 (Bold)</b></p></div></div></div></div>
<div class="se-component se-text se-l-default"><div class="se-component-content"><div class="se-section se-section-text se-l-default"><div class="se-module se-module-text"><p class="se-text-paragraph se-text-paragraph-align-right" style="text-align:right">우측 마무리 단락 — 정렬 검증용</p></div></div></div></div>
`.trim();

const wpCategories = ["매거진", "큐레이션"];
const notionTags = ["문학", "출판"];

const category = mapToNaverCategory(wpCategories);
const topic = mapToNaverTopic(notionTags);

if (!category) {
  console.error("category mapping failed for", wpCategories);
  process.exit(2);
}

const isPublic = process.argv.includes("--public");
const privacy: "public" | "private" = isPublic ? "public" : "private";

console.log("[cli] options resolved:");
console.log("  category :", category);
console.log("  topic    :", topic ?? "(주제 선택 안 함)");
console.log("  privacy  :", privacy);

(async () => {
  const result = await publishToNaver({
    title: "[자동화 PoC v2 · 발행 후 즉시 삭제]",
    bodyHtml: SAMPLE_HTML,
    category,
    topic,
    privacy,
    tags: ["자동화", "PoC"],
  });

  console.log("\n[cli] result:");
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
})();
