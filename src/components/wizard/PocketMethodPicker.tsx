import type { WizardParams } from '../../types/wizard'
import { pocketMethodListForShape } from '../../config/pocketMethodMeta'

interface PocketMethodPickerProps {
  params: WizardParams
  onChange: (patch: Partial<WizardParams>) => void
}

// Same compact toggle style as SurfaceMethodPicker.tsx — but filtered by
// shape first (pocketMethodListForShape), since unlike Surface's two
// methods (both valid for its one shape family), Pocket's Raster is
// Rectangle-only — Circle only ever shows Spiral (see pocketMethodMeta.ts).
export function PocketMethodPicker({ params, onChange }: PocketMethodPickerProps) {
  const { pocket } = params
  const methods = pocketMethodListForShape(pocket.shape)
  return (
    <div className="flex gap-2">
      {methods.map((method) => {
        const isSelected = pocket.method === method.value
        return (
          <button
            key={method.value}
            type="button"
            onClick={() => onChange({ pocket: { ...pocket, method: method.value } })}
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
