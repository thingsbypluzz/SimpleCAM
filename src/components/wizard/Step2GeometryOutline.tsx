import type { WizardParams } from '../../types/wizard'
import type { MachineSettings } from '../../types/machine'
import {
  isOutlineTabHeightValid,
  isOutlineTabWidthValid,
  isOutlineToolDiameterValid,
  MAX_TAB_COUNT,
} from '../../lib/validation'
import { TOOL_DIAMETER_OPTIONS } from '../../config/toolDiameterOptions'
import { FieldRow, inputClass } from './FieldRow'
import { HintPopover } from './HintPopover'
import { OffsetModePicker } from './OffsetModePicker'
import { OutlineMethodPicker } from './OutlineMethodPicker'
import { useNumberField } from './useNumberField'

interface Step2GeometryOutlineProps {
  params: WizardParams
  onChange: (patch: Partial<WizardParams>) => void
  machine: MachineSettings
}

// Field order: Tool Diameter -> Cutting Depth -> Offset Mode -> Method ->
// shape size fields -> Tabs -> Offset X/Y — see CLAUDE.md's Outline design
// notes. Mirrors Step2GeometryHoles.tsx's conventions throughout
// (FieldRow/useNumberField/HintPopover, flex-row pairs for X/Y-like
// fields, border-t section dividers).
export function Step2GeometryOutline({ params, onChange, machine }: Step2GeometryOutlineProps) {
  const { outline } = params

  const updateOutline = (patch: Partial<WizardParams['outline']>) =>
    onChange({ outline: { ...outline, ...patch } })

  const totalDepthField = useNumberField(outline.totalDepth, (v) => updateOutline({ totalDepth: v }))
  const widthField = useNumberField(outline.width, (v) => updateOutline({ width: v }))
  const heightField = useNumberField(outline.height, (v) => updateOutline({ height: v }))
  const diameterField = useNumberField(outline.diameter, (v) => updateOutline({ diameter: v }))
  const offsetXField = useNumberField(outline.offsetX, (v) => updateOutline({ offsetX: v }))
  const offsetYField = useNumberField(outline.offsetY, (v) => updateOutline({ offsetY: v }))

  const tabHeightField = useNumberField(outline.tabHeight, (v) => updateOutline({ tabHeight: v }))
  const tabWidthField = useNumberField(outline.tabWidth, (v) => updateOutline({ tabWidth: v }))
  const tabCountField = useNumberField(outline.tabCount, (v) => updateOutline({ tabCount: v }))

  const isRect = outline.shape !== 'circle'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <FieldRow label="Tool Diameter [mm]">
          <select
            className={inputClass}
            value={outline.toolDiameter}
            onChange={(e) => updateOutline({ toolDiameter: Number(e.target.value) })}
          >
            {TOOL_DIAMETER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </FieldRow>
        <FieldRow label="Cutting Depth [mm]">
          <input
            type="number"
            step="0.1"
            min="0"
            max={machine.travelZ}
            className={inputClass}
            {...totalDepthField}
          />
        </FieldRow>
        {!isOutlineToolDiameterValid(outline) && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {isRect
              ? "Tool diameter must be smaller than the shorter side for an Inside cut."
              : "Tool diameter can't exceed the shape diameter for an Inside cut."}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        <span>Offset Mode:</span>
        <OffsetModePicker params={params} onChange={onChange} />
      </div>

      <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        <span>Method:</span>
        <OutlineMethodPicker params={params} onChange={onChange} />
      </div>

      {isRect ? (
        <div className="flex gap-4">
          <div className="min-w-0 flex-1">
            <FieldRow label="Width [mm]">
              <input
                type="number"
                step="0.1"
                min="0"
                max={machine.travelX}
                className={inputClass}
                {...widthField}
              />
            </FieldRow>
          </div>
          <div className="min-w-0 flex-1">
            <FieldRow label="Height [mm]">
              <input
                type="number"
                step="0.1"
                min="0"
                max={machine.travelY}
                className={inputClass}
                {...heightField}
              />
            </FieldRow>
          </div>
        </div>
      ) : (
        <FieldRow label="Diameter [mm]">
          <input
            type="number"
            step="0.1"
            min="0"
            max={Math.min(machine.travelX, machine.travelY)}
            className={inputClass}
            {...diameterField}
          />
        </FieldRow>
      )}

      <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
        <label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={outline.tabsEnabled}
            onChange={(e) => {
              const enabled = e.target.checked
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
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          Enable Tabs
          <HintPopover
            text={
              isRect
                ? "Small uncut bridges near the bottom of the cut, evenly spaced on each of the 4 sides, so the cut part stays attached to the stock instead of dropping free. Forces G1 interpolation."
                : "Small uncut bridges near the bottom of the cut, so the cut part stays attached to the stock instead of dropping free. Forces G1 interpolation (see Step 4)."
            }
          />
        </label>
        {outline.tabsEnabled && (
          <div className="flex flex-col gap-4">
            <div className="flex gap-4">
              <div className="min-w-0 flex-1">
                <FieldRow label="Height [mm]">
                  <input type="number" step="0.1" min="0" className={inputClass} {...tabHeightField} />
                </FieldRow>
              </div>
              <div className="min-w-0 flex-1">
                <FieldRow label="Width [mm]">
                  <input type="number" step="0.1" min="0" className={inputClass} {...tabWidthField} />
                </FieldRow>
              </div>
              <div className="min-w-0 flex-1">
                <FieldRow label={isRect ? 'Per Side' : 'Tab Count'}>
                  <input
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
            {!isOutlineTabHeightValid(outline) && (
              <p className="text-sm text-red-600 dark:text-red-400">
                Tab height must be greater than 0 and less than Cutting Depth.
              </p>
            )}
            {!isOutlineTabWidthValid(outline) && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {isRect
                  ? "Tab count × width can't reach the shortest side's length."
                  : "Tab count × width can't reach the toolpath's full circumference."}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
        <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Offset
        </span>
        <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">
          Shifts the whole shape from the origin.
        </p>
        <div className="flex gap-4">
          <div className="min-w-0 flex-1">
            <FieldRow label="Offset X [mm]">
              <input
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
              <input
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
