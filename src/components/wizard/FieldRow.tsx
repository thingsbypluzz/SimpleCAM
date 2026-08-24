import type { ReactNode } from 'react'
import { HintPopover } from './HintPopover'

interface FieldRowProps {
  label: string
  hint?: string
  children: ReactNode
}

export function FieldRow({ label, hint, children }: FieldRowProps) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        {hint && <HintPopover text={hint} />}
      </div>
    </label>
  )
}

export const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
