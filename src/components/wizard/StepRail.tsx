import type { ReactNode } from 'react'

export interface StepRailItem {
  id: number
  label: string
  // One short line about what the step holds now.
  detail: ReactNode
  // The step's full summary, for a tooltip.
  title: string
}

interface StepRailProps {
  items: readonly StepRailItem[]
  activeStep: number
  onSelect: (id: number) => void
}

// BL-8: the four steps as one row of buttons above the open step — what
// the medium and narrow layouts show instead of the Step N Summary columns
// of the wide accordion. Any step opens at any time, as there.
export function StepRail({ items, activeStep, onSelect }: StepRailProps) {
  return (
    <nav aria-label="Wizard steps" className="grid shrink-0 grid-cols-4 border-b border-border">
      {items.map((item) => {
        const active = item.id === activeStep
        return (
          <button
            key={item.id}
            type="button"
            aria-current={active ? 'step' : undefined}
            title={item.title}
            onClick={() => onSelect(item.id)}
            className={[
              'flex min-h-13 min-w-0 flex-col items-center justify-center gap-0.5 border-r border-b-2 border-r-border px-1 py-1.5 last:border-r-0',
              active ? 'border-b-accent bg-accent-bg text-fg' : 'border-b-transparent text-muted hover:bg-border/40',
            ].join(' ')}
          >
            <span className="text-xs font-semibold">
              {item.id} {item.label}
            </span>
            <span className={`flex max-w-full items-center gap-1 truncate text-[11px] ${active ? 'text-accent-fg' : 'text-value'}`}>
              {item.detail}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
