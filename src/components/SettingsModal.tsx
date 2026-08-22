import { useEffect, useState } from 'react'
import type { MachineSettings } from '../types/machine'
import { inputClass } from './wizard/FieldRow'

interface SettingsModalProps {
  machine: MachineSettings
  onSave: (machine: MachineSettings) => void
  onClose: () => void
}

type TravelField = 'travelX' | 'travelY' | 'travelZ'

// One section today ("Machine"), structured as a list so a future section
// (e.g. G-code dialect, see CLAUDE.md BL-5) is just another array entry,
// not a rewrite of the nav.
const SECTIONS: { id: 'machine'; label: string }[] = [{ id: 'machine', label: 'Machine' }]

const FIELDS: { key: TravelField; label: string }[] = [
  { key: 'travelX', label: 'X travel [mm]' },
  { key: 'travelY', label: 'Y travel [mm]' },
  { key: 'travelZ', label: 'Z travel [mm]' },
]

export function SettingsModal({ machine, onSave, onClose }: SettingsModalProps) {
  // Local text per field so an in-progress edit (e.g. typing "400" one
  // digit at a time) never round-trips through a half-valid number — only
  // committed to machine settings (and localStorage) on blur.
  const [text, setText] = useState<Record<TravelField, string>>({
    travelX: String(machine.travelX),
    travelY: String(machine.travelY),
    travelZ: String(machine.travelZ),
  })
  const [savedField, setSavedField] = useState<TravelField | null>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleBlur = (key: TravelField) => {
    const value = Number(text[key])
    if (!Number.isFinite(value) || value <= 0) {
      // Invalid entry — revert the field instead of persisting garbage.
      setText((prev) => ({ ...prev, [key]: String(machine[key]) }))
      return
    }
    onSave({ ...machine, [key]: value })
    setSavedField(key)
    setTimeout(() => setSavedField((f) => (f === key ? null : f)), 1500)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="flex h-[420px] w-[640px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex w-44 shrink-0 flex-col gap-1 border-r border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
          <span className="mb-2 px-2 text-xs font-semibold tracking-wide text-slate-400 uppercase dark:text-slate-500">
            Settings
          </span>
          {SECTIONS.map((section) => (
            <div
              key={section.id}
              className="rounded-md bg-indigo-50 px-2 py-1.5 text-sm font-medium text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
            >
              {section.label}
            </div>
          ))}
        </div>

        <div className="relative flex flex-1 flex-col gap-4 overflow-y-auto p-6">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="absolute top-4 right-4 flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            ✕
          </button>

          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Machine
          </h2>

          <div className="flex flex-col gap-4">
            {FIELDS.map((field) => (
              <label key={field.key} className="flex flex-col gap-1">
                <span className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                  {field.label}
                  {savedField === field.key && (
                    <span className="text-xs font-normal text-emerald-600 dark:text-emerald-400">
                      ✓ Saved
                    </span>
                  )}
                </span>
                <input
                  type="number"
                  step="1"
                  min="0"
                  className={inputClass}
                  value={text[field.key]}
                  onChange={(e) => setText((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  onBlur={() => handleBlur(field.key)}
                />
              </label>
            ))}
          </div>

          <p className="text-sm text-slate-500 dark:text-slate-400">
            These settings will enforce limits on values you can enter when planning your work.
            They also introduce a soft warning when the planned work doesn't make sense within
            these limits.
          </p>
        </div>
      </div>
    </div>
  )
}
