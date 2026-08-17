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

export function StepdownIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 20h4v-4h4v-4h4v-4h4" />
    </svg>
  )
}

// Crosshair + arrow, drawn at rest pointing into quadrant I (up-right, 45°)
// — callers that need it to reflect a real direction should wrap it and
// apply `rotate(realAngleDeg - 45deg)` so the drawn 45° baseline lines up.
export function OffsetIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M9 12h6M12 9v6" />
      <path d="M12 12 18 6" />
      <path d="M14.1 6.35 18 6 17.7 9.9" />
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
