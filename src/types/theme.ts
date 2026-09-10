// UI chrome theme (Header/Wizard Section/Preview Section chrome — buttons,
// borders, badges, form fields) — a separate axis from the Preview Color
// Palette (src/config/palettes.ts, the toolpath/rapid/hole accent inside
// the 2D/3D canvas). A Theme is allowed to also shift the preview's fixed
// CNC colors (axes/origin/offset) and its "Default" palette accent, since
// those are meant to be each theme's own native look; Ocean/Ember/Violet
// stay theme-independent alternate accents layered on top, same as today.
//
// More themes are coming (user-supplied design specs, one at a time) — see
// ideas.md if a specific one is still mid-`/grill-me` rather than built.
export type ThemeId = 'sloppy-indigo' | 'shopfloor-amber'

interface ThemeSwatch {
  bg: string
  accent: string
}

export interface ThemeMeta {
  id: ThemeId
  label: string
  // Static duplicate of this theme's --bg/--accent from index.css, only for
  // rendering the Settings > Appearance picker's swatch dots — the actual
  // running app never reads these, it goes through the CSS custom
  // properties (see the `[data-theme="..."]` blocks in index.css). Keeping
  // a tiny hardcoded copy here is simpler than parsing computed styles just
  // to paint a picker swatch.
  swatchLight: ThemeSwatch
  swatchDark: ThemeSwatch
}

export const THEME_LIST: ThemeMeta[] = [
  {
    id: 'sloppy-indigo',
    label: 'Sloppy Indigo',
    swatchLight: { bg: '#ffffff', accent: '#4f46e5' },
    swatchDark: { bg: '#020617', accent: '#818cf8' },
  },
  {
    id: 'shopfloor-amber',
    label: 'Shopfloor Amber',
    swatchLight: { bg: '#faf8f4', accent: '#b45309' },
    swatchDark: { bg: '#0a0a0b', accent: '#f59e0b' },
  },
]
