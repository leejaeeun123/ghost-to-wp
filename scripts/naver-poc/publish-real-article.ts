import "dotenv/config";
import {
  fetchWeekArticles,
  getCurrentKstWeek,
  getWeekRangeFromMonday,
  type WeekRange,
} from "../../src/blog-format/week-fetcher.js";
import { formatForNaver } from "../../src/blog-format/naver-formatter.js";
import { mapToNaverCategory } from "../../src/blog-format/naver-category-mapper.js";
import { mapToNaverTopic } from "../../src/blog-format/naver-topic-mapper.js";
import { publishToNaver } from "../../src/naver-publisher.js";
import type { WeekArticle } from "../../src/blog-format/types.js";

const args = process.argv.slice(2);
const wpIdArg = args.find((a) => /^\d+$/.test(a));
const wpId = wpIdArg ? parseInt(wpIdArg, 10) : null;
const mondayArg = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
const isPublic = args.includes("--public");
const privacy: "public" | "private" = isPublic ? "public" : "private";

function shiftWeek(start: WeekRange, weeksBack: number): WeekRange {
  const d = new Date(start.mondayLabel + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 7 * weeksBack);
  return getWeekRangeFromMonday(d.toISOString().slice(0, 10));
}

async function findArticle(): Promise<WeekArticle | null> {
  const start = mondayArg ? getWeekRangeFromMonday(mondayArg) : getCurrentKstWeek();
  for (let i = 0; i < 8; i++) {
    const r = shiftWeek(start, i);
    const list = await fetchWeekArticles(r);
    console.log(`[real] week ${r.mondayLabel}: ${list.length} articles`);
    if (wpId) {
      const found = list.find((a) => a.wpId === wpId);
      if (found) return found;
    } else if (list.length > 0) {
      return list[0];
    }
  }
  return null;
}

(async () => {
  console.log(`[real] mode: ${privacy.toUpperCase()} ${wpId ? `(wpId=${wpId})` : "(latest)"}`);

  const article = await findArticle();
  if (!article) {
    console.error("[real] no article found in 8-week lookback");
    process.exit(2);
  }

  const formatted = formatForNaver(article);
  const wpCategoryNames = [article.category, article.subCategoryName].filter(Boolean) as string[];
  const category = mapToNaverCategory(wpCategoryNames);
  const allTagsForTopic = [
    ...(article.notionCategories ?? []),
    ...(article.notionThemes ?? []),
    ...(article.notionKeywords ?? []),
    ...article.tags,
  ];
  const topic = mapToNaverTopic(allTagsForTopic);

  if (!category) {
    console.error("[real] category mapping failed:", {
      wpCategory: article.category,
      sub: article.subCategoryName,
    });
    process.exit(3);
  }

  // Title format: '부제목', 제목  (when subtitle present)
  const composedTitle = article.subtitle
    ? `'${article.subtitle}', ${article.title}`
    : article.title;

  console.log("\n[real] publishing:", {
    wpId: article.wpId,
    composedTitle,
    category,
    topic,
    privacy,
    tagCount: (formatted.meta.naverTags ?? []).length,
    tags: formatted.meta.naverTags,
    dividerLayouts: formatted.meta.naverDividerLayouts,
  });

  const result = await publishToNaver({
    title: composedTitle,
    bodyHtml: formatted.html,
    category,
    topic,
    privacy,
    tags: formatted.meta.naverTags,
    dividerLayouts: formatted.meta.naverDividerLayouts,
    oglinkUrls: formatted.meta.naverOglinkUrls,
  });
  console.log("\n[real] result:", JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
})().catch((e) => {
  console.error("[real] failed:", e);
  process.exit(1);
});
