import type { WizardParams } from '../../types/wizard'
import { POCKET_METHOD_LIST } from '../../config/pocketMethodMeta'
import { isSpiralOnlyShape } from '../../lib/pocketLightened'

interface PocketMethodPickerProps {
  params: WizardParams
  onChange: (patch: Partial<WizardParams>) => void
}

// Same compact toggle style as SurfaceMethodPicker.tsx. Circle Lightened is
// Spiral-only for now (BL-85) — Adaptive stays visible but disabled, with
// the reason in its tooltip.
export function PocketMethodPicker({ params, onChange }: PocketMethodPickerProps) {
  const { pocket } = params
  const spiralOnly = isSpiralOnlyShape(pocket.shape)
  return (
    <div className="flex gap-2">
      {POCKET_METHOD_LIST.map((method) => {
        const isSelected = pocket.method === method.value
        const disabled = spiralOnly && method.value === 'adaptive'
        return (
          <button
            key={method.value}
            type="button"
            aria-pressed={isSelected}
            disabled={disabled}
            onClick={() => onChange({ pocket: { ...pocket, method: method.value } })}
            title={disabled ? 'Adaptive for Circle Lightened comes in a later release — it uses Spiral for now.' : method.description}
            className={[
              'rounded-md border px-2.5 py-1 text-xs font-medium transition',
              disabled ? 'cursor-not-allowed opacity-40' : '',
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
