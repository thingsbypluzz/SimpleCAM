import type { WizardParams } from '../../types/wizard'
import { SURFACE_METHOD_LIST } from '../../config/surfaceMethodMeta'

interface SurfaceMethodPickerProps {
  params: WizardParams
  onChange: (patch: Partial<WizardParams>) => void
}

// Same compact toggle style as MethodPicker.tsx/OutlineMethodPicker.tsx.
export function SurfaceMethodPicker({ params, onChange }: SurfaceMethodPickerProps) {
  const { surface } = params
  return (
    <div className="flex gap-2">
      {SURFACE_METHOD_LIST.map((method) => {
        const isSelected = surface.method === method.value
        return (
          <button
            key={method.value}
            type="button"
            onClick={() => onChange({ surface: { ...surface, method: method.value } })}
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
