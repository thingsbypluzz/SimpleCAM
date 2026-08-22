// UI/appearance preferences — deliberately separate from MachineSettings
// (types/machine.ts): a color palette is a rendering preference, not a
// property of the physical CNC, so it lives in its own storage key (see
// lib/appearanceStorage.ts) instead of piggybacking on simplecam.machine.
import type { PaletteId } from '../config/palettes'

export interface AppearanceSettings {
  palette: PaletteId
}

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  palette: 'default',
}
