import type { WizardParams } from '../../types/wizard'
import type { MachineSettings } from '../../types/machine'
import { METHOD_META } from '../../config/methodMeta'
import { isStartZValid, isStepdownValid } from '../../lib/validation'
import { FieldRow, inputClass } from './FieldRow'
import { useNumberField } from './useNumberField'

interface Step3FeedsProps {
  params: WizardParams
  onChange: (patch: Partial<WizardParams>) => void
  machine: MachineSettings
}

export function Step3Feeds({ params, onChange, machine }: Step3FeedsProps) {
  const { feeds, method } = params

  const updateFeeds = (patch: Partial<WizardParams['feeds']>) =>
    onChange({ feeds: { ...feeds, ...patch } })

  const stepdownField = useNumberField(feeds.stepdown, (v) => updateFeeds({ stepdown: v }))
  const feedrateXYField = useNumberField(feeds.feedrateXY, (v) => updateFeeds({ feedrateXY: v }))
  const plungeRateField = useNumberField(feeds.plungeRate, (v) => updateFeeds({ plungeRate: v }))
  const startZField = useNumberField(feeds.startZ, (v) => updateFeeds({ startZ: v }))
  const safeZField = useNumberField(feeds.safeZ, (v) => updateFeeds({ safeZ: v }))

  return (
    <div className="flex flex-col gap-4">
      <FieldRow label="Feedrate XY [mm/min]">
        <input type="number" step="1" className={inputClass} {...feedrateXYField} />
      </FieldRow>
      <FieldRow label="Plunge Rate [mm/min]">
        <input type="number" step="1" className={inputClass} {...plungeRateField} />
      </FieldRow>
      <FieldRow label={METHOD_META[method].stepdown.fieldLabel}>
        <input type="number" step="0.05" className={inputClass} {...stepdownField} />
      </FieldRow>
      {!isStepdownValid(feeds) && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Stepdown must be greater than 0.
        </p>
      )}
      <FieldRow label="Start Z [mm]">
        <input type="number" step="0.1" min="0" className={inputClass} {...startZField} />
      </FieldRow>
      {!isStartZValid(feeds) && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Start Z must not exceed Safe Z.
        </p>
      )}
      <FieldRow label="Safe Z [mm]">
        <input
          type="number"
          step="0.1"
          min="0"
          max={machine.travelZ}
          className={inputClass}
          {...safeZField}
        />
      </FieldRow>
    </div>
  )
}
