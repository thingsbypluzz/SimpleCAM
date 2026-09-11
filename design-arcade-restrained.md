# Arcade Cabinet — restrained — theme spec for SimpleCAM

Target: the 80s arcade-cabinet skin, tuned for an eight-hour working session. Same palette and
same intent as *Arcade Cabinet — full neon*, with the glow pulled back to roughly half and the
CRT overlay removed entirely. **The layout does not change** — same grid, same column widths,
same paddings, same type sizes and weights as today. Everything below is surface.

Based on the *Arcade Studio Console* design system. Dark mode only (see §5).

This is the variant to ship if the theme is going to be the app default. The full-neon variant
is the demo/marketing look.

---

## 1. Design intent

- **Cabinet black ground** (`#0b0c10`), identical to the full-neon variant.
- **Two accents, two jobs.** Cyan = *active / structural*: icons, active step borders, active
  tabs, checkbox fills, block outlines, the toolpath. Pink `#ff2a85` = *your data and your
  commit action*: every numeric value, the selected option row, the primary buttons.
- **Glow is mostly inset.** The difference from full neon: outer bloom is reserved for the
  primary button alone. Everything else gets a faint inner glow that suggests backlight
  without haloing into its neighbours. Accent hues are also stepped down one notch
  (`#00d5e3` instead of `#00f0ff`) so long stretches of chrome don't vibrate.
- **No scanlines.** The CRT film is what tires the eye first; it's gone here.
- Contrast: body text ≥ 4.5:1 on `#0b0c10`; neon colors used at ≥ 14px/600, as fills, or as
  monospace numerals — never as small grey-weight prose.

---

## 2. Token table — UI chrome

Suggested CSS custom properties, with the class each one replaces today. Rows marked **=** are
identical to the full-neon variant.

| Token | Replaces (today) | Value | |
| --- | --- | --- | --- |
| `--bg` | `dark:bg-slate-950` | `#0b0c10` | = |
| `--fg` | `dark:text-slate-100` | `#e3e2e8` | = |
| `--border` | `dark:border-slate-800` | `#1e2230` | = |
| `--muted` | `dark:text-slate-400` | `#849495` | = |
| `--value` | `dark:text-slate-300` (G-code body text) | `#b9cacb` | = |
| `--accent` | `dark:indigo-400` (icons, checkbox fill, active borders) | `#00d5e3` | |
| `--accent-fg` | `dark:text-indigo-300` | `#7df4ff` | = |
| `--accent-bg` | `dark:bg-indigo-950/40` | `rgba(0,240,255,.06)` | |
| `--accent-border` | `dark:border-indigo-800` | `rgba(0,240,255,.28)` | |
| `--accent-strong` | `border-indigo-500` (active block outline) | `#00b3c4` | |
| `--selected-bg` | `dark:bg-indigo-900/40` (selected OptionButton) | `rgba(255,42,133,.11)` | |
| `--selected-border` | `border-indigo-500` on the selected row | `#d1005f` | |
| `--selected-icon` | the icon inside the selected row | `#ff5fa8` | |
| `--stat-value` | `dark:text-slate-300` in `MiniStat` | `#ff2a85` | = |
| `--btn-bg` | `bg-indigo-600` (Next / Generate / Download) | `linear-gradient(180deg,#ff4d9c 0%,#d1005f 100%)` | |
| `--btn-fg` | `text-white` | `#ffffff` | = |
| `--tab-active-bg` | `dark:bg-indigo-950` | `rgba(0,240,255,.12)` | |
| `--tab-active-fg` | `dark:text-indigo-300` | `#7df4ff` | = |
| `--code-bg` | `dark:bg-slate-900` (G-code `<pre>`) | `#0d0e12` | = |
| `--field-bg` | `dark:bg-slate-900` (inputClass) | `#0b0c10` | = |
| `--field-border` | `dark:border-slate-700` | `#1e2230` | = |
| `--empty-border` | slot border / "Coming soon" border | `#1e2230` | = |
| `--empty-fg` | `dark:text-slate-700` (disabled text) | `#3f4b52` | = |

The button gradient is two stops instead of three: no light top highlight, so it reads as a
solid pink key rather than a glossy arcade button.

### Wordmark

`SimpleCAM` splits into two spans — same font size, same weight, same position:

| Part | Color | Glow |
| --- | --- | --- |
| `Simple` | `#00f0ff` | `0 0 8px rgba(0,240,255,.35)` |
| `CAM` | `#ff2a85` | `0 0 8px rgba(255,42,133,.30)` |

Letter-spacing `.06em`. Note the wordmark keeps full-strength `#00f0ff` — it's the one place
the brighter cyan is worth it, and it's a single short string.

---

## 3. Effect tokens

| Token | Applies to | Value |
| --- | --- | --- |
| `--ui-font` | app chrome | `'Space Grotesk', ui-sans-serif, system-ui, sans-serif` |
| `--mono-font` | G-code pane, MiniStat numerals | unchanged |
| `--frame-glow` | app frame / outermost container | `0 0 0 1px rgba(0,240,255,.10)` |
| `--glow-accent` | active step slot, active tab, active block, checkbox, ✓ badge, free preset slot | `inset 0 0 6px rgba(0,240,255,.10)` |
| `--glow-selected` | the selected option row | `inset 0 0 6px rgba(255,42,133,.14)` |
| `--glow-btn` | primary buttons | `0 0 10px rgba(255,42,133,.28)` |
| `--glow-warn` | "not generated" ✕ badge, machine-fit warning | `0 0 8px rgba(255,0,127,.28)` |
| `--text-glow` | accent-colored labels on active chrome | `none` |
| `--preview-inset` | preview pane | `inset 0 0 60px rgba(0,240,255,.05)` |
| `--path-glow` | toolpath + axis strokes (SVG `filter`) | `drop-shadow(0 0 3px rgba(0,240,255,.5))` |
| `--scan` | CRT overlay | `none` |

Two structural differences from full neon worth calling out:

- **`--text-glow` is `none`.** No text-shadow anywhere except the wordmark. This is the single
  biggest legibility win — glowing 10–12px labels are what makes the full-neon variant tiring.
- **`--scan` is `none`.** Keep the overlay element in the markup driven by the token so the two
  variants share one component; it renders as nothing here.

---

## 4. Status colors

| State | Replaces | Background / foreground |
| --- | --- | --- |
| Not generated (`XIcon`) | `amber-950 / amber-300` | `rgba(255,0,127,.14)` / `#ff8ec0` |
| Generated (`CheckIcon`) | `indigo-950 / indigo-300` | `rgba(0,240,255,.12)` / `#7df4ff` |
| Machine-fit warning | `orange-950/60 / orange-300` | `rgba(255,0,127,.14)` / `#ff8ec0` |
| Validation error text | `dark:text-red-400` | `#ff8ec0` |
| "✓ Saved" in Settings | `emerald-400` | `#39ff14` |
| Delete-preset ✕ badge | `red-950 / red-400` | `rgba(255,0,127,.14)` / `#ff8ec0` |

---

## 5. Preview colors — `src/config/palettes.ts`

**Palette accents** (`PaletteAccents`):

| Field | Value | vs. full neon |
| --- | --- | --- |
| `background` | `#0b0c10` | = |
| `grid` | `rgba(0,240,255,.10)` | fainter |
| `toolpath` | `#00d5e3` | stepped down |
| `rapid` | `#1e2230` | = |
| `hole` | `#7a3a5c` | desaturated — the hole outline is reference geometry, not an accent |

**Fixed colors** (`FixedColors`) — identical to the full-neon variant:

| Field | Value | Why |
| --- | --- | --- |
| `axisX` | `#ff007f` | arcade magenta instead of red-400 |
| `axisY` | `#39ff14` | phosphor green |
| `origin` | `#ffffff` | pure white so the origin dot is never mistaken for an accent |
| `offset` | `#ffe600` | coin-op yellow (the third system accent) |
| `text` | `#849495` | matches `--muted` |
| `holeFill` | `rgba(0,240,255,.07)` | cyan tint replacing the indigo tint |

The `hole` change is the one substantive preview difference: in full neon the hole outline is
magenta `#ff007f` and competes with the axis; here it recedes to a muted plum so the toolpath
is unambiguously the brightest thing in the pane.

**Light mode is not defined for this theme** — same reasoning as the full-neon variant: an
arcade skin on a white ground loses the idea entirely. Ship dark-only and either fall back to
an existing palette when light mode is selected, or hide the toggle while this palette is
active.

---

## 6. Semantic changes beyond color

Identical to the full-neon variant — four things changed meaning, not just hue:

1. **All MiniStat icons use `--accent`.** Previously only METHOD was indigo and the rest were
   `slate-400`. Now every stat icon (BIT, HOLE, DEPTH, FEED, PLUNGE, PITCH) is cyan.
2. **All MiniStat values use `--stat-value`** (pink), including the collapsed operation label
   (`SINGLE HOLE`) and the method name (`Helix`). Units (`mm`, `mm/min`) stay `--muted`.
3. **Preset slot emphasis is inverted.** Occupied slots (1, 2) render neutral — solid
   `--field-border`, `--muted` text, no glow. Free slots (3, 4, 5) render as the accent, plus
   `--glow-accent`. The highlight means "available to save into", not "in use".
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

Because this variant and the full-neon one differ **only** in token values, implement them as
two value sets over one set of names — `.dark[data-skin="arcade"]` and
`.dark[data-skin="arcade-neon"]`. No component should branch on which variant is active.

Font: add Space Grotesk (weights 400/500/600/700) via `<link>` in `index.html` or a
`@font-face`, and set it as the sans stack. The mono stack stays as-is — G-code must keep a
true fixed-width face.

Files that carry color and will need touching:
`src/index.css`, `index.html` (font), `src/App.tsx` (frame, wordmark, step slots, tabs,
preset slots), `src/components/SettingsModal.tsx`,
`src/components/wizard/FieldRow.tsx` (`inputClass`), `Step1Positioning.tsx`,
`Step2GeometryHoles.tsx`, `Step2GeometryOutline.tsx`, `Step3Feeds.tsx`, `Step4Output.tsx`,
`MethodPicker.tsx`, `OutlineMethodPicker.tsx`, `OffsetModePicker.tsx`, `MiniStat.tsx`,
`HintPopover.tsx`, `src/config/palettes.ts`, `src/components/preview3d/buildScene.ts`.

---

## 8. Things to check after implementing

- **Is the inset glow visible at all?** `inset 0 0 6px rgba(0,240,255,.10)` is near the
  threshold. On a low-contrast monitor it may vanish, leaving flat bordered boxes — which is an
  acceptable outcome, but check that active vs. inactive states are still distinguishable
  *without* it (they should be: border color and background tint carry the state on their own).
- **`--accent` at `#00d5e3` against `--accent-fg` at `#7df4ff`.** Two close cyans in the same
  component (icon stroke vs. label) can look like a mistake. If it does, drop `--accent-fg`
  to `#67e8f9`.
- **Focus rings.** `focus:ring-indigo-500` must become `--accent-strong` (`#00b3c4`). This is
  darker than the full-neon equivalent — verify the ring is still obvious on `#0b0c10`; if not,
  use `#00d5e3` for focus specifically.
- **`disabled:opacity-40` on the gradient Generate button.** Add an explicit disabled state:
  flat `#1e2230`, `--muted` text, no glow.
- **Print / PDF export.** Suppress the remaining glows in a `@media print` block.
- **`prefers-contrast: more`.** The faint borders (`rgba(0,240,255,.28)`) should go solid
  `#00d5e3`.
- **Palette collision in Settings ▸ Appearance.** The swatch row shows
  `palette.light.toolpath` / `palette.dark.toolpath` as two dots. This theme's dark toolpath
  (`#00d5e3`) is very close to the existing **Ocean** palette (`#22d3ee`) — decide whether
  Ocean stays, and note that a dark-only palette has no light dot to show at all, so the
  swatch component needs a single-dot case.
