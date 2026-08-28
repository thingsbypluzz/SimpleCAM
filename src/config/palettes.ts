// Single source of truth for every color used by the 2D
// (preview/drawToolpath.ts) and 3D (preview3d/buildScene.ts) previews —
// replaces what used to be two hand-duplicated LIGHT_THEME/DARK_THEME pairs
// (one per file, kept in sync only by a comment). BL-12.
//
// Two categories, per the /grill-me decision:
//  - Fixed colors: axis red (X) / green (Y), origin indigo, offset amber,
//    plus 2D-only text/holeFill. These are a CNC/semantic convention (which
//    axis is which, "this is the work-offset vector"), not a stylistic
//    choice — no palette is allowed to change them.
//  - Palette accents: background/grid/toolpath/rapid/hole — the part a user
//    can actually reskin via Settings > Appearance. Each palette carries a
//    light AND dark variant, selected by the existing dark-mode toggle
//    (independent axis from palette choice).

export interface FixedColors {
  axisX: string
  axisY: string
  origin: string
  offset: string
  text: string
  holeFill: string
}

export const FIXED_COLORS_LIGHT: FixedColors = {
  axisX: '#dc2626',
  axisY: '#16a34a',
  origin: '#4f46e5',
  offset: '#d97706',
  text: '#64748b',
  holeFill: 'rgba(79, 70, 229, 0.3)',
}

export const FIXED_COLORS_DARK: FixedColors = {
  axisX: '#f87171',
  axisY: '#4ade80',
  origin: '#818cf8',
  offset: '#fbbf24',
  text: '#94a3b8',
  holeFill: 'rgba(129, 140, 248, 0.3)',
}

export function getFixedColors(isDark: boolean): FixedColors {
  return isDark ? FIXED_COLORS_DARK : FIXED_COLORS_LIGHT
}

export interface PaletteAccents {
  background: string
  grid: string
  toolpath: string
  rapid: string
  hole: string
}

export type PaletteId = 'default' | 'ocean' | 'ember' | 'violet'

export interface Palette {
  id: PaletteId
  label: string
  light: PaletteAccents
  dark: PaletteAccents
}

// "Default" reproduces the pre-BL-12 LIGHT_THEME/DARK_THEME colors, with one
// deliberate exception: `grid` was fixed post-launch (same day), not
// reproduced. BL-12 had accidentally collapsed the 3D preview's own grid
// color (`#94a3b8`/`#475569`) into the much subtler one 2D always used
// (`#e2e8f0`/`#1e293b`) — at the 3D GridHelper's 0.4 opacity that read as
// "the grid nearly disappeared", not a style choice. Fixed with a fresh
// value (`#c0bfbc`/`#5e5c64`) shared by all four palettes — grid is a
// utility/orientation cue, not a signature accent, so it isn't part of what
// differentiates one palette from another. "Ember" avoids amber
// (#d97706/#fbbf24 is the fixed `offset` color) so its toolpath accent
// never gets mistaken for the offset vector.
export const PALETTES: Record<PaletteId, Palette> = {
  default: {
    id: 'default',
    label: 'Default',
    light: { background: '#ffffff', grid: '#c0bfbc', toolpath: '#16a34a', rapid: '#cbd5e1', hole: '#94a3b8' },
    dark: { background: '#0f172a', grid: '#5e5c64', toolpath: '#4ade80', rapid: '#334155', hole: '#475569' },
  },
  ocean: {
    id: 'ocean',
    label: 'Ocean',
    light: { background: '#ffffff', grid: '#c0bfbc', toolpath: '#0891b2', rapid: '#94a3b8', hole: '#64a0b8' },
    dark: { background: '#0f172a', grid: '#5e5c64', toolpath: '#22d3ee', rapid: '#3f4b5c', hole: '#3d5a6b' },
  },
  ember: {
    id: 'ember',
    label: 'Ember',
    light: { background: '#ffffff', grid: '#c0bfbc', toolpath: '#c2410c', rapid: '#a8a29e', hole: '#8a7a6d' },
    dark: { background: '#0f172a', grid: '#5e5c64', toolpath: '#fb923c', rapid: '#44403c', hole: '#57453a' },
  },
  violet: {
    id: 'violet',
    label: 'Violet',
    light: { background: '#ffffff', grid: '#c0bfbc', toolpath: '#7c3aed', rapid: '#a5a3b8', hole: '#8b7fae' },
    dark: { background: '#0f172a', grid: '#5e5c64', toolpath: '#a78bfa', rapid: '#3f3d56', hole: '#4c4166' },
  },
}

// Fixed display order for the Settings swatch row — Object.values(PALETTES)
// would work today too, but this keeps the order explicit and independent
// of key-insertion order.
export const PALETTE_LIST: Palette[] = [
  PALETTES.default,
  PALETTES.ocean,
  PALETTES.ember,
  PALETTES.violet,
]

export function getPaletteAccents(paletteId: PaletteId, isDark: boolean): PaletteAccents {
  const palette = PALETTES[paletteId] ?? PALETTES.default
  return isDark ? palette.dark : palette.light
}

// 3D (Three.js) colors are numeric 0xrrggbb; 2D (Canvas) colors are hex
// strings — this converts once instead of maintaining two literal copies of
// every value.
export function hexToThreeColor(hex: string): number {
  return parseInt(hex.slice(1), 16)
}
