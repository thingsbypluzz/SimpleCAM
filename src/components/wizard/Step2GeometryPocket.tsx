import type { CutDirection, RasterDirection, WizardParams, ZTransitionMode } from '../../types/wizard'
import type { MachineSettings } from '../../types/machine'
import {
  isPocketHelixRadiusSmall,
  isPocketHelixRadiusValid,
  isPocketOptimalLoadValid,
  isPocketRampAngleValid,
  isPocketStepoverValid,
  isPocketToolDiameterValid,
  MAX_RAMP_ANGLE_DEG,
  pocketMaxHelixRadius,
  MIN_RAMP_ANGLE_DEG,
} from '../../lib/validation'
import {
  chipThinnedFeed,
  chipThinningFactor,
  engagementAngleFor,
  isFeedChipThinningCompensated,
  MAX_OPTIMAL_LOAD_PERCENT,
  MIN_OPTIMAL_LOAD_PERCENT,
  optimalLoadMm,
  optimalLoadPercentFromMm,
} from '../../lib/pocketAdaptiveMath'
import { effectivePocketZTransitionMode } from '../../lib/pocketZTransition'
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

function ZTransitionModeToggle({
  value,
  onChange,
  disabled = false,
}: {
  value: ZTransitionMode
  onChange: (v: ZTransitionMode) => void
  disabled?: boolean
}) {
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
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={[
            'rounded-md border px-2.5 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60',
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

function CutDirectionToggle({ value, onChange }: { value: CutDirection; onChange: (v: CutDirection) => void }) {
  // "Conv." keeps Method + Direction on one line next to three method
  // buttons; the full word is in the tooltip.
  const options: { value: CutDirection; label: string; title: string }[] = [
    { value: 'conventional', label: 'Conv.', title: 'Conventional milling' },
    { value: 'climb', label: 'Climb', title: 'Climb milling' },
  ]
  return (
    <div className="flex gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          title={opt.title}
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

const round2 = (n: number) => Math.round(n * 100) / 100
const round4 = (n: number) => Math.round(n * 10000) / 10000

// Field order: Tool Diameter -> Total Depth -> Method -> Raster Direction
// (Raster only) -> shape size fields -> Stepover (% + read-only mm) ->
// Z-Transition Mode -> Helix Radius (Helix only) -> Offset X/Y — mirrors
// Step2GeometrySurface.tsx's conventions throughout. Adaptive swaps
// Stepover for Optimal Load (% ↔ mm, both editable, % stored; engagement
// angle read-only), adds Direction next to Method and Ramp Angle under the
// helix, and locks Z-Transition on Helix. No Tabs section, same reasoning
// as Surface: Pocket doesn't cut through, nothing to bridge. No Offset
// Mode picker either (unlike Outline) — Pocket is always an inside
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
  const optimalLoadPercentField = useNumberField(
    round2(pocket.optimalLoadPercent),
    (v) => updatePocket({ optimalLoadPercent: v }),
    { syncWhenBlurred: true },
  )
  const optimalLoadMmField = useNumberField(
    round4(optimalLoadMm(pocket.toolDiameter, pocket.optimalLoadPercent)),
    (v) => updatePocket({ optimalLoadPercent: round4(optimalLoadPercentFromMm(pocket.toolDiameter, v)) }),
    { syncWhenBlurred: true },
  )
  const rampAngleField = useNumberField(pocket.rampAngleDeg, (v) => updatePocket({ rampAngleDeg: v }))

  const isRect = pocket.shape !== 'circle'
  const isAdaptive = pocket.method === 'adaptive'
  const zMode = effectivePocketZTransitionMode(pocket)
  const loadValid = isPocketOptimalLoadValid(pocket)
  const thinning = chipThinningFactor(pocket.optimalLoadPercent)
  // Suggest from the pre-compensation feed when one is remembered, so
  // Apply never compounds on an already-compensated Feed XY.
  const thinningBase = pocket.chipThinningBaseFeed ?? params.feeds.feedrateXY
  const suggestedFeed = chipThinnedFeed(thinningBase, pocket.optimalLoadPercent)
  const compensated = isFeedChipThinningCompensated(params.feeds.feedrateXY, pocket.chipThinningBaseFeed, pocket.optimalLoadPercent)

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

      {/* Method sizes to its own buttons (three of them no longer fit half
          the panel) and the companion toggle starts a clear gap after it,
          on the same line. */}
      <div className="flex gap-7">
        <div className="flex shrink-0 flex-col gap-1">
          <span className="text-sm font-medium text-value">Method</span>
          <PocketMethodPicker params={params} onChange={onChange} />
        </div>
        {pocket.method === 'raster' && (
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-sm font-medium text-value">Raster Direction</span>
            <RasterDirectionToggle value={pocket.rasterDirection} onChange={(v) => updatePocket({ rasterDirection: v })} />
          </div>
        )}
        {isAdaptive && (
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-sm font-medium text-value">Direction</span>
            <CutDirectionToggle value={pocket.cutDirection} onChange={(v) => updatePocket({ cutDirection: v })} />
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

      {isAdaptive ? (
        <div className="flex flex-col gap-4">
          <div className="flex gap-4">
            <div className="min-w-0 flex-1">
              <FieldRow
                label="Opt. Load [%]"
                hint="How much of the tool's diameter each pass cuts sideways. Adaptive spaces every pass so the tool's engagement stays at this level everywhere — including tight spots and corners where a normal stepover would bite much deeper."
              >
                <NumberInput
                  type="number"
                  step="1"
                  min={MIN_OPTIMAL_LOAD_PERCENT}
                  max={MAX_OPTIMAL_LOAD_PERCENT}
                  className={inputClass}
                  {...optimalLoadPercentField}
                />
              </FieldRow>
            </div>
            <div className="min-w-0 flex-1">
              <FieldRow label="Opt. Load [mm]">
                <NumberInput type="number" step="0.05" min="0" className={inputClass} {...optimalLoadMmField} />
              </FieldRow>
            </div>
            <div className="min-w-0 flex-1">
              <FieldRow
                label="Engagement [°]"
                hint="The arc of the tool's edge in contact with material while cutting, measured at the tool center — 90° is half the tool buried sideways (a half-width cut), 180° a full slot. Adaptive keeps every pass at or below this angle, which is what keeps the load on each flute steady."
              >
                <input
                  type="text"
                  readOnly
                  disabled
                  value={loadValid ? fmt(round2((engagementAngleFor(pocket.optimalLoadPercent) * 180) / Math.PI)) : '—'}
                  className={`${inputClass} cursor-not-allowed opacity-70`}
                />
              </FieldRow>
            </div>
          </div>
          {!loadValid && (
            <p className="text-sm text-status-error">
              Optimal Load must be between {MIN_OPTIMAL_LOAD_PERCENT}% and {MAX_OPTIMAL_LOAD_PERCENT}% of the tool diameter.
            </p>
          )}
          {loadValid && compensated && (
            <p className="text-sm text-muted">
              Chip thinning ×{fmt(round2(thinning))} — Feedrate XY ({params.feeds.feedrateXY} mm/min) is already compensated
              from {pocket.chipThinningBaseFeed} mm/min.
            </p>
          )}
          {loadValid && !compensated && (
            <div className="flex items-start gap-3">
              <p className="min-w-0 flex-1 text-sm text-muted">
                Chip thinning ×{fmt(round2(thinning))} — at this load each chip is thinner than the feed per tooth. To keep
                the chip load {thinningBase} mm/min was chosen for, consider {suggestedFeed} mm/min.
              </p>
              <button
                type="button"
                // Keep focus where it is — applying the suggestion shouldn't
                // yank the user out of whatever field they were in.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() =>
                  onChange({
                    feeds: { ...params.feeds, feedrateXY: suggestedFeed },
                    pocket: { ...pocket, chipThinningBaseFeed: thinningBase },
                  })
                }
                className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted transition hover:border-field-border hover:text-fg"
              >
                Apply
              </button>
            </div>
          )}
        </div>
      ) : (
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
      )}

      <div className="flex flex-col gap-4">
        <div className="flex gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-sm font-medium text-value">Z-Transition Mode</span>
            <ZTransitionModeToggle
              value={zMode}
              disabled={isAdaptive}
              onChange={(v) => updatePocket({ zTransitionMode: v })}
            />
          </div>
          {zMode === 'helix' && (
            <div className="min-w-0 flex-1">
              <FieldRow label="Helix Radius [mm]">
                <NumberInput type="number" step="0.1" min="0" className={inputClass} {...helixRadiusField} />
              </FieldRow>
            </div>
          )}
        </div>
        {isAdaptive && (
          <p className="text-sm text-muted">
            Adaptive always enters with a Helix — constant engagement can't grow outward from a plunged hole the size of
            the tool.
          </p>
        )}
        {isAdaptive && (
          <div className="flex gap-4">
            <div className="min-w-0 flex-1">
              <FieldRow
                label="Ramp Angle [°]"
                hint="How steeply the entry helix descends. Independent of Stepdown, so a deep Adaptive pass still enters gently — typical 1–3°."
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
        {isAdaptive && !isPocketRampAngleValid(pocket) && (
          <p className="text-sm text-status-error">
            Ramp angle must be between {MIN_RAMP_ANGLE_DEG}° and {MAX_RAMP_ANGLE_DEG}°.
          </p>
        )}
        {zMode === 'helix' && !isPocketHelixRadiusValid(pocket) && (
          <p className="text-sm text-status-error">
            Helix radius must be greater than 0 and at most {fmt(round2(pocketMaxHelixRadius(pocket)))} mm — no more than
            the tool's radius (a wider helix leaves an uncut post in the center) and inside the pocket's own wall.
          </p>
        )}
        {isPocketHelixRadiusSmall(pocket) && isPocketHelixRadiusValid(pocket) && (
          <p className="text-sm text-muted">
            A small helix means many helix turns at this ramp angle and very dense first passes — a radius around a
            quarter to half of the tool diameter enters faster.
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
