// UI/appearance preferences — deliberately separate from MachineSettings
// (types/machine.ts): a color theme/palette is a rendering preference, not a
// property of the physical CNC, so it lives in its own storage key (see
// lib/appearanceStorage.ts) instead of piggybacking on simplecam.machine.
import type { PaletteId } from '../config/palettes'
import type { ThemeId } from './theme'

// Named sizes, not a raw pixel number — the sane range for a 3D grid
// coordinate label is narrow (~10-25px), so a free-text field would just
// invite illegible or absurdly large values with no guardrail. Mapped to
// actual pixel heights in preview3d/buildScene.ts's GRID_LABEL_SIZE_PX.
export type Grid3DLabelSize = 'small' | 'medium' | 'large'

export interface AppearanceSettings {
  theme: ThemeId
  palette: PaletteId
  // 3D Preview only — the 2D grid's labels are a fixed font size and have
  // no equivalent legibility problem to configure around (see the grid
  // coordinate-labels work this setting follows up on).
  grid3DLabelsEnabled: boolean
  grid3DLabelSize: Grid3DLabelSize
}

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  theme: 'sloppy-indigo',
  palette: 'default',
  grid3DLabelsEnabled: true,
  grid3DLabelSize: 'medium',
}
