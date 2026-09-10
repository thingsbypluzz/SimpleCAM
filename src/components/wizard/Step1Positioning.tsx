import type { ComponentType, ReactNode } from 'react'
import type { WizardParams } from '../../types/wizard'
import { POSITIONING_LIST } from '../../config/positioningMeta'
import { OUTLINE_SHAPE_LIST } from '../../config/outlineMeta'

interface Step1PositioningProps {
  params: WizardParams
  onChange: (patch: Partial<WizardParams>) => void
}

// Placeholder rows for future operations (see CLAUDE.md's "Przyszłe
// operacje") — purely visual, no WizardParams field backs these yet.
const OPERATION_PLACEHOLDERS = ['Pocket', 'Surface']

// Shared visual shell for an operation block — active (expanded, with its
// own pattern/shape list) or inactive (collapsed to a single clickable
// header row) — used for both "Hole(s)" and "Outline" below. Clicking an
// inactive header switches `operation`; clicking a pattern/shape button
// inside the active block also implicitly switches `operation` (relevant
// when arriving here with the other operation active).
function OperationBlock({
  title,
  isActive,
  onActivate,
  children,
}: {
  title: string
  isActive: boolean
  onActivate: () => void
  children: ReactNode
}) {
  if (!isActive) {
    return (
      <button
        type="button"
        onClick={onActivate}
        className="flex items-center rounded-lg border border-transparent px-3 py-2 text-left transition hover:border-border"
      >
        <span className="text-base font-semibold text-muted">{title}</span>
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-accent-strong bg-accent-bg p-3">
      <span className="text-base font-semibold text-accent-fg">{title}</span>
      <div className="mt-2 flex flex-col gap-1">{children}</div>
    </div>
  )
}

function OptionButton({
  isSelected,
  onClick,
  Icon,
  label,
}: {
  isSelected: boolean
  onClick: () => void
  Icon: ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition',
        isSelected
          ? 'border-accent-strong bg-selected-bg'
          : 'border-transparent hover:border-border',
      ].join(' ')}
    >
      <Icon className="h-4 w-4 shrink-0 text-accent" />
      <span className="text-sm text-value">{label}</span>
    </button>
  )
}

export function Step1Positioning({ params, onChange }: Step1PositioningProps) {
  const { geometry, outline, operation } = params

  return (
    <div className="flex flex-col gap-2">
      <OperationBlock
        title="Hole(s)"
        isActive={operation === 'holes'}
        onActivate={() => onChange({ operation: 'holes' })}
      >
        {POSITIONING_LIST.map((opt) => (
          <OptionButton
            key={opt.value}
            isSelected={operation === 'holes' && geometry.positioning === opt.value}
            onClick={() => onChange({ operation: 'holes', geometry: { ...geometry, positioning: opt.value } })}
            Icon={opt.Icon}
            label={opt.title}
          />
        ))}
      </OperationBlock>

      <OperationBlock
        title="Outline"
        isActive={operation === 'outline'}
        onActivate={() => onChange({ operation: 'outline' })}
      >
        {OUTLINE_SHAPE_LIST.map((opt) => (
          <OptionButton
            key={opt.value}
            isSelected={operation === 'outline' && outline.shape === opt.value}
            onClick={() => onChange({ operation: 'outline', outline: { ...outline, shape: opt.value } })}
            Icon={opt.Icon}
            label={opt.title}
          />
        ))}
      </OperationBlock>

      {OPERATION_PLACEHOLDERS.map((label) => (
        <div
          key={label}
          className="flex cursor-not-allowed items-center justify-between rounded-lg border border-dashed border-empty-border px-3 py-2 opacity-60"
        >
          <span className="text-sm font-semibold text-empty-fg">{label}</span>
          <span className="text-xs text-empty-fg">Coming soon</span>
        </div>
      ))}
    </div>
  )
}
