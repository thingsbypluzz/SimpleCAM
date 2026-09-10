---
name: Arcade Studio Console
colors:
  surface: '#121317'
  surface-dim: '#121317'
  surface-bright: '#38393e'
  surface-container-lowest: '#0d0e12'
  surface-container-low: '#1a1b20'
  surface-container: '#1f1f24'
  surface-container-high: '#292a2e'
  surface-container-highest: '#343439'
  on-surface: '#e3e2e8'
  on-surface-variant: '#b9cacb'
  inverse-surface: '#e3e2e8'
  inverse-on-surface: '#2f3035'
  outline: '#849495'
  outline-variant: '#3b494b'
  surface-tint: '#00dbe9'
  primary: '#dbfcff'
  on-primary: '#00363a'
  primary-container: '#00f0ff'
  on-primary-container: '#006970'
  inverse-primary: '#006970'
  secondary: '#ffb1c5'
  on-secondary: '#65002f'
  secondary-container: '#e30071'
  on-secondary-container: '#fffbff'
  tertiary: '#fff6d1'
  on-tertiary: '#373100'
  tertiary-container: '#f3db00'
  on-tertiary-container: '#6b5f00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#7df4ff'
  primary-fixed-dim: '#00dbe9'
  on-primary-fixed: '#002022'
  on-primary-fixed-variant: '#004f54'
  secondary-fixed: '#ffd9e1'
  secondary-fixed-dim: '#ffb1c5'
  on-secondary-fixed: '#3f001b'
  on-secondary-fixed-variant: '#8f0045'
  tertiary-fixed: '#fde400'
  tertiary-fixed-dim: '#dec800'
  on-tertiary-fixed: '#201c00'
  on-tertiary-fixed-variant: '#504700'
  background: '#121317'
  on-background: '#e3e2e8'
  surface-variant: '#343439'
  surface-cabinet: '#0b0c10'
  surface-deck: '#12131c'
  surface-panel: '#1a102f'
  surface-crt-bezel: '#1e2230'
  neon-cyan-glow: '#00f0ff'
  neon-magenta: '#ff007f'
  neon-amber-alert: '#ff8c00'
  neon-laser-green: '#4ade80'
  grid-line: rgba(0, 240, 255, 0.12)
  scanline-tint: rgba(255, 42, 133, 0.04)
typography:
  display-arcade:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-xl:
    fontFamily: Space Grotesk
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.01em
  headline-xl-mobile:
    fontFamily: Space Grotesk
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 34px
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: Space Grotesk
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 18px
    letterSpacing: 0.06em
  label-md:
    fontFamily: Space Grotesk
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.08em
  label-sm:
    fontFamily: Space Grotesk
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.1em
  telemetry-mono:
    fontFamily: Space Grotesk
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.04em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-lg: 1.5rem
  margin: 1rem
  margin-md: 1.5rem
  margin-lg: 2.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
  space-2xl: 3rem
---

## Brand & Style
The design system combines the visceral tactile energy of an 80s coin-op arcade cabinet with the mission-critical precision required by contemporary video capture and streaming utilities. 

Targeted at creators, streamers, retro enthusiasts, and desktop broadcast operators, the aesthetic bridges synthwave nostalgia and functional pro-audio/video interfaces. While drawing heavy inspiration from CRT monitors, glowing vector cabinets, and tactile toggle banks, the interface avoids pastiche by prioritizing strict data density, zero-latency feedback cues, and accessible, scanline-conscious legibility. 

The emotional response is immediate and electric: empowering operators to feel like they are piloting an elite neon cockpit or specialized hardware rack without sacrificing the intuitive control of modern camera tooling.

## Colors
The color architecture mimics the pitch-black ambiance of an arcade hall illuminated by phosphor glows and back-lit marquis displays.

- **Primary (`#00f0ff`):** Electric Cyan serves as the operational focal point. It indicates active video streams, standard selection outlines, primary triggers, and high-priority status indicators.
- **Secondary (`#ff2a85`):** Hot Neon Magenta provides secondary energetic emphasis. It designates recording triggers, broadcast live states, audio peak monitors, and bold decorative highlights.
- **Tertiary (`#ffe600`):** Arcade Coin-Op Yellow/Orange handles telemetry warnings, buffer slips, active sensor alerts, and key toggles.
- **Neutrals (`#0b0c10`, `#12131c`, `#1a102f`):** Dense midnight black, cabinet iron, and deep synthwave twilight form the canvas surfaces. Tints ensure interface layers stand out crisply without falling back to flat generic greys.

### Usage Directives
1. Use cyan and magenta glows sparingly on passive states; reserve intense luminous box shadows (`0 0 12px #00f0ff`, `0 0 16px #ff2a85`) strictly for active toggles, hover focuses, or live recording modes.
2. Maintain strict 4.5:1 contrast against `#0b0c10` and `#12131c` panels by rendering non-headline text in crisp high-illumination whites (`#f8fafc`) or saturated tier-one neon values.

## Typography
Typographic discipline maintains the system's dual nature: retro-futuristic arcade spirit in structural titles and pure utilitarian legibility for operational telemetry.

- **Headlines & Labels (`Space Grotesk`):** Technical, angular, and geometric. Used for HUD readouts, card titles, control labels, and metric outputs. All labels must be rendered in uppercase (`text-transform: uppercase`) with widened letter-spacing to reproduce high-score and arcade bezel typography.
- **Body (`Inter`):** Clean, neutral, and uncolored. Applied to user guides, streaming settings, modal documentation, and detailed system messages to eliminate visual fatigue during sustained broadcast sessions.

## Layout & Spacing
The layout follows a responsive modular flight-deck grid tailored for multi-monitor camera control and single-screen overlays.

- **Desktop (1024px+):** A 12-column dynamic grid anchors the central live monitor screen across 8–9 columns, reserving a 3–4 column pinned panel for hardware inputs, filters, and stream telemetry. Standard gutter is `1.5rem`.
- **Tablet (768px – 1023px):** A fluid 8-column layout stacks the camera viewport directly atop horizontal slider control banks using `1rem` gutters.
- **Mobile (Below 768px):** A 4-column layout where video preview dominates the viewport and camera controls condense into swipeable thumb-accessible arcade drawers.

Outer edges observe a strict physical enclosure margin of `1.5rem` to simulate the internal borders of a glass-faced CRT arcade monitor bezel.

## Elevation & Depth
Elevation is expressed not through generic blurred drop-shadows, but through light emissions, crisp high-voltage wireframes, and stacked dark containers.

- **Level 0 (Cabinet Deck):** Base layer `#0b0c10` with an optional subtle 24px isometric or orthographic neon grid pattern (`rgba(0, 240, 255, 0.05)`).
- **Level 1 (Sub-Panels & Racks):** `#12131c` container backings enclosed by a `1px` solid border (`#1e2230` or `rgba(0, 240, 255, 0.2)`).
- **Level 2 (Active Controls / CRT Monitor Bays):** `#1a102f` with a dual border treatment: an inner highlight of `inset 0 0 1px rgba(255, 255, 255, 0.2)` and a localized border accent of `#00f0ff`.
- **Level 3 (Engaged / Active State Glows):** Illuminated elements emit targeted neon box shadows:
  - Cyan Active: `0 0 10px rgba(0, 240, 255, 0.4), inset 0 0 8px rgba(0, 240, 255, 0.2)`
  - Recording / Hot State: `0 0 12px rgba(255, 0, 127, 0.5), inset 0 0 10px rgba(255, 0, 127, 0.25)`
- **CRT Glass Treatment:** Overlays use a CSS scanline gradient (`linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%)`) at a 4px background-size, layered beneath UI text to protect readability.

## Shapes
In alignment with 80s coin-op cabinets and industrial flight gear, curves are kept taut, restrained, and deliberate:

- **Soft Radius (`0.25rem` / `4px`):** Used universally for micro-controls, toggles, buttons, input bars, and telemetry badges. Softens raw computer-terminal harshness while preserving the machined, stamped feel of hardware keys.
- **Large Panels (`0.5rem` / `8px`):** Applied exclusively to major surface monitor frames and popover modular dialogs.
- **Chamfer Accents:** Key action buttons and high-priority badges may feature a 45-degree angled clip-path corner (`clip-path: polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 0 100%)`) to heighten the arcade vector aesthetic.

## Components

### Buttons & Switches
- **Coin-Op Push Buttons (Primary):** Solid `#00f0ff` or outline variants with `#00f0ff` text, uppercase `label-md` Space Grotesk, 1px solid `#00f0ff` border, and subtle inner glow. Hover triggers an intensified outer neon pulse. Pressing reduces visual inset to simulate mechanical spring compression.
- **Record / Broadcast Button (Critical):** Finished in `#ff007f` background with `#ffffff` text. Flashes a pulsing heartbeat glow (`0 0 18px rgba(255, 0, 127, 0.7)`) when actively recording or on-air.
- **Auxiliary Controls:** Translucent `#12131c` background, `#f8fafc` text, and faint `rgba(255, 255, 255, 0.15)` border.

### Input Fields & Selectors
- **Device Selectors / Text Boxes:** Inset dark wells (`#0b0c10`) with `1px` border in `#1e2230`. Focus states snap the border to `#00f0ff` with an internal cyan phosphor glow. Placeholder text is muted cyan (`rgba(0, 240, 255, 0.4)`).
- **Range Sliders (Gain, Saturation, Brightness):** Track height is 4px in dark plum (`#1a102f`). Active fill is bright `#00f0ff`. Thumb handle is a sharp 12px rounded-sm rectangle illuminated with neon magenta (`#ff2a85`).

### Checkboxes & Toggle Switches
- **Toggles:** Styled as industrial rocker toggles. Track is `#12131c` with a high-contrast border. Active position shifts to electric cyan with a lit LED dot indicator in the center.
- **Checkboxes:** 16x16px square with 2px corner radius. Checked state fills with `#00f0ff` and displays a bold black pixel-styled check glyph.

### Cards & Control Bay Racks
- Backed by `#12131c` or `#1a102f`. Headers feature an arcade-styled title bar with `Space Grotesk` uppercase typography, separated from the content body by a crisp 1px dividing rule (`#1e2230`).

### Badges, Status Chips & Telemetry Readouts
- **Live / Recording Badges:** Border-boxed pill with a blinking 6px LED dot. Green for stream healthy (`#4ade80`), yellow for packet/frame drops (`#ffe600`), and neon magenta for active recording (`#ff007f`).
- **Resolution / FPS Indicators:** Space Grotesk `label-sm` encased in a semi-transparent cyan wireframe box (`border: 1px solid rgba(0, 240, 255, 0.3)`).