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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Family</span>
        <div className="grid grid-cols-4 gap-2">
          <div className="flex flex-col items-center gap-0.5 rounded-md border border-indigo-500 bg-indigo-50 px-2 py-2 text-center dark:bg-indigo-950/40">
            <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
              Hole(s)
            </span>
          </div>
          {FAMILY_PLACEHOLDERS.map((label) => (
            <div
              key={label}
              className="flex cursor-not-allowed flex-col items-center gap-0.5 rounded-md border border-dashed border-slate-200 px-2 py-2 text-center opacity-60 dark:border-slate-700"
            >
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-600">
                {label}
              </span>
              <span className="text-[9px] text-slate-400 dark:text-slate-600">Coming soon</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {POSITIONING_LIST.map((opt) => {
          const isSelected = geometry.positioning === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ geometry: { ...geometry, positioning: opt.value } })}
              className={[
                'flex flex-col gap-2 rounded-lg border p-5 text-left transition',
                isSelected
                  ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500 dark:bg-indigo-950/40'
                  : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600',
              ].join(' ')}
            >
              <opt.Icon className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
              <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {opt.title}
              </span>
              <span className="text-sm text-slate-600 dark:text-slate-400">
                {opt.description}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
