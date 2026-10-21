import type { WizardParams } from '../../types/wizard'
import { POCKET_CONTOUR_METHOD_LIST, POCKET_METHOD_LIST } from '../../config/pocketMethodMeta'
import { isPocketContour } from '../../lib/pocketContour'

interface PocketMethodPickerProps {
  params: WizardParams
  onChange: (patch: Partial<WizardParams>) => void
}

// Same compact toggle style as SurfaceMethodPicker.tsx — both Pocket
// methods are valid for every shape. With Bottom Open (BL-82) the contour's
// own Ramp / Standard instead; the stored Spiral / Adaptive stays.
export function PocketMethodPicker({ params, onChange }: PocketMethodPickerProps) {
  const { pocket } = params
  const contour = isPocketContour(pocket)
  const methods = contour ? POCKET_CONTOUR_METHOD_LIST : POCKET_METHOD_LIST
  return (
    <div className="flex gap-2">
      {methods.map((method) => {
        const isSelected = (contour ? pocket.contourMethod : pocket.method) === method.value
        return (
          <button
            key={method.value}
            type="button"
            aria-pressed={isSelected}
            onClick={() =>
              onChange({
                pocket: contour
                  ? { ...pocket, contourMethod: method.value as typeof pocket.contourMethod }
                  : { ...pocket, method: method.value as typeof pocket.method },
              })
            }
            title={method.description}
            className={[
              'rounded-md border px-2.5 py-1 text-xs font-medium transition pointer-coarse:min-h-11 pointer-coarse:px-4 pointer-coarse:text-sm',
              isSelected
                ? 'border-selected-border bg-selected-bg text-selected-fg shadow-[var(--glow-selected)]'
                : 'border-border text-muted hover:border-field-border',
            ].join(' ')}
          >
            {'label' in method ? method.label : method.shortLabel}
          </button>
        )
      })}
    </div>
  )
}
