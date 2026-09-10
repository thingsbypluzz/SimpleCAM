import type { ReactNode } from 'react'

interface MiniStatProps {
  icon: ReactNode
  label: string
  value: string
  unit?: string
  title: string
}

export function MiniStat({ icon, label, value, unit, title }: MiniStatProps) {
  return (
    <div className="flex flex-col items-center gap-1" title={title}>
      <span className="whitespace-nowrap text-[9px] font-semibold text-muted">
        {label}
      </span>
      {/* Every Step N Summary icon shares the theme's accent color — the
          dominant, single-hue "signature" treatment (icons.md-style
          consistency), not just the icon(s) tied to an active selection.
          An icon passed in with its own explicit color class (rare) still
          wins locally over this wrapper. */}
      <span className="text-accent">{icon}</span>
      <span className="whitespace-nowrap text-[10px] leading-none font-medium text-value">
        {/* Machine-coordinate readouts (BIT, DEPTH, FEED, ...) get the
            monospace/tabular treatment so digit columns line up across
            steps, instead of blending into the same proportional sans as
            every label — see apple-design review, "font-mono for
            instrument readouts". */}
        <span className="font-mono tabular-nums">{value}</span>
        {unit && (
          <span className="text-muted">
            {' '}
            {unit}
          </span>
        )}
      </span>
    </div>
  )
}
