import {
  fetchWeekArticles,
  getCurrentKstWeek,
  getWeekRangeFromMonday,
  type WeekArticle,
} from "../blog-format/index.js"

type WeekRange = ReturnType<typeof getCurrentKstWeek>
interface WeekLoadResult {
  range: WeekRange
  articles: WeekArticle[]
}

const weekCache = new Map<string, { articles: WeekArticle[]; cachedAt: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000

export const clearWeekCache = (monday?: string): void => {
  const key = monday ?? getCurrentKstWeek().mondayLabel
  weekCache.delete(key)
}

export const loadWeek = async (mondayYmd?: string): Promise<WeekLoadResult> => {
  const range = mondayYmd ? getWeekRangeFromMonday(mondayYmd) : getCurrentKstWeek()
  const cached = weekCache.get(range.mondayLabel)
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return { range, articles: cached.articles }
  }
  const articles = await fetchWeekArticles(range)
  weekCache.set(range.mondayLabel, { articles, cachedAt: Date.now() })
  return { range, articles }
}

export const findArticle = (
  articles: WeekArticle[],
  wpId: number,
): WeekArticle | undefined => articles.find((a) => a.wpId === wpId)
