import type { WizardParams } from '../../types/wizard'
import type { MachineSettings } from '../../types/machine'
import {
  isFacingClearanceValid,
  isFacingLeadValid,
  isFacingPassCountWithinLimit,
  isFacingSizeValid,
  isFacingStepoverValid,
} from '../../lib/validation'
import { MAX_PASSES } from '../../lib/depthPasses'
import { facingPassEdges } from '../../lib/facingGeometry'
import { resolveToolDiameterSelectOptions } from '../../lib/toolDiameterOptions'
import type { ToolDiameterOption } from '../../types/toolDiameters'
import { ToolChipLoad } from './ToolChipLoad'
import { FieldRow, inputClass } from './FieldRow'
import { NumberInput } from './NumberInput'
import { PickHeader } from './PickHeader'
import { TextToggle } from './TextToggle'
import { FACING_CUT_DIRECTION_OPTIONS, FACING_ORIGIN_ACROSS_OPTIONS, FACING_ORIGIN_ALONG_OPTIONS } from './toggleOptions'
import { useNumberField } from './useNumberField'

interface Step2GeometryFacingProps {
  params: WizardParams
  onChange: (patch: Partial<WizardParams>) => void
  machine: MachineSettings
  toolDiameters: ToolDiameterOption[]
  flutes: number
  onFlutesChange: (flutes: number) => void
}

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits

// Field order: Side Length + Material to Remove + Depth (one row) -> Origin
// Along + Origin Across -> Tool Diameter -> Stepover (mm + %, either one
// editable; mm is what's stored) -> Direction -> Lead + Clearance ->
// Offset X/Y. No method picker (one way of cutting) and no Tabs.
export function Step2GeometryFacing({ params, onChange, machine, toolDiameters, flutes, onFlutesChange }: Step2GeometryFacingProps) {
  const { facing } = params

  const updateFacing = (patch: Partial<WizardParams['facing']>) => onChange({ facing: { ...facing, ...patch } })

  const lengthField = useNumberField(facing.length, (v) => updateFacing({ length: v }))
  const removalField = useNumberField(facing.removal, (v) => updateFacing({ removal: v }))
  const totalDepthField = useNumberField(facing.totalDepth, (v) => updateFacing({ totalDepth: v }))
  // Two views of one value: each resyncs when the other (or the tool
  // diameter, for %) changes it.
  const stepoverField = useNumberField(facing.stepover, (v) => updateFacing({ stepover: v }), { syncWhenBlurred: true })
  const stepoverPercent = facing.toolDiameter > 0 ? round((facing.stepover / facing.toolDiameter) * 100, 2) : 0
  const stepoverPercentField = useNumberField(
    stepoverPercent,
    (v) => updateFacing({ stepover: round((facing.toolDiameter * v) / 100, 4) }),
    { syncWhenBlurred: true },
  )
  const leadField = useNumberField(facing.lead, (v) => updateFacing({ lead: v }))
  const clearanceField = useNumberField(facing.clearance, (v) => updateFacing({ clearance: v }))
  const offsetXField = useNumberField(facing.offsetX, (v) => updateFacing({ offsetX: v }))
  const offsetYField = useNumberField(facing.offsetY, (v) => updateFacing({ offsetY: v }))

  const alongX = facing.side === 'bottom' || facing.side === 'top'
  const stepoverValid = isFacingStepoverValid(facing)
  const passLimitInvalid = stepoverValid && !isFacingPassCountWithinLimit(params)
  const passCount = stepoverValid && facing.removal > 0 && !passLimitInvalid ? facingPassEdges(facing).length : null

  return (
    <div className="flex flex-col gap-6">
      <PickHeader params={params} />

      <div className="flex flex-col gap-4">
        <div className="flex items-end gap-4">
          <div className="min-w-0 flex-1">
            <FieldRow label="Length [mm]" hint="Side Length — how long the milled side is. The tool starts and ends beyond both ends of it, in the air.">
              <NumberInput
                type="number"
                step="0.1"
                min="0"
                max={alongX ? machine.travelX : machine.travelY}
                className={inputClass}
                aria-invalid={!(facing.length > 0)}
                {...lengthField}
              />
            </FieldRow>
          </div>
          <div className="min-w-0 flex-1">
            <FieldRow label="Remove [mm]" hint="Material to Remove — how far the side moves into the part, taken in sideways passes of one Stepover each.">
              <NumberInput type="number" step="0.1" min="0" className={inputClass} aria-invalid={!(facing.removal > 0)} {...removalField} />
            </FieldRow>
          </div>
          <div className="min-w-0 flex-1">
            <FieldRow label="Depth [mm]" hint="How far below Z0 the tool cuts — the height of the side. To clear the whole side, set it a little more than the part's thickness.">
              <NumberInput
                type="number"
                step="0.1"
                min="0"
                max={machine.travelZ}
                className={inputClass}
                aria-invalid={!(facing.totalDepth > 0)}
                {...totalDepthField}
              />
            </FieldRow>
          </div>
        </div>
        {!isFacingSizeValid(facing) && (
          <p className="text-sm text-status-error">Length, material to remove and depth must be greater than 0.</p>
        )}
      </div>

      <div className="flex gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm font-medium text-value">Origin Along</span>
          <TextToggle options={FACING_ORIGIN_ALONG_OPTIONS} value={facing.originAlong} onChange={(v) => updateFacing({ originAlong: v })} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm font-medium text-value">Origin Across</span>
          <TextToggle options={FACING_ORIGIN_ACROSS_OPTIONS} value={facing.originAcross} onChange={(v) => updateFacing({ originAcross: v })} />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <ToolChipLoad params={params} machine={machine} flutes={flutes} onFlutesChange={onFlutesChange}>
          <FieldRow label="Tool Diam. [mm]">
            <select
              className={inputClass}
              value={facing.toolDiameter}
              onChange={(e) => updateFacing({ toolDiameter: Number(e.target.value) })}
            >
              {resolveToolDiameterSelectOptions(toolDiameters, facing.toolDiameter).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </FieldRow>
        </ToolChipLoad>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex gap-4">
          <div className="min-w-0 flex-1">
            <FieldRow
              label="Stepover [mm]"
              annotation={passCount !== null ? <span className="text-muted">({passCount} {passCount === 1 ? 'pass' : 'passes'})</span> : undefined}
            >
              <NumberInput
                type="number"
                step="0.05"
                min="0"
                className={inputClass}
                aria-invalid={!stepoverValid || passLimitInvalid}
                {...stepoverField}
              />
            </FieldRow>
          </div>
          <div className="min-w-0 flex-1">
            <FieldRow label="Stepover [%]">
              <NumberInput
                type="number"
                step="1"
                min="0"
                max="100"
                className={inputClass}
                aria-invalid={!stepoverValid || passLimitInvalid}
                {...stepoverPercentField}
              />
            </FieldRow>
          </div>
        </div>
        {!stepoverValid && (
          <p className="text-sm text-status-error">
            Stepover must be greater than 0 and can't exceed the tool diameter ({facing.toolDiameter}mm).
          </p>
        )}
        {passLimitInvalid && (
          <p className="text-sm text-status-error">
            Stepover is too small — more than {MAX_PASSES} passes over all depth levels, the cut would stop short.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-value">Direction</span>
        <TextToggle options={FACING_CUT_DIRECTION_OPTIONS} value={facing.cutDirection} onChange={(v) => updateFacing({ cutDirection: v })} />
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex gap-4">
          <div className="min-w-0 flex-1">
            <FieldRow label="Lead [mm]" hint="Extra distance beyond each end of the side, on top of the tool radius — the tool goes down and turns around there, clear of the corners.">
              <NumberInput type="number" step="0.5" min="0" className={inputClass} aria-invalid={!isFacingLeadValid(facing)} {...leadField} />
            </FieldRow>
          </div>
          <div className="min-w-0 flex-1">
            <FieldRow label="Clearance [mm]" hint="How far the tool backs away from the raw edge before it returns to the start of the side. The return is a G1 at Linking Feed (Step 3), never a rapid.">
              <NumberInput
                type="number"
                step="0.5"
                min="0"
                className={inputClass}
                aria-invalid={!isFacingClearanceValid(facing)}
                {...clearanceField}
              />
            </FieldRow>
          </div>
        </div>
        {!isFacingLeadValid(facing) && <p className="text-sm text-status-error">Lead can't be negative.</p>}
        {!isFacingClearanceValid(facing) && <p className="text-sm text-status-error">Clearance must be greater than 0.</p>}
      </div>

      <div className="border-t border-border pt-4">
        <span className="mb-2 block text-sm font-medium text-value">Offset</span>
        <p className="mb-2 text-sm text-muted">Shifts the whole side from the origin.</p>
        <div className="flex gap-4">
          <div className="min-w-0 flex-1">
            <FieldRow label="Offset X [mm]">
              <NumberInput type="number" step="0.1" min={-machine.travelX} max={machine.travelX} className={inputClass} {...offsetXField} />
            </FieldRow>
          </div>
          <div className="min-w-0 flex-1">
            <FieldRow label="Offset Y [mm]">
              <NumberInput type="number" step="0.1" min={-machine.travelY} max={machine.travelY} className={inputClass} {...offsetYField} />
            </FieldRow>
          </div>
        </div>
      </div>
    </div>
  )
}
