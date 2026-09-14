# Cyan Steel — theme spec for OnlyPaths

Target: replace the indigo/slate palette with a cool, technical cyan-on-deep-teal scheme, in
both dark and light mode, across the UI chrome **and** the 2D/3D preview accents.

Source of the current values: Tailwind's `slate`/`indigo`/`amber` scales as used in
`src/App.tsx`, `src/components/**`, plus `src/config/palettes.ts`.

---

## 1. Design intent

- **Chrome**: deep blue-green near-black (cooler and darker than today's slate), with cyan as
  the single interactive accent: selected states, active tabs, primary buttons, preset slots,
  icons.
- **Preview**: cyan toolpath on the dark ground — bright, thin, reads like an oscilloscope
  trace. Amber stays reserved for the offset vector (it's the only warm color in the scheme,
  so it pops without competing).
- **Axes** keep the red/green CNC convention but shift to rose/emerald in dark mode so they
  survive on the teal-black ground; light mode keeps the literal red/green.
- **Origin** moves to violet so it is distinguishable from both the cyan toolpath and the
  amber offset vector.
- Contrast target: body text ≥ 4.5:1 on its background; cyan-on-black accents used at
  ≥ 14px/600 or as fills, never as small grey-weight text.

---

## 2. Token table

Names below are suggested CSS custom properties. Each row lists what it replaces today.

### 2.1 UI chrome

| Token | Replaces (today) | Dark | Light |
| --- | --- | --- | --- |
| `--bg` | `bg-white` / `dark:bg-slate-950` | `#071013` | `#f6fafb` |
| `--fg` | `text-slate-900` / `dark:text-slate-100` | `#e6f1f4` | `#0b1a1f` |
| `--border` | `border-slate-200` / `dark:border-slate-800` | `#16282e` | `#dde8ec` |
| `--muted` | `text-slate-500` / `dark:text-slate-400` | `#8ba3ab` | `#5d7b85` |
| `--value` | `text-slate-700` / `dark:text-slate-300` (MiniStat values, G-code text) | `#cbd9de` | `#334155` |
| `--accent` | `indigo-600` / `dark:indigo-400` (icons, active borders, checkbox fill) | `#06b6d4` | `#0891b2` |
| `--accent-fg` | `text-indigo-700` / `dark:text-indigo-300` | `#67e8f9` | `#0e7490` |
| `--accent-bg` | `bg-indigo-50` / `dark:bg-indigo-950/40` | `rgba(8,51,68,.55)` | `#ecfeff` |
| `--accent-border` | `border-indigo-300` / `dark:border-indigo-800` | `#155e75` | `#67e8f9` |
| `--accent-strong` | `border-indigo-500` (selected option, active block) | `#0e7490` | `#06b6d4` |
| `--selected-bg` | `bg-white` / `dark:bg-indigo-900/40` (selected OptionButton) | `rgba(8,51,68,.90)` | `#ffffff` |
| `--btn-bg` | `bg-indigo-600` (Next / Generate / Download) | `#0891b2` | `#0891b2` |
| `--btn-fg` | `text-white` | `#03161c` | `#ffffff` |
| `--btn-bg-hover` | `hover:bg-indigo-500` | `#22d3ee` | `#0e7490` |
| `--tab-active-bg` | `bg-indigo-100` / `dark:bg-indigo-950` | `#083344` | `#cffafe` |
| `--tab-active-fg` | `text-indigo-700` / `dark:text-indigo-300` | `#67e8f9` | `#0e7490` |
| `--code-bg` | `bg-slate-50` / `dark:bg-slate-900` (G-code `<pre>`) | `#0a171b` | `#f0f6f8` |
| `--field-bg` | `bg-white` / `dark:bg-slate-900` (inputClass) | `#0a171b` | `#ffffff` |
| `--field-border` | `border-slate-300` / `dark:border-slate-700` | `#1d333a` | `#c3d4da` |
| `--empty-border` | empty preset slot border (`slate-200`/`slate-800`) | `#16282e` | `#dde8ec` |
| `--empty-fg` | empty preset slot / "Coming soon" (`slate-300`/`slate-700`) | `#31474f` | `#9db6bf` |

Note on `--btn-fg`: `#0891b2` is dark enough for white text in light mode, but in dark mode
the button sits on a very dark ground and reads better with a near-black label (`#03161c`) —
that's the one asymmetry in the scheme.

### 2.2 Status colors

Cyan does not collide with amber, so the existing amber/indigo status logic survives almost
intact — only the indigo entries move to cyan. `step4Badge()` in `App.tsx` and the
machine-fit warning box in `Step4Output.tsx`:

| State | Replaces | Dark bg / fg | Light bg / fg |
| --- | --- | --- | --- |
| Not generated (`XIcon`) | `amber-100 / amber-700`, `amber-950 / amber-300` | `#422006` / `#fbbf24` | `#fef3c7` / `#b45309` |
| Generated (`CheckIcon`) | `indigo-100 / indigo-700`, `indigo-950 / indigo-300` | `#083344` / `#67e8f9` | `#cffafe` / `#0e7490` |
| Machine-fit warning | `orange-200 / black`, `orange-950/60 / orange-300` | `#431407` / `#fdba74` | `#ffedd5` / `#9a3412` |
| Validation error text | `text-red-600` / `dark:text-red-400` | `#fb7185` | `#dc2626` |
| "✓ Saved" in Settings | `emerald-600` / `emerald-400` | `#34d399` | `#047857` |
| Delete-preset ✕ badge | `red-100 / red-600`, `red-950 / red-400` | `#4c0519` / `#fda4af` | `#fee2e2` / `#dc2626` |

### 2.3 Preview colors — `src/config/palettes.ts`

**Palette accents** (`PaletteAccents`, the part a palette is allowed to change):

| Field | Dark | Light |
| --- | --- | --- |
| `background` | `#071013` | `#ffffff` |
| `grid` | `#2b4249` | `#c3d4da` |
| `toolpath` | `#22d3ee` | `#0891b2` |
| `rapid` | `#24383f` | `#c3d4da` |
| `hole` | `#3d5a6b` | `#64a0b8` |

These are close to the existing **Ocean** palette (`#22d3ee`/`#0891b2` toolpath) — Ocean is
effectively this theme's preview half already. If Cyan Steel ships as the app default,
consider dropping Ocean or re-pitching it as a lighter variant, otherwise the Appearance
swatch row shows two near-identical entries.

**Fixed colors** (`FixedColors`) — three of the four change here:

| Field | Dark | Light | Why |
| --- | --- | --- | --- |
| `axisX` | `#fb7185` | `#dc2626` | rose instead of red-400 on the teal-black ground |
| `axisY` | `#4ade80` | `#16a34a` | unchanged from today — green still works |
| `origin` | `#a78bfa` | `#7c3aed` | violet, so origin ≠ cyan toolpath and ≠ amber offset |
| `offset` | `#f59e0b` | `#d97706` | **stays amber** — the only warm hue in the scheme |
| `text` | `#8ba3ab` | `#5d7b85` | matches `--muted` |
| `holeFill` | `rgba(34,211,238,.16)` | `rgba(8,145,178,.14)` | cyan tint replacing the indigo tint |

Only `axisX` and `origin` genuinely depart from the BL-12 "fixed colors are a CNC convention"
rule. If you'd rather not touch `FixedColors` at all, this theme is the one that can live with
it: keep `axisX`/`origin` as-is and only the origin dot's indigo (`#818cf8`) will look like a
leftover of the old accent — a smaller compromise than in the amber theme.

3D (`buildScene.ts`) consumes the same values through `hexToThreeColor()`; the `rgba(...)`
entries are 2D-only.

---

## 3. Implementation route

Two options, in order of preference:

**A. CSS variables + Tailwind theme extension (recommended).** Define the tokens above in
`src/index.css` under `:root` and `.dark`, register them with Tailwind v4's `@theme` so
utilities like `bg-surface` / `text-accent` exist, then do a mechanical class swap:

```
slate-950 → surface           indigo-600 → accent
slate-900 → surface-raised    indigo-500 → accent-strong
slate-800 → border            indigo-300 → accent-border
slate-500 → muted             indigo-100/950 → accent-bg
slate-300/700 → value         indigo-700/300 → accent-fg
```

This removes the light/dark class pairs from most components: one utility, two values.

**B. Straight class replacement.** Keep the `dark:` pairs, swap each hardcoded slate/indigo
class for the hex above via arbitrary values. Faster to start, but leaves the palette
scattered across ~10 files — the same duplication `palettes.ts` was created to kill.

Files that carry color and will need touching either way:
`src/index.css`, `src/App.tsx`, `src/components/SettingsModal.tsx`,
`src/components/wizard/FieldRow.tsx` (`inputClass`), `Step1Positioning.tsx`,
`Step2GeometryHoles.tsx`, `Step2GeometryOutline.tsx`, `Step3Feeds.tsx`, `Step4Output.tsx`,
`MethodPicker.tsx`, `OutlineMethodPicker.tsx`, `OffsetModePicker.tsx`, `MiniStat.tsx`,
`HintPopover.tsx`, `src/config/palettes.ts`, `src/components/preview3d/buildScene.ts`.

---

## 4. Things to check after implementing

- Ocean vs. the new default in Settings ▸ Appearance: the swatch dots will be nearly identical
  (see §2.3). Decide whether Ocean stays.
- `--bg` (`#071013`) is darker than today's `slate-950`; check the 3D viewer's own clear color
  and ground shadow in `buildScene.ts` still separate from the page background.
- `disabled:opacity-40` on the cyan Generate button: verify it reads as disabled against the
  dark ground rather than just dim-cyan.
- Focus rings: `focus:ring-indigo-500` in `inputClass` and the checkbox styles must become
  `--accent-strong` (`#06b6d4`), or focus disappears against the cyan borders.
- The grid (`#2b4249`) is intentionally low-contrast; confirm it's still visible at the 3D
  GridHelper's 0.4 opacity — that was the exact bug the post-BL-12 grid fix addressed.
