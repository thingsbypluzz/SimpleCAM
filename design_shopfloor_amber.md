# Shopfloor Amber — theme spec for OnlyPaths

Target: replace the indigo/slate palette with a warm amber-on-near-black scheme, in both dark
and light mode, across the UI chrome **and** the 2D/3D preview accents.

Source of the current values: Tailwind's `slate`/`indigo`/`amber` scales as used in
`src/App.tsx`, `src/components/**`, plus `src/config/palettes.ts`.

---

## 1. Design intent

- **Chrome**: near-black warm greys (not slate — slate is blue-tinted). Amber is the single
  interactive accent: selected states, active tabs, primary buttons, preset slots, icons.
  **Icons specifically means every icon rendered in the Step N Summary (collapsed wizard
  columns) — not just the icon tied to the active selection.** All of them (BIT, DEPTH, FEED,
  PLUNGE, STEP, STARTZ, OFFSET, TABS, SIZE, METHOD, the pattern/shape icon, ...) share the one
  dominant accent color, uniformly, via the shared `MiniStat` icon wrapper — a single-hue
  "signature" treatment, not a state indicator. (First pass under-applied this: only the
  pattern/shape icon and the METHOD icon were tinted, the rest stayed on the neutral `muted`
  color inherited from the pre-theme default — fixed by tinting `MiniStat`'s icon wrapper
  itself instead of individual call sites, which also applies to Sloppy Indigo, not just this
  theme, since it's one shared component.)
- **Preview**: the toolpath is amber too, so the offset vector **must move off amber** —
  it becomes violet. This is the one deliberate break with today's "fixed colors" rule in
  `palettes.ts`.
- **Axes** shift from red/green to rose/lime so they stay legible on a warm near-black ground
  and don't fight the amber toolpath.
- Contrast target: body text ≥ 4.5:1 on its background; amber-on-black accents used at
  ≥ 14px/600 or as fills, never as small grey-weight text.

---

## 2. Token table

Names below are suggested CSS custom properties. Each row lists what it replaces today.

### 2.1 UI chrome

| Token | Replaces (today) | Dark | Light |
| --- | --- | --- | --- |
| `--bg` | `bg-white` / `dark:bg-slate-950` | `#0a0a0b` | `#faf8f4` |
| `--fg` | `text-slate-900` / `dark:text-slate-100` | `#f5f2ea` | `#1c1917` |
| `--border` | `border-slate-200` / `dark:border-slate-800` | `#282520` | `#e7e2d8` |
| `--muted` | `text-slate-500` / `dark:text-slate-400` | `#a29a8c` | `#78716c` |
| `--value` | `text-slate-700` / `dark:text-slate-300` (MiniStat values, G-code text) | `#d8d2c6` | `#44403c` |
| `--accent` | `indigo-600` / `dark:indigo-400` (icons, active borders, checkbox fill) | `#f59e0b` | `#b45309` |
| `--accent-fg` | `text-indigo-700` / `dark:text-indigo-300` | `#fbbf24` | `#92400e` |
| `--accent-bg` | `bg-indigo-50` / `dark:bg-indigo-950/40` | `rgba(69,45,3,.55)` | `#fef3c7` |
| `--accent-border` | `border-indigo-300` / `dark:border-indigo-800` | `#78350f` | `#fcd34d` |
| `--accent-strong` | `border-indigo-500` (selected option, active block) | `#b45309` | `#d97706` |
| `--selected-bg` | `bg-white` / `dark:bg-indigo-900/40` (selected OptionButton) | `rgba(69,45,3,.85)` | `#ffffff` |
| `--btn-bg` | `bg-indigo-600` (Next / Generate / Download) | `#f59e0b` | `#b45309` |
| `--btn-fg` | `text-white` | `#1a1408` | `#ffffff` |
| `--btn-bg-hover` | `hover:bg-indigo-500` | `#fbbf24` | `#92400e` |
| `--tab-active-bg` | `bg-indigo-100` / `dark:bg-indigo-950` | `#3a2a06` | `#fef3c7` |
| `--tab-active-fg` | `text-indigo-700` / `dark:text-indigo-300` | `#fbbf24` | `#92400e` |
| `--code-bg` | `bg-slate-50` / `dark:bg-slate-900` (G-code `<pre>`) | `#121211` | `#f5f2ec` |
| `--field-bg` | `bg-white` / `dark:bg-slate-900` (inputClass) | `#131312` | `#ffffff` |
| `--field-border` | `border-slate-300` / `dark:border-slate-700` | `#3a3630` | `#d6d1c7` |
| `--empty-border` | empty preset slot border (`slate-200`/`slate-800`) | `#282520` | `#e7e2d8` |
| `--empty-fg` | empty preset slot / "Coming soon" (`slate-300`/`slate-700`) | `#4a4640` | `#a8a29e` |

Note on `--btn-fg`: amber is a light fill, so button labels in dark mode are near-black
(`#1a1408`), not white. In light mode the button is dark amber (`#b45309`) with white text.

### 2.2 Status colors

Amber is now the accent, so the "not generated yet" badge can no longer be amber — it moves
to rose. `step4Badge()` in `App.tsx` and the machine-fit warning box in `Step4Output.tsx`:

| State | Replaces | Dark bg / fg | Light bg / fg |
| --- | --- | --- | --- |
| Not generated (`XIcon`) | `amber-100 / amber-700`, `amber-950 / amber-300` | `#4c0519` / `#fda4af` | `#ffe4e6` / `#be123c` |
| Generated (`CheckIcon`) | `indigo-100 / indigo-700`, `indigo-950 / indigo-300` | `#3a2a06` / `#fbbf24` | `#fef3c7` / `#92400e` |
| Machine-fit warning | `orange-200 / black`, `orange-950/60 / orange-300` | `#4c0519` / `#fda4af` | `#ffe4e6` / `#be123c` |
| Validation error text | `text-red-600` / `dark:text-red-400` | `#fb7185` | `#be123c` |
| "✓ Saved" in Settings | `emerald-600` / `emerald-400` | `#a3e635` | `#4d7c0f` |
| Delete-preset ✕ badge | `red-100 / red-600`, `red-950 / red-400` | `#4c0519` / `#fda4af` | `#ffe4e6` / `#be123c` |

### 2.3 Preview colors — `src/config/palettes.ts`

**Palette accents** (`PaletteAccents`, the part a palette is allowed to change):

| Field | Dark | Light |
| --- | --- | --- |
| `background` | `#0a0a0b` | `#fffdf8` |
| `grid` | `#3a3630` | `#d6d1c7` |
| `toolpath` | `#fbbf24` | `#b45309` |
| `rapid` | `#3a3630` | `#d6d1c7` |
| `hole` | `#57534e` | `#a8a29e` |

**Fixed colors** (`FixedColors`) — these change too in this theme, which is a deliberate
departure from the BL-12 note that says no palette may touch them:

| Field | Dark | Light | Why |
| --- | --- | --- | --- |
| `axisX` | `#fb7185` | `#e11d48` | rose reads better than pure red on warm black |
| `axisY` | `#a3e635` | `#4d7c0f` | lime keeps the X/Y red-vs-green convention without muddying against amber |
| `origin` | `#e7e5e4` | `#1c1917` | neutral, so the origin dot never looks like an accent |
| `offset` | `#a78bfa` | `#7c3aed` | **moved off amber** — the toolpath is amber now |
| `text` | `#a29a8c` | `#78716c` | matches `--muted` |
| `holeFill` | `rgba(245,158,11,.18)` | `rgba(180,83,9,.15)` | amber tint replacing the indigo tint |

Because `offset`/`axis` are now theme-dependent, the cleanest implementation is to fold
`FixedColors` into the `Palette` type (a `fixed` block per palette, per mode) rather than
keeping the two module-level `FIXED_COLORS_LIGHT/DARK` constants. If you'd rather keep the
existing shape, add Shopfloor Amber as a new `PaletteId` and let `getFixedColors()` take the
`paletteId` as well as `isDark`.

3D (`buildScene.ts`) consumes the same values through `hexToThreeColor()` — the
`rgba(...)` entries need their own handling there (they already do; `holeFill` is 2D-only).

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

- The Settings ▸ Appearance swatch row renders `palette.light.toolpath` / `palette.dark.toolpath`
  as two dots — with amber on both sides the four palettes need distinguishable dots; verify
  Ember (`#c2410c`/`#fb923c`) doesn't read as a duplicate of the new default.
- `disabled:opacity-40` on the amber Generate button in dark mode: check it still reads as
  disabled rather than just dim-amber; if not, add an explicit disabled background.
- Tab dash rendering (`TAB_DASH`) is drawn in the toolpath color — confirm dashed amber arcs
  are still distinguishable from the solid ones on `#0a0a0b`.
- Focus rings: `focus:ring-indigo-500` in `inputClass` and the checkbox styles must become
  `--accent-strong`, or focus disappears against amber borders.
