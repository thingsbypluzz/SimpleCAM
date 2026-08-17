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
      <span className="whitespace-nowrap text-[9px] font-semibold text-slate-400 dark:text-slate-500">
        {label}
      </span>
      <span className="text-slate-500 dark:text-slate-400">{icon}</span>
      <span className="whitespace-nowrap text-[10px] leading-none font-medium text-slate-700 dark:text-slate-300">
        {value}
        {unit && (
          <span className="text-slate-400 dark:text-slate-500">
            {' '}
            {unit}
          </span>
        )}
      </span>
    </div>
  )
}
