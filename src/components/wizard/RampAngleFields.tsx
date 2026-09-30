import type { WizardParams } from '../../types/wizard'
import {
  isRampAngleValid,
  isRampTurnCountWithinLimit,
  MAX_RAMP_ANGLE_DEG,
  MIN_RAMP_ANGLE_DEG,
  rampDescent,
} from '../../lib/validation'
import { fmt } from '../../lib/format'
import { FieldRow, inputClass } from './FieldRow'
import { NumberInput } from './NumberInput'
import { useNumberField } from './useNumberField'

interface RampAngleFieldsProps {
  params: WizardParams
  rampAngleDeg: number
  onChange: (rampAngleDeg: number) => void
}

// BL-80: Ramp Angle + read-only Pitch for the Hole(s) Helix and the Outline
// Circle Helix / Rectangle Ramp — rendered only while that method is active
// (rampDescent() is null otherwise). Pitch comes from the engine's own
// options builder via rampDescent(), so it is exactly what the toolpath uses.
export function RampAngleFields({ params, rampAngleDeg, onChange }: RampAngleFieldsProps) {
  const rampAngleField = useNumberField(rampAngleDeg, onChange)
  const descent = rampDescent(params)
  if (descent === null) return null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          <FieldRow
            label="Ramp [°]"
            hint={`Ramp Angle — how steeply the ${descent.unit === 'turn' ? 'helix' : 'ramp'} descends. Pitch = the lower of Stepdown and what this angle allows over one ${descent.unit}, so Stepdown stays the ceiling — typical 1–3°.`}
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
        <div className="min-w-0 flex-1">
          <FieldRow label={`Pitch [mm/${descent.unit}]`}>
            <input
              type="text"
              readOnly
              disabled
              value={descent.pitch > 0 ? fmt(descent.pitch) : '—'}
              className={`${inputClass} cursor-not-allowed opacity-70`}
            />
          </FieldRow>
        </div>
      </div>
      {!isRampAngleValid(params) && (
        <p className="text-sm text-status-error">
          Ramp angle must be between {MIN_RAMP_ANGLE_DEG}° and {MAX_RAMP_ANGLE_DEG}°.
        </p>
      )}
      {!isRampTurnCountWithinLimit(params) && (
        <p className="text-sm text-status-error">
          Too many {descent.unit}s — the {descent.unit === 'turn' ? 'helix' : 'ramp'} would be cut short by its safety
          limit. Raise the Ramp Angle, or use the Standard method.
        </p>
      )}
    </div>
  )
}
