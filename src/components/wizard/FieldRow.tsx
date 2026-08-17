import type { ReactNode } from 'react'

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
      {children}
      {hint && (
        <span className="text-xs text-slate-500 dark:text-slate-400">{hint}</span>
      )}
    </label>
  )
}

export const inputClass =
  'rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
