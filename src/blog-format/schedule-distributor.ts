import type { WeekArticle, ScheduledArticle, ScheduleResult } from "./types.js"

/**
 * 주간 아티클을 월/화 두 배치로 분배.
 *
 * 규칙:
 *  - 큐레이션은 절반씩 (홀수면 월요일에 1개 더)
 *  - 그레이는 항상 화요일 꼬리
 *
 * 순수 함수 — 외부 상태 의존 없음.
 */
export const distributeWeek = (
  articles: WeekArticle[],
  weekLabel: string
): ScheduleResult => {
  const curations = articles.filter((a) => a.category === "큐레이션")
  const grays = articles.filter((a) => a.category === "그레이")

  const half = Math.ceil(curations.length / 2)
  const mondayCurations = curations.slice(0, half)
  const tuesdayCurations = curations.slice(half)

  const monday: ScheduledArticle[] = mondayCurations.map((a, i) => ({
    ...a,
    scheduleDay: "monday",
    scheduleOrder: i,
  }))

  const tuesday: ScheduledArticle[] = [
    ...tuesdayCurations.map((a, i) => ({
      ...a,
      scheduleDay: "tuesday" as const,
      scheduleOrder: i,
    })),
    ...grays.map((a, i) => ({
      ...a,
      scheduleDay: "tuesday" as const,
      scheduleOrder: tuesdayCurations.length + i,
    })),
  ]

  return { weekLabel, monday, tuesday }
}
