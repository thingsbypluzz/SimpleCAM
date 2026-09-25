import type { ReactNode } from 'react'
import { HintPopover } from './HintPopover'

interface FieldRowProps {
  label: string
  hint?: string
  // Short status note shown inline after the label (e.g. "chip thinning
  // applied") — smaller and lighter than the label itself.
  annotation?: ReactNode
  children: ReactNode
}

export function FieldRow({ label, hint, annotation, children }: FieldRowProps) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-value">
        {label}
        {annotation && <span className="ml-1.5 text-xs font-normal">{annotation}</span>}
      </span>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        {hint && <HintPopover text={hint} />}
      </div>
    </label>
  )
}

export const inputClass =
  'w-full rounded-md border border-field-border bg-field-bg px-3 py-2 text-sm text-fg shadow-sm focus:border-accent-strong focus:outline-none focus:ring-1 focus:ring-accent-strong'
