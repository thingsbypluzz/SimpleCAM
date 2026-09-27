import type { WizardParams } from '../../types/wizard'
import { POCKET_METHOD_LIST } from '../../config/pocketMethodMeta'

interface PocketMethodPickerProps {
  params: WizardParams
  onChange: (patch: Partial<WizardParams>) => void
}

// Same compact toggle style as SurfaceMethodPicker.tsx — both Pocket
// methods are valid for every shape.
export function PocketMethodPicker({ params, onChange }: PocketMethodPickerProps) {
  const { pocket } = params
  return (
    <div className="flex gap-2">
      {POCKET_METHOD_LIST.map((method) => {
        const isSelected = pocket.method === method.value
        return (
          <button
            key={method.value}
            type="button"
            aria-pressed={isSelected}
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
