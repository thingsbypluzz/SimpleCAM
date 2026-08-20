import type { WizardParams } from '../../types/wizard'
import { POSITIONING_LIST } from '../../config/positioningMeta'

interface Step1PositioningProps {
  params: WizardParams
  onChange: (patch: Partial<WizardParams>) => void
}

// Placeholder rows for future operation families (see CLAUDE.md /
// ideas.md "Reorganizacja taksonomii wizarda") — purely visual, no
// WizardParams field backs these, since Hole(s) is the only real family
// today. Not worth a dedicated icon per family yet (nothing to
// distinguish visually beyond the label until the family actually exists).
const FAMILY_PLACEHOLDERS = ['Outline', 'Pocket', 'Surface']

export function Step1Positioning({ params, onChange }: Step1PositioningProps) {
  const { geometry } = params

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-lg border border-indigo-500 bg-indigo-50 p-3 dark:bg-indigo-950/40">
        <span className="text-base font-semibold text-indigo-700 dark:text-indigo-300">
          Hole(s)
        </span>
        <div className="mt-2 flex flex-col gap-1">
          {POSITIONING_LIST.map((opt) => {
            const isSelected = geometry.positioning === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange({ geometry: { ...geometry, positioning: opt.value } })}
                className={[
                  'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition',
                  isSelected
                    ? 'border-indigo-500 bg-white dark:bg-indigo-900/40'
                    : 'border-transparent hover:border-slate-200 dark:hover:border-slate-700',
                ].join(' ')}
              >
                <opt.Icon className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                <span className="text-sm text-slate-800 dark:text-slate-200">{opt.title}</span>
              </button>
            )
          })}
        </div>
      </div>

      {FAMILY_PLACEHOLDERS.map((label) => (
        <div
          key={label}
          className="flex cursor-not-allowed items-center justify-between rounded-lg border border-dashed border-slate-200 px-3 py-2 opacity-60 dark:border-slate-700"
        >
          <span className="text-sm font-semibold text-slate-400 dark:text-slate-600">{label}</span>
          <span className="text-xs text-slate-400 dark:text-slate-600">Coming soon</span>
        </div>
      ))}
    </div>
  )
}
