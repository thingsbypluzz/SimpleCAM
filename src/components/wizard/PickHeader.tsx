import { OPERATION_META } from '../../config/operationMeta'
import type { WizardParams } from '../../types/wizard'
import { HintPopover } from './HintPopover'

// First row of every Step 2 panel: what Step 1 picked ("Pattern: Rectangular
// Grid", "Shape: Circle"), its description behind a Hint Button at the
// right edge, lined up with the fields' own hints below.
export function PickHeader({ params }: { params: WizardParams }) {
  const meta = OPERATION_META[params.operation]
  const pick = meta.pick(params)
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-sm">
        <span className="font-medium text-value">{meta.pickKind}:</span> <span className="text-fg">{pick.title}</span>
      </p>
      <HintPopover text={pick.description} />
    </div>
  )
}
