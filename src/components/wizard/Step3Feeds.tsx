import type { WizardParams } from '../../types/wizard'
import { OPERATION_META } from '../../config/operationMeta'
import { isStepdownValid } from '../../lib/validation'
import { FieldRow, inputClass } from './FieldRow'

interface Step3FeedsProps {
  params: WizardParams
  onChange: (patch: Partial<WizardParams>) => void
}

export function Step3Feeds({ params, onChange }: Step3FeedsProps) {
  const { feeds, operation } = params

  const updateFeeds = (patch: Partial<WizardParams['feeds']>) =>
    onChange({ feeds: { ...feeds, ...patch } })

  return (
    <div className="flex flex-col gap-4">
      <FieldRow label={OPERATION_META[operation].stepdown.fieldLabel}>
        <input
          type="number"
          step="0.01"
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
      <FieldRow label="Safe Z [mm]">
        <input
          type="number"
          step="0.1"
          className={inputClass}
          value={feeds.safeZ}
          onChange={(e) => updateFeeds({ safeZ: Number(e.target.value) })}
        />
      </FieldRow>
    </div>
  )
}
