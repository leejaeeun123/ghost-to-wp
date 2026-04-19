/**
 * 브런치 자동 예약 상태 저장소.
 * 프로젝트 루트의 .brunch-publish-state.json에 wpId 기준으로 이미 예약한 기록을 남겨 중복을 막는다.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const STATE_FILE = join(process.cwd(), ".brunch-publish-state.json")

export interface BrunchReservedEntry {
  wpId: number
  brunchArticleNo: number
  brunchUrl: string
  reservedAt: number
  publishAt: number
  scheduleDay: "monday" | "tuesday"
  weekLabel: string
}

interface StateFile {
  version: 1
  entries: Record<string, BrunchReservedEntry>
}

const EMPTY: StateFile = { version: 1, entries: {} }

const loadState = (): StateFile => {
  if (!existsSync(STATE_FILE)) return EMPTY
  try {
    const parsed = JSON.parse(readFileSync(STATE_FILE, "utf8")) as StateFile
    if (!parsed || typeof parsed !== "object" || !parsed.entries) return EMPTY
    return parsed
  } catch {
    return EMPTY
  }
}

export const getReservedEntry = (wpId: number): BrunchReservedEntry | null => {
  const state = loadState()
  return state.entries[String(wpId)] ?? null
}

export const markReserved = (entry: BrunchReservedEntry): void => {
  const state = loadState()
  state.entries[String(entry.wpId)] = entry
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8")
}

export const listReserved = (): BrunchReservedEntry[] =>
  Object.values(loadState().entries)
