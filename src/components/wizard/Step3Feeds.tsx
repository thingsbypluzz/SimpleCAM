import type { WizardParams } from '../../types/wizard'
import type { MachineSettings } from '../../types/machine'
import { METHOD_META } from '../../config/methodMeta'
import { isStartZValid, isStepdownValid } from '../../lib/validation'
import { FieldRow, inputClass } from './FieldRow'

interface Step3FeedsProps {
  params: WizardParams
  onChange: (patch: Partial<WizardParams>) => void
  machine: MachineSettings
}

export function Step3Feeds({ params, onChange, machine }: Step3FeedsProps) {
  const { feeds, method } = params

  const updateFeeds = (patch: Partial<WizardParams['feeds']>) =>
    onChange({ feeds: { ...feeds, ...patch } })

  return (
    <div className="flex flex-col gap-4">
      <FieldRow label={METHOD_META[method].stepdown.fieldLabel}>
        <input
          type="number"
          step="0.05"
          className={inputClass}
          value={feeds.stepdown}
          onChange={(e) => updateFeeds({ stepdown: Number(e.target.value) })}
        />
      </FieldRow>
      {!isStepdownValid(feeds) && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Stepdown must be greater than 0.
        </p>
      )}
      <FieldRow label="Feedrate XY [mm/min]">
        <input
          type="number"
          step="1"
          className={inputClass}
          value={feeds.feedrateXY}
          onChange={(e) => updateFeeds({ feedrateXY: Number(e.target.value) })}
        />
      </FieldRow>
      <FieldRow label="Plunge Rate [mm/min]">
        <input
          type="number"
          step="1"
          className={inputClass}
          value={feeds.plungeRate}
          onChange={(e) => updateFeeds({ plungeRate: Number(e.target.value) })}
        />
      </FieldRow>
      <FieldRow label="Start Z [mm]">
        <input
          type="number"
          step="0.1"
          min="0"
          className={inputClass}
          value={feeds.startZ}
          onChange={(e) => updateFeeds({ startZ: Number(e.target.value) })}
        />
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
          value={feeds.safeZ}
          onChange={(e) => updateFeeds({ safeZ: Number(e.target.value) })}
        />
      </FieldRow>
    </div>
  )
}
