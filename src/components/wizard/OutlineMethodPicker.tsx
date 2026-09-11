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
                ? 'border-selected-border bg-selected-bg text-selected-fg shadow-[var(--glow-selected)]'
                : 'border-border text-muted hover:border-field-border',
            ].join(' ')}
          >
            {method.shortLabel}
          </button>
        )
      })}
    </div>
  )
}
