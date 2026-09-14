# Arcade Cabinet — full neon — theme spec for OnlyPaths

Target: an 80s arcade-cabinet skin for OnlyPaths. **The layout does not change** — same grid,
same column widths, same paddings, same type sizes and weights as today. Everything below is
surface: color, glow, gradient, one font swap, one overlay element.

Based on the *Arcade Studio Console* design system. Dark mode only (see §5).

Source of the current values: Tailwind's `slate`/`indigo`/`amber` scales as used in
`src/App.tsx`, `src/components/**`, plus `src/config/palettes.ts`.

---

## 1. Design intent

- **Cabinet black ground** (`#0b0c10`), one step deeper than today's `slate-950`, so neon has
  something to sit on.
- **Two accents, two jobs.** Cyan `#00f0ff` = *active / structural*: icons, active step
  borders, active tabs, checkbox fills, block outlines, the toolpath. Pink `#ff2a85` =
  *your data and your commit action*: every numeric value, the selected option row, and the
  primary buttons. A user scanning the screen reads cyan as "where the app is" and pink as
  "what I set / what I press".
- **Glow is a state, not a texture.** `box-shadow`/`text-shadow` appear only on elements that
  are active, selected, or interactive. Nothing inert glows — that's what keeps this readable
  rather than a wall of light.
- **CRT film** is deliberately faint (a 4px scanline at 5.5% black). It should read as glass
  texture, not as stripes.
- Contrast: body text ≥ 4.5:1 on `#0b0c10`; neon colors used at ≥ 14px/600, as fills, or as
  monospace numerals — never as small grey-weight prose.

---

## 2. Token table — UI chrome

Suggested CSS custom properties, with the class each one replaces today.

| Token | Replaces (today) | Value |
| --- | --- | --- |
| `--bg` | `dark:bg-slate-950` | `#0b0c10` |
| `--fg` | `dark:text-slate-100` | `#e3e2e8` |
| `--border` | `dark:border-slate-800` | `#1e2230` |
| `--muted` | `dark:text-slate-400` | `#849495` |
| `--value` | `dark:text-slate-300` (G-code body text) | `#b9cacb` |
| `--accent` | `dark:indigo-400` (icons, checkbox fill, active borders) | `#00f0ff` |
| `--accent-fg` | `dark:text-indigo-300` | `#7df4ff` |
| `--accent-bg` | `dark:bg-indigo-950/40` | `rgba(0,240,255,.07)` |
| `--accent-border` | `dark:border-indigo-800` | `rgba(0,240,255,.35)` |
| `--accent-strong` | `border-indigo-500` (active block outline) | `#00f0ff` |
| `--selected-bg` | `dark:bg-indigo-900/40` (selected OptionButton) | `rgba(255,42,133,.16)` |
| `--selected-border` | `border-indigo-500` on the selected row | `#ff2a85` |
| `--selected-icon` | the icon inside the selected row | `#ff2a85` |
| `--stat-value` | `dark:text-slate-300` in `MiniStat` | `#ff2a85` |
| `--btn-bg` | `bg-indigo-600` (Next / Generate / Download) | `linear-gradient(180deg,#ff5fa8 0%,#ff2a85 45%,#d1005f 100%)` |
| `--btn-fg` | `text-white` | `#ffffff` |
| `--tab-active-bg` | `dark:bg-indigo-950` | `rgba(0,240,255,.15)` |
| `--tab-active-fg` | `dark:text-indigo-300` | `#7df4ff` |
| `--code-bg` | `dark:bg-slate-900` (G-code `<pre>`) | `#0d0e12` |
| `--field-bg` | `dark:bg-slate-900` (inputClass) | `#0b0c10` |
| `--field-border` | `dark:border-slate-700` | `#1e2230` |
| `--empty-border` | slot border / "Coming soon" border | `#1e2230` |
| `--empty-fg` | `dark:text-slate-700` (disabled text) | `#3f4b52` |

### Wordmark

`OnlyPaths` in the header splits into two spans — same font size, same weight, same position:

| Part | Color | Glow |
| --- | --- | --- |
| `Only` | `#00f0ff` | `0 0 14px rgba(0,240,255,.65)` |
| `Paths` | `#ff2a85` | `0 0 14px rgba(255,42,133,.60)` |

Letter-spacing `.06em` on the whole wordmark.

---

## 3. Effect tokens

| Token | Applies to | Value |
| --- | --- | --- |
| `--ui-font` | app chrome | `'Space Grotesk', ui-sans-serif, system-ui, sans-serif` |
| `--mono-font` | G-code pane, MiniStat numerals | unchanged (`ui-monospace, SFMono-Regular, Menlo, monospace`) |
| `--frame-glow` | app frame / outermost container | `0 0 0 1px rgba(0,240,255,.18), 0 0 44px rgba(0,240,255,.10)` |
| `--glow-accent` | active step slot, active tab, active block, checkbox, ✓ badge, free preset slot | `0 0 10px rgba(0,240,255,.40), inset 0 0 8px rgba(0,240,255,.16)` |
| `--glow-selected` | the selected option row | `0 0 10px rgba(255,42,133,.40), inset 0 0 8px rgba(255,42,133,.18)` |
| `--glow-btn` | primary buttons | `0 0 18px rgba(255,42,133,.55)` |
| `--glow-warn` | "not generated" ✕ badge, machine-fit warning | `0 0 12px rgba(255,0,127,.50)` |
| `--text-glow` | accent-colored labels on active chrome | `0 0 8px rgba(0,240,255,.55)` |
| `--preview-inset` | preview pane | `inset 0 0 70px rgba(0,240,255,.07)` |
| `--path-glow` | toolpath + axis strokes (SVG `filter`) | `drop-shadow(0 0 5px rgba(0,240,255,.85))` |

### CRT scanline overlay

One absolutely-positioned, `pointer-events:none` div as the **last child of the app frame**,
`z-index` above content:

```css
position: absolute; inset: 0; z-index: 9; pointer-events: none;
background-image: repeating-linear-gradient(
  rgba(0,0,0,0) 0 3px,
  rgba(0,0,0,.055) 3px 4px
);
background-size: 100% 4px;
opacity: .85;
```

Intentionally faint. If it reads as visible stripes at the user's DPI, drop the alpha to
`.04` rather than increasing the pitch.

---

## 4. Status colors

| State | Replaces | Background / foreground |
| --- | --- | --- |
| Not generated (`XIcon`) | `amber-950 / amber-300` | `rgba(255,0,127,.16)` / `#ff5fa8` |
| Generated (`CheckIcon`) | `indigo-950 / indigo-300` | `rgba(0,240,255,.15)` / `#7df4ff` |
| Machine-fit warning | `orange-950/60 / orange-300` | `rgba(255,0,127,.16)` / `#ff5fa8` |
| Validation error text | `dark:text-red-400` | `#ff5fa8` |
| "✓ Saved" in Settings | `emerald-400` | `#39ff14` |
| Delete-preset ✕ badge | `red-950 / red-400` | `rgba(255,0,127,.16)` / `#ff5fa8` |

---

## 5. Preview colors — `src/config/palettes.ts`

**Palette accents** (`PaletteAccents`):

| Field | Value |
| --- | --- |
| `background` | `#0b0c10` |
| `grid` | `#5e5c64` (changed from spec's original cyan `rgba(0,240,255,.14)` — BL-32; low alpha first read as practically invisible in the 2D Preview's Canvas rendering, and raising the alpha only surfaced the deeper problem: a cyan grid shares the toolpath's own hue, so the two fight for attention. Now the same neutral gray every other theme/palette already uses for grid — "a utility/orientation cue, not a signature accent" — confirmed against Arcade's background by comparing it live to the Ocean palette. Identical to Restrained's grid — the neon-intensity distinction between the two variants still shows up in toolpath/hole, not in this now-neutral grid) |
| `toolpath` | `#00f0ff` |
| `rapid` | `#1e2230` |
| `hole` | `#ff007f` |

**Fixed colors** (`FixedColors`) — all four change:

| Field | Value | Why |
| --- | --- | --- |
| `axisX` | `#ff007f` | arcade magenta instead of red-400 |
| `axisY` | `#39ff14` | phosphor green |
| `origin` | `#ffffff` | pure white so the origin dot is never mistaken for an accent |
| `offset` | `#ffe600` | coin-op yellow (the third system accent) |
| `text` | `#849495` | matches `--muted` |
| `holeFill` | `rgba(0,240,255,.09)` | cyan tint replacing the indigo tint |

The toolpath and both axis strokes carry `--path-glow` as an SVG `filter` for the phosphor
bloom. In 3D (`buildScene.ts`) the equivalent is an emissive material on the toolpath line, or
a bloom pass — check performance before adding a post-processing pass.

**Light mode is not defined for this theme.** An arcade cabinet skin on a white ground loses
the entire idea; glow becomes invisible and the neon pair drops below contrast. Recommendation:
ship Arcade Cabinet as a dark-only palette and have the light/dark toggle fall back to one of
the existing palettes when light mode is selected — or hide the toggle while this palette is
active. If a light variant is genuinely required, it needs its own spec, not a mechanical
inversion.

---

## 6. Semantic changes beyond color

Four things changed meaning, not just hue. These are intentional and need code changes, not
just token swaps:

1. **All MiniStat icons use `--accent`.** Previously only the METHOD icon was indigo and the
   rest were `slate-400`. Now every stat icon (BIT, HOLE, DEPTH, FEED, PLUNGE, PITCH) is cyan.
2. **All MiniStat values use `--stat-value`** (pink), including the collapsed operation label
   (`SINGLE HOLE`) and the method name (`Helix`). Units (`mm`, `mm/min`) stay `--muted`.
3. **Preset slot emphasis is inverted.** Occupied slots (1, 2) render neutral — solid
   `--field-border`, `--muted` text, no glow. Free slots (3, 4, 5) render as the accent —
   `--accent-border`, `--accent-bg`, `--accent-fg`, plus `--glow-accent`. The highlight now
   means "available to save into" rather than "in use".
4. **The wordmark is two-tone** (see §2).

---

## 7. Implementation route

**CSS variables + Tailwind theme extension (recommended).** Define the tokens in
`src/index.css` under `.dark`, register them with Tailwind v4's `@theme`, then swap classes:

```
slate-950 → surface           indigo-600 → accent
slate-900 → surface-raised    indigo-500 → accent-strong
slate-800 → border            indigo-300 → accent-border
slate-500 → muted             indigo-100/950 → accent-bg
slate-300/700 → value         indigo-700/300 → accent-fg
```

The glow tokens are new and need explicit application — they don't fall out of a class swap.
Suggested approach: one `.glow-accent` / `.glow-selected` / `.glow-btn` utility class each,
applied to the elements listed in §3, so glow stays greppable and removable.

Font: add Space Grotesk (weights 400/500/600/700) via `<link>` in `index.html` or a
`@font-face`, and set it as the sans stack. The mono stack stays as-is — G-code must keep a
true fixed-width face.

Files that carry color and will need touching:
`src/index.css`, `index.html` (font), `src/App.tsx` (frame, wordmark, step slots, tabs,
scanline overlay, preset slots), `src/components/SettingsModal.tsx`,
`src/components/wizard/FieldRow.tsx` (`inputClass`), `Step1Positioning.tsx`,
`Step2GeometryHoles.tsx`, `Step2GeometryOutline.tsx`, `Step3Feeds.tsx`, `Step4Output.tsx`,
`MethodPicker.tsx`, `OutlineMethodPicker.tsx`, `OffsetModePicker.tsx`, `MiniStat.tsx`,
`HintPopover.tsx`, `src/config/palettes.ts`, `src/components/preview3d/buildScene.ts`.

---

## 8. Things to check after implementing

- **Glow stacking.** Several glowing elements adjacent (the five preset slots, the step strip)
  can bloom into each other. If the row looks like one smear, halve the outer blur radius
  before touching the colors.
- **Scanline over the G-code pane.** The overlay sits above everything, including 12px
  monospace text. Verify legibility at 100% zoom; if it degrades, exclude the `<pre>` from the
  overlay rather than lowering the alpha everywhere.
- **`mix-blend-mode`.** The overlay is a plain alpha gradient here. Do not add `overlay` or
  `screen` blending — it reacts badly to the gradient button and the glow shadows.
- **Focus rings.** `focus:ring-indigo-500` must become `--accent-strong` (`#00f0ff`), or focus
  vanishes against cyan borders. Given everything glows, consider a solid 2px ring rather than
  a shadow-based one so focus stays distinguishable from decoration.
- **`disabled:opacity-40` on the gradient Generate button.** A 40%-opacity gradient with glow
  still looks enabled. Add an explicit disabled state: flat `#1e2230`, `--muted` text, no glow.
- **Print / PDF export.** The scanline overlay and glows will render in print. Suppress both
  in a `@media print` block.
- **`prefers-reduced-motion` / `prefers-contrast`.** No animation here, so motion is fine, but
  under `prefers-contrast: more` the faint borders (`rgba(0,240,255,.35)`) should go solid.
