interface IconProps {
  className?: string
}

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function HelixIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M8 4c0 1.5 8 1.5 8 3s-8 1.5-8 3 8 1.5 8 3-8 1.5-8 3 8 1.5 8 3" />
    </svg>
  )
}

export function StandardHoleIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" />
    </svg>
  )
}

export function BitIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M9 3h6v9l-3 7-3-7V3Z" />
      <path d="M9 7h6M9 10.5h6" />
    </svg>
  )
}

export function DiameterIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8" />
      <path d="M6.3 17.7 17.7 6.3" />
    </svg>
  )
}

export function DepthIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6 4h4M14 4h4" />
      <path d="M12 4v14" />
      <path d="M8 14l4 4 4-4" />
    </svg>
  )
}

export function FeedIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 12h14" />
      <path d="M13 7l5 5-5 5" />
    </svg>
  )
}

// Plunge Rate: an arrow descending straight into a surface line — the Z
// feed used while cutting down into the material. Distinct from DepthIcon
// (measurement ticks at top, no surface) and StepdownIcon (staircase).
export function PlungeIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3v13" />
      <path d="M8 13l4 4 4-4" />
      <path d="M4 20h16" strokeWidth={1} />
    </svg>
  )
}

// Start Z: mirror of PlungeIcon (arrow + surface line) but pointing up,
// plus a small "+" mark — the workpiece's raised starting plane (+Z).
export function StartZIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M11 20V7" />
      <path d="M7 11l4-4 4 4" />
      <path d="M4 20h14" strokeWidth={1} />
      <path d="M19 3v4M17 5h4" strokeWidth={1.4} />
    </svg>
  )
}

export function StepdownIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 20h4v-4h4v-4h4v-4h4" />
    </svg>
  )
}

// Cartesian axes (full cross, thin) + a bold arrow from the origin toward
// quadrant I (up-right, 45°) — a static, generic "offset" symbol (Step 2
// collapsed-bar annotation). Deliberately doesn't rotate to match the real
// offset direction — that's what the amber vector in the 2D/3D previews is
// for; this icon is just a subtle marker that an offset is set.
export function OffsetIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 2v20M2 12h20" strokeWidth={1} />
      <path d="M12 12 18 6" strokeWidth={2.4} />
      <path d="M14.1 6.35 18 6 17.7 9.9" strokeWidth={2.4} />
    </svg>
  )
}

// Positioning-mode badges for the Step 2 collapsed bar — one per
// PositioningMode, each a small pictogram of the point layout rather than
// generic text (see CLAUDE.md "Ikony w podsumowaniu Kroku 2").

// Single (0,0): crosshair through a filled center dot — the classic
// "one point at the origin" symbol.
export function SingleIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3v5M12 16v5M3 12h5M16 12h5" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

// Rectangular Grid: 4 corner points connected by a thin outline, with the
// bottom-left corner (the origin, (0,0)) drawn larger than the other three.
export function RectangleIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6 18h12M18 18V6M18 6H6M6 6v12" strokeWidth={1} />
      <circle cx="18" cy="6" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="18" cy="18" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="6" cy="6" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="6" cy="18" r="2.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

// Rectangular Grid (Centered): same 4-corner outline, but the origin has
// moved to the rectangle's center, so the larger point moves there too.
export function RectangleCenteredIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6 18h12M18 18V6M18 6H6M6 6v12" strokeWidth={1} />
      <circle cx="18" cy="6" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="18" cy="18" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="6" cy="6" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="6" cy="18" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

// N-Holes on Circle: circle outline with a few dots around the
// circumference (the holes) and a larger dot at the center (the origin).
export function CircleHolesIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8" strokeWidth={1} />
      <circle cx="12" cy="4" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="19.1" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="16.3" cy="19" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="7.7" cy="19" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="4.9" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
    </svg>
  )
}

// Custom List: faint cartesian axes with a single dot in quadrant I
// (+X/+Y) — a generic "arbitrary point" symbol.
export function CustomPointsIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M5 19h14M5 19V5" strokeWidth={1} opacity={0.5} />
      <circle cx="14" cy="10" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 12l5 5L20 6" />
    </svg>
  )
}

// Step 4 collapsed-bar badge when G-Code hasn't been generated yet (or a
// param changed since the last Generate) — pairs with CheckIcon, which
// takes over once a snapshot exists.
export function XIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

// Step 4 collapsed-bar badge when the machine-fit soft warning is active
// (see machineFitWarnings() in lib/validation.ts) — takes priority over
// both CheckIcon and XIcon, since "generated but doesn't fit the machine"
// is still something the user should notice at a glance.
// Header toggle for the BL-3 preset overlay — reuses the filled-pupil-dot
// idiom already used elsewhere (e.g. SingleIcon's center dot) rather than
// introducing a new icon convention.
export function EyeIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function WarningIcon({ className }: IconProps) {
  return (
    <svg {...base} strokeWidth={3.2} className={className}>
      <path d="M12 7.5v5.5" />
      <circle cx="12" cy="16.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}
