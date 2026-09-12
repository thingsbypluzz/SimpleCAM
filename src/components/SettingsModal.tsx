import { useEffect, useRef, useState } from 'react'
import { getPaletteAccents, PALETTE_LIST } from '../config/palettes'
import type { Dialect, MachineSettings } from '../types/machine'
import type { AppearanceSettings, Grid3DLabelSize } from '../types/appearance'
import { THEME_LIST } from '../types/theme'
import { inputClass } from './wizard/FieldRow'
import { NumberInput } from './wizard/NumberInput'
import { roundToStepPrecision } from './wizard/useNumberField'

interface SettingsModalProps {
  machine: MachineSettings
  onSave: (machine: MachineSettings) => void
  appearance: AppearanceSettings
  onSaveAppearance: (appearance: AppearanceSettings) => void
  onClose: () => void
}

type TravelField = 'travelX' | 'travelY' | 'travelZ'
type TabDefaultField = 'defaultTabHeight' | 'defaultTabWidth' | 'defaultTabCount'
// Both groups are plain positive numbers, sharing one local-buffer/onBlur
// mechanism (text/savedField/handleBlur below) — only the field list and
// per-field step/label differ.
type NumericField = TravelField | TabDefaultField
type CodeField = 'headerText' | 'footerText'
type SectionId = 'machine' | 'tabs' | 'appearance' | 'about' | 'privacy'

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'machine', label: 'Machine' },
  { id: 'tabs', label: 'Tabs' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'privacy', label: 'Privacy' },
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

const DIALECT_OPTIONS: { value: Dialect; label: string }[] = [
  { value: 'grbl', label: 'GRBL' },
  { value: 'marlin', label: 'Marlin' },
  { value: 'mach3', label: 'Mach3' },
]

const CODE_FIELDS: { key: CodeField; label: string; placeholder: string }[] = [
  { key: 'headerText', label: 'Start G-Code', placeholder: '; e.g. G28, custom homing…' },
  { key: 'footerText', label: 'End G-Code', placeholder: '; e.g. coolant off…' },
]

export function SettingsModal({
  machine,
  onSave,
  appearance,
  onSaveAppearance,
  onClose,
}: SettingsModalProps) {
  const [activeSection, setActiveSection] = useState<SectionId>('machine')
  // Local text per field so an in-progress edit (e.g. typing "400" one
  // digit at a time) never round-trips through a half-valid number — only
  // committed to machine settings (and localStorage) on blur. Shared by
  // travel and default-tab-size fields alike (both plain positive numbers).
  const [text, setText] = useState<Record<NumericField, string>>({
    travelX: String(machine.travelX),
    travelY: String(machine.travelY),
    travelZ: String(machine.travelZ),
    defaultTabHeight: String(machine.defaultTabHeight),
    defaultTabWidth: String(machine.defaultTabWidth),
    defaultTabCount: String(machine.defaultTabCount),
  })
  const [savedField, setSavedField] = useState<NumericField | null>(null)
  // Same "local buffer, commit on blur" pattern as the numeric travel
  // fields — here purely to avoid a localStorage write per keystroke, not
  // for validation (any string is a valid header/footer).
  const [codeText, setCodeText] = useState<Record<CodeField, string>>({
    headerText: machine.headerText,
    footerText: machine.footerText,
  })
  const [savedCodeField, setSavedCodeField] = useState<CodeField | null>(null)

  const modalRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // Moves focus into the modal on open and restores it to whatever was
  // focused before (the Settings button in the header, in practice) once
  // the modal unmounts — without this a keyboard user's focus silently
  // drops back to <body> on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    closeButtonRef.current?.focus()
    return () => {
      previouslyFocused?.focus?.()
    }
  }, [])

  // Escape closes the modal; Tab/Shift+Tab wraps focus within it instead of
  // escaping to the page behind the backdrop. Not portaled to document.body
  // (renders inline in App's tree), so `inert` on sibling content isn't a
  // practical option here — a plain keydown-based trap covers the same
  // requirement (modality.md: give people an obvious, contained way to
  // interact with a modal view) without a new dependency.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !modalRef.current) return
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Shared by both onBlur (parses the typed text) and the NumberInput
  // stepper buttons below (already has a numeric value in hand, no text
  // round-trip needed) — same validation either way: reject non-finite or
  // non-positive, revert to the last saved value instead of persisting
  // garbage.
  const commitField = (key: NumericField, next: number) => {
    if (!Number.isFinite(next) || next <= 0) {
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
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
            drift out of view on a tall Machine section (dialect + Start/End
            G-Code pushed it past the fold). Anchored to this non-scrolling
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
                  Grid Labels (3D Preview)
                </span>
                <label className="flex items-center gap-2 text-sm text-value">
                  <input
                    type="checkbox"
                    checked={appearance.grid3DLabelsEnabled}
                    onChange={(e) =>
                      onSaveAppearance({ ...appearance, grid3DLabelsEnabled: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-field-border text-accent focus:ring-accent-strong"
                  />
                  Show grid coordinate labels
                </label>
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
                SimpleCAM runs entirely in your browser. There is no backend, no database, and no
                user accounts — G-code generation and the 2D/3D previews all happen locally on
                your machine, and nothing you type or generate is ever sent to a server we
                operate.
              </p>

              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <span className="text-sm font-medium text-value">What's stored, and where</span>
                <p className="text-sm text-muted">
                  Presets and settings (Machine, Appearance, Tabs) are stored only in your
                  browser's localStorage, scoped to this site. Nothing is synced, exported, or
                  read by us — it stays on your device and is cleared whenever you clear your
                  browser's site data, or automatically if you use a private/incognito window.
                </p>
              </div>

              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <span className="text-sm font-medium text-value">Cookies &amp; tracking</span>
                <p className="text-sm text-muted">
                  SimpleCAM sets no cookies and runs no analytics, telemetry, or fingerprinting
                  scripts of any kind. There is nothing to opt out of, because nothing is
                  collected in the first place.
                </p>
              </div>

              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <span className="text-sm font-medium text-value">The one external request</span>
                <p className="text-sm text-muted">
                  SimpleCAM loads one third-party resource on every visit: the "Space Grotesk"
                  typeface from Google Fonts, used by the Arcade Studio themes. Like loading a
                  font or image from any external site, this sends your browser's standard
                  request data (including your IP address) to Google, governed by Google's own
                  privacy policy, not ours — it happens outside SimpleCAM's own code. It's the
                  only network request SimpleCAM makes to a third party; you can verify this
                  yourself with your browser's network inspector.
                </p>
              </div>

              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <span className="text-sm font-medium text-value">GDPR</span>
                <p className="text-sm text-muted">
                  The GDPR (General Data Protection Regulation) governs the collection and
                  processing of personal data. SimpleCAM's own code and infrastructure collect,
                  store, transmit, or process none — there is no server-side component to do so,
                  and nothing you enter ever leaves your device through us. The one exception is
                  the Google Fonts request above, handled entirely by Google under its own policy.
                  With that one disclosed exception, using SimpleCAM does not involve us
                  processing your personal data at all.
                </p>
              </div>
            </>
          )}

          {activeSection === 'about' && (
            <>
              <h2 className="text-sm font-semibold text-fg">About</h2>

              <div className="flex flex-col gap-1">
                <span className="text-base font-semibold text-fg">
                  SimpleCAM
                </span>
                <span className="font-mono text-sm text-muted">
                  v{__APP_VERSION__}
                </span>
              </div>

              <p className="text-sm text-muted">
                Fast G-Code generator for your basic operations. Client-side, no backend, no
                accounts.
              </p>

              <p className="text-sm text-muted">Envisioned by ThingsByPluzz</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
