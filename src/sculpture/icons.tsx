// OnlySculpture's own icons, drawn like OnlyPaths' (components/icons.tsx):
// a 24 px outline in currentColor.

interface IconProps {
  className?: string
}

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

// The step columns' stats, one icon each as in OnlyPaths' Step Summaries.

// Height: a dimension line from a technical drawing, marked H.
export function HeightIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 3.5h8M3 20.5h8M7 3.5v17M5 6l2-2.5L9 6M5 18l2 2.5L9 18" />
      <path d="M14 8.5v7M19 8.5v7M14 12h5" />
    </svg>
  )
}

// Plate: the section through one layer, its thickness marked h.
export function PlateIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M2.5 9.5h12v5h-12zM5 14.5l4-5M9 14.5l4-5" />
      <path d="M17.5 7.5v8M17.5 12a2 2 0 0 1 4 0v3.5" />
    </svg>
  )
}

// Gap: two plates with the space between them measured.
export function GapIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 3.5h18v3.5H3zM3 17h18v3.5H3z" />
      <path d="M12 9v6M10 11l2-2 2 2M10 13l2 2 2-2" />
    </svg>
  )
}

// Layers: thin plates of uneven width, one on another.
export function LayersIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M9 3.5h7v2.5H9zM6 7.5h10v2.5H6zM4 11.5h13v2.5H4zM7 15.5h13v2.5H7zM5 19.5h11v2H5z" />
    </svg>
  )
}

// Sheet: the stock sheet, dashed as in the layer view.
export function SheetIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="5" width="18" height="14" rx="0.5" strokeDasharray="3 2" />
    </svg>
  )
}

// Turn: an angle with its arc.
export function TurnIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3.5 19.5h17M3.5 19.5l11-11M11.5 19.5a8 8 0 0 0-2.35-5.65" />
    </svg>
  )
}

// Contour taken at: the plane through the plate (dashed edges), with an
// arrow to it as in a text-alignment button; the middle has none.
export function ContourIcon({ className, plane }: IconProps & { plane: 'bottom' | 'middle' | 'top' }) {
  return (
    <svg {...base} className={className}>
      {plane !== 'top' && <path d="M3 4.5h18" strokeDasharray="2.5 2" />}
      {plane !== 'bottom' && <path d="M3 19.5h18" strokeDasharray="2.5 2" />}
      {plane === 'top' && <path d="M3 4.5h18M12 19V8M9 11l3-3 3 3" />}
      {plane === 'middle' && <path d="M3 12h18" />}
      {plane === 'bottom' && <path d="M3 19.5h18M12 5v11M9 13l3 3 3-3" />}
    </svg>
  )
}

const ISLAND = 'M5 9.5c0-3 3-5 6-4.5 2.5.4 3 2.5 1.5 4.5S11 14 8.5 14 5 12 5 9.5Z'

// Separate pieces: their own screw, a bridge to the main part, or left on tabs.
export function IslandIcon({ className, mode }: IconProps & { mode: 'screw' | 'bridge' | 'none' }) {
  if (mode === 'screw')
    return (
      <svg {...base} className={className}>
        <path d="M5 12c0-4.5 4-7.5 8-6.8 3.5.6 4.3 3.8 2.3 6.8S14.5 18.5 11 18.5 5 16 5 12Z" />
        <circle cx="11" cy="12" r="1.8" />
      </svg>
    )
  if (mode === 'bridge')
    return (
      <svg {...base} className={className}>
        <path d={ISLAND} transform="translate(-2 -2)" />
        <path d="M14 17.5c0-2 2-3.5 4-3 1.8.4 2.2 2 1.3 3.5S17.8 21 16 21s-2-1.5-2-3.5Z" />
        <path d="M10 10.5l5.5 4.2M11.5 8.6l5.5 4.2" />
      </svg>
    )
  return (
    <svg {...base} className={className}>
      <path d="M8 8h8v8H8z" />
      <path d="M3 3h18v18H3z" strokeDasharray="2.5 2" />
      <path d="M12 3v5M12 16v5" strokeWidth={2.5} />
    </svg>
  )
}

// Spacers: three layers, the one between them smaller and filled.
export function SpacersIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 4h18v3.5H3zM3 16.5h18V20H3z" />
      <path d="M8.5 10h7v4h-7z" fill="currentColor" />
    </svg>
  )
}

// Holes: a plate with its master holes.
export function PlateHolesIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="4.5" width="18" height="15" rx="1.5" />
      <circle cx="8.3" cy="9" r="1.8" />
      <circle cx="15.7" cy="9" r="1.8" />
      <circle cx="12" cy="15" r="1.8" />
    </svg>
  )
}

// Rods: three steel rods.
export function RodsIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="4.5" y="3" width="3" height="18" rx="1.5" />
      <rect x="10.5" y="3" width="3" height="18" rx="1.5" />
      <rect x="16.5" y="3" width="3" height="18" rx="1.5" />
    </svg>
  )
}

// Own files: layers that get their own holes file.
export function OwnFileIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6 3h8l4 4v14H6zM14 3v4h4" />
      <circle cx="10" cy="13" r="1.3" />
      <circle cx="14" cy="16" r="1.3" />
    </svg>
  )
}

// Hub: the mounting disc with the rods' holes.
export function HubIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="7.5" r="1.5" />
      <circle cx="8.1" cy="14.3" r="1.5" />
      <circle cx="15.9" cy="14.3" r="1.5" />
    </svg>
  )
}

// Collapse every step, the preview takes the room.
export function CollapseAllIcon({ className }: IconProps) {
  return (
    <svg {...base} strokeWidth={2} className={className}>
      <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
    </svg>
  )
}

export function CopyIcon({ className }: IconProps) {
  return (
    <svg {...base} strokeWidth={2} className={className}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  )
}

export function DownloadIcon({ className }: IconProps) {
  return (
    <svg {...base} strokeWidth={2} className={className}>
      <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
    </svg>
  )
}
