import type { ReactNode } from 'react'
import type { WizardParams } from '../../types/wizard'
import type { MachineSettings } from '../../types/machine'
import { effectiveChipLoad } from '../../lib/feedCalc'
import { isValidFluteCount, MAX_FLUTES } from '../../lib/feedCalcStorage'
import { OPERATION_RULES } from '../../lib/validation'
import { FieldRow, inputClass } from './FieldRow'
import { NumberInput } from './NumberInput'
import { useNumberField } from './useNumberField'

interface ToolChipLoadProps {
  params: WizardParams
  machine: MachineSettings
  flutes: number
  onFlutesChange: (flutes: number) => void
  // The Tool Diameter field this row sits next to.
  children: ReactNode
}

// BL-68: the Tool Diameter row of Step 2 with the tool's flute count and
// the chip load the current parameters actually give — Feed XY ÷ (RPM ×
// z), and ÷ chip thinning for a cut narrower than half the tool. Flutes is
// the same stored value the Feedrate Calculator edits (simplecam.feedCalc),
// so either place changes both; fz is live, so it never goes stale after a
// hand edit of Feed XY or a preset load.
export function ToolChipLoad({ params, machine, flutes, onFlutesChange, children }: ToolChipLoadProps) {
  const fz = effectiveChipLoad(params.feeds.feedrateXY, machine.spindleSpeed, flutes, OPERATION_RULES[params.operation].engagement(params))
  // Only a whole number within range is saved; anything else stays in the
  // field (with the error below) until corrected or reverted on blur.
  const flutesField = useNumberField(
    flutes,
    (v) => {
      if (isValidFluteCount(v)) onFlutesChange(v)
    },
    { syncWhenBlurred: true },
  )
  const typedFlutes = Number(flutesField.value)
  const showError = flutesField.value !== '' && !isValidFluteCount(typedFlutes)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-4">
        <div className="min-w-0 flex-1">{children}</div>
        <div className="w-24 shrink-0">
          <FieldRow label="Flutes">
            <NumberInput type="number" step="1" min="1" max={MAX_FLUTES} className={inputClass} {...flutesField} />
          </FieldRow>
        </div>
        <div className="w-24 shrink-0">
          <FieldRow label="fz [mm]">
            <input
              type="text"
              readOnly
              disabled
              value={fz === null ? '—' : String(Math.round(fz * 1000) / 1000)}
              className={`${inputClass} cursor-not-allowed opacity-70`}
              title="Chip load per tooth from Feed XY, Spindle Speed and flutes (with chip thinning for narrow cuts)"
            />
          </FieldRow>
        </div>
      </div>
      {showError && <p className="text-sm text-status-error">Flutes must be a whole number from 1 to {MAX_FLUTES}.</p>}
    </div>
  )
}
