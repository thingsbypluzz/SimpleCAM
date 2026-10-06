import type { WizardParams } from '../../types/wizard'
import type { MachineSettings } from '../../types/machine'
import {
  isOutlineLobeCountValid,
  isOutlineLobeGapTooNarrow,
  isOutlineLobesAttached,
  isOutlineSizeValid,
  isOutlineTabCountValid,
  isOutlineTabHeightValid,
  isOutlineTabWidthValid,
  isOutlineToolDiameterValid,
  MAX_TAB_COUNT,
} from '../../lib/validation'
import { MAX_LOBE_COUNT } from '../../lib/outlineLobedGeometry'
import { resolveToolDiameterSelectOptions } from '../../lib/toolDiameterOptions'
import type { ToolDiameterOption } from '../../types/toolDiameters'
import { Checkbox } from './Checkbox'
import { ToolChipLoad } from './ToolChipLoad'
import { FieldRow, inputClass } from './FieldRow'
import { HintPopover } from './HintPopover'
import { NumberInput } from './NumberInput'
import { PickHeader } from './PickHeader'
import { RampAngleFields } from './RampAngleFields'
import { OffsetModePicker } from './OffsetModePicker'
import { OutlineMethodPicker } from './OutlineMethodPicker'
import { useNumberField } from './useNumberField'

interface Step2GeometryOutlineProps {
  params: WizardParams
  onChange: (patch: Partial<WizardParams>) => void
  machine: MachineSettings
  toolDiameters: ToolDiameterOption[]
  flutes: number
  onFlutesChange: (flutes: number) => void
}

// Field order (BL-72): shape size fields + Depth (one row) -> Lobes (Lobed
// Circle: Count + Pitch Diameter, Lobe Diameter + Start) -> Offset Mode ->
// Tool Diameter -> Method -> Ramp + Pitch (Helix/Ramp only, BL-80) -> Tabs ->
// Offset X/Y — see CLAUDE.md's Outline design
// notes. Mirrors Step2GeometryHoles.tsx's conventions throughout
// (FieldRow/useNumberField/HintPopover, flex-row pairs for X/Y-like
// fields, border-t section dividers).
export function Step2GeometryOutline({ params, onChange, machine, toolDiameters, flutes, onFlutesChange }: Step2GeometryOutlineProps) {
  const { outline } = params

  const updateOutline = (patch: Partial<WizardParams['outline']>) =>
    onChange({ outline: { ...outline, ...patch } })

  const totalDepthField = useNumberField(outline.totalDepth, (v) => updateOutline({ totalDepth: v }))
  const widthField = useNumberField(outline.width, (v) => updateOutline({ width: v }))
  const heightField = useNumberField(outline.height, (v) => updateOutline({ height: v }))
  const diameterField = useNumberField(outline.diameter, (v) => updateOutline({ diameter: v }))
  const lobeMainField = useNumberField(outline.lobeMainDiameter, (v) => updateOutline({ lobeMainDiameter: v }))
  const offsetXField = useNumberField(outline.offsetX, (v) => updateOutline({ offsetX: v }))
  const offsetYField = useNumberField(outline.offsetY, (v) => updateOutline({ offsetY: v }))

  const tabHeightField = useNumberField(outline.tabHeight, (v) => updateOutline({ tabHeight: v }))
  const tabWidthField = useNumberField(outline.tabWidth, (v) => updateOutline({ tabWidth: v }))
  const tabCountField = useNumberField(outline.tabCount, (v) => updateOutline({ tabCount: v }))
  const tabStartField = useNumberField(outline.tabStartAngle, (v) => updateOutline({ tabStartAngle: v }))

  const lobeCountField = useNumberField(outline.lobeCount, (v) => updateOutline({ lobeCount: v }))
  const lobePitchField = useNumberField(outline.lobePitchDiameter, (v) => updateOutline({ lobePitchDiameter: v }))
  const lobeDiameterField = useNumberField(outline.lobeDiameter, (v) => updateOutline({ lobeDiameter: v }))
  const lobeStartField = useNumberField(outline.lobeStartAngle, (v) => updateOutline({ lobeStartAngle: v }))

  const isRect = outline.shape === 'rectCornered' || outline.shape === 'rectCentered'
  const isLobed = outline.shape === 'lobedCircle'
  const lobeCountInvalid = !isOutlineLobeCountValid(outline)
  const lobesDetached = !isOutlineLobesAttached(outline)

  // BL-66: the same conditions that show the errors below also mark the
  // fields they concern (aria-invalid -> error styling in inputClass).
  const toolInvalid = !isOutlineToolDiameterValid(outline)
  const tabHeightInvalid = !isOutlineTabHeightValid(outline)
  const tabWidthInvalid = !isOutlineTabWidthValid(outline)
  const tabCountInvalid = !isOutlineTabCountValid(outline)
  const widthIsShorter = outline.width <= outline.height
  const widthInvalid = !(outline.width > 0) || (toolInvalid && widthIsShorter)
  const heightInvalid = !(outline.height > 0) || (toolInvalid && !widthIsShorter)
  const diameterInvalid = isLobed ? !(outline.lobeMainDiameter > 0) || lobesDetached : !(outline.diameter > 0) || toolInvalid
  const depthInvalid = !(outline.totalDepth > 0) || (outline.tabsEnabled && outline.tabHeight >= outline.totalDepth)

  return (
    <div className="flex flex-col gap-6">
      <PickHeader params={params} />

      <div className="flex flex-col gap-4">
        {isRect ? (
          // Rectangle: Width + Height + Depth on one row (BL-93).
          <div className="flex items-end gap-4">
            <div className="min-w-0 flex-1">
              <FieldRow label="Width [mm]">
                <NumberInput
                  type="number"
                  step="0.1"
                  min="0"
                  max={machine.travelX}
                  className={inputClass}
                  aria-invalid={widthInvalid}
                  {...widthField}
                />
              </FieldRow>
            </div>
            <div className="min-w-0 flex-1">
              <FieldRow label="Height [mm]">
                <NumberInput
                  type="number"
                  step="0.1"
                  min="0"
                  max={machine.travelY}
                  className={inputClass}
                  aria-invalid={heightInvalid}
                  {...heightField}
                />
              </FieldRow>
            </div>
            <div className="min-w-0 flex-1">
              <FieldRow label="Depth [mm]">
                <NumberInput
                  type="number"
                  step="0.1"
                  min="0"
                  max={machine.travelZ}
                  className={inputClass}
                  aria-invalid={depthInvalid}
                  {...totalDepthField}
                />
              </FieldRow>
            </div>
          </div>
        ) : (
          // Circle and Lobed Circle (its main circle): Diameter + Depth on
          // one row, like Hole(s).
          <div className="flex gap-4">
            <div className="min-w-0 flex-1">
              <FieldRow label="Diameter [mm]">
                <NumberInput
                  type="number"
                  step="0.1"
                  min="0"
                  max={Math.min(machine.travelX, machine.travelY)}
                  className={inputClass}
                  aria-invalid={diameterInvalid}
                  {...(isLobed ? lobeMainField : diameterField)}
                />
              </FieldRow>
            </div>
            <div className="min-w-0 flex-1">
              <FieldRow label="Depth [mm]">
                <NumberInput
                  type="number"
                  step="0.1"
                  min="0"
                  max={machine.travelZ}
                  className={inputClass}
                  aria-invalid={depthInvalid}
                  {...totalDepthField}
                />
              </FieldRow>
            </div>
          </div>
        )}
        {isLobed && (
          <>
            <span className="text-sm font-medium text-value">Lobes</span>
            <div className="flex gap-4">
              <div className="min-w-0 flex-1">
                <FieldRow label="Count">
                  <NumberInput
                    type="number"
                    step="1"
                    min="1"
                    max={MAX_LOBE_COUNT}
                    className={inputClass}
                    aria-invalid={lobeCountInvalid}
                    {...lobeCountField}
                  />
                </FieldRow>
              </div>
              <div className="min-w-0 flex-1">
                <FieldRow
                  label="Pitch Diam. [mm]"
                  hint="Pitch Diameter — the circle the lobe centers sit on. The same number as Circle Diameter in Hole(s) N-Holes on Circle, so a hole lands in the middle of every lobe."
                >
                  <NumberInput
                    type="number"
                    step="0.1"
                    min="0"
                    className={inputClass}
                    aria-invalid={!(outline.lobePitchDiameter > 0) || lobesDetached}
                    {...lobePitchField}
                  />
                </FieldRow>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="min-w-0 flex-1">
                <FieldRow label="Lobe Diam. [mm]">
                  <NumberInput
                    type="number"
                    step="0.1"
                    min="0"
                    className={inputClass}
                    aria-invalid={!(outline.lobeDiameter > 0) || lobesDetached || (toolInvalid && isLobed)}
                    {...lobeDiameterField}
                  />
                </FieldRow>
              </div>
              <div className="min-w-0 flex-1">
                <FieldRow label="Start [°]" hint="Start Angle of the first lobe — 0° points along +X, angles grow counter-clockwise. The rest are spaced evenly.">
                  <NumberInput type="number" step="1" className={inputClass} {...lobeStartField} />
                </FieldRow>
              </div>
            </div>
          </>
        )}
        {!isOutlineSizeValid(outline) && <p className="text-sm text-status-error">Dimensions and depth must be greater than 0.</p>}
        {lobeCountInvalid && (
          <p className="text-sm text-status-error">Lobe count must be a whole number from 1 to {MAX_LOBE_COUNT}.</p>
        )}
        {lobesDetached && (
          <p className="text-sm text-status-error">
            Every lobe has to cross the main circle — with these sizes it is either apart from it or hidden inside it.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-value">Offset Mode</span>
        <OffsetModePicker params={params} onChange={onChange} />
      </div>

      <div className="flex flex-col gap-4">
        <ToolChipLoad params={params} machine={machine} flutes={flutes} onFlutesChange={onFlutesChange}>
          <FieldRow label="Tool Diam. [mm]">
            <select
              className={inputClass}
              aria-invalid={toolInvalid}
              value={outline.toolDiameter}
              onChange={(e) => updateOutline({ toolDiameter: Number(e.target.value) })}
            >
              {resolveToolDiameterSelectOptions(toolDiameters, outline.toolDiameter).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </FieldRow>
        </ToolChipLoad>
        {toolInvalid && (
          <p className="text-sm text-status-error">
            {isRect
              ? "Tool diameter must be smaller than the shorter side for an Inside cut."
              : isLobed
                ? "The tool doesn't fit for an Inside cut — it has to be smaller than a lobe and than the neck between each lobe and the main circle."
                : "Tool diameter must be smaller than the shape diameter for an Inside cut."}
          </p>
        )}
        {isOutlineLobeGapTooNarrow(outline) && (
          <p className="rounded-md border border-status-warn-border bg-status-warn-bg px-3 py-2 text-xs text-status-warn-fg">
            The tool is wider than the gap between two lobes — the material in that gap stays. The preview shows the
            shape the cut leaves.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-value">Method</span>
        <OutlineMethodPicker params={params} onChange={onChange} />
      </div>

      <RampAngleFields params={params} rampAngleDeg={outline.rampAngleDeg} onChange={(v) => updateOutline({ rampAngleDeg: v })} />

      <div className="border-t border-border pt-4">
        <Checkbox
          checked={outline.tabsEnabled}
          onChange={(enabled) => {
            updateOutline(
              enabled
                ? {
                    tabsEnabled: true,
                    tabHeight: machine.defaultTabHeight,
                    tabWidth: machine.defaultTabWidth,
                    tabCount: machine.defaultTabCount,
                  }
                : { tabsEnabled: false },
            )
          }}
          label="Enable Tabs"
          className="mb-2 text-sm font-medium text-value"
        >
          <HintPopover
            text={
              isRect
                ? "Small uncut bridges near the bottom of the cut, evenly spaced on each of the 4 sides, so the cut part stays attached to the stock instead of dropping free. Forces G1 interpolation."
                : "Small uncut bridges near the bottom of the cut, so the cut part stays attached to the stock instead of dropping free. Forces G1 interpolation (see Step 4)."
            }
          />
        </Checkbox>
        {outline.tabsEnabled && (
          <div className="flex flex-col gap-4">
            <div className="flex gap-4">
              <div className="min-w-0 flex-1">
                <FieldRow label="Height [mm]">
                  <NumberInput type="number" step="0.1" min="0" className={inputClass} aria-invalid={tabHeightInvalid} {...tabHeightField} />
                </FieldRow>
              </div>
              <div className="min-w-0 flex-1">
                <FieldRow label="Width [mm]">
                  <NumberInput type="number" step="0.1" min="0" className={inputClass} aria-invalid={tabWidthInvalid} {...tabWidthField} />
                </FieldRow>
              </div>
              <div className="min-w-0 flex-1">
                <FieldRow label={isRect ? 'Per Side' : 'Tab Count'}>
                  <NumberInput
                    type="number"
                    step="1"
                    min="1"
                    max={MAX_TAB_COUNT}
                    className={inputClass}
                    aria-invalid={tabCountInvalid || tabWidthInvalid}
                    {...tabCountField}
                  />
                </FieldRow>
              </div>
            </div>
            {!isRect && (
              <div className="flex gap-4">
                <div className="min-w-0 flex-1">
                  <FieldRow
                    label="Tab Start [°]"
                    hint="Where the first tab sits — 0° points along +X, angles grow counter-clockwise. The other tabs follow at equal distances along the toolpath."
                  >
                    <NumberInput type="number" step="1" className={inputClass} {...tabStartField} />
                  </FieldRow>
                </div>
                <div className="min-w-0 flex-1" />
                <div className="min-w-0 flex-1" />
              </div>
            )}
            {tabHeightInvalid && (
              <p className="text-sm text-status-error">
                Tab height must be greater than 0 and less than Depth.
              </p>
            )}
            {tabWidthInvalid && (
              <p className="text-sm text-status-error">
                {isRect
                  ? "Tab count × width can't reach the shortest side's length."
                  : "Tab count × width can't reach the toolpath's full length."}
              </p>
            )}
            {tabCountInvalid && (
              <p className="text-sm text-status-error">
                Tab count must be a whole number from 1 to {MAX_TAB_COUNT}.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border pt-4">
        <span className="mb-2 block text-sm font-medium text-value">
          Offset
        </span>
        <p className="mb-2 text-sm text-muted">
          Shifts the whole shape from the origin.
        </p>
        <div className="flex gap-4">
          <div className="min-w-0 flex-1">
            <FieldRow label="Offset X [mm]">
              <NumberInput
                type="number"
                step="0.1"
                min={-machine.travelX}
                max={machine.travelX}
                className={inputClass}
                {...offsetXField}
              />
            </FieldRow>
          </div>
          <div className="min-w-0 flex-1">
            <FieldRow label="Offset Y [mm]">
              <NumberInput
                type="number"
                step="0.1"
                min={-machine.travelY}
                max={machine.travelY}
                className={inputClass}
                {...offsetYField}
              />
            </FieldRow>
          </div>
        </div>
      </div>
    </div>
  )
}
