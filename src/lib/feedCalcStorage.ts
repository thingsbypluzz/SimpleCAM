import { isMaterialId, type MaterialId } from '../config/materials'
import type { ToolMaterial } from './feedCalc'

// BL-68: the Feedrate Calculator's own memory — the last material and tool
// it was used with. Global, not per preset (WizardParams stays untouched);
// the chip load override is deliberately not kept, so a value typed for one
// material never carries over to another.
export interface FeedCalcSettings {
  material: MaterialId
  flutes: number
  toolMaterial: ToolMaterial
}

export const DEFAULT_FEED_CALC_SETTINGS: FeedCalcSettings = {
  material: 'mdf',
  flutes: 2,
  toolMaterial: 'carbide',
}

// Hobby end mills top out well below this; 6 still covers roughers.
export const MAX_FLUTES = 6

export function isValidFluteCount(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= MAX_FLUTES
}

const FEED_CALC_STORAGE_KEY = 'simplecam.feedCalc'

export function loadFeedCalcSettings(): FeedCalcSettings {
  try {
    const raw = localStorage.getItem(FEED_CALC_STORAGE_KEY)
    if (!raw) return DEFAULT_FEED_CALC_SETTINGS
    const parsed = JSON.parse(raw) as Partial<Record<keyof FeedCalcSettings, unknown>> | null
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_FEED_CALC_SETTINGS
    const d = DEFAULT_FEED_CALC_SETTINGS
    return {
      material: isMaterialId(parsed.material) ? parsed.material : d.material,
      flutes: typeof parsed.flutes === 'number' && isValidFluteCount(parsed.flutes) ? parsed.flutes : d.flutes,
      toolMaterial: parsed.toolMaterial === 'carbide' || parsed.toolMaterial === 'hss' ? parsed.toolMaterial : d.toolMaterial,
    }
  } catch (err) {
    console.warn('OnlyPaths: could not read feed calculator settings from localStorage', err)
    return DEFAULT_FEED_CALC_SETTINGS
  }
}

export function saveFeedCalcSettings(settings: FeedCalcSettings): void {
  try {
    localStorage.setItem(FEED_CALC_STORAGE_KEY, JSON.stringify(settings))
  } catch (err) {
    console.warn('OnlyPaths: could not save feed calculator settings to localStorage', err)
  }
}
