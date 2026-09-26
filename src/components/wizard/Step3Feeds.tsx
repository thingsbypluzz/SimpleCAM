import type { WizardParams } from '../../types/wizard'
import type { MachineSettings } from '../../types/machine'
import {
  descentWarnings,
  isAdaptiveStepdownShallow,
  isPassCountWithinLimit,
  isFeedrateXYValid,
  isPlungeRateValid,
  isPocketLinkingFeedValid,
  isSafeZValid,
  activeTotalDepth,
  isStartZAboveCut,
  isStartZBelowStock,
  minStartZ,
  isStartZValid,
  isStepdownValid,
  MAX_PASSES,
  suggestedAdaptiveStepdown,
} from '../../lib/validation'
import { isFeedChipThinningCompensated } from '../../lib/pocketAdaptiveMath'
import { fmt } from '../../lib/format'
import { FieldRow, inputClass } from './FieldRow'
import { NumberInput } from './NumberInput'
import { useNumberField } from './useNumberField'

interface Step3FeedsProps {
  params: WizardParams
  onChange: (patch: Partial<WizardParams>) => void
  machine: MachineSettings
  // BL-60: the active operation's method label (App.tsx's
  // activeMethodDisplay) — not METHOD_META[params.method], which is always
  // the Hole(s) method regardless of operation.
  stepdownLabel: string
}

export function Step3Feeds({ params, onChange, machine, stepdownLabel }: Step3FeedsProps) {
  const { feeds, pocket } = params
  const isPocketAdaptive = params.operation === 'pocket' && pocket.method === 'adaptive'

  const updateFeeds = (patch: Partial<WizardParams['feeds']>) =>
    onChange({ feeds: { ...feeds, ...patch } })

  // Synced from outside by the Adaptive hint's Apply button below.
  const stepdownField = useNumberField(feeds.stepdown, (v) => updateFeeds({ stepdown: v }), { syncWhenBlurred: true })
  // A hand edit of Feed XY is a fresh deliberate choice — forget the
  // remembered pre-compensation base so Adaptive's chip-thinning suggestion
  // starts over from this new value.
  const feedrateXYField = useNumberField(feeds.feedrateXY, (v) =>
    onChange({
      feeds: { ...feeds, feedrateXY: v },
      ...(pocket.chipThinningBaseFeed !== null ? { pocket: { ...pocket, chipThinningBaseFeed: null } } : {}),
    }),
    // Step 2's chip-thinning Apply can change it from outside.
    { syncWhenBlurred: true },
  )
  const plungeRateField = useNumberField(feeds.plungeRate, (v) => updateFeeds({ plungeRate: v }))
  const startZField = useNumberField(feeds.startZ, (v) => updateFeeds({ startZ: v }))
  const safeZField = useNumberField(feeds.safeZ, (v) => updateFeeds({ safeZ: v }))
  const linkingFeedField = useNumberField(pocket.linkingFeed, (v) => onChange({ pocket: { ...pocket, linkingFeed: v } }))

  return (
    <div className="flex flex-col gap-4">
      <FieldRow
        label="Feedrate XY [mm/min]"
        annotation={
          isPocketAdaptive && isFeedChipThinningCompensated(feeds.feedrateXY, pocket.chipThinningBaseFeed, pocket.optimalLoadPercent) ? (
            <span className="text-status-success">(chip thinning applied)</span>
          ) : undefined
        }
      >
        <NumberInput type="number" step="1" className={inputClass} {...feedrateXYField} />
      </FieldRow>
      {!isFeedrateXYValid(feeds) && <p className="text-sm text-status-error">Feedrate XY must be greater than 0.</p>}
      {isPocketAdaptive && (
        <FieldRow
          label="Linking Feed [mm/min]"
          hint="Feed for moves through already-cleared area — returns between arcs, hops between corners and back to the center before each new level. Always G1 (never a rapid below Safe Z); can safely be higher than Feedrate XY."
        >
          <NumberInput type="number" step="1" className={inputClass} {...linkingFeedField} />
        </FieldRow>
      )}
      {isPocketAdaptive && !isPocketLinkingFeedValid(pocket) && (
        <p className="text-sm text-status-error">Linking Feed must be greater than 0.</p>
      )}
      <FieldRow label="Plunge Rate [mm/min]">
        <NumberInput type="number" step="1" className={inputClass} {...plungeRateField} />
      </FieldRow>
      {!isPlungeRateValid(feeds) && <p className="text-sm text-status-error">Plunge Rate must be greater than 0.</p>}
      <FieldRow label={stepdownLabel}>
        <NumberInput type="number" step="0.05" className={inputClass} {...stepdownField} />
      </FieldRow>
      {!isStepdownValid(feeds) && (
        <p className="text-sm text-status-error">
          Stepdown must be greater than 0.
        </p>
      )}
      {isStepdownValid(feeds) && !isPassCountWithinLimit(params) && (
        <p className="text-sm text-status-error">
          Stepdown is too small for this depth — more than {MAX_PASSES} passes, the toolpath would stop short of the
          full depth.
        </p>
      )}
      {descentWarnings(params).map((warning) => (
        <p
          key={warning}
          className="rounded-md border border-status-warn-border bg-status-warn-bg px-3 py-2 text-xs text-status-warn-fg"
        >
          {warning}
        </p>
      ))}
      {params.operation === 'pocket' && isAdaptiveStepdownShallow(pocket, feeds.stepdown) && (
        <div className="flex items-start gap-3">
          <p className="min-w-0 flex-1 text-sm text-muted">
            Adaptive keeps each pass light, so it can go much deeper — consider a Stepdown of 1–2× the tool diameter (
            {pocket.toolDiameter}–{pocket.toolDiameter * 2} mm). Apply sets {suggestedAdaptiveStepdown(pocket)} mm (1.5×).
          </p>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => updateFeeds({ stepdown: suggestedAdaptiveStepdown(pocket) })}
            className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted transition hover:border-field-border hover:text-fg"
          >
            Apply
          </button>
        </div>
      )}
      <FieldRow label="Start Z [mm]">
        <NumberInput type="number" step="0.1" min="0" className={inputClass} {...startZField} />
      </FieldRow>
      {!isStartZValid(feeds) && (
        <p className="text-sm text-status-error">
          Start Z must not exceed Safe Z.
        </p>
      )}
      {!isStartZAboveCut(params) && (
        <p className="text-sm text-status-error">
          Start Z must be above {fmt(minStartZ(params))} mm — at or below it, the rapid to Start Z would already be
          deeper than {params.feeds.startZ < -activeTotalDepth(params) + 1e-9 ? 'the bottom of the cut' : 'the top of the tab band'}.
        </p>
      )}
      {isStartZAboveCut(params) && isStartZBelowStock(feeds) && (
        <p className="rounded-md border border-status-warn-border bg-status-warn-bg px-3 py-2 text-xs text-status-warn-fg">
          Start Z is below 0 — the rapid down to it goes into the stock unless that material is already cut away.
        </p>
      )}
      <FieldRow label="Safe Z [mm]">
        <NumberInput
          type="number"
          step="0.1"
          min="0"
          max={machine.travelZ}
          className={inputClass}
          {...safeZField}
        />
      </FieldRow>
      {!isSafeZValid(feeds) && (
        <p className="text-sm text-status-error">Safe Z must be above the stock top (greater than 0).</p>
      )}
    </div>
  )
}
