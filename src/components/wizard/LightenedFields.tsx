import type { LightLayout, WizardParams } from '../../types/wizard'
import { isPocketLightCellsValid } from '../../lib/validation'
import { MAX_LIGHT_COUNT, MAX_SPOKES, MIN_LIGHT_COUNT, MIN_SPOKES } from '../../lib/pocketLightened'
import { FieldRow, inputClass } from './FieldRow'
import { NumberInput } from './NumberInput'
import { TextToggle, type TextToggleOption } from './TextToggle'
import { useNumberField } from './useNumberField'

interface LightenedFieldsProps {
  params: WizardParams
  onChange: (patch: Partial<WizardParams['pocket']>) => void
}

const LAYOUT_OPTIONS: readonly TextToggleOption<LightLayout>[] = [
  { value: 'xgrid', label: 'X-grid', title: 'N×M cells, each split by its diagonals into 4 triangles' },
  { value: 'triangles', label: 'Triangles', title: 'M rows of N zigzag diagonals — 1 row is a Warren truss' },
]

const whole = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max

// Lightened Pocket pattern fields (OP-6), right after the shape's size:
// Rectangle — Layout on its own row, then N + M + Rib Width; Circle —
// Spokes + Hub + Rib Width, then Start Angle. No rim (BL-84): the shape's size is the area the cells fill,
// like every Pocket shape. Range errors mark the field itself; "a cell is
// too small" marks every field that sizes the cells (the tool is marked in
// Step2).
export function LightenedFields({ params, onChange }: LightenedFieldsProps) {
  const { pocket } = params
  const countXField = useNumberField(pocket.lightCountX, (v) => onChange({ lightCountX: v }))
  const countYField = useNumberField(pocket.lightCountY, (v) => onChange({ lightCountY: v }))
  const spokesField = useNumberField(pocket.spokeCount, (v) => onChange({ spokeCount: v }))
  const hubField = useNumberField(pocket.hubDiameter, (v) => onChange({ hubDiameter: v }))
  const startAngleField = useNumberField(pocket.spokeStartAngle, (v) => onChange({ spokeStartAngle: v }))
  const ribField = useNumberField(pocket.ribWidth, (v) => onChange({ ribWidth: v }))

  const isCircle = pocket.shape === 'circleLightened'
  const isXGrid = pocket.lightLayout === 'xgrid'
  const countXInvalid = !whole(pocket.lightCountX, MIN_LIGHT_COUNT, MAX_LIGHT_COUNT)
  const countYInvalid = !whole(pocket.lightCountY, MIN_LIGHT_COUNT, MAX_LIGHT_COUNT)
  const spokesInvalid = !whole(pocket.spokeCount, MIN_SPOKES, MAX_SPOKES)
  const hubInvalid = !(pocket.hubDiameter >= 0) || pocket.hubDiameter >= pocket.diameter
  const ribInvalid = !(pocket.ribWidth > 0)
  const cellsInvalid = !isPocketLightCellsValid(pocket)

  const ribCell = (
    <div className="min-w-0 flex-1">
      <FieldRow
        label="Rib Width [mm]"
        hint={`Width of the material left between the cells. The ${isCircle ? 'Diameter' : 'Width × Height'} is the area the cells fill, right up to its edge — leave any margin for a later Outline in the size yourself, and check it by overlaying both presets.`}
      >
        <NumberInput type="number" step="0.5" min="0" className={inputClass} aria-invalid={ribInvalid || cellsInvalid} {...ribField} />
      </FieldRow>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      {isCircle ? (
        <>
          <div className="flex items-end gap-4">
            <div className="min-w-0 flex-1">
              <FieldRow label="Spokes" hint="Ribs from the hub to the rim; the sectors between them are cut out.">
                <NumberInput
                  type="number"
                  step="1"
                  min={MIN_SPOKES}
                  max={MAX_SPOKES}
                  className={inputClass}
                  aria-invalid={spokesInvalid || cellsInvalid}
                  {...spokesField}
                />
              </FieldRow>
            </div>
            <div className="min-w-0 flex-1">
              <FieldRow label="Hub [mm]" hint="Diameter of the solid center the spokes start from. 0 lets the spokes meet in the center.">
                <NumberInput type="number" step="0.5" min="0" className={inputClass} aria-invalid={hubInvalid || cellsInvalid} {...hubField} />
              </FieldRow>
            </div>
            {ribCell}
          </div>
          {/* Start Angle alone, in the first of the same three columns. */}
          <div className="flex gap-4">
            <div className="min-w-0 flex-1">
              <FieldRow label="Start [deg]" hint="Angle of the first spoke — 0° = +X, counter-clockwise.">
                <NumberInput type="number" step="1" className={inputClass} {...startAngleField} />
              </FieldRow>
            </div>
            <div className="min-w-0 flex-1" />
            <div className="min-w-0 flex-1" />
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-value">Layout</span>
            <TextToggle options={LAYOUT_OPTIONS} value={pocket.lightLayout} onChange={(v) => onChange({ lightLayout: v })} />
          </div>
          <div className="flex items-end gap-4">
            <div className="min-w-0 flex-1">
              <FieldRow
                label={isXGrid ? 'Cells X' : 'Diagonals'}
                hint={
                  isXGrid
                    ? 'Cells along X (Width), each split into 4 triangles by its diagonals.'
                    : 'Diagonal ribs per row, zigzagging along X — a row has one more cell than diagonals (right triangles at both ends).'
                }
              >
                <NumberInput
                  type="number"
                  step="1"
                  min={MIN_LIGHT_COUNT}
                  max={MAX_LIGHT_COUNT}
                  className={inputClass}
                  aria-invalid={countXInvalid || cellsInvalid}
                  {...countXField}
                />
              </FieldRow>
            </div>
            <div className="min-w-0 flex-1">
              <FieldRow
                label={isXGrid ? 'Cells Y' : 'Rows'}
                hint={isXGrid ? 'Cells along Y (Height).' : 'Rows of triangles along Y — 1 is a Warren truss, more make an isogrid.'}
              >
                <NumberInput
                  type="number"
                  step="1"
                  min={MIN_LIGHT_COUNT}
                  max={MAX_LIGHT_COUNT}
                  className={inputClass}
                  aria-invalid={countYInvalid || cellsInvalid}
                  {...countYField}
                />
              </FieldRow>
            </div>
            {ribCell}
          </div>
        </>
      )}
      {isCircle ? (
        (spokesInvalid || hubInvalid) && (
          <p className="text-sm text-status-error">
            Spokes must be a whole number from {MIN_SPOKES} to {MAX_SPOKES}, and the hub must be at least 0 and smaller than
            the diameter.
          </p>
        )
      ) : (
        (countXInvalid || countYInvalid) && (
          <p className="text-sm text-status-error">
            {isXGrid ? 'Cells' : 'Diagonals and rows'} must be whole numbers from {MIN_LIGHT_COUNT} to {MAX_LIGHT_COUNT}.
          </p>
        )
      )}
      {ribInvalid && <p className="text-sm text-status-error">Rib Width must be greater than 0.</p>}
      {cellsInvalid && (
        <p className="text-sm text-status-error">
          A cell is too small for the tool{pocket.finishingEnabled ? ' plus Stock to Leave' : ''} — use fewer cells, thinner
          ribs, a {isCircle ? 'smaller hub, ' : ''}larger area or a smaller tool.
        </p>
      )}
    </div>
  )
}
