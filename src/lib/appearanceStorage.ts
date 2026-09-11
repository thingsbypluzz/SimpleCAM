import { PALETTE_LIST, type PaletteId } from '../config/palettes'
import { DEFAULT_APPEARANCE_SETTINGS, type AppearanceSettings, type Grid3DLabelSize } from '../types/appearance'
import { THEME_LIST, type ThemeId } from '../types/theme'

// Separate localStorage key from simplecam.machine — see types/appearance.ts
// for why.
const APPEARANCE_STORAGE_KEY = 'simplecam.appearance'

function isPaletteId(value: unknown): value is PaletteId {
  return typeof value === 'string' && PALETTE_LIST.some((p) => p.id === value)
}

function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEME_LIST.some((t) => t.id === value)
}

function isGrid3DLabelSize(value: unknown): value is Grid3DLabelSize {
  return value === 'small' || value === 'medium' || value === 'large'
}

export function loadAppearanceSettings(): AppearanceSettings {
  try {
    const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY)
    if (!raw) return DEFAULT_APPEARANCE_SETTINGS
    const parsed = JSON.parse(raw) as Partial<AppearanceSettings>
    // A theme/palette id from an older/corrupted save that no longer
    // matches a known one falls back to the default rather than reaching a
    // lookup miss deeper in the app. Missing `theme` (a save from before
    // this field existed) merges in the default the same way.
    return {
      theme: isThemeId(parsed.theme) ? parsed.theme : DEFAULT_APPEARANCE_SETTINGS.theme,
      palette: isPaletteId(parsed.palette) ? parsed.palette : DEFAULT_APPEARANCE_SETTINGS.palette,
      grid3DLabelsEnabled:
        typeof parsed.grid3DLabelsEnabled === 'boolean'
          ? parsed.grid3DLabelsEnabled
          : DEFAULT_APPEARANCE_SETTINGS.grid3DLabelsEnabled,
      grid3DLabelSize: isGrid3DLabelSize(parsed.grid3DLabelSize)
        ? parsed.grid3DLabelSize
        : DEFAULT_APPEARANCE_SETTINGS.grid3DLabelSize,
    }
  } catch (err) {
    console.warn('SimpleCAM: could not read appearance settings from localStorage', err)
    return DEFAULT_APPEARANCE_SETTINGS
  }
}

export function saveAppearanceSettings(settings: AppearanceSettings): void {
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(settings))
  } catch (err) {
    console.warn('SimpleCAM: could not save appearance settings to localStorage', err)
  }
}
