import { useState } from 'react'
import type { WizardParams } from '../../types/wizard'
import type { MachineSettings } from '../../types/machine'
import {
  isCircleHoleCountValid,
  isTabHeightValid,
  isTabWidthValid,
  isToolDiameterValid,
  MAX_CIRCLE_HOLE_COUNT,
  MAX_TAB_COUNT,
} from '../../lib/validation'
import { POSITIONING_META } from '../../config/positioningMeta'
import { TOOL_DIAMETER_OPTIONS } from '../../config/toolDiameterOptions'
import { Checkbox } from './Checkbox'
import { FieldRow, inputClass } from './FieldRow'
import { HintPopover } from './HintPopover'
import { MethodPicker } from './MethodPicker'
import { NumberInput } from './NumberInput'
import { useNumberField } from './useNumberField'

interface Step2GeometryHolesProps {
  params: WizardParams
  onChange: (patch: Partial<WizardParams>) => void
  machine: MachineSettings
}

function parseCustomPoints(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [x, y] = line.split(',').map((v) => Number(v.trim()))
      return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 }
    })
}

function formatCustomPoints(points: { x: number; y: number }[]) {
  return points.map((p) => `${p.x},${p.y}`).join('\n')
}

export function Step2GeometryHoles({ params, onChange, machine }: Step2GeometryHolesProps) {
  const { geometry } = params

  const updateGeometry = (patch: Partial<WizardParams['geometry']>) =>
    onChange({ geometry: { ...geometry, ...patch } })

  // The textarea keeps its own raw-text state instead of being derived via
  // formatCustomPoints(parseCustomPoints(text)) on every keystroke — that
  // round-trip strips blank/trailing lines (parseCustomPoints filters empty
  // lines), which snapped back and swallowed the Enter key. Lazy-init reads
  // the current geometry once; the component remounts whenever Step 2
  // becomes active again, so it stays in sync across visits.
  const [customPointsText, setCustomPointsText] = useState(() =>
    formatCustomPoints(geometry.customPoints),
  )

  const handleCustomPointsChange = (text: string) => {
    setCustomPointsText(text)
    updateGeometry({ customPoints: parseCustomPoints(text) })
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <FieldRow label="Tool Diameter [mm]">
          <select
            className={inputClass}
            value={geometry.toolDiameter}
            onChange={(e) => updateGeometry({ toolDiameter: Number(e.target.value) })}
          >
            {TOOL_DIAMETER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </FieldRow>
        <div className="flex gap-4">
          <div className="min-w-0 flex-1">
            <FieldRow label="Hole Diameter [mm]">
              <NumberInput type="number" step="0.1" className={inputClass} {...holeDiameterField} />
            </FieldRow>
          </div>
          <div className="min-w-0 flex-1">
            <FieldRow label="Total Depth [mm]">
              <NumberInput
                type="number"
                step="0.1"
                min="0"
                max={machine.travelZ}
                className={inputClass}
                {...totalDepthField}
              />
            </FieldRow>
          </div>
        </div>
        {!isToolDiameterValid(geometry) && (
          <p className="text-sm text-status-error">
            Tool diameter can't be larger than the hole diameter.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-value">Method</span>
        <MethodPicker params={params} onChange={onChange} />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-value">Pattern</span>
        <p className="text-sm text-fg">
          {POSITIONING_META[geometry.positioning].title}
        </p>
        <p className="text-sm text-muted">
          {POSITIONING_META[geometry.positioning].description}
        </p>
      </div>

      {(geometry.positioning === 'grid' || geometry.positioning === 'gridCentered') && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-4">
            <div className="min-w-0 flex-1">
              <FieldRow label="Width (X) [mm]" hint="Tip: set to 0 for 2 holes spaced by Height">
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
              <FieldRow label="Height (Y) [mm]" hint="Tip: set to 0 for 2 holes spaced by Width">
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
          </div>
        </div>
      )}

      {geometry.positioning === 'circle' && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-4">
            <div className="min-w-0 flex-1">
              <FieldRow label="Hole Count">
                <NumberInput
                  type="number"
                  step="1"
                  min="0"
                  max={MAX_CIRCLE_HOLE_COUNT}
                  className={inputClass}
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
            <div className="min-w-0 flex-1">
              <FieldRow label="Start Angle [deg]">
                <NumberInput type="number" step="1" className={inputClass} {...circleStartAngleField} />
              </FieldRow>
            </div>
          </div>
          {!isCircleHoleCountValid(geometry) && (
            <p className="text-sm text-status-error">
              Hole count can't exceed {MAX_CIRCLE_HOLE_COUNT}.
            </p>
          )}
        </div>
      )}

      {geometry.positioning === 'custom' && (
        <FieldRow label="Points (X,Y per line)" hint="e.g. 10,10">
          <textarea
            className={`${inputClass} h-28 font-mono`}
            value={customPointsText}
            onChange={(e) => handleCustomPointsChange(e.target.value)}
          />
        </FieldRow>
      )}

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
                  <NumberInput type="number" step="0.1" min="0" className={inputClass} {...tabHeightField} />
                </FieldRow>
              </div>
              <div className="min-w-0 flex-1">
                <FieldRow label="Width [mm]">
                  <NumberInput type="number" step="0.1" min="0" className={inputClass} {...tabWidthField} />
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
                    {...tabCountField}
                  />
                </FieldRow>
              </div>
            </div>
            {!isTabHeightValid(geometry) && (
              <p className="text-sm text-status-error">
                Tab height must be greater than 0 and less than Total Depth.
              </p>
            )}
            {!isTabWidthValid(geometry) && (
              <p className="text-sm text-status-error">
                Tab count × width can't reach the toolpath's full circumference.
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
