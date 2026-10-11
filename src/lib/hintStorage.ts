// One-time hints the user has already dismissed (BL-8) — its own
// localStorage key, like every other store here.
const HINT_STORAGE_KEY = 'simplecam.hints'

export type HintId = 'presetHold'

function readSeen(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(HINT_STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

export function isHintSeen(id: HintId): boolean {
  return readSeen().includes(id)
}

export function markHintSeen(id: HintId): void {
  try {
    localStorage.setItem(HINT_STORAGE_KEY, JSON.stringify([...new Set([...readSeen(), id])]))
  } catch {
    // Storage unavailable: the hint simply shows again next time.
  }
}

export function clearHints(): void {
  try {
    localStorage.removeItem(HINT_STORAGE_KEY)
  } catch {
    // Nothing to clear.
  }
}
