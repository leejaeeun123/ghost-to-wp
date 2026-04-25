export type NaverCategory = "CURATION" | "GRAY";

export function mapToNaverCategory(
  wpCategoryNames: string[],
): NaverCategory | null {
  // 그레이 글이 큐레이션 카테고리도 함께 갖고 있을 수 있어 그레이 우선
  if (wpCategoryNames.some((n) => /그레이|gray/i.test(n))) return "GRAY";
  if (wpCategoryNames.some((n) => /큐레이션|curation/i.test(n))) return "CURATION";
  return null;
}
