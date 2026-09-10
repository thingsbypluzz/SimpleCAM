// Single source of truth for every color used by the 2D
// (preview/drawToolpath.ts) and 3D (preview3d/buildScene.ts) previews —
// replaces what used to be two hand-duplicated LIGHT_THEME/DARK_THEME pairs
// (one per file, kept in sync only by a comment). BL-12.
//
// Two categories, per the original /grill-me decision:
//  - Fixed colors: axis red (X) / green (Y), origin indigo, offset amber,
//    plus 2D-only text/holeFill. A CNC/semantic convention (which axis is
//    which, "this is the work-offset vector"), not a stylistic choice — no
//    Preview Palette (below) is allowed to change them. A UI Theme
//    (src/types/theme.ts) IS allowed to, though — see below.
//  - Palette accents: background/grid/toolpath/rapid/hole — the part a user
//    can actually reskin via Settings > Appearance > Preview Color Palette.
//    Each palette carries a light AND dark variant, selected by the
//    existing dark-mode toggle (independent axis from palette choice).
//
// Themes (added alongside Shopfloor Amber): a Theme reskins the UI chrome
// (see src/index.css) and is allowed to touch this preview module in two
// places — FixedColors (axes/origin/offset need to read against a
// different chrome background, e.g. rose axes instead of red/green so they
// don't fight an amber toolpath) and the **Default** palette's accents
// (Default has always meant "the app's own native look" — see the note on
// `default` below — so it tracks whichever Theme is active). Ocean/Ember/
// Violet remain theme-independent, deliberate alternate accents a user can
// still pick regardless of which Theme's chrome is showing — this is the
// "Preview Color Palette stays a choice complementing the Theme" decision.
import type { ThemeId } from '../types/theme'

export interface FixedColors {
  axisX: string
  axisY: string
  origin: string
  offset: string
  text: string
  holeFill: string
}

const FIXED_COLORS: Record<ThemeId, { light: FixedColors; dark: FixedColors }> = {
  'sloppy-indigo': {
    light: {
      axisX: '#dc2626',
      axisY: '#16a34a',
      origin: '#4f46e5',
      offset: '#d97706',
      text: '#64748b',
      holeFill: 'rgba(79, 70, 229, 0.3)',
    },
    dark: {
      axisX: '#f87171',
      axisY: '#4ade80',
      origin: '#818cf8',
      offset: '#fbbf24',
      text: '#94a3b8',
      holeFill: 'rgba(129, 140, 248, 0.3)',
    },
  },
  // Values from design_shopfloor_amber.md §2.3 — the toolpath is amber in
  // this theme, so the offset vector moves off amber to violet (the one
  // deliberate break with "no palette touches fixed colors" — a Theme is a
  // different, higher-level axis than a Palette, see the file banner
  // above), and axes shift to rose/lime so they read on a warm near-black
  // ground without fighting the amber toolpath.
  'shopfloor-amber': {
    light: {
      axisX: '#e11d48',
      axisY: '#4d7c0f',
      origin: '#1c1917',
      offset: '#7c3aed',
      text: '#78716c',
      holeFill: 'rgba(180, 83, 9, .15)',
    },
    dark: {
      axisX: '#fb7185',
      axisY: '#a3e635',
      origin: '#e7e5e4',
      offset: '#a78bfa',
      text: '#a29a8c',
      holeFill: 'rgba(245, 158, 11, .18)',
    },
  },
}

export function getFixedColors(themeId: ThemeId, isDark: boolean): FixedColors {
  const theme = FIXED_COLORS[themeId] ?? FIXED_COLORS['sloppy-indigo']
  return isDark ? theme.dark : theme.light
}

export interface PaletteAccents {
  background: string
  grid: string
  toolpath: string
  rapid: string
  hole: string
}

export type PaletteId = 'default' | 'ocean' | 'ember' | 'violet'

export interface PaletteMeta {
  id: PaletteId
  label: string
}

// Display order for the Settings swatch row and validation — id/label only;
// actual colors always come from getPaletteAccents() below (the "Default"
// entry has no fixed colors of its own, they depend on the active Theme).
export const PALETTE_LIST: PaletteMeta[] = [
  { id: 'default', label: 'Default' },
  { id: 'ocean', label: 'Ocean' },
  { id: 'ember', label: 'Ember' },
  { id: 'violet', label: 'Violet' },
]

// "Default" reproduces each theme's own native accent colors — for Sloppy
// Indigo, the original pre-BL-12 LIGHT_THEME/DARK_THEME colors, with one
// deliberate exception: `grid` was fixed post-launch (same day), not
// reproduced. BL-12 had accidentally collapsed the 3D preview's own grid
// color (`#94a3b8`/`#475569`) into the much subtler one 2D always used
// (`#e2e8f0`/`#1e293b`) — at the 3D GridHelper's 0.4 opacity that read as
// "the grid nearly disappeared", not a style choice. Fixed with a fresh
// value shared by every palette/theme — grid is a utility/orientation cue,
// not a signature accent. Shopfloor Amber's values are from
// design_shopfloor_amber.md §2.3.
const DEFAULT_ACCENTS: Record<ThemeId, { light: PaletteAccents; dark: PaletteAccents }> = {
  'sloppy-indigo': {
    light: { background: '#ffffff', grid: '#c0bfbc', toolpath: '#16a34a', rapid: '#cbd5e1', hole: '#94a3b8' },
    dark: { background: '#0f172a', grid: '#5e5c64', toolpath: '#4ade80', rapid: '#334155', hole: '#475569' },
  },
  'shopfloor-amber': {
    light: { background: '#fffdf8', grid: '#d6d1c7', toolpath: '#b45309', rapid: '#d6d1c7', hole: '#a8a29e' },
    dark: { background: '#0a0a0b', grid: '#3a3630', toolpath: '#fbbf24', rapid: '#3a3630', hole: '#57534e' },
  },
}

// The three theme-independent alternate accents — unchanged by which Theme
// is active, exactly as before Themes existed. "Ember" avoids amber
// (`#d97706`/`#fbbf24` is Sloppy Indigo's fixed `offset` color, and IS
// Shopfloor Amber's own toolpath color) so its own toolpath accent never
// gets mistaken for an offset vector or a theme's native look.
const ALTERNATE_PALETTES: Record<Exclude<PaletteId, 'default'>, { light: PaletteAccents; dark: PaletteAccents }> = {
  ocean: {
    light: { background: '#ffffff', grid: '#c0bfbc', toolpath: '#0891b2', rapid: '#94a3b8', hole: '#64a0b8' },
    dark: { background: '#0f172a', grid: '#5e5c64', toolpath: '#22d3ee', rapid: '#3f4b5c', hole: '#3d5a6b' },
  },
  ember: {
    light: { background: '#ffffff', grid: '#c0bfbc', toolpath: '#c2410c', rapid: '#a8a29e', hole: '#8a7a6d' },
    dark: { background: '#0f172a', grid: '#5e5c64', toolpath: '#fb923c', rapid: '#44403c', hole: '#57453a' },
  },
  violet: {
    light: { background: '#ffffff', grid: '#c0bfbc', toolpath: '#7c3aed', rapid: '#a5a3b8', hole: '#8b7fae' },
    dark: { background: '#0f172a', grid: '#5e5c64', toolpath: '#a78bfa', rapid: '#3f3d56', hole: '#4c4166' },
  },
}

export function getPaletteAccents(paletteId: PaletteId, isDark: boolean, themeId: ThemeId): PaletteAccents {
  const mode = isDark ? 'dark' : 'light'
  if (paletteId === 'default') {
    const theme = DEFAULT_ACCENTS[themeId] ?? DEFAULT_ACCENTS['sloppy-indigo']
    return theme[mode]
  }
  const palette = ALTERNATE_PALETTES[paletteId] ?? DEFAULT_ACCENTS['sloppy-indigo']
  return palette[mode]
}

// 3D (Three.js) colors are numeric 0xrrggbb; 2D (Canvas) colors are hex
// strings — this converts once instead of maintaining two literal copies of
// every value.
export function hexToThreeColor(hex: string): number {
  return parseInt(hex.slice(1), 16)
}
