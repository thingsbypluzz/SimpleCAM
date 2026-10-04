import { useState } from 'react'
import { getPaletteAccents, PALETTE_LIST } from '../config/palettes'
import type { Dialect, MachineSettings, Rigidity } from '../types/machine'
import type { AppearanceSettings, Grid3DLabelSize } from '../types/appearance'
import { THEME_LIST } from '../types/theme'
import { isRouterId, ROUTER_IDS, ROUTERS } from '../config/routers'
import { DEFAULT_TOOL_DIAMETER_OPTIONS, type ToolDiameterOption } from '../types/toolDiameters'
import { formatToolDiameterLabel } from '../lib/toolDiameterOptions'
import { isToolDiameterEntryValid, isValidTabCount, MAX_TOOL_DIAMETER_COUNT } from '../lib/validation'
import { Checkbox } from './wizard/Checkbox'
import { inputClass } from './wizard/FieldRow'
import { NumberInput } from './wizard/NumberInput'
import { roundToStepPrecision } from './wizard/useNumberField'
import { useModalFocus } from './useModalFocus'

interface SettingsModalProps {
  machine: MachineSettings
  onSave: (machine: MachineSettings) => void
  appearance: AppearanceSettings
  onSaveAppearance: (appearance: AppearanceSettings) => void
  toolDiameters: ToolDiameterOption[]
  onSaveToolDiameters: (options: ToolDiameterOption[]) => void
  onResetAll: () => void
  onClose: () => void
}

type TravelField = 'travelX' | 'travelY' | 'travelZ'
type TabDefaultField = 'defaultTabHeight' | 'defaultTabWidth' | 'defaultTabCount'
type SpindleField = 'spindleSpeed' | 'dwellSeconds'
type LimitField = 'spindleMinRpm' | 'spindleMaxRpm' | 'maxFeed'
// All groups are plain positive numbers (dwell may also be 0), sharing one
// local-buffer/onBlur mechanism (text/savedField/handleBlur below) — only
// the field list and per-field step/label differ.
type NumericField = TravelField | TabDefaultField | SpindleField | LimitField
type CodeField = 'headerText' | 'footerText'
type SectionId = 'machine' | 'controller' | 'tabs' | 'toolDiameters' | 'appearance' | 'privacy' | 'reset' | 'about'

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'machine', label: 'Machine' },
  { id: 'controller', label: 'Controller' },
  { id: 'tabs', label: 'Tabs' },
  { id: 'toolDiameters', label: 'Tool Diameters' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'reset', label: 'Reset' },
  { id: 'about', label: 'About' },
]

const FIELDS: { key: TravelField; label: string }[] = [
  { key: 'travelX', label: 'X travel [mm]' },
  { key: 'travelY', label: 'Y travel [mm]' },
  { key: 'travelZ', label: 'Z travel [mm]' },
]

// BL-14: template applied whenever "Enable Tabs" is checked on Step 2 —
// see Step2Geometry.tsx and the note on MachineSettings itself.
const TAB_DEFAULT_FIELDS: { key: TabDefaultField; label: string; step: string }[] = [
  { key: 'defaultTabHeight', label: 'Height [mm]', step: '0.1' },
  { key: 'defaultTabWidth', label: 'Width [mm]', step: '0.1' },
  { key: 'defaultTabCount', label: 'Count', step: '1' },
]

// BL-53: emitted as `M3 S<speed>` + `G4 P<dwell>` when Step 4's "Start
// spindle" is checked.
// BL-68: Spindle Speed shares its row with the spindle's range, which the
// Feedrate Calculator clamps its suggestion to; dwell sits with the other
// calculator limits below.
const SPINDLE_FIELDS: { key: SpindleField | LimitField; label: string; step: string }[] = [
  { key: 'spindleSpeed', label: 'Spindle Speed [RPM]', step: '100' },
  { key: 'spindleMinRpm', label: 'Min RPM', step: '100' },
  { key: 'spindleMaxRpm', label: 'Max RPM', step: '100' },
]

const MOTION_FIELDS: { key: SpindleField | LimitField; label: string; step: string }[] = [
  { key: 'dwellSeconds', label: 'Spin-up Dwell [s]', step: '0.5' },
  { key: 'maxFeed', label: 'Max Feed [mm/min]', step: '100' },
]

const RIGIDITY_OPTIONS: { value: Rigidity; label: string }[] = [
  { value: 'light', label: 'Light (router on extrusions)' },
  { value: 'medium', label: 'Medium' },
  { value: 'rigid', label: 'Rigid (steel / cast frame)' },
]

const DIALECT_OPTIONS: { value: Dialect; label: string }[] = [
  { value: 'grbl', label: 'GRBL' },
  { value: 'marlin', label: 'Marlin' },
  { value: 'mach3', label: 'Mach3' },
]

const CODE_FIELDS: { key: CodeField; label: string; placeholder: string }[] = [
  { key: 'headerText', label: 'Start G-Code', placeholder: '; e.g. G28, custom homing…' },
  { key: 'footerText', label: 'End G-Code', placeholder: '; e.g. coolant off…' },
]

function numericTextFrom(machine: MachineSettings): Record<NumericField, string> {
  return {
    travelX: String(machine.travelX),
    travelY: String(machine.travelY),
    travelZ: String(machine.travelZ),
    defaultTabHeight: String(machine.defaultTabHeight),
    defaultTabWidth: String(machine.defaultTabWidth),
    defaultTabCount: String(machine.defaultTabCount),
    spindleSpeed: String(machine.spindleSpeed),
    dwellSeconds: String(machine.dwellSeconds),
    spindleMinRpm: String(machine.spindleMinRpm),
    spindleMaxRpm: String(machine.spindleMaxRpm),
    maxFeed: String(machine.maxFeed),
  }
}

function codeTextFrom(machine: MachineSettings): Record<CodeField, string> {
  return { headerText: machine.headerText, footerText: machine.footerText }
}

export function SettingsModal({
  machine,
  onSave,
  appearance,
  onSaveAppearance,
  toolDiameters,
  onSaveToolDiameters,
  onResetAll,
  onClose,
}: SettingsModalProps) {
  const [activeSection, setActiveSection] = useState<SectionId>('machine')
  // Local text per field so an in-progress edit (e.g. typing "400" one
  // digit at a time) never round-trips through a half-valid number — only
  // committed to machine settings (and localStorage) on blur. Shared by
  // travel and default-tab-size fields alike (both plain positive numbers).
  const [text, setText] = useState(() => numericTextFrom(machine))
  const [savedField, setSavedField] = useState<NumericField | null>(null)
  // Same "local buffer, commit on blur" pattern as the numeric travel
  // fields — here purely to avoid a localStorage write per keystroke, not
  // for validation (any string is a valid header/footer).
  const [codeText, setCodeText] = useState(() => codeTextFrom(machine))
  // BL-56: the buffers above are seeded once, so after "Reset All Settings"
  // (which replaces `machine` while the modal stays open) they kept showing
  // the old values — and blurring a Start/End G-Code field wrote the old
  // text straight back. Re-seed them whenever `machine` is replaced from
  // outside; React's "adjust state while rendering" pattern, so there's no
  // extra render with stale buffers. Every commit path in this modal
  // writes the buffer's own value, so re-seeding after a normal save is a
  // no-op for the field just saved.
  const [bufferedMachine, setBufferedMachine] = useState(machine)
  if (machine !== bufferedMachine) {
    setBufferedMachine(machine)
    setText(numericTextFrom(machine))
    setCodeText(codeTextFrom(machine))
  }
  const [savedCodeField, setSavedCodeField] = useState<CodeField | null>(null)
  // Transient "type a value, click Add" field — not one of the persisted
  // settings above, so it doesn't need the buffer/onBlur machinery those
  // use; it just clears itself on a successful add.
  const [newDiameterText, setNewDiameterText] = useState('')
  const [newDiameterError, setNewDiameterError] = useState<string | null>(null)

  // Focus on open/restore on close, Escape, Tab trap — shared with the
  // Feedrate Calculator.
  const { modalRef, initialFocusRef: closeButtonRef } = useModalFocus<HTMLButtonElement>(onClose)

  // Shared by both onBlur (parses the typed text) and the NumberInput
  // stepper buttons below (already has a numeric value in hand, no text
  // round-trip needed) — same validation either way: reject non-finite or
  // non-positive, revert to the last saved value instead of persisting
  // garbage.
  const commitField = (key: NumericField, next: number) => {
    // Default Tab Count also has to be a whole number within the wizard's
    // own Tab Count limit (BL-45) — seeding a fractional default into Step
    // 2 would just land the user on a validation error.
    // Dwell 0 is meaningful (no G4 at all), and so is Min RPM 0 (no lower
    // limit) — the only fields allowed to reach zero. The spindle range
    // must stay a range (min below max).
    const invalid =
      !Number.isFinite(next) ||
      (key === 'dwellSeconds' || key === 'spindleMinRpm' ? next < 0 : next <= 0) ||
      (key === 'defaultTabCount' && !isValidTabCount(next)) ||
      (key === 'spindleMinRpm' && next >= machine.spindleMaxRpm) ||
      (key === 'spindleMaxRpm' && next <= machine.spindleMinRpm)
    if (invalid) {
      setText((prev) => ({ ...prev, [key]: String(machine[key]) }))
      return
    }
    setText((prev) => ({ ...prev, [key]: String(next) }))
    onSave({ ...machine, [key]: next })
    setSavedField(key)
    setTimeout(() => setSavedField((f) => (f === key ? null : f)), 1500)
  }

  const handleBlur = (key: NumericField) => commitField(key, Number(text[key]))

  // Stepper click is an explicit, unambiguous value change — commits
  // immediately rather than waiting for a blur that may never come (the
  // field might not have been focused at all before the click).
  const handleAdjust = (key: NumericField, delta: number) => {
    const current = Number(text[key])
    const base = Number.isFinite(current) ? current : machine[key]
    commitField(key, roundToStepPrecision(base + delta))
  }

  const handleCodeBlur = (key: CodeField) => {
    if (codeText[key] === machine[key]) return
    onSave({ ...machine, [key]: codeText[key] })
    setSavedCodeField(key)
    setTimeout(() => setSavedCodeField((f) => (f === key ? null : f)), 1500)
  }

  const handleDialectChange = (dialect: Dialect) => {
    onSave({ ...machine, dialect })
  }

  const handleRigidityChange = (rigidity: Rigidity) => {
    onSave({ ...machine, rigidity })
  }

  // BL-69: picking a router also sets the spindle range to its dial's —
  // the calculator's suggestion should never land between two positions
  // the dial can't reach.
  const handleRouterChange = (value: string) => {
    if (!isRouterId(value)) {
      onSave({ ...machine, router: null })
      return
    }
    const dial = ROUTERS[value].dial
    onSave({ ...machine, router: value, spindleMinRpm: dial[0], spindleMaxRpm: dial[dial.length - 1] })
  }
  const router = machine.router ? ROUTERS[machine.router] : null

  const numericField = (field: { key: NumericField; label: string; step: string }) => (
    <div key={field.key} className="min-w-0 flex-1">
      <label className="flex flex-col gap-1">
        <span className="flex items-center gap-2 text-sm font-medium text-value">
          {field.label}
          {savedField === field.key && <span className="text-xs font-normal text-status-success">✓ Saved</span>}
        </span>
        <NumberInput
          type="number"
          step={field.step}
          min="0"
          className={inputClass}
          value={text[field.key]}
          onChange={(e) => setText((prev) => ({ ...prev, [field.key]: e.target.value }))}
          onBlur={() => handleBlur(field.key)}
          onAdjust={(delta) => handleAdjust(field.key, delta)}
        />
      </label>
    </div>
  )

  const sortedToolDiameters = [...toolDiameters].sort((a, b) => a.value - b.value)

  const handleAddToolDiameter = () => {
    const value = Number(newDiameterText)
    if (toolDiameters.length >= MAX_TOOL_DIAMETER_COUNT) {
      setNewDiameterError(`Can't add more than ${MAX_TOOL_DIAMETER_COUNT} tool diameters.`)
      return
    }
    if (!isToolDiameterEntryValid(value, toolDiameters)) {
      setNewDiameterError(
        Number.isFinite(value) && value > 0
          ? 'That diameter is already in the list.'
          : 'Enter a diameter greater than 0.',
      )
      return
    }
    onSaveToolDiameters(
      [...toolDiameters, { value, label: formatToolDiameterLabel(value) }].sort((a, b) => a.value - b.value),
    )
    setNewDiameterText('')
    setNewDiameterError(null)
  }

  const handleRemoveToolDiameter = (value: number) => {
    if (toolDiameters.length <= 1) return
    onSaveToolDiameters(toolDiameters.filter((opt) => opt.value !== value))
  }

  const handleResetToolDiameters = () => {
    if (!window.confirm('Reset the tool diameter list to its default values?')) return
    onSaveToolDiameters(DEFAULT_TOOL_DIAMETER_OPTIONS)
    setNewDiameterError(null)
  }

  // BL-40: distinct from handleResetToolDiameters above — this wipes every
  // localStorage key the app owns (Appearance, Tool Diameters, Machine, Feedrate Calculator,
  // and every preset slot including the hidden session one), not just one
  // list. onResetAll (App.tsx) owns the actual reset + in-memory state
  // sync; this is only the confirm gate.
  const handleResetAll = () => {
    if (
      !window.confirm(
        'Reset ALL settings to their defaults? This clears the theme, tool diameters, machine settings, the Feedrate Calculator memory, and every saved preset — it cannot be undone.',
      )
    )
      return
    onResetAll()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        className="relative flex h-[640px] w-[820px] overflow-hidden rounded-lg border border-border bg-bg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sibling of the scrollable content pane below, not a child of it —
            an absolutely-positioned descendant of a scrolling container
            scrolls right along with it, which is what made this button
            drift out of view on a section taller than the modal. Anchored to this non-scrolling
            card instead, it now stays pinned regardless of inner scroll. */}
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close settings"
          className="absolute top-4 right-4 z-10 flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-border/40 hover:text-fg"
        >
          ✕
        </button>

        <div className="flex w-44 shrink-0 flex-col gap-1 border-r border-border bg-code-bg p-4">
          <span
            id="settings-modal-title"
            className="mb-2 px-2 text-xs font-semibold tracking-wide text-muted uppercase"
          >
            Settings
          </span>
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              aria-current={activeSection === section.id ? 'page' : undefined}
              onClick={() => setActiveSection(section.id)}
              className={
                activeSection === section.id
                  ? 'rounded-md bg-accent-bg px-2 py-1.5 text-left text-sm font-medium text-accent-fg'
                  : 'rounded-md px-2 py-1.5 text-left text-sm font-medium text-value hover:bg-border/40'
              }
            >
              {section.label}
            </button>
          ))}
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
          {activeSection === 'machine' && (
            <>
              <h2 className="text-sm font-semibold text-fg">
                Machine
              </h2>

              <div className="flex gap-4">
                {FIELDS.map((field) => (
                  <div key={field.key} className="min-w-0 flex-1">
                    <label className="flex flex-col gap-1">
                      <span className="flex items-center gap-2 text-sm font-medium text-value">
                        {field.label}
                        {savedField === field.key && (
                          <span className="text-xs font-normal text-status-success">
                            ✓ Saved
                          </span>
                        )}
                      </span>
                      <NumberInput
                        type="number"
                        step="1"
                        min="0"
                        className={inputClass}
                        value={text[field.key]}
                        onChange={(e) => setText((prev) => ({ ...prev, [field.key]: e.target.value }))}
                        onBlur={() => handleBlur(field.key)}
                        onAdjust={(delta) => handleAdjust(field.key, delta)}
                      />
                    </label>
                  </div>
                ))}
              </div>

              <p className="text-sm text-muted">
                These settings will enforce limits on values you can enter when planning your work.
                They also introduce a soft warning when the planned work doesn't make sense within
                these limits.
              </p>

              <div className="flex flex-col gap-4 border-t border-border pt-4">
                <div className="flex gap-4">{SPINDLE_FIELDS.map(numericField)}</div>
                <div className="flex gap-4">
                  {MOTION_FIELDS.map(numericField)}
                  <label className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-sm font-medium text-value">Rigidity</span>
                    <select
                      className={inputClass}
                      value={machine.rigidity}
                      onChange={(e) => handleRigidityChange(e.target.value as Rigidity)}
                    >
                      {RIGIDITY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-value">Router (speed dial)</span>
                  <select className={inputClass} value={machine.router ?? ''} onChange={(e) => handleRouterChange(e.target.value)}>
                    <option value="">None — spindle speed set by S</option>
                    {ROUTER_IDS.map((id) => (
                      <option key={id} value={id}>
                        {ROUTERS[id].label}
                      </option>
                    ))}
                  </select>
                </label>
                {router && (
                  <p className="text-sm text-muted">
                    Dial {router.dial.map((rpm, i) => `${i + 1} ≈ ${rpm}`).join(', ')} RPM
                    {router.approximate ? ' (only the range is published — positions in between are estimated)' : ''}.
                    A router ignores S in the G-code: the Feedrate Calculator shows which dial position to set.
                    Choosing it also set Min/Max RPM to the dial's range.
                  </p>
                )}
                <p className="text-sm text-muted">
                  Used when Step 4's "Start spindle" is checked: <code className="font-mono text-xs">M3 S
                  {machine.spindleSpeed}</code>, then a dwell while the spindle spins up (0 = none).
                  {machine.dialect === 'marlin' &&
                    ' On Marlin, S is often PWM 0–255 or a percentage (depends on CUTTER_POWER_UNIT) — set it to what your firmware expects.'}
                </p>
                <p className="text-sm text-muted">
                  Min/Max RPM, Max Feed and Rigidity are only used by the Feedrate Calculator (Step 3): its
                  suggested RPM stays within the spindle's range, a feed above Max Feed lowers the RPM first, and
                  Rigidity scales the chip load it suggests, and the stepdown of wide cuts (not Adaptive). The defaults mean no limit.
                </p>
              </div>
            </>
          )}

          {activeSection === 'controller' && (
            <>
              <h2 className="text-sm font-semibold text-fg">Controller</h2>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-value">
                  G-Code Dialect
                </span>
                <select
                  className={inputClass}
                  value={machine.dialect}
                  onChange={(e) => handleDialectChange(e.target.value as Dialect)}
                >
                  {DIALECT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-sm text-muted">
                Sets what differs between controllers: the setup line at the top of the program, the
                dwell units (<code className="font-mono text-xs">G4 P</code> in seconds, milliseconds on
                Marlin) and the closing code (<code className="font-mono text-xs">M30</code>,{' '}
                <code className="font-mono text-xs">M2</code> on Marlin).
              </p>

              <div className="flex flex-col gap-4 border-t border-border pt-4">
                <span className="text-sm font-medium text-value">
                  Start / End G-Code
                </span>
                {CODE_FIELDS.map((field) => (
                  <label key={field.key} className="flex flex-col gap-1">
                    <span className="flex items-center gap-2 text-xs font-medium text-muted">
                      {field.label}
                      {savedCodeField === field.key && (
                        <span className="text-xs font-normal text-status-success">
                          ✓ Saved
                        </span>
                      )}
                    </span>
                    <textarea
                      rows={3}
                      className={`${inputClass} resize-y font-mono text-xs`}
                      placeholder={field.placeholder}
                      value={codeText[field.key]}
                      onChange={(e) =>
                        setCodeText((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      onBlur={() => handleCodeBlur(field.key)}
                    />
                  </label>
                ))}
                <p className="text-sm text-muted">
                  Inserted verbatim — Start G-Code before the generated program, End G-Code after
                  it (before the closing {machine.dialect === 'marlin' ? 'M2' : 'M30'}). Wrapped in
                  comment markers when non-empty; left untouched when blank.
                </p>
              </div>
            </>
          )}

          {activeSection === 'tabs' && (
            <>
              <h2 className="text-sm font-semibold text-fg">Tabs</h2>

              <div className="flex flex-col gap-4">
                <span className="text-sm font-medium text-value">
                  Default Tab Settings
                </span>
                <div className="flex gap-4">
                  {TAB_DEFAULT_FIELDS.map((field) => (
                    <div key={field.key} className="min-w-0 flex-1">
                      <label className="flex flex-col gap-1">
                        <span className="flex items-center gap-2 text-sm font-medium text-value">
                          {field.label}
                          {savedField === field.key && (
                            <span className="text-xs font-normal text-status-success">
                              ✓ Saved
                            </span>
                          )}
                        </span>
                        <NumberInput
                          type="number"
                          step={field.step}
                          min="0"
                          className={inputClass}
                          value={text[field.key]}
                          onChange={(e) =>
                            setText((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                          onBlur={() => handleBlur(field.key)}
                          onAdjust={(delta) => handleAdjust(field.key, delta)}
                        />
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-sm text-muted">
                Applied whenever you check "Enable Tabs" on Step 2 — a starting point for a new
                job, not a live link, so editing these later doesn't change a job that already has
                tabs on.
              </p>
            </>
          )}

          {activeSection === 'toolDiameters' && (
            <>
              <h2 className="text-sm font-semibold text-fg">Tool Diameters</h2>

              <p className="text-sm text-muted">
                The choices offered by the Tool Diameter dropdown on Step 2, for every operation.
                Add the bits you actually own, remove the ones you don't.
              </p>

              <div className="flex flex-wrap gap-2">
                {sortedToolDiameters.map((opt) => (
                  <span
                    key={opt.value}
                    className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-value"
                  >
                    {opt.label}
                    <button
                      type="button"
                      onClick={() => handleRemoveToolDiameter(opt.value)}
                      disabled={toolDiameters.length <= 1}
                      aria-label={`Remove ${opt.label}`}
                      title={
                        toolDiameters.length <= 1
                          ? 'At least one tool diameter is required'
                          : `Remove ${opt.label}`
                      }
                      className="flex h-4 w-4 items-center justify-center rounded-full leading-none text-muted hover:bg-status-delete-bg hover:text-status-delete-fg disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>

              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <div className="flex items-end gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted">New diameter [mm]</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className={`${inputClass} w-32`}
                      // BL-66: the list-full error isn't about the typed value.
                      aria-invalid={newDiameterError !== null && toolDiameters.length < MAX_TOOL_DIAMETER_COUNT}
                      value={newDiameterText}
                      onChange={(e) => {
                        setNewDiameterText(e.target.value)
                        setNewDiameterError(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return
                        e.preventDefault()
                        handleAddToolDiameter()
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleAddToolDiameter}
                    className="rounded-md bg-btn-bg px-3 py-2 text-sm font-medium text-btn-fg shadow-[var(--glow-btn)]"
                  >
                    Add
                  </button>
                </div>
                {newDiameterError && <p className="text-sm text-status-error">{newDiameterError}</p>}
              </div>

              <div className="border-t border-border pt-4">
                <button
                  type="button"
                  onClick={handleResetToolDiameters}
                  className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-value hover:bg-border/40"
                >
                  Reset to Default
                </button>
              </div>
            </>
          )}

          {activeSection === 'appearance' && (
            <>
              <h2 className="text-sm font-semibold text-fg">
                Appearance
              </h2>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-value">Theme</span>
                <div className="flex flex-wrap gap-3">
                  {THEME_LIST.map((theme) => {
                    const isSelected = appearance.theme === theme.id
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => onSaveAppearance({ ...appearance, theme: theme.id })}
                        title={theme.label}
                        className={
                          isSelected
                            ? 'flex w-24 flex-col items-center gap-1.5 rounded-md border-2 border-accent p-2'
                            : 'flex w-24 flex-col items-center gap-1.5 rounded-md border border-border p-2 hover:bg-border/40'
                        }
                      >
                        <span className="flex gap-1">
                          <span
                            className="flex h-4 w-4 items-center justify-center rounded-full border border-black/10"
                            style={{ backgroundColor: theme.swatchLight.bg }}
                          >
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: theme.swatchLight.accent }}
                            />
                          </span>
                          <span
                            className="flex h-4 w-4 items-center justify-center rounded-full border border-white/10"
                            style={{ backgroundColor: theme.swatchDark.bg }}
                          >
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: theme.swatchDark.accent }}
                            />
                          </span>
                        </span>
                        <span className="text-center text-xs font-medium text-value">
                          {theme.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <p className="text-sm text-muted">
                  Reskins the app's chrome — header, buttons, badges, form fields. More themes are
                  on the way.
                </p>
              </div>

              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <span className="text-sm font-medium text-value">
                  Preview Color Palette
                </span>
                <div className="flex flex-wrap gap-3">
                  {PALETTE_LIST.map((palette) => {
                    const isSelected = appearance.palette === palette.id
                    const lightAccents = getPaletteAccents(palette.id, false, appearance.theme)
                    const darkAccents = getPaletteAccents(palette.id, true, appearance.theme)
                    return (
                      <button
                        key={palette.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => onSaveAppearance({ ...appearance, palette: palette.id })}
                        title={palette.label}
                        className={
                          isSelected
                            ? 'flex w-20 flex-col items-center gap-1.5 rounded-md border-2 border-accent p-2'
                            : 'flex w-20 flex-col items-center gap-1.5 rounded-md border border-border p-2 hover:bg-border/40'
                        }
                      >
                        <span className="flex gap-1">
                          <span
                            className="h-4 w-4 rounded-full border border-black/10"
                            style={{ backgroundColor: lightAccents.toolpath }}
                          />
                          <span
                            className="h-4 w-4 rounded-full border border-white/10"
                            style={{ backgroundColor: darkAccents.toolpath }}
                          />
                        </span>
                        <span className="text-xs font-medium text-value">
                          {palette.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <p className="text-sm text-muted">
                  Changes the toolpath/rapid/hole accent colors in the 2D and 3D previews — a
                  choice that complements the Theme above, independent of it. Axis colors, the
                  origin marker and the offset vector stay fixed per Theme in every palette.
                </p>
              </div>

              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <span className="text-sm font-medium text-value">
                  Stock Edges (3D Preview)
                </span>
                <Checkbox
                  checked={appearance.stockEdges3DEnabled}
                  onChange={(checked) =>
                    onSaveAppearance({ ...appearance, stockEdges3DEnabled: checked })
                  }
                  label="Outline the stock's edges"
                  className="text-sm text-value"
                />
                <p className="text-sm text-muted">
                  Draws a thin line along every edge of the stock — rims of holes and pockets,
                  steps and sharp corners — in both Solid and Transparent Stock. The line color
                  follows the Preview Color Palette.
                </p>
              </div>

              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <span className="text-sm font-medium text-value">
                  Grid Labels (3D Preview)
                </span>
                <Checkbox
                  checked={appearance.grid3DLabelsEnabled}
                  onChange={(checked) =>
                    onSaveAppearance({ ...appearance, grid3DLabelsEnabled: checked })
                  }
                  label="Show grid coordinate labels"
                  className="text-sm text-value"
                />
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted">Label size</span>
                  <select
                    className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-50`}
                    value={appearance.grid3DLabelSize}
                    disabled={!appearance.grid3DLabelsEnabled}
                    onChange={(e) =>
                      onSaveAppearance({
                        ...appearance,
                        grid3DLabelSize: e.target.value as Grid3DLabelSize,
                      })
                    }
                  >
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </select>
                </label>
                <p className="text-sm text-muted">
                  Coordinate numbers along the 3D grid's outer edges — always rendered at a
                  constant screen size, regardless of zoom.
                </p>
              </div>
            </>
          )}

          {activeSection === 'privacy' && (
            <>
              <h2 className="text-sm font-semibold text-fg">Privacy</h2>

              <p className="text-sm text-muted">
                OnlyPaths runs entirely in your browser. There is no backend, no database, and no
                user accounts — G-code generation and the 2D/3D previews all happen locally on
                your machine, and nothing you type or generate is ever sent to a server we
                operate.
              </p>

              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <span className="text-sm font-medium text-value">What's stored, and where</span>
                <p className="text-sm text-muted">
                  Presets and settings (Machine, Controller, Appearance, Tabs, Tool Diameters, Feedrate Calculator) are stored only
                  in your browser's localStorage, scoped to this site. Nothing is synced,
                  exported, or read by us — it stays on your device and is cleared whenever you
                  clear your browser's site data, or automatically if you use a private/incognito
                  window.
                </p>
              </div>

              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <span className="text-sm font-medium text-value">Cookies &amp; tracking</span>
                <p className="text-sm text-muted">
                  OnlyPaths sets no cookies and runs no analytics, telemetry, or fingerprinting
                  scripts of any kind. There is nothing to opt out of, because nothing is
                  collected in the first place.
                </p>
              </div>

              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <span className="text-sm font-medium text-value">The one external request</span>
                <p className="text-sm text-muted">
                  OnlyPaths loads one third-party resource on every visit: the "Space Grotesk"
                  typeface from Google Fonts, used by the Arcade Studio themes. Like loading a
                  font or image from any external site, this sends your browser's standard
                  request data (including your IP address) to Google, governed by Google's own
                  privacy policy, not ours — it happens outside OnlyPaths's own code. It's the
                  only network request OnlyPaths makes to a third party; you can verify this
                  yourself with your browser's network inspector.
                </p>
              </div>

              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <span className="text-sm font-medium text-value">GDPR</span>
                <p className="text-sm text-muted">
                  The GDPR (General Data Protection Regulation) governs the collection and
                  processing of personal data. OnlyPaths's own code and infrastructure collect,
                  store, transmit, or process none — there is no server-side component to do so,
                  and nothing you enter ever leaves your device through us. The one exception is
                  the Google Fonts request above, handled entirely by Google under its own policy.
                  With that one disclosed exception, using OnlyPaths does not involve us
                  processing your personal data at all.
                </p>
              </div>
            </>
          )}

          {activeSection === 'reset' && (
            <>
              <h2 className="text-sm font-semibold text-fg">Reset</h2>

              <p className="text-sm text-muted">
                Clears every setting OnlyPaths keeps in your browser and puts it back to first-run
                defaults:
              </p>

              <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted">
                <li>Theme, Preview Color Palette, and Grid Labels (Appearance)</li>
                <li>The Tool Diameters list</li>
                <li>
                  Machine and Controller settings — X/Y/Z travel, spindle and feed limits, rigidity, dialect,
                  Start/End G-Code, default tab sizes
                </li>
                <li>The Feedrate Calculator's remembered material and tool</li>
                <li>Every saved preset, including the hidden auto-save from your last session</li>
              </ul>

              <p className="text-sm text-muted">
                It does not touch what's currently open in the wizard — only what's saved.
              </p>

              <div className="border-t border-border pt-4">
                <button
                  type="button"
                  onClick={handleResetAll}
                  className="rounded-md border border-status-delete-fg px-3 py-1.5 text-sm font-medium text-status-delete-fg hover:bg-status-delete-bg"
                >
                  Reset All Settings to Defaults
                </button>
              </div>
            </>
          )}

          {activeSection === 'about' && (
            <>
              <h2 className="text-sm font-semibold text-fg">About</h2>

              <div className="flex flex-col gap-1">
                <span className="text-base font-semibold text-fg">
                  OnlyPaths
                </span>
                <span className="font-mono text-sm text-muted">
                  v{__APP_VERSION__}
                </span>
              </div>

              <p className="text-sm text-muted">
                Helps you CAM. Every time! Client-side, no backend, no accounts.
              </p>

              <p className="text-sm text-muted">Envisioned by ThingsByPluzz</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
