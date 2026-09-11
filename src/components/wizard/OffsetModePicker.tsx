import type { OffsetMode, WizardParams } from '../../types/wizard'
import { offsetModeLabel } from '../../config/outlineMeta'

const OFFSET_MODES: OffsetMode[] = ['inside', 'outside', 'onLine']

interface OffsetModePickerProps {
  params: WizardParams
  onChange: (patch: Partial<WizardParams>) => void
}

// Same compact toggle style as MethodPicker.tsx.
export function OffsetModePicker({ params, onChange }: OffsetModePickerProps) {
  const { outline } = params
  return (
    <div className="flex gap-2">
      {OFFSET_MODES.map((mode) => {
        const isSelected = outline.offsetMode === mode
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange({ outline: { ...outline, offsetMode: mode } })}
            className={[
              'rounded-md border px-2.5 py-1 text-xs font-medium transition',
              isSelected
                ? 'border-selected-border bg-selected-bg text-selected-fg shadow-[var(--glow-selected)]'
                : 'border-border text-muted hover:border-field-border',
            ].join(' ')}
          >
            {offsetModeLabel(mode)}
          </button>
        )
      })}
    </div>
  )
}
