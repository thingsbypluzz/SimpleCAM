import type { WizardParams } from '../../types/wizard'
import { OUTLINE_METHOD_LIST, outlineMethodFamily } from '../../config/outlineMeta'

interface OutlineMethodPickerProps {
  params: WizardParams
  onChange: (patch: Partial<WizardParams>) => void
}

// Same compact toggle style as MethodPicker.tsx, but the option list is
// shape-family-aware: Ramp/Standard for the two rectangle shapes,
// Helix/Standard for Circle — see config/outlineMeta.ts.
export function OutlineMethodPicker({ params, onChange }: OutlineMethodPickerProps) {
  const { outline } = params
  const methods = OUTLINE_METHOD_LIST[outlineMethodFamily(outline.shape)]
  return (
    <div className="flex gap-2">
      {methods.map((method) => {
        const isSelected = outline.method === method.value
        return (
          <button
            key={method.value}
            type="button"
            onClick={() => onChange({ outline: { ...outline, method: method.value } })}
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
