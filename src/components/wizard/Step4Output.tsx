import { useState } from 'react'
import type { WizardParams } from '../../types/wizard'
import { buildFilename, downloadTextFile } from '../../lib/download'
import { presetLabel } from '../../lib/presetLabel'
import { PRESET_SLOT_IDS, type PresetSlotId } from '../../lib/storage'

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
          <label key={opt.key} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={Boolean(output[opt.key])}
              onChange={(e) => updateOutput({ [opt.key]: e.target.checked } as Partial<WizardParams['output']>)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            {opt.label}
          </label>
        ))}

        <div className="flex items-center gap-2 pt-2 text-sm text-slate-700 dark:text-slate-300">
          <span>Circle interpolation:</span>
          <div className="flex gap-2">
            {(['arc', 'linear'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => updateOutput({ interpolation: mode })}
                className={[
                  'rounded-md border px-2.5 py-1 text-xs font-medium transition',
                  output.interpolation === mode
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400',
                ].join(' ')}
              >
                {mode === 'arc' ? 'G2/G3 (arcs)' : 'G1 (segments)'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!canGenerate && (
        <p className="text-sm text-red-600 dark:text-red-400">
          {overlayActive
            ? 'Turn off preset overlay (the eye icon in the header) to generate G-code.'
            : 'Fix the highlighted errors in Step 2 / Step 3 before generating.'}
        </p>
      )}

      {warnings.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onGenerate}
        disabled={!canGenerate}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-indigo-600"
      >
        Generate
      </button>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleCopy}
          disabled={!generatedGCode}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
        >
          {copied ? 'Copied!' : 'Copy to clipboard'}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={!generatedGCode}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-indigo-600"
        >
          Download .gcode file
        </button>
      </div>

      <div className="flex flex-col gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Save current settings as preset
        </span>
        <div className="flex gap-3">
          {PRESET_SLOT_IDS.map((id) => {
            const existing = presetSlots[id]
            const justSaved = savedSlot === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleSaveToPreset(id)}
                title={
                  existing
                    ? `Overwrite preset [${id}] — ${presetLabel(existing)}`
                    : `Save current settings to preset [${id}]`
                }
                className={
                  justSaved
                    ? 'flex h-11 w-11 items-center justify-center rounded-md border border-green-500 bg-green-50 text-sm font-semibold text-green-700 dark:bg-green-950/40 dark:text-green-300'
                    : existing
                      ? 'flex h-11 w-11 items-center justify-center rounded-md border border-indigo-300 bg-indigo-50 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-950'
                      : 'flex h-11 w-11 items-center justify-center rounded-md border border-dashed border-slate-300 text-sm font-semibold text-slate-400 hover:border-slate-400 hover:text-slate-600 dark:border-slate-700 dark:text-slate-500 dark:hover:border-slate-600 dark:hover:text-slate-300'
                }
              >
                {justSaved ? '✓' : id}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
