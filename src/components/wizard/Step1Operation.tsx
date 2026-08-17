import type { WizardParams } from '../../types/wizard'
import { OPERATION_LIST } from '../../config/operationMeta'

interface Step1OperationProps {
  params: WizardParams
  onChange: (patch: Partial<WizardParams>) => void
}

export function Step1Operation({ params, onChange }: Step1OperationProps) {
  return (
    <div className="flex flex-col gap-4">
      {OPERATION_LIST.map((op) => {
        const isSelected = params.operation === op.value
        return (
          <button
            key={op.value}
            type="button"
            onClick={() => onChange({ operation: op.value })}
            className={[
              'flex flex-col gap-2 rounded-lg border p-5 text-left transition',
              isSelected
                ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500 dark:bg-indigo-950/40'
                : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600',
            ].join(' ')}
          >
            <op.Icon className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {op.title}
            </span>
            <span className="text-sm text-slate-600 dark:text-slate-400">
              {op.description}
            </span>
          </button>
        )
      })}
    </div>
  )
}
