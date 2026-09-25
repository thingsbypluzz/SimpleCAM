import type { RasterDirection, WizardParams, ZTransitionMode } from '../../types/wizard'
import type { MachineSettings } from '../../types/machine'
import { isPocketHelixRadiusValid, isPocketStepoverValid, isPocketToolDiameterValid } from '../../lib/validation'
import { pocketStepoverMm } from '../../lib/pocketGeometry'
import { fmt } from '../../lib/format'
import { resolveToolDiameterSelectOptions } from '../../lib/toolDiameterOptions'
import type { ToolDiameterOption } from '../../types/toolDiameters'
import { FieldRow, inputClass } from './FieldRow'
import { NumberInput } from './NumberInput'
import { PocketMethodPicker } from './PocketMethodPicker'
import { useNumberField } from './useNumberField'

interface Step2GeometryPocketProps {
  params: WizardParams
  onChange: (patch: Partial<WizardParams>) => void
  machine: MachineSettings
  toolDiameters: ToolDiameterOption[]
}

// Same compact toggle style as Step2GeometrySurface.tsx's own copies — kept
// inline there too, no shared file to import from.
function RasterDirectionToggle({ value, onChange }: { value: RasterDirection; onChange: (v: RasterDirection) => void }) {
  const options: { value: RasterDirection; label: string }[] = [
    { value: 'x', label: 'X' },
    { value: 'y', label: 'Y' },
  ]
  return (
    <div className="flex gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={[
            'rounded-md border px-2.5 py-1 text-xs font-medium transition',
            value === opt.value
              ? 'border-selected-border bg-selected-bg text-selected-fg shadow-[var(--glow-selected)]'
              : 'border-border text-muted hover:border-field-border',
          ].join(' ')}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function ZTransitionModeToggle({ value, onChange }: { value: ZTransitionMode; onChange: (v: ZTransitionMode) => void }) {
  const options: { value: ZTransitionMode; label: string }[] = [
    { value: 'plunge', label: 'Plunge' },
    { value: 'helix', label: 'Helix' },
  ]
  return (
    <div className="flex gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={[
            'rounded-md border px-2.5 py-1 text-xs font-medium transition',
            value === opt.value
              ? 'border-selected-border bg-selected-bg text-selected-fg shadow-[var(--glow-selected)]'
              : 'border-border text-muted hover:border-field-border',
          ].join(' ')}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// Field order: Tool Diameter -> Total Depth -> Method -> Raster Direction
// (Raster only) -> shape size fields -> Stepover (% + read-only mm) ->
// Z-Transition Mode -> Helix Radius (Helix only) -> Offset X/Y — mirrors
// Step2GeometrySurface.tsx's conventions throughout. No Tabs section, same
// reasoning as Surface: Pocket doesn't cut through, nothing to bridge. No
// Offset Mode picker either (unlike Outline) — Pocket is always an inside
// cut, there's no other physically meaningful mode.
export function Step2GeometryPocket({ params, onChange, machine, toolDiameters }: Step2GeometryPocketProps) {
  const { pocket } = params

  const updatePocket = (patch: Partial<WizardParams['pocket']>) => onChange({ pocket: { ...pocket, ...patch } })

  const totalDepthField = useNumberField(pocket.totalDepth, (v) => updatePocket({ totalDepth: v }))
  const widthField = useNumberField(pocket.width, (v) => updatePocket({ width: v }))
  const heightField = useNumberField(pocket.height, (v) => updatePocket({ height: v }))
  const diameterField = useNumberField(pocket.diameter, (v) => updatePocket({ diameter: v }))
  const stepoverField = useNumberField(pocket.stepoverPercent, (v) => updatePocket({ stepoverPercent: v }))
  const helixRadiusField = useNumberField(pocket.helixRadius, (v) => updatePocket({ helixRadius: v }))
  const offsetXField = useNumberField(pocket.offsetX, (v) => updatePocket({ offsetX: v }))
  const offsetYField = useNumberField(pocket.offsetY, (v) => updatePocket({ offsetY: v }))

  const isRect = pocket.shape !== 'circle'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <FieldRow label="Tool Diameter [mm]">
          <select
            className={inputClass}
            value={pocket.toolDiameter}
            onChange={(e) => updatePocket({ toolDiameter: Number(e.target.value) })}
          >
            {resolveToolDiameterSelectOptions(toolDiameters, pocket.toolDiameter).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </FieldRow>
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
        {!isPocketToolDiameterValid(pocket) && (
          <p className="text-sm text-status-error">
            {isRect
              ? 'Tool diameter must be smaller than the shorter side.'
              : "Tool diameter must be smaller than the pocket's diameter."}
          </p>
        )}
      </div>

      <div className="flex gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm font-medium text-value">Method</span>
          <PocketMethodPicker params={params} onChange={onChange} />
        </div>
        {pocket.method === 'raster' && (
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-sm font-medium text-value">Raster Direction</span>
            <RasterDirectionToggle value={pocket.rasterDirection} onChange={(v) => updatePocket({ rasterDirection: v })} />
          </div>
        )}
      </div>

      {isRect ? (
        <div className="flex gap-4">
          <div className="min-w-0 flex-1">
            <FieldRow label="Width [mm]">
              <NumberInput
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
              <NumberInput
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
          <NumberInput
            type="number"
            step="0.1"
            min="0"
            max={Math.min(machine.travelX, machine.travelY)}
            className={inputClass}
            {...diameterField}
          />
        </FieldRow>
      )}

      <div className="flex flex-col gap-4">
        <div className="flex gap-4">
          <div className="min-w-0 flex-1">
            <FieldRow label="Stepover [%]">
              <NumberInput type="number" step="1" min="1" max="100" className={inputClass} {...stepoverField} />
            </FieldRow>
          </div>
          <div className="min-w-0 flex-1">
            <FieldRow label="Stepover [mm]">
              <input
                type="text"
                readOnly
                disabled
                value={fmt(pocketStepoverMm(pocket))}
                className={`${inputClass} cursor-not-allowed opacity-70`}
              />
            </FieldRow>
          </div>
        </div>
        {!isPocketStepoverValid(pocket) && (
          <p className="text-sm text-status-error">Stepover must be between 1% and 100% of the tool diameter.</p>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-sm font-medium text-value">Z-Transition Mode</span>
            <ZTransitionModeToggle value={pocket.zTransitionMode} onChange={(v) => updatePocket({ zTransitionMode: v })} />
          </div>
          {pocket.zTransitionMode === 'helix' && (
            <div className="min-w-0 flex-1">
              <FieldRow label="Helix Radius [mm]">
                <NumberInput type="number" step="0.1" min="0" className={inputClass} {...helixRadiusField} />
              </FieldRow>
            </div>
          )}
        </div>
        {pocket.zTransitionMode === 'helix' && !isPocketHelixRadiusValid(pocket) && (
          <p className="text-sm text-status-error">
            Helix radius must be greater than 0 and can't exceed the pocket's own wall (the tool must fit inside the
            first ring).
          </p>
        )}
      </div>

      <div className="border-t border-border pt-4">
        <span className="mb-2 block text-sm font-medium text-value">Offset</span>
        <p className="mb-2 text-sm text-muted">Shifts the whole pocket from the origin.</p>
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
