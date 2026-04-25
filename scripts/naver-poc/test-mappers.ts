import { mapToNaverCategory } from "../../src/blog-format/naver-category-mapper.js";
import { mapToNaverTopic } from "../../src/blog-format/naver-topic-mapper.js";

const cases: Array<{ label: string; wp: string[]; tags: string[]; expectCat: string | null; expectTopic: string | null }> = [
  {
    label: "그레이 + 미술 단독",
    wp: ["매거진", "그레이"],
    tags: ["미술"],
    expectCat: "GRAY",
    expectTopic: "미술·디자인",
  },
  {
    label: "큐레이션 + 디자인",
    wp: ["매거진", "큐레이션", "디자인"],
    tags: ["디자인"],
    expectCat: "CURATION",
    expectTopic: "미술·디자인",
  },
  {
    label: "큐레이션 + 영화",
    wp: ["매거진", "큐레이션", "컬쳐"],
    tags: ["영화"],
    expectCat: "CURATION",
    expectTopic: "영화",
  },
  {
    label: "큐레이션 + 만화 (그래픽노블 우선)",
    wp: ["매거진", "큐레이션"],
    tags: ["출판", "그래픽노블"],
    expectCat: "CURATION",
    expectTopic: "만화·애니",
  },
  {
    label: "출판만 (Tier 2 폴백)",
    wp: ["매거진", "큐레이션"],
    tags: ["출판"],
    expectCat: "CURATION",
    expectTopic: "문학·책",
  },
  {
    label: "컬쳐만 (Tier 2 폴백 → 문학·책)",
    wp: ["매거진", "큐레이션"],
    tags: ["컬쳐"],
    expectCat: "CURATION",
    expectTopic: "문학·책",
  },
  {
    label: "공연 + 전시",
    wp: ["매거진", "큐레이션"],
    tags: ["공연", "전시"],
    expectCat: "CURATION",
    expectTopic: "공연·전시",
  },
  {
    label: "매핑 안 되는 카테고리",
    wp: ["매거진"],
    tags: ["일상"],
    expectCat: null,
    expectTopic: null,
  },
];

let pass = 0;
let fail = 0;
for (const c of cases) {
  const cat = mapToNaverCategory(c.wp);
  const topic = mapToNaverTopic(c.tags);
  const ok = cat === c.expectCat && topic === c.expectTopic;
  if (ok) pass++;
  else fail++;
  console.log(
    (ok ? "✓" : "✗") +
      ` ${c.label}\n  cat: ${cat} (expect ${c.expectCat}), topic: ${topic} (expect ${c.expectTopic})`,
  );
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
