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
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400',
            ].join(' ')}
          >
            {offsetModeLabel(mode)}
          </button>
        )
      })}
    </div>
  )
}
