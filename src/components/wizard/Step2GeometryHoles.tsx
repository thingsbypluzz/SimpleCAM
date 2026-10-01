import type { WizardParams } from '../../types/wizard'
import type { MachineSettings } from '../../types/machine'
import { parseCustomPointsText } from '../../lib/customPoints'
import {
  isCircleHoleCountValid,
  isHolesSizeValid,
  isTabCountValid,
  isTabHeightValid,
  isTabWidthValid,
  isToolDiameterValid,
  MAX_CIRCLE_HOLE_COUNT,
  MAX_TAB_COUNT,
} from '../../lib/validation'
import { resolveToolDiameterSelectOptions } from '../../lib/toolDiameterOptions'
import type { ToolDiameterOption } from '../../types/toolDiameters'
import { Checkbox } from './Checkbox'
import { ToolChipLoad } from './ToolChipLoad'
import { FieldRow, inputClass } from './FieldRow'
import { HintPopover } from './HintPopover'
import { MethodPicker } from './MethodPicker'
import { NumberInput } from './NumberInput'
import { PickHeader } from './PickHeader'
import { RampAngleFields } from './RampAngleFields'
import { useNumberField } from './useNumberField'

interface Step2GeometryHolesProps {
  params: WizardParams
  onChange: (patch: Partial<WizardParams>) => void
  machine: MachineSettings
  toolDiameters: ToolDiameterOption[]
  flutes: number
  onFlutesChange: (flutes: number) => void
}

// Field order (BL-72, shared idea across all four Step 2 panels): where
// and how big first, then the tool, then how to cut — Pattern fields with
// the hole size (Grid: Width + Height + Depth, then Hole Diameter; N-Holes:
// Hole Count + Diameter + Depth, then Hole Diameter + Start Angle; Custom:
// the list, then Hole Diameter + Depth; Single: just that pair, BL-93)
// -> Tool Diameter -> Method -> Ramp + Pitch (Helix only, BL-80) -> Tabs ->
// Offset X/Y.
export function Step2GeometryHoles({ params, onChange, machine, toolDiameters, flutes, onFlutesChange }: Step2GeometryHolesProps) {
  const { geometry } = params

  const updateGeometry = (patch: Partial<WizardParams['geometry']>) =>
    onChange({ geometry: { ...geometry, ...patch } })

  // The textarea is bound to geometry.customPointsText (BL-48) — raw text,
  // blank/trailing lines included, so Enter isn't swallowed by a
  // parse/format round-trip. customPoints always follows it with just the
  // lines that parsed; invalid ones are listed below the field and block
  // Generate (isCustomPointsValid).
  const customParse = parseCustomPointsText(geometry.customPointsText)

  const handleCustomPointsChange = (text: string) => {
    updateGeometry({ customPointsText: text, customPoints: parseCustomPointsText(text).points })
  }

  const holeDiameterField = useNumberField(geometry.holeDiameter, (v) =>
    updateGeometry({ holeDiameter: v }),
  )
  const totalDepthField = useNumberField(geometry.totalDepth, (v) => updateGeometry({ totalDepth: v }))
  const gridXField = useNumberField(geometry.gridX, (v) => updateGeometry({ gridX: v }))
  const gridYField = useNumberField(geometry.gridY, (v) => updateGeometry({ gridY: v }))
  const circleHoleCountField = useNumberField(geometry.circleHoleCount, (v) =>
    updateGeometry({ circleHoleCount: v }),
  )
  const circleDiameterField = useNumberField(geometry.circleDiameter, (v) =>
    updateGeometry({ circleDiameter: v }),
  )
  const circleStartAngleField = useNumberField(geometry.circleStartAngle, (v) =>
    updateGeometry({ circleStartAngle: v }),
  )
  const offsetXField = useNumberField(geometry.offsetX, (v) => updateGeometry({ offsetX: v }))
  const offsetYField = useNumberField(geometry.offsetY, (v) => updateGeometry({ offsetY: v }))

  const tabHeightField = useNumberField(geometry.tabHeight, (v) => updateGeometry({ tabHeight: v }))
  const tabWidthField = useNumberField(geometry.tabWidth, (v) => updateGeometry({ tabWidth: v }))
  const tabCountField = useNumberField(geometry.tabCount, (v) => updateGeometry({ tabCount: v }))

  // BL-66: the same conditions that show the errors below also mark the
  // fields they concern (aria-invalid -> error styling in inputClass).
  const circleCountInvalid = !isCircleHoleCountValid(geometry)
  const customPointsInvalid = customParse.invalidLines.length > 0 || customParse.points.length === 0
  const sizeInvalid = !isHolesSizeValid(geometry)
  const toolInvalid = !isToolDiameterValid(geometry)
  const tabHeightInvalid = !isTabHeightValid(geometry)
  const tabWidthInvalid = !isTabWidthValid(geometry)
  const tabCountInvalid = !isTabCountValid(geometry)

  // BL-93: Grid and N-Holes carry the depth on their own dimension row
  // (three columns), Single and Custom List keep Hole Diameter + Depth as
  // a pair. The field is "Depth" in every operation.
  // Three columns leave no room for a Hint Button beside an input, so the
  // Grid's "0 = two holes" tip lives in the pattern description (PickHeader).
  const isGrid = geometry.positioning === 'grid' || geometry.positioning === 'gridCentered'
  const isCircle = geometry.positioning === 'circle'
  const holeDiameterInput = (
    <NumberInput
      type="number"
      step="0.1"
      className={inputClass}
      aria-invalid={!(geometry.holeDiameter > 0) || toolInvalid}
      {...holeDiameterField}
    />
  )
  const depthCell = (
    <div className="min-w-0 flex-1">
      <FieldRow label="Depth [mm]">
        <NumberInput
          type="number"
          step="0.1"
          min="0"
          max={machine.travelZ}
          className={inputClass}
          aria-invalid={!(geometry.totalDepth > 0) || (geometry.tabsEnabled && geometry.tabHeight >= geometry.totalDepth)}
          {...totalDepthField}
        />
      </FieldRow>
    </div>
  )
  const sizeError = sizeInvalid && <p className="text-sm text-status-error">Dimensions and depth must be greater than 0.</p>

  return (
    <div className="flex flex-col gap-6">
      <PickHeader params={params} />

      {isGrid && (
        <div className="flex flex-col gap-4">
          <div className="flex items-end gap-4">
            <div className="min-w-0 flex-1">
              <FieldRow label="Width [mm]">
                <NumberInput
                  type="number"
                  step="0.1"
                  min="0"
                  max={machine.travelX}
                  className={inputClass}
                  {...gridXField}
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
                  {...gridYField}
                />
              </FieldRow>
            </div>
            {depthCell}
          </div>
          <FieldRow label="Hole Diameter [mm]">{holeDiameterInput}</FieldRow>
          {sizeError}
        </div>
      )}

      {isCircle && (
        <div className="flex flex-col gap-4">
          <div className="flex items-end gap-4">
            <div className="min-w-0 flex-1">
              <FieldRow label="Hole Count">
                <NumberInput
                  type="number"
                  step="1"
                  min="0"
                  max={MAX_CIRCLE_HOLE_COUNT}
                  className={inputClass}
                  aria-invalid={circleCountInvalid}
                  {...circleHoleCountField}
                />
              </FieldRow>
            </div>
            <div className="min-w-0 flex-1">
              <FieldRow label="Diameter [mm]">
                <NumberInput
                  type="number"
                  step="0.1"
                  min="0"
                  max={Math.min(machine.travelX, machine.travelY)}
                  className={inputClass}
                  {...circleDiameterField}
                />
              </FieldRow>
            </div>
            {depthCell}
          </div>
          {circleCountInvalid && (
            <p className="text-sm text-status-error">
              Hole count can't exceed {MAX_CIRCLE_HOLE_COUNT}.
            </p>
          )}
          <div className="flex gap-4">
            <div className="min-w-0 flex-1">
              <FieldRow label="Hole Diameter [mm]">{holeDiameterInput}</FieldRow>
            </div>
            <div className="min-w-0 flex-1">
              <FieldRow label="Start Angle [deg]">
                <NumberInput type="number" step="1" className={inputClass} {...circleStartAngleField} />
              </FieldRow>
            </div>
          </div>
          {sizeError}
        </div>
      )}

      {geometry.positioning === 'custom' && (
        <div className="flex flex-col gap-4">
          <FieldRow label="Points (X,Y per line)" hint="e.g. 10,10 — comma, semicolon or space">
            <textarea
              className={`${inputClass} h-28 font-mono`}
              aria-invalid={customPointsInvalid}
              value={geometry.customPointsText}
              onChange={(e) => handleCustomPointsChange(e.target.value)}
            />
          </FieldRow>
          {customParse.invalidLines.length > 0 ? (
            <p className="text-sm text-status-error">
              {customParse.invalidLines.length === 1 ? 'Line' : 'Lines'} {customParse.invalidLines.join(', ')}:
              expected two numbers, e.g. 10,20.
            </p>
          ) : (
            customParse.points.length === 0 && (
              <p className="text-sm text-status-error">Add at least one point.</p>
            )
          )}
        </div>
      )}

      {!isGrid && !isCircle && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-4">
            <div className="min-w-0 flex-1">
              <FieldRow label="Hole Diameter [mm]">{holeDiameterInput}</FieldRow>
            </div>
            {depthCell}
          </div>
          {sizeError}
        </div>
      )}

      <div className="flex flex-col gap-4">
        <ToolChipLoad params={params} machine={machine} flutes={flutes} onFlutesChange={onFlutesChange}>
          <FieldRow label="Tool Diam. [mm]">
            <select
              className={inputClass}
              aria-invalid={toolInvalid}
              value={geometry.toolDiameter}
              onChange={(e) => updateGeometry({ toolDiameter: Number(e.target.value) })}
            >
              {resolveToolDiameterSelectOptions(toolDiameters, geometry.toolDiameter).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </FieldRow>
        </ToolChipLoad>
        {toolInvalid && (
          <p className="text-sm text-status-error">
            Tool diameter must be smaller than the hole diameter.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-value">Method</span>
        <MethodPicker params={params} onChange={onChange} />
      </div>

      <RampAngleFields params={params} rampAngleDeg={geometry.rampAngleDeg} onChange={(v) => updateGeometry({ rampAngleDeg: v })} />

      <div className="border-t border-border pt-4">
        <Checkbox
          checked={geometry.tabsEnabled}
          onChange={(enabled) => {
            // Checking the box always seeds height/width/count fresh
            // from Settings > Tabs's "Default Tab Settings" — including
            // on a re-check after unchecking, which does mean a custom
            // edit made before unchecking is lost, not remembered. Kept
            // deliberately simple: there's no clean way to tell "user
            // customized this in-session" from "just showing whatever
            // was last seeded" without new state to track it, and a
            // predictable "always starts from your default" beats a
            // half-remembered one.
            updateGeometry(
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
          <HintPopover text="Small uncut bridges near the bottom of the cut, so a through-hole's center plug stays attached to the stock instead of dropping free. Forces G1 interpolation (see Step 4)." />
        </Checkbox>
        {geometry.tabsEnabled && (
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
                <FieldRow label="Tab Count">
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
            {tabHeightInvalid && (
              <p className="text-sm text-status-error">
                Tab height must be greater than 0 and less than Depth.
              </p>
            )}
            {tabWidthInvalid && (
              <p className="text-sm text-status-error">
                Tab count × width can't reach the toolpath's full circumference.
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
          Shifts the whole pattern — applies on top of any positioning mode above.
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
