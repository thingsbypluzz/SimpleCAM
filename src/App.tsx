import { lazy, Suspense, useEffect, useState, type ComponentType } from 'react'
import { Step1Positioning } from './components/wizard/Step1Positioning'
import { Step2Geometry } from './components/wizard/Step2Geometry'
import { Step3Feeds } from './components/wizard/Step3Feeds'
import { Step4Output } from './components/wizard/Step4Output'
import { MiniStat } from './components/wizard/MiniStat'
import { ToolpathCanvas } from './components/preview/ToolpathCanvas'
import { SettingsModal } from './components/SettingsModal'

// Three.js is a large dependency (~600KB) — only pull it into a chunk when
// the user actually opens the 3D tab, not on initial page load.
const Scene3D = lazy(() =>
  import('./components/preview3d/Scene3D').then((m) => ({ default: m.Scene3D })),
)
import {
  BitIcon,
  CheckIcon,
  DepthIcon,
  DiameterIcon,
  FeedIcon,
  OffsetIcon,
  PlungeIcon,
  StartZIcon,
  StepdownIcon,
  WarningIcon,
  XIcon,
} from './components/icons'
import { OPERATION_META } from './config/operationMeta'
import { positioningIcon, positioningLines, positioningSummary } from './config/positioningMeta'
import { fmt } from './lib/format'
import { presetLabel } from './lib/presetLabel'
import {
  AUTO_SAVE_SLOT,
  PRESET_SLOT_IDS,
  deleteSlot,
  loadPresetSlots,
  loadSlot,
  saveSlot,
  type PresetSlotId,
} from './lib/storage'
import { loadMachineSettings, saveMachineSettings } from './lib/machineStorage'
import {
  isStartZValid,
  isStepdownValid,
  isToolDiameterValid,
  machineFitWarnings,
} from './lib/validation'
import { DEFAULT_WIZARD_PARAMS, type GeometryParams, type WizardParams } from './types/wizard'

const TOTAL_STEPS = 4

const STEP_META = [
  { id: 1, title: 'Pattern' },
  { id: 2, title: 'Geometry' },
  { id: 3, title: 'Feeds & Speeds' },
  { id: 4, title: 'G-Code' },
] as const

// Steps whose panel needs an explicit "Next" button — none of the steps
// auto-advance on selection, step 4 is the last one.
const STEPS_WITH_NEXT_BUTTON = new Set([1, 2, 3])

// null when there's no offset to show — the collapsed-bar annotation is
// hidden entirely at the (0,0) default, not just zeroed out.
function offsetSummary(geometry: GeometryParams): string | null {
  if (geometry.offsetX === 0 && geometry.offsetY === 0) return null
  return `(${fmt(geometry.offsetX)};${fmt(geometry.offsetY)})mm`
}

interface Step4Badge {
  Icon: ComponentType<{ className?: string }>
  colorClassName: string
  title: string
}

// Shared between the collapsed-bar badge and the persistent top-right
// badge in the expanded Step 4 panel (see App() body) — both need the
// exact same icon/color/tooltip, just at different sizes. Icon shape
// tracks "has Generate been clicked" (X vs check), color tracks "does the
// current pattern fit the machine" (amber/indigo vs orange) — the two are
// independent, e.g. a param change can leave stale G-code generated while
// the live pattern no longer fits. `colorClassName` excludes sizing so
// each call site can pick its own h-*/w-*.
function step4Badge(generatedGCode: string[] | null, warnings: string[]): Step4Badge {
  if (warnings.length > 0) {
    return {
      Icon: generatedGCode ? CheckIcon : WarningIcon,
      colorClassName: 'bg-orange-200 text-black',
      title: warnings.join(' '),
    }
  }
  if (generatedGCode) {
    return {
      Icon: CheckIcon,
      colorClassName: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
      title: 'G-Code generated',
    }
  }
  return {
    Icon: XIcon,
    colorClassName: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    title: 'G-Code not generated yet',
  }
}

function collapsedStepTitle(stepId: number, params: WizardParams): string {
  switch (stepId) {
    case 1:
      return `Pattern — ${positioningSummary(params.geometry)}`
    case 2: {
      const offset = offsetSummary(params.geometry)
      return `Geometry — Tool ⌀${params.geometry.toolDiameter}mm, Hole ⌀${params.geometry.holeDiameter}mm, Depth ${params.geometry.totalDepth}mm${offset ? ` — Offset ${offset}` : ''} — Method: ${OPERATION_META[params.operation].title}`
    }
    case 3:
      return `Feeds & Speeds — Feed ${params.feeds.feedrateXY} mm/min, Stepdown ${params.feeds.stepdown} mm`
    default:
      return 'G-Code'
  }
}

// Computed once, at mount, from the hidden auto-save slot (see
// src/lib/storage.ts) — if a previous session left a snapshot, the wizard
// opens straight on Step 4 with a "restored" banner instead of Step 1.
function loadInitialState(): { params: WizardParams; activeStep: number; restored: boolean } {
  const restoredParams = loadSlot(AUTO_SAVE_SLOT)
  return restoredParams
    ? { params: restoredParams, activeStep: 4, restored: true }
    : { params: DEFAULT_WIZARD_PARAMS, activeStep: 1, restored: false }
}

function useDarkMode() {
  // Dark mode is the default regardless of OS preference; the toggle in
  // the header still lets the user switch to light.
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  return [isDark, setIsDark] as const
}

function App() {
  const [initial] = useState(loadInitialState)
  const [activeStep, setActiveStep] = useState(initial.activeStep)
  const [params, setParams] = useState<WizardParams>(initial.params)
  const [showRestoredBanner, setShowRestoredBanner] = useState(initial.restored)
  const [presetSlots, setPresetSlots] = useState(loadPresetSlots)
  const [isDark, setIsDark] = useDarkMode()
  const [generatedGCode, setGeneratedGCode] = useState<string[] | null>(null)
  const [previewTab, setPreviewTab] = useState<'2d' | '3d' | 'gcode'>('3d')
  const [machine, setMachine] = useState(loadMachineSettings)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  // Any parameter change invalidates the last generated snapshot — Copy/
  // Download must not act on G-code that no longer matches the current
  // parameters.
  const updateParams = (patch: Partial<WizardParams>) => {
    setParams((prev) => ({ ...prev, ...patch }))
    setGeneratedGCode(null)
    setShowRestoredBanner(false)
  }

  const goForward = () => setActiveStep((s) => Math.min(s + 1, TOTAL_STEPS))

  const activeOperation = OPERATION_META[params.operation]
  const offset = offsetSummary(params.geometry)
  const isGeometryValid =
    isToolDiameterValid(params.geometry) && isStepdownValid(params.feeds) && isStartZValid(params.feeds)
  const fitWarnings = machineFitWarnings(params, machine)
  const step4BadgeInfo = step4Badge(generatedGCode, fitWarnings)

  const handleSaveMachine = (next: typeof machine) => {
    saveMachineSettings(next)
    setMachine(next)
  }

  // Generate is also the auto-save trigger for the hidden slot 0 — see
  // CLAUDE.md, Etap 5, "localStorage": persisted on Generate rather than on
  // every keystroke, so a snapshot only survives once the user considered
  // the params worth turning into G-code.
  const handleGenerate = () => {
    setGeneratedGCode(activeOperation.generate(params))
    saveSlot(AUTO_SAVE_SLOT, params)
    setShowRestoredBanner(false)
  }

  // Returns false (and leaves the slot untouched) if the user cancels the
  // overwrite confirmation on an occupied slot.
  const handleSaveToPreset = (id: PresetSlotId): boolean => {
    const existing = presetSlots[id]
    if (existing && !window.confirm(`Overwrite preset [${id}] — ${presetLabel(existing)}?`)) {
      return false
    }
    saveSlot(id, params)
    setPresetSlots((prev) => ({ ...prev, [id]: params }))
    return true
  }

  const handleLoadPreset = (id: PresetSlotId) => {
    const preset = presetSlots[id]
    if (!preset) return
    setParams(preset)
    setGeneratedGCode(null)
    setShowRestoredBanner(false)
    setActiveStep(4)
  }

  const handleDeletePreset = (id: PresetSlotId) => {
    const existing = presetSlots[id]
    if (!existing) return
    if (!window.confirm(`Delete preset [${id}] — ${presetLabel(existing)}?`)) return
    deleteSlot(id)
    setPresetSlots((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  return (
    <div className="flex h-svh flex-col bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-slate-200 px-6 py-4 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-semibold">SimpleCAM</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Fast G-code generator for CNC holes — client-side, no backend.
          </p>
        </div>

        <div className="flex items-center justify-self-center gap-2">
          {PRESET_SLOT_IDS.map((id) => {
            const preset = presetSlots[id]
            const PresetIcon = preset ? positioningIcon(preset.geometry.positioning) : null
            return (
              <div key={id} className="group relative">
                <button
                  type="button"
                  onClick={() => handleLoadPreset(id)}
                  disabled={!preset}
                  title={preset ? `Load preset [${id}] — ${presetLabel(preset)}` : `Preset [${id}] — empty`}
                  className={
                    preset
                      ? 'flex h-11 w-11 items-center justify-center rounded-md border border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/40'
                      : 'flex h-11 w-11 cursor-default items-center justify-center rounded-md border border-slate-200 text-xs font-semibold text-slate-300 dark:border-slate-800 dark:text-slate-700'
                  }
                >
                  {PresetIcon ? <PresetIcon className="h-6 w-6" /> : id}
                </button>
                {preset && (
                  <button
                    type="button"
                    onClick={() => handleDeletePreset(id)}
                    aria-label={`Delete preset ${id}`}
                    title="Delete preset"
                    className="absolute -top-1 -right-1 hidden h-4 w-4 items-center justify-center rounded-full bg-red-100 text-[10px] leading-none font-bold text-red-600 group-hover:flex dark:bg-red-950 dark:text-red-400"
                  >
                    ×
                  </button>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-self-end gap-2">
          <button
            type="button"
            onClick={() => setIsDark((d) => !d)}
            aria-label="Toggle dark mode"
            title="Toggle dark mode"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
          >
            {isDark ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="4" />
                <path strokeLinecap="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
              </svg>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            aria-label="Settings"
            title="Settings"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex shrink-0 overflow-x-auto border-r border-slate-200 dark:border-slate-800">
          {STEP_META.map((step) => {
            if (step.id === activeStep) {
              return (
                <div
                  key={step.id}
                  className="flex w-[420px] shrink-0 flex-col overflow-y-auto border-r border-slate-200 p-6 dark:border-slate-800"
                >
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Step {step.id} · {step.title}
                    </h2>
                    {step.id === 4 && (
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${step4BadgeInfo.colorClassName}`}
                        title={step4BadgeInfo.title}
                      >
                        <step4BadgeInfo.Icon className="h-4 w-4" />
                      </span>
                    )}
                  </div>

                  {step.id === 1 && (
                    <Step1Positioning params={params} onChange={updateParams} />
                  )}
                  {step.id === 2 && (
                    <Step2Geometry params={params} onChange={updateParams} machine={machine} />
                  )}
                  {step.id === 3 && (
                    <Step3Feeds params={params} onChange={updateParams} machine={machine} />
                  )}
                  {step.id === 4 && (
                    <>
                      {showRestoredBanner && (
                        <div className="mb-4 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300">
                          Restored from your last session — click Generate to refresh the G-code.
                        </div>
                      )}
                      <Step4Output
                        params={params}
                        onChange={updateParams}
                        generatedGCode={generatedGCode}
                        onGenerate={handleGenerate}
                        canGenerate={isGeometryValid}
                        presetSlots={presetSlots}
                        onSaveToPreset={handleSaveToPreset}
                        warnings={fitWarnings}
                      />
                    </>
                  )}

                  {STEPS_WITH_NEXT_BUTTON.has(step.id) && (
                    <div className="mt-6 flex justify-end">
                      <button
                        type="button"
                        onClick={goForward}
                        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
              )
            }

            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setActiveStep(step.id)}
                title={collapsedStepTitle(step.id, params)}
                className="flex w-20 shrink-0 flex-col items-center gap-3 border-r border-slate-200 py-4 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
              >
                {step.id === 1 && (
                  <div
                    className="flex flex-col items-center gap-1"
                    title={`Pattern: ${positioningSummary(params.geometry)}`}
                  >
                    {(() => {
                      const PositioningIcon = positioningIcon(params.geometry.positioning)
                      return (
                        <PositioningIcon className="h-6 w-6 text-slate-500 dark:text-slate-400" />
                      )
                    })()}
                    <div className="flex flex-col items-center">
                      {positioningLines(params.geometry).map((line, i) => (
                        <span
                          key={i}
                          className="text-center text-[9px] leading-tight font-semibold whitespace-nowrap text-slate-600 dark:text-slate-300"
                        >
                          {line}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {step.id === 2 && (
                  <div className="flex flex-col items-center gap-4">
                    <MiniStat
                      icon={<activeOperation.Icon className="h-6 w-6" />}
                      label="METHOD"
                      value={activeOperation.shortLabel}
                      title={`Method: ${activeOperation.title}`}
                    />
                    {offset && (
                      <MiniStat
                        icon={<OffsetIcon className="h-6 w-6" />}
                        label="OFFSET"
                        value={offset}
                        title={`Offset: ${offset}`}
                      />
                    )}
                    <MiniStat
                      icon={<BitIcon className="h-6 w-6" />}
                      label="BIT"
                      value={`${params.geometry.toolDiameter}`}
                      unit="mm"
                      title={`Tool Diameter: ${params.geometry.toolDiameter} mm`}
                    />
                    <MiniStat
                      icon={<DiameterIcon className="h-6 w-6" />}
                      label="HOLE"
                      value={`${params.geometry.holeDiameter}`}
                      unit="mm"
                      title={`Hole Diameter: ${params.geometry.holeDiameter} mm`}
                    />
                    <MiniStat
                      icon={<DepthIcon className="h-6 w-6" />}
                      label="DEPTH"
                      value={`${params.geometry.totalDepth}`}
                      unit="mm"
                      title={`Total Depth: ${params.geometry.totalDepth} mm`}
                    />
                  </div>
                )}

                {step.id === 3 && (
                  <div className="flex flex-col items-center gap-4">
                    <MiniStat
                      icon={<FeedIcon className="h-6 w-6" />}
                      label="FEED"
                      value={`${params.feeds.feedrateXY}`}
                      unit="mm/min"
                      title={`Feedrate XY: ${params.feeds.feedrateXY} mm/min`}
                    />
                    <MiniStat
                      icon={<PlungeIcon className="h-6 w-6" />}
                      label="PLUNGE"
                      value={`${params.feeds.plungeRate}`}
                      unit="mm/min"
                      title={`Plunge Rate: ${params.feeds.plungeRate} mm/min`}
                    />
                    {params.feeds.startZ !== 0 && (
                      <MiniStat
                        icon={<StartZIcon className="h-6 w-6" />}
                        label="STARTZ"
                        value={`${params.feeds.startZ}`}
                        unit="mm"
                        title={`Start Z: ${params.feeds.startZ} mm`}
                      />
                    )}
                    <MiniStat
                      icon={<StepdownIcon className="h-6 w-6" />}
                      label={activeOperation.stepdown.shortLabel}
                      value={`${params.feeds.stepdown}`}
                      unit="mm"
                      title={`Stepdown: ${params.feeds.stepdown} mm`}
                    />
                  </div>
                )}

                {step.id === 4 && (
                  <>
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full ${step4BadgeInfo.colorClassName}`}
                      title={step4BadgeInfo.title}
                    >
                      <step4BadgeInfo.Icon className="h-4 w-4" />
                    </span>
                    <span className="[writing-mode:vertical-rl] rotate-180 text-xs font-medium text-slate-500 dark:text-slate-400">
                      {step.title}
                    </span>
                  </>
                )}
              </button>
            )
          })}
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-3 dark:border-slate-800">
            <div className="flex gap-2">
              {(['2d', '3d', 'gcode'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setPreviewTab(tab)}
                  className={[
                    'rounded-md px-2.5 py-1 text-xs font-semibold uppercase tracking-wide transition',
                    previewTab === tab
                      ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
                  ].join(' ')}
                >
                  {tab === '2d' ? '2D Preview' : tab === '3d' ? '3D Preview' : 'G-Code'}
                </button>
              ))}
            </div>
            {previewTab === 'gcode' && generatedGCode && (
              <span className="text-xs text-slate-400 dark:text-slate-500">
                {generatedGCode.length} lines
              </span>
            )}
          </div>

          {previewTab === '2d' && <ToolpathCanvas params={params} isDark={isDark} />}

          {previewTab === '3d' && (
            <Suspense
              fallback={
                <div className="flex flex-1 items-center justify-center text-sm text-slate-400 dark:text-slate-500">
                  Loading 3D viewer…
                </div>
              }
            >
              <Scene3D params={params} isDark={isDark} />
            </Suspense>
          )}

          {previewTab === 'gcode' &&
            (generatedGCode ? (
              <pre className="flex-1 overflow-auto bg-slate-50 p-6 font-mono text-xs leading-relaxed text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                {generatedGCode.join('\n')}
              </pre>
            ) : (
              <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-slate-400 dark:text-slate-500">
                Go to Step 4 and click "Generate" to preview the G-code.
              </div>
            ))}
        </div>
      </div>

      {isSettingsOpen && (
        <SettingsModal
          machine={machine}
          onSave={handleSaveMachine}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </div>
  )
}

export default App
