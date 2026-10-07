import type { WizardParams } from '../../types/wizard'
import { POCKET_METHOD_LIST } from '../../config/pocketMethodMeta'
import { effectivePocketMethod } from '../../lib/pocketGeometry'

interface PocketMethodPickerProps {
  params: WizardParams
  onChange: (patch: Partial<WizardParams>) => void
}

// Same compact toggle style as SurfaceMethodPicker.tsx. Both methods work
// for every shape but the Donut, which is Spiral-only: Adaptive is disabled
// there and Spiral shows as selected whatever is stored.
export function PocketMethodPicker({ params, onChange }: PocketMethodPickerProps) {
  const { pocket } = params
  const active = effectivePocketMethod(pocket)
  return (
    <div className="flex gap-2">
      {POCKET_METHOD_LIST.map((method) => {
        const isSelected = active === method.value
        const unavailable = pocket.shape === 'donut' && method.value !== 'spiral'
        return (
          <button
            key={method.value}
            type="button"
            aria-pressed={isSelected}
            disabled={unavailable}
            onClick={() => onChange({ pocket: { ...pocket, method: method.value } })}
            title={unavailable ? 'Donut: Spiral only' : method.description}
            className={[
              'rounded-md border px-2.5 py-1 text-xs font-medium transition',
              isSelected
                ? 'border-selected-border bg-selected-bg text-selected-fg shadow-[var(--glow-selected)]'
                : unavailable
                  ? 'cursor-not-allowed border-border text-muted opacity-50'
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
