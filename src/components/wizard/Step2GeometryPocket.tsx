import type { WizardParams } from '../../types/wizard'
import type { MachineSettings } from '../../types/machine'
import {
  isPocketHelixRadiusSmall,
  isPocketHelixRadiusValid,
  isPocketOptimalLoadValid,
  isPocketRampAngleValid,
  isPocketIslandValid,
  isPocketSizeValid,
  isPocketStepoverValid,
  isPocketRampLengthValid,
  isPocketLightCellsValid,
  MAX_RAMP_LENGTH_FACTOR,
  MIN_RAMP_LENGTH_FACTOR,
  isPocketStockToLeaveValid,
  isPocketToolDiameterValid,
  isPocketToolpathWithinLimits,
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
import { pocketStepoverMm, spiralRampEngagementDeg } from '../../lib/pocketGeometry'
import { fmt } from '../../lib/format'
import { resolveToolDiameterSelectOptions } from '../../lib/toolDiameterOptions'
import type { ToolDiameterOption } from '../../types/toolDiameters'
import { ToolChipLoad } from './ToolChipLoad'
import { Checkbox } from './Checkbox'
import { HintPopover } from './HintPopover'
import { InfoNote } from './InfoNote'
import { FieldRow, inputClass } from './FieldRow'
import { NumberInput } from './NumberInput'
import { PickHeader } from './PickHeader'
import { PocketMethodPicker } from './PocketMethodPicker'
import { TextToggle } from './TextToggle'
import { CUT_DIRECTION_OPTIONS, Z_TRANSITION_MODE_OPTIONS } from './toggleOptions'
import { useNumberField } from './useNumberField'
import { LightenedFields } from './LightenedFields'
import { isLightenedShape } from '../../lib/pocketLightened'

interface Step2GeometryPocketProps {
  params: WizardParams
  onChange: (patch: Partial<WizardParams>) => void
  machine: MachineSettings
  toolDiameters: ToolDiameterOption[]
  flutes: number
  onFlutesChange: (flutes: number) => void
}

const round2 = (n: number) => Math.round(n * 100) / 100
const round4 = (n: number) => Math.round(n * 10000) / 10000

// Field order (BL-72): shape size fields + Depth (one row) -> Lightened
// pattern (OP-6: Layout, then N + M + Rib Width; or Spokes + Hub + Rib
// Width, then Start — LightenedFields.tsx) -> Tool Diameter ->
// Method (+ Direction) -> Stepover (% + read-only mm) + Ramp Length (one
// row, BL-41, engagement readout below it) -> Z-Transition Mode
// + Helix Radius + Ramp Angle (one row, helix fields only in Helix mode)
// -> Finishing Pass + Stock to Leave (one row, BL-42) -> Offset X/Y —
// mirrors Step2GeometrySurface.tsx's conventions throughout. Adaptive swaps
// Stepover for Optimal Load (% ↔ mm, both editable, % stored; engagement
// angle read-only), adds Direction next to Method, and locks Z-Transition
// on Helix (the reason in a hint next to its label). No Tabs section, same reasoning
// as Surface: Pocket doesn't cut through, nothing to bridge. No Offset
// Mode picker either (unlike Outline) — Pocket is always an inside
// cut, there's no other physically meaningful mode.
export function Step2GeometryPocket({ params, onChange, machine, toolDiameters, flutes, onFlutesChange }: Step2GeometryPocketProps) {
  const { pocket } = params

  const updatePocket = (patch: Partial<WizardParams['pocket']>) => onChange({ pocket: { ...pocket, ...patch } })

  const totalDepthField = useNumberField(pocket.totalDepth, (v) => updatePocket({ totalDepth: v }))
  const widthField = useNumberField(pocket.width, (v) => updatePocket({ width: v }))
  const heightField = useNumberField(pocket.height, (v) => updatePocket({ height: v }))
  const diameterField = useNumberField(pocket.diameter, (v) => updatePocket({ diameter: v }))
  const islandField = useNumberField(pocket.islandDiameter, (v) => updatePocket({ islandDiameter: v }))
  const stepoverField = useNumberField(pocket.stepoverPercent, (v) => updatePocket({ stepoverPercent: v }))
  const rampLengthField = useNumberField(pocket.rampLengthFactor, (v) => updatePocket({ rampLengthFactor: v }))
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
  const stockToLeaveField = useNumberField(pocket.stockToLeave, (v) => updatePocket({ stockToLeave: v }))

  const isDonut = pocket.shape === 'donut'
  const isRect = pocket.shape !== 'circle' && pocket.shape !== 'circleLightened' && !isDonut
  const isLightened = isLightenedShape(pocket.shape)
  const cellsInvalid = !isPocketLightCellsValid(pocket)
  const isAdaptive = pocket.method === 'adaptive'
  const zMode = effectivePocketZTransitionMode(pocket)
  const loadValid = isPocketOptimalLoadValid(pocket)
  const thinning = chipThinningFactor(pocket.optimalLoadPercent)
  // Suggest from the pre-compensation feed when one is remembered, so
  // Apply never compounds on an already-compensated Feed XY.
  const thinningBase = pocket.chipThinningBaseFeed ?? params.feeds.feedrateXY
  const suggestedFeed = chipThinnedFeed(thinningBase, pocket.optimalLoadPercent)
  const compensated = isFeedChipThinningCompensated(params.feeds.feedrateXY, pocket.chipThinningBaseFeed, pocket.optimalLoadPercent)

  // BL-66: the same conditions that show the errors below also mark the
  // fields they concern (aria-invalid -> error styling in inputClass).
  const toolInvalid = !isPocketToolDiameterValid(pocket)
  const widthIsShorter = pocket.width <= pocket.height
  const widthInvalid = !(pocket.width > 0) || (toolInvalid && widthIsShorter)
  const heightInvalid = !(pocket.height > 0) || (toolInvalid && !widthIsShorter)
  const diameterInvalid = !(pocket.diameter > 0) || toolInvalid
  const islandInvalid = !isPocketIslandValid(pocket) || (isDonut && toolInvalid)
  const depthInvalid = !(pocket.totalDepth > 0)
  const stepoverInvalid = !isPocketStepoverValid(pocket)
  const rampLengthInvalid = !isPocketRampLengthValid(pocket)
  const spiralEngagement = spiralRampEngagementDeg(pocket)
  const rampInvalid = !isPocketRampAngleValid(pocket)
  const helixRadiusInvalid = zMode === 'helix' && !isPocketHelixRadiusValid(pocket)
  const limitInvalid = !isPocketToolpathWithinLimits(params)
  const stockInvalid = !isPocketStockToLeaveValid(pocket)

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
          // Circle: Diameter + Depth on one row, like Hole(s).
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
                  {...diameterField}
                />
              </FieldRow>
            </div>
            {isDonut && (
              <div className="min-w-0 flex-1">
                <FieldRow
                  label="Island ⌀ [mm]"
                  hint="Diameter of the island left standing in the middle. The ring between it and the Diameter is cleared."
                >
                  <NumberInput
                    type="number"
                    step="0.1"
                    min="0"
                    max={pocket.diameter}
                    className={inputClass}
                    aria-invalid={islandInvalid}
                    {...islandField}
                  />
                </FieldRow>
              </div>
            )}
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
        {!isPocketSizeValid(pocket) && (
          <p className="text-sm text-status-error">
            {isPocketIslandValid(pocket)
              ? 'Dimensions and depth must be greater than 0.'
              : 'Island diameter must be greater than 0 and smaller than the Diameter.'}
          </p>
        )}
      </div>

      {isLightened && <LightenedFields params={params} onChange={updatePocket} />}

      <div className="flex flex-col gap-4">
        <ToolChipLoad params={params} machine={machine} flutes={flutes} onFlutesChange={onFlutesChange}>
          <FieldRow label="Tool Diam. [mm]">
            <select
              className={inputClass}
              aria-invalid={toolInvalid || cellsInvalid}
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
        </ToolChipLoad>
        {toolInvalid && (
          <p className="text-sm text-status-error">
            {isDonut
              ? 'The tool must fit between the island and the outer wall — at most half the difference of the two diameters.'
              : isRect
              ? 'Tool diameter must be smaller than the shorter side.'
              : "Tool diameter must be smaller than the pocket's diameter."}
          </p>
        )}
      </div>

      {/* Method sizes to its own buttons and the companion toggle starts a
          clear gap after it, on the same line. */}
      <div className="flex gap-7">
        <div className="flex shrink-0 flex-col gap-1">
          <span className="text-sm font-medium text-value">Method</span>
          <PocketMethodPicker params={params} onChange={onChange} />
        </div>
        {isAdaptive && (
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-sm font-medium text-value">Direction</span>
            <TextToggle options={CUT_DIRECTION_OPTIONS} value={pocket.cutDirection} onChange={(v) => updatePocket({ cutDirection: v })} />
          </div>
        )}
      </div>

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
                  aria-invalid={!loadValid || limitInvalid}
                  {...optimalLoadPercentField}
                />
              </FieldRow>
            </div>
            <div className="min-w-0 flex-1">
              <FieldRow label="Opt. Load [mm]">
                <NumberInput
                  type="number"
                  step="0.05"
                  min="0"
                  className={inputClass}
                  aria-invalid={!loadValid || limitInvalid}
                  {...optimalLoadMmField}
                />
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
            <InfoNote id="pocket-chip-thinning" title={`Chip thinning ×${fmt(round2(thinning))}`}>
              Feedrate XY ({params.feeds.feedrateXY} mm/min) is already compensated from {pocket.chipThinningBaseFeed}{' '}
              mm/min.
            </InfoNote>
          )}
          {loadValid && !compensated && (
            <InfoNote
              id="pocket-chip-thinning"
              title={`Chip thinning ×${fmt(round2(thinning))}`}
              action={
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
              }
            >
              At this load each chip is thinner than the feed per tooth. To keep the chip load {thinningBase} mm/min was
              chosen for, consider {suggestedFeed} mm/min.
            </InfoNote>
          )}
        </div>
      ) : (
      <div className="flex flex-col gap-4">
        <div className="flex gap-4">
          <div className="min-w-0 flex-1">
            <FieldRow label="Stepover [%]">
              <NumberInput
                type="number"
                step="1"
                min="1"
                max="100"
                className={inputClass}
                aria-invalid={stepoverInvalid || limitInvalid}
                {...stepoverField}
              />
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
          <div className="min-w-0 flex-1">
            <FieldRow
              label="Ramp Length [×]"
              hint="How far the tool travels around while stepping out to the next ring: the ramp's length = this × the ring spacing (Stepover). Lower is a shorter, more aggressive step-out (1 ≈ 45° outward), higher a gentler one (10 ≈ 6°). The readout below shows what it does to the engagement. Default 3."
            >
              <NumberInput
                type="number"
                step="0.5"
                min={MIN_RAMP_LENGTH_FACTOR}
                max={MAX_RAMP_LENGTH_FACTOR}
                className={inputClass}
                aria-invalid={rampLengthInvalid}
                {...rampLengthField}
              />
            </FieldRow>
          </div>
        </div>
        {stepoverInvalid && (
          <p className="text-sm text-status-error">Stepover must be between 1% and 100% of the tool diameter.</p>
        )}
        {rampLengthInvalid && (
          <p className="text-sm text-status-error">
            Ramp Length must be between {MIN_RAMP_LENGTH_FACTOR}× and {MAX_RAMP_LENGTH_FACTOR}×.
          </p>
        )}
        {!stepoverInvalid && !rampLengthInvalid && (
          <p className="text-sm text-muted">
            Engagement: {Math.round(spiralEngagement.ring)}° on each ring, up to {Math.round(spiralEngagement.ramp)}° while
            ramping out to the next one.
          </p>
        )}
      </div>
      )}

      <div className="flex flex-col gap-4">
        {/* Z-Transition + Helix Radius + Ramp Angle on one row; the helix
            fields leave their cells empty in Plunge mode. */}
        <div className="flex gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex items-center gap-1.5 text-sm font-medium text-value">
              Z-Transition
              {isDonut && !isAdaptive && (
                <HintPopover text="Donut enters on its first lap, right next to the island: Plunge goes straight down at the lap's start, Helix ramps down along the lap itself at the Ramp Angle." />
              )}
              {isAdaptive && (
                <HintPopover text="Adaptive always enters with a Helix — constant engagement can't grow outward from a plunged hole the size of the tool." />
              )}
            </span>
            <TextToggle
              options={Z_TRANSITION_MODE_OPTIONS}
              value={zMode}
              disabled={isAdaptive}
              onChange={(v) => updatePocket({ zTransitionMode: v })}
            />
          </div>
          <div className="min-w-0 flex-1">
            {zMode === 'helix' && !(isDonut && !isAdaptive) && (
              <FieldRow label="Helix R. [mm]">
                <NumberInput
                  type="number"
                  step="0.1"
                  min="0"
                  className={inputClass}
                  aria-invalid={helixRadiusInvalid || limitInvalid}
                  {...helixRadiusField}
                />
              </FieldRow>
            )}
          </div>
          <div className="min-w-0 flex-1">
            {zMode === 'helix' && (
              <FieldRow
                label="Ramp [°]"
                hint="Ramp Angle — how steeply the entry helix descends. Independent of Stepdown, so a deep pass still enters gently — typical 1–3°. Every level after the first starts just above the previous floor, so only the new depth is ramped."
              >
                <NumberInput
                  type="number"
                  step="0.5"
                  min={MIN_RAMP_ANGLE_DEG}
                  max={MAX_RAMP_ANGLE_DEG}
                  className={inputClass}
                  aria-invalid={rampInvalid || limitInvalid}
                  {...rampAngleField}
                />
              </FieldRow>
            )}
          </div>
        </div>
        {rampInvalid && (
          <p className="text-sm text-status-error">
            Ramp angle must be between {MIN_RAMP_ANGLE_DEG}° and {MAX_RAMP_ANGLE_DEG}°.
          </p>
        )}
        {helixRadiusInvalid && (
          <p className="text-sm text-status-error">
            Helix radius must be greater than 0 and at most {fmt(round2(pocketMaxHelixRadius(pocket)))} mm — no more than
            the tool's radius (a wider helix leaves an uncut post in the center) and inside{' '}
            {isLightened ? "the smallest cell's wall" : isDonut ? 'half the width the ring leaves the tool' : "the pocket's own wall"}.
          </p>
        )}
        {isPocketHelixRadiusSmall(pocket) && isPocketHelixRadiusValid(pocket) && (
          <InfoNote id="pocket-small-helix" title="Small helix radius">
            A small helix means many helix turns at this ramp angle and very dense first passes — a radius around a
            quarter to half of the tool diameter enters faster.
          </InfoNote>
        )}
        {limitInvalid && (
          <p className="text-sm text-status-error">
            {isAdaptive
              ? 'This pocket needs too many helix turns or passes — the toolpath would be cut short by its safety limit. Raise the Ramp Angle, Helix Radius or Optimal Load, or lower Stepdown.'
              : zMode === 'helix'
                ? 'Too many helix turns or passes — the toolpath would be cut short by its safety limit. Raise the Ramp Angle, Helix Radius or Stepover.'
                : 'Stepover is too small for this pocket — too many passes, the toolpath would be cut short by its safety limit.'}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4 border-t border-border pt-4">
        {/* Checkbox and Stock to Leave on one row — the checkbox sits on the
            input's line (h-[38px] = inputClass height). */}
        <div className="flex items-end gap-4">
          <div className="flex h-[38px] min-w-0 flex-1 items-center">
            <Checkbox
              checked={pocket.finishingEnabled}
              // Finish Feed starts from the current Feed XY on every enable,
              // like Outline's Tabs start from their Settings defaults.
              onChange={(enabled) =>
                updatePocket(enabled ? { finishingEnabled: true, finishFeed: params.feeds.feedrateXY } : { finishingEnabled: false })
              }
              label="Finishing Pass"
              className="text-sm font-medium text-value"
            >
              <HintPopover text="Roughing stops Stock to Leave short of the walls; after the whole pocket is roughed, one clean lap per Stepdown level takes that last layer off the walls at the Finish Feed (Step 3), entering and leaving along a tangent arc. Walls only — the floor is always cut to full depth." />
            </Checkbox>
          </div>
          <div className="min-w-0 flex-1">
            {pocket.finishingEnabled && (
              <FieldRow label="Stock to Leave [mm]">
                <NumberInput type="number" step="0.05" min="0" className={inputClass} aria-invalid={stockInvalid} {...stockToLeaveField} />
              </FieldRow>
            )}
          </div>
        </div>
        {stockInvalid && (
          <p className="text-sm text-status-error">
            Stock to Leave must be greater than 0, at most the tool's radius ({fmt(round4(pocket.toolDiameter / 2))} mm),
            and leave room inside the walls for roughing.
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
