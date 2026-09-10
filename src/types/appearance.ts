// UI/appearance preferences — deliberately separate from MachineSettings
// (types/machine.ts): a color theme/palette is a rendering preference, not a
// property of the physical CNC, so it lives in its own storage key (see
// lib/appearanceStorage.ts) instead of piggybacking on simplecam.machine.
import type { PaletteId } from '../config/palettes'
import type { ThemeId } from './theme'

export interface AppearanceSettings {
  theme: ThemeId
  palette: PaletteId
}

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  theme: 'sloppy-indigo',
  palette: 'default',
}
