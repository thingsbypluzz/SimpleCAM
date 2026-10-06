import { useState } from 'react'
import type { WizardParams } from '../../types/wizard'
import { buildFilename, downloadTextFile } from '../../lib/download'
import { forcedLinearReason } from '../../lib/interpolation'
import { presetLabel } from '../../lib/presetLabel'
import { PRESET_SLOT_IDS, type PresetSlotId } from '../../lib/storage'
import { OPERATION_META } from '../../config/operationMeta'
import { Checkbox } from './Checkbox'
import { TextToggle } from './TextToggle'
import { INTERPOLATION_OPTIONS } from './toggleOptions'

interface Step4OutputProps {
  params: WizardParams
  onChange: (patch: Partial<WizardParams>) => void
  generatedGCode: string[] | null
  onGenerate: () => void
  canGenerate: boolean
  overlayActive: boolean
  presetSlots: Partial<Record<PresetSlotId, WizardParams>>
  onSaveToPreset: (id: PresetSlotId) => boolean
  warnings: string[]
}

interface CheckboxOption {
  key: keyof WizardParams['output']
  label: string
}

const CHECKBOX_OPTIONS: CheckboxOption[] = [
  { key: 'spindleStart', label: 'Start spindle at the beginning (M3 + dwell)' },
  { key: 'spindleStopEnd', label: 'Stop spindle (M5) at the end' },
  { key: 'returnOriginEnd', label: 'Return to (0,0) at the end of the program' },
]

export function Step4Output({
  params,
  onChange,
  generatedGCode,
  onGenerate,
  canGenerate,
  overlayActive,
  presetSlots,
  onSaveToPreset,
  warnings,
}: Step4OutputProps) {
  const { output } = params
  const [copied, setCopied] = useState(false)
  const [savedSlot, setSavedSlot] = useState<PresetSlotId | null>(null)

  const updateOutput = (patch: Partial<WizardParams['output']>) =>
    onChange({ output: { ...output, ...patch } })

  const forcedLinearBy = forcedLinearReason(params)
  const forcedLinear = forcedLinearBy !== null

  const handleCopy = async () => {
    if (!generatedGCode) return
    await navigator.clipboard.writeText(generatedGCode.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleDownload = () => {
    if (!generatedGCode) return
    downloadTextFile(buildFilename(params), generatedGCode.join('\n'))
  }

  const handleSaveToPreset = (id: PresetSlotId) => {
    if (!onSaveToPreset(id)) return
    setSavedSlot(id)
    setTimeout(() => setSavedSlot(null), 1500)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        {CHECKBOX_OPTIONS.map((opt) => (
          <Checkbox
            key={opt.key}
            checked={Boolean(output[opt.key])}
            onChange={(checked) => updateOutput({ [opt.key]: checked } as Partial<WizardParams['output']>)}
            label={opt.label}
            className="text-sm text-value"
          />
        ))}
        <p className="text-xs text-muted">Spindle speed and dwell time are set in Settings → Machine.</p>

        <div className="flex items-center gap-2 pt-2 text-sm text-value">
          <span>Circle interpolation:</span>
          <TextToggle
            options={INTERPOLATION_OPTIONS}
            value={forcedLinear ? 'linear' : output.interpolation}
            disabled={forcedLinear}
            onChange={(mode) => updateOutput({ interpolation: mode })}
          />
        </div>
        {forcedLinear && (
          <p className="text-xs text-muted">
            {forcedLinearBy === 'rectOutline'
              ? 'G2/G3 disabled — Rectangle outlines are always straight-edge (G1).'
              : forcedLinearBy === 'facing'
                ? 'G2/G3 disabled — Facing is straight lines only (G1).'
                : 'G2/G3 disabled — Tabs (Step 2) require G1 interpolation.'}
          </p>
        )}
      </div>

      {!canGenerate && (
        <p className="text-sm text-status-error">
          {overlayActive
            ? 'Turn off preset overlay (the eye icon in the header) to generate G-code.'
            : 'Fix the highlighted errors in Step 2 / Step 3 before generating.'}
        </p>
      )}

      {warnings.length > 0 && (
        <div className="rounded-md border border-status-warn-border bg-status-warn-bg px-3 py-2 text-xs text-status-warn-fg">
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onGenerate}
        disabled={!canGenerate}
        className="rounded-md bg-btn-bg px-4 py-2 text-sm font-medium text-btn-fg shadow-[var(--glow-btn)] hover:bg-btn-bg-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-btn-bg"
      >
        Generate
      </button>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleCopy}
          disabled={!generatedGCode}
          className="rounded-md border border-field-border px-4 py-2 text-sm font-medium text-value hover:bg-border/40 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          {copied ? 'Copied!' : 'Copy to clipboard'}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={!generatedGCode}
          className="rounded-md bg-btn-bg px-4 py-2 text-sm font-medium text-btn-fg shadow-[var(--glow-btn)] hover:bg-btn-bg-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-btn-bg"
        >
          Download .gcode file
        </button>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <span className="text-xs font-medium text-muted">
          Save current settings as preset
        </span>
        {/* gap-1.5: seven 44 px slots have to fit the 420 px panel, scrollbar included. */}
        <div className="flex gap-1.5">
          {PRESET_SLOT_IDS.map((id) => {
            const existing = presetSlots[id]
            const justSaved = savedSlot === id
            // BL-87: a saved slot looks exactly like it does in the Header's
            // Preset Bar (accent frame + the preset's icon); an empty one is
            // a dashed, dim frame with its number — so the two states differ
            // by content and border, not by color alone.
            const PresetIcon = existing ? OPERATION_META[existing.operation].pickIcon(existing) : null
            const label = existing
              ? `Overwrite preset [${id}] — ${presetLabel(existing)}`
              : `Save current settings to preset [${id}] — empty`
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleSaveToPreset(id)}
                title={label}
                aria-label={label}
                className={
                  justSaved
                    ? 'flex h-11 w-11 items-center justify-center rounded-md border border-status-success bg-status-success-bg text-sm font-semibold text-status-success'
                    : existing
                      ? 'flex h-11 w-11 items-center justify-center rounded-md border border-accent-border text-accent-fg shadow-[var(--glow-accent)] hover:bg-accent-bg'
                      : 'flex h-11 w-11 items-center justify-center rounded-md border border-dashed border-empty-border text-xs font-semibold text-empty-fg hover:border-field-border hover:text-muted'
                }
              >
                {justSaved ? '✓' : PresetIcon ? <PresetIcon className="h-7 w-7" /> : id}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
