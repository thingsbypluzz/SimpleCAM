import type { WizardParams } from '../../types/wizard'
import { METHOD_LIST } from '../../config/methodMeta'

interface MethodPickerProps {
  params: WizardParams
  onChange: (patch: Partial<WizardParams>) => void
}

// Compact toggle — same visual weight as the Circle Interpolation
// (arcs/segments) toggle on Step 4, not the large card-button style this
// used before it moved into Step 2 as a secondary field alongside the
// dimensions (see CLAUDE.md Etap 6).
export function MethodPicker({ params, onChange }: MethodPickerProps) {
  return (
    <div className="flex gap-2">
      {METHOD_LIST.map((method) => {
        const isSelected = params.method === method.value
        return (
          <button
            key={method.value}
            type="button"
            onClick={() => onChange({ method: method.value })}
            title={method.description}
            className={[
              'rounded-md border px-2.5 py-1 text-xs font-medium transition',
              isSelected
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400',
            ].join(' ')}
          >
            {method.shortLabel}
          </button>
        )
      })}
    </div>
  )
}
