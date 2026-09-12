import type { RasterDirection, WizardParams, ZTransitionMode } from '../../types/wizard'
import type { MachineSettings } from '../../types/machine'
import { isSurfaceHelixRadiusValid, isSurfaceStepoverValid } from '../../lib/validation'
import { surfaceStepoverMm } from '../../lib/surfaceGeometry'
import { fmt } from '../../lib/format'
import { TOOL_DIAMETER_OPTIONS } from '../../config/toolDiameterOptions'
import { FieldRow, inputClass } from './FieldRow'
import { NumberInput } from './NumberInput'
import { SurfaceMethodPicker } from './SurfaceMethodPicker'
import { useNumberField } from './useNumberField'

interface Step2GeometrySurfaceProps {
  params: WizardParams
  onChange: (patch: Partial<WizardParams>) => void
  machine: MachineSettings
}

// Same compact toggle style as OffsetModePicker.tsx/MethodPicker.tsx — kept
// inline (not their own files) since each is a plain 2-option text toggle
// with no icons or shared list to register (unlike SurfaceMethodPicker,
// which reads from the SURFACE_METHOD_LIST registry).
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

// Field order: Tool Diameter -> Cutting Depth -> Width/Height -> Method ->
// Raster Direction -> Stepover (% + read-only mm) -> Z-Transition Mode ->
// Helix Radius (Helix only) -> Offset X/Y — see CLAUDE.md's Surface design
// notes. Mirrors Step2GeometryOutline.tsx's conventions throughout
// (FieldRow/useNumberField, flex-row pairs, border-t section dividers). No
// Tabs section — tabs don't apply to Surface at all (it never isolates or
// cuts through a piece).
export function Step2GeometrySurface({ params, onChange, machine }: Step2GeometrySurfaceProps) {
  const { surface } = params

  const updateSurface = (patch: Partial<WizardParams['surface']>) => onChange({ surface: { ...surface, ...patch } })

  const totalDepthField = useNumberField(surface.totalDepth, (v) => updateSurface({ totalDepth: v }))
  const widthField = useNumberField(surface.width, (v) => updateSurface({ width: v }))
  const heightField = useNumberField(surface.height, (v) => updateSurface({ height: v }))
  const stepoverField = useNumberField(surface.stepoverPercent, (v) => updateSurface({ stepoverPercent: v }))
  const helixRadiusField = useNumberField(surface.helixRadius, (v) => updateSurface({ helixRadius: v }))
  const offsetXField = useNumberField(surface.offsetX, (v) => updateSurface({ offsetX: v }))
  const offsetYField = useNumberField(surface.offsetY, (v) => updateSurface({ offsetY: v }))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <FieldRow label="Tool Diameter [mm]">
          <select
            className={inputClass}
            value={surface.toolDiameter}
            onChange={(e) => updateSurface({ toolDiameter: Number(e.target.value) })}
          >
            {TOOL_DIAMETER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </FieldRow>
        <FieldRow label="Cutting Depth [mm]">
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

      <div className="flex gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm font-medium text-value">Method</span>
          <SurfaceMethodPicker params={params} onChange={onChange} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm font-medium text-value">Raster Direction</span>
          <RasterDirectionToggle value={surface.rasterDirection} onChange={(v) => updateSurface({ rasterDirection: v })} />
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
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-value">Z-Transition Mode</span>
          <ZTransitionModeToggle value={surface.zTransitionMode} onChange={(v) => updateSurface({ zTransitionMode: v })} />
        </div>
        {surface.zTransitionMode === 'helix' && (
          <>
            <FieldRow label="Helix Radius [mm]">
              <NumberInput type="number" step="0.1" min="0" className={inputClass} {...helixRadiusField} />
            </FieldRow>
            {!isSurfaceHelixRadiusValid(surface) && (
              <p className="text-sm text-status-error">
                Helix radius must be greater than 0 and can't exceed the stepover ({fmt(surfaceStepoverMm(surface))}mm).
              </p>
            )}
          </>
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
