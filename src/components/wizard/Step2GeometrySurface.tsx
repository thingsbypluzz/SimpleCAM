import type { WizardParams } from '../../types/wizard'
import type { MachineSettings } from '../../types/machine'
import {
  isSurfaceEntryHelixWithinLimit,
  isSurfaceRampAngleValid,
  MAX_RAMP_ANGLE_DEG,
  MIN_RAMP_ANGLE_DEG,
  isSurfaceHelixRadiusValid,
  isSurfaceLineCountWithinLimit,
  isSurfaceSizeValid,
  isSurfaceStepoverValid,
} from '../../lib/validation'
import { MAX_LINES } from '../../lib/surfaceRaster'
import { surfaceStepoverMm } from '../../lib/surfaceGeometry'
import { fmt } from '../../lib/format'
import { resolveToolDiameterSelectOptions } from '../../lib/toolDiameterOptions'
import type { ToolDiameterOption } from '../../types/toolDiameters'
import { ToolChipLoad } from './ToolChipLoad'
import { FieldRow, inputClass } from './FieldRow'
import { NumberInput } from './NumberInput'
import { PickHeader } from './PickHeader'
import { SurfaceMethodPicker } from './SurfaceMethodPicker'
import { TextToggle } from './TextToggle'
import { RASTER_DIRECTION_OPTIONS, Z_TRANSITION_MODE_OPTIONS } from './toggleOptions'
import { useNumberField } from './useNumberField'

interface Step2GeometrySurfaceProps {
  params: WizardParams
  onChange: (patch: Partial<WizardParams>) => void
  machine: MachineSettings
  toolDiameters: ToolDiameterOption[]
  flutes: number
  onFlutesChange: (flutes: number) => void
}

// Field order (BL-72): Width/Height -> Depth to Remove -> Tool Diameter ->
// Method + Raster Direction -> Stepover (% + read-only mm) -> Z-Transition
// Mode -> Helix Radius + Ramp Angle (Helix only) -> Offset X/Y — see
// CLAUDE.md's Surface design
// notes. Mirrors Step2GeometryOutline.tsx's conventions throughout
// (FieldRow/useNumberField, flex-row pairs, border-t section dividers). No
// Tabs section — tabs don't apply to Surface at all (it never isolates or
// cuts through a piece).
export function Step2GeometrySurface({ params, onChange, machine, toolDiameters, flutes, onFlutesChange }: Step2GeometrySurfaceProps) {
  const { surface } = params

  const updateSurface = (patch: Partial<WizardParams['surface']>) => onChange({ surface: { ...surface, ...patch } })

  const totalDepthField = useNumberField(surface.totalDepth, (v) => updateSurface({ totalDepth: v }))
  const widthField = useNumberField(surface.width, (v) => updateSurface({ width: v }))
  const heightField = useNumberField(surface.height, (v) => updateSurface({ height: v }))
  const stepoverField = useNumberField(surface.stepoverPercent, (v) => updateSurface({ stepoverPercent: v }))
  const helixRadiusField = useNumberField(surface.helixRadius, (v) => updateSurface({ helixRadius: v }))
  const rampAngleField = useNumberField(surface.rampAngleDeg, (v) => updateSurface({ rampAngleDeg: v }))
  const offsetXField = useNumberField(surface.offsetX, (v) => updateSurface({ offsetX: v }))
  const offsetYField = useNumberField(surface.offsetY, (v) => updateSurface({ offsetY: v }))

  return (
    <div className="flex flex-col gap-6">
      <PickHeader params={params} />

      <div className="flex flex-col gap-4">
        <div className="flex gap-4">
          <div className="min-w-0 flex-1">
            <FieldRow label="Width [mm]">
              <NumberInput type="number" step="0.1" min="0" max={machine.travelX} className={inputClass} {...widthField} />
            </FieldRow>
          </div>
          <div className="min-w-0 flex-1">
            <FieldRow label="Height [mm]">
              <NumberInput type="number" step="0.1" min="0" max={machine.travelY} className={inputClass} {...heightField} />
            </FieldRow>
          </div>
        </div>
        <FieldRow label="Depth to Remove [mm]">
          <NumberInput
            type="number"
            step="0.1"
            min="0"
            max={machine.travelZ}
            className={inputClass}
            {...totalDepthField}
          />
        </FieldRow>
        {!isSurfaceSizeValid(surface) && <p className="text-sm text-status-error">Dimensions and depth must be greater than 0.</p>}
      </div>

      <div className="flex flex-col gap-4">
        <ToolChipLoad params={params} machine={machine} flutes={flutes} onFlutesChange={onFlutesChange}>
          <FieldRow label="Tool Diameter [mm]">
            <select
              className={inputClass}
              value={surface.toolDiameter}
              onChange={(e) => updateSurface({ toolDiameter: Number(e.target.value) })}
            >
              {resolveToolDiameterSelectOptions(toolDiameters, surface.toolDiameter).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </FieldRow>
        </ToolChipLoad>
      </div>

      <div className="flex gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm font-medium text-value">Method</span>
          <SurfaceMethodPicker params={params} onChange={onChange} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm font-medium text-value">Raster Direction</span>
          <TextToggle options={RASTER_DIRECTION_OPTIONS} value={surface.rasterDirection} onChange={(v) => updateSurface({ rasterDirection: v })} />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex gap-4">
          <div className="min-w-0 flex-1">
            <FieldRow label="Stepover [%]">
              <NumberInput type="number" step="1" min="1" max="100" className={inputClass} {...stepoverField} />
            </FieldRow>
          </div>
          <div className="min-w-0 flex-1">
            <FieldRow label="Stepover [mm]">
              <input type="text" readOnly disabled value={fmt(surfaceStepoverMm(surface))} className={`${inputClass} cursor-not-allowed opacity-70`} />
            </FieldRow>
          </div>
        </div>
        {!isSurfaceStepoverValid(surface) && (
          <p className="text-sm text-status-error">Stepover must be between 1% and 100% of the tool diameter.</p>
        )}
        {isSurfaceStepoverValid(surface) && !isSurfaceLineCountWithinLimit(surface) && (
          <p className="text-sm text-status-error">
            Stepover is too small for this area — more than {MAX_LINES} raster lines, part of the surface would be left
            uncut.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-sm font-medium text-value">Z-Transition Mode</span>
            <TextToggle options={Z_TRANSITION_MODE_OPTIONS} value={surface.zTransitionMode} onChange={(v) => updateSurface({ zTransitionMode: v })} />
          </div>
          {surface.zTransitionMode === 'helix' && (
            <div className="min-w-0 flex-1">
              <FieldRow label="Helix Radius [mm]">
                <NumberInput type="number" step="0.1" min="0" className={inputClass} {...helixRadiusField} />
              </FieldRow>
            </div>
          )}
        </div>
        {surface.zTransitionMode === 'helix' && !isSurfaceHelixRadiusValid(surface) && (
          <p className="text-sm text-status-error">
            Helix radius must be greater than 0 and can't exceed the stepover ({fmt(surfaceStepoverMm(surface))}mm).
          </p>
        )}
        {surface.zTransitionMode === 'helix' && (
          <div className="flex gap-4">
            <div className="min-w-0 flex-1">
              <FieldRow
                label="Ramp Angle [°]"
                hint="How steeply the entry helix descends. Independent of Stepdown, so a deep pass still enters gently — typical 1–3°. Every level after the first starts just above the previous floor, so only the new depth is ramped."
              >
                <NumberInput
                  type="number"
                  step="0.5"
                  min={MIN_RAMP_ANGLE_DEG}
                  max={MAX_RAMP_ANGLE_DEG}
                  className={inputClass}
                  {...rampAngleField}
                />
              </FieldRow>
            </div>
            <div className="min-w-0 flex-1" />
          </div>
        )}
        {!isSurfaceRampAngleValid(surface) && (
          <p className="text-sm text-status-error">
            Ramp angle must be between {MIN_RAMP_ANGLE_DEG}° and {MAX_RAMP_ANGLE_DEG}°.
          </p>
        )}
        {!isSurfaceEntryHelixWithinLimit(params) && (
          <p className="text-sm text-status-error">
            Too many helix turns per level — the entry would be cut short by its safety limit. Raise the Ramp Angle or
            Helix Radius.
          </p>
        )}
      </div>

      <div className="border-t border-border pt-4">
        <span className="mb-2 block text-sm font-medium text-value">Offset</span>
        <p className="mb-2 text-sm text-muted">Shifts the whole area from the origin.</p>
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
