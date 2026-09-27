import type { WizardParams } from '../../types/wizard'
import type { MachineSettings } from '../../types/machine'
import { effectiveChipLoad } from '../../lib/feedCalc'
import { OPERATION_RULES } from '../../lib/validation'
import { FieldRow, inputClass } from './FieldRow'

interface ToolChipLoadProps {
  params: WizardParams
  machine: MachineSettings
  flutes: number
}

// BL-68: read-only flute count (the Feedrate Calculator's memory) and the
// chip load the current parameters actually give — Feed XY ÷ (RPM × z),
// and ÷ chip thinning for a cut narrower than half the tool — shown next
// to Tool Diameter. Live, so it never goes stale after a hand edit of
// Feed XY or a preset load.
export function ToolChipLoad({ params, machine, flutes }: ToolChipLoadProps) {
  const fz = effectiveChipLoad(params.feeds.feedrateXY, machine.spindleSpeed, flutes, OPERATION_RULES[params.operation].engagement(params))
  const readOnlyClass = `${inputClass} cursor-not-allowed opacity-70`
  return (
    <>
      <div className="w-16 shrink-0">
        <FieldRow label="Flutes">
          <input type="text" readOnly disabled value={flutes} className={readOnlyClass} title="Set in the Feedrate Calculator (Step 3)" />
        </FieldRow>
      </div>
      <div className="w-24 shrink-0">
        <FieldRow label="fz [mm]">
          <input
            type="text"
            readOnly
            disabled
            value={fz === null ? '—' : String(Math.round(fz * 1000) / 1000)}
            className={readOnlyClass}
            title="Chip load per tooth from Feed XY, Spindle Speed and flutes (with chip thinning for narrow cuts)"
          />
        </FieldRow>
      </div>
    </>
  )
}
