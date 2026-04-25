export type NaverTopic =
  | "문학·책"
  | "영화"
  | "드라마"
  | "공연·전시"
  | "미술·디자인"
  | "만화·애니"
  | null; // null = 주제 선택 안 함

interface TopicRule {
  topic: Exclude<NaverTopic, null>;
  keywords: string[];
}

// Tier 1: specific keywords. Match first → high confidence.
const TIER1_RULES: TopicRule[] = [
  { topic: "만화·애니", keywords: ["만화", "그래픽노블", "애니"] },
  { topic: "공연·전시", keywords: ["공연", "전시", "댄스", "춤"] },
  { topic: "미술·디자인", keywords: ["미술", "디자인", "아트", "공예", "아티스트"] },
  { topic: "영화", keywords: ["영화"] },
  { topic: "드라마", keywords: ["드라마"] },
  { topic: "문학·책", keywords: ["문학", "책"] },
];

// Tier 2: ambiguous fallback keywords. Used only if no Tier 1 match.
const TIER2_RULES: TopicRule[] = [
  { topic: "문학·책", keywords: ["출판"] },
  { topic: "공연·전시", keywords: ["피플"] },
  { topic: "문학·책", keywords: ["컬쳐"] },
  { topic: "영화", keywords: ["미디어"] },
];

export function mapToNaverTopic(tags: string[]): NaverTopic {
  const set = new Set(tags.map((t) => t.trim()).filter(Boolean));
  for (const rule of TIER1_RULES) {
    if (rule.keywords.some((k) => set.has(k))) return rule.topic;
  }
  for (const rule of TIER2_RULES) {
    if (rule.keywords.some((k) => set.has(k))) return rule.topic;
  }
  return null;
}
