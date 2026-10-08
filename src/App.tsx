import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { Step1Positioning } from './components/wizard/Step1Positioning'
import { Step1Summary } from './components/wizard/Step1Summary'
import { Step2Geometry } from './components/wizard/Step2Geometry'
import { Step3Feeds } from './components/wizard/Step3Feeds'
import { Step4Output } from './components/wizard/Step4Output'
import { MiniStat } from './components/wizard/MiniStat'
import { routerDialHint } from './config/routers'
import { ToolpathCanvas, type Saved2DView } from './components/preview/ToolpathCanvas'
import type { Saved3DView } from './components/preview3d/Scene3D'
import { SettingsModal } from './components/SettingsModal'
import { FeedCalculatorModal } from './components/FeedCalculatorModal'
import {
  DEFAULT_FEED_CALC_SETTINGS,
  loadFeedCalcSettings,
  saveFeedCalcSettings,
  type FeedCalcSettings,
} from './lib/feedCalcStorage'

// Three.js is a large dependency (~600KB) — only pull it into a chunk when
// the user actually opens the 3D tab, not on initial page load.
const Scene3D = lazy(() =>
  import('./components/preview3d/Scene3D').then((m) => ({ default: m.Scene3D })),
)
import {
  CheckIcon,
  EyeIcon,
  FeedIcon,
  SpindleIcon,
  OpenFileIcon,
  PencilIcon,
  SaveFileIcon,
  PlungeIcon,
  StartZIcon,
  StepdownIcon,
  WarningIcon,
  XIcon,
} from './components/icons'
import { OPERATION_META } from './config/operationMeta'
import { deriveOverlayParams, overlayFitKey, sameOverlayParams } from './lib/overlayParams'
import {
  buildProjectFile,
  parseProjectFile,
  PROJECT_ERROR_MESSAGE,
  projectFilename,
  projectNameFromFilename,
  slotsFingerprint,
  type PresetSlots,
} from './lib/projectFile'
import { loadProjectInfo, NO_PROJECT, saveProjectInfo, type ProjectInfo } from './lib/projectStorage'
import { downloadTextFile } from './lib/download'
import { ProjectNameModal } from './components/ProjectNameModal'
import { templateSlots, type ProjectTemplate } from './templates'
import { ensureTextFont } from './config/textFonts'
import { getLoadedFont } from './lib/textFont'
import { presetLabel } from './lib/presetLabel'
import {
  AUTO_SAVE_SLOT,
  PRESET_SLOT_IDS,
  clearAllSlots,
  deleteSlot,
  loadPresetSlots,
  replacePresetSlots,
  loadSlot,
  saveSlot,
  type PresetSlotId,
} from './lib/storage'
import { loadAppearanceSettings, saveAppearanceSettings } from './lib/appearanceStorage'
import { loadMachineSettings, saveMachineSettings } from './lib/machineStorage'
import { loadToolDiameterOptions, saveToolDiameterOptions } from './lib/toolDiameterStorage'
import { DEFAULT_APPEARANCE_SETTINGS } from './types/appearance'
import { DEFAULT_MACHINE_SETTINGS } from './types/machine'
import { DEFAULT_TOOL_DIAMETER_OPTIONS } from './types/toolDiameters'
import {
  descentWarnings,
  feedsWarnings,
  isWizardParamsValid,
  machineFitWarnings,
} from './lib/validation'
import type { AppearanceSettings } from './types/appearance'
import type { ThemeId } from './types/theme'
import type { ToolDiameterOption } from './types/toolDiameters'
import { DEFAULT_WIZARD_PARAMS, type WizardParams } from './types/wizard'

const TOTAL_STEPS = 4

const STEP_META = [
  { id: 1, title: 'Operation & Pattern' },
  { id: 2, title: 'Geometry' },
  { id: 3, title: 'Feeds & Speeds' },
  { id: 4, title: 'G-Code' },
] as const

// Steps whose panel needs an explicit "Next" button — none of the steps
// auto-advance on selection, step 4 is the last one.
const STEPS_WITH_NEXT_BUTTON = new Set([1, 2, 3])

// null when there's no offset to show — the collapsed-bar annotation is
// hidden entirely at the (0,0) default, not just zeroed out. Structural
// param type (not GeometryParams) — both geometry and outline carry their
// own offsetX/offsetY, this reads either.
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
// BL-63: the G-Code tab shows at most this many lines — a Pocket Adaptive
// program in G1 mode can reach hundreds of thousands, and rendering them
// all into one <pre> freezes the page. The downloaded file is always
// complete.
const GCODE_PREVIEW_LINES = 5000

function step4Badge(generatedGCode: string[] | null, warnings: string[]): Step4Badge {
  if (warnings.length > 0) {
    return {
      Icon: generatedGCode ? CheckIcon : WarningIcon,
      colorClassName: 'bg-status-warn-bg text-status-warn-fg shadow-[var(--glow-warn)]',
      title: warnings.join(' '),
    }
  }
  if (generatedGCode) {
    return {
      Icon: CheckIcon,
      colorClassName: 'bg-status-done-bg text-status-done-fg shadow-[var(--glow-accent)]',
      title: 'G-Code generated',
    }
  }
  return {
    Icon: XIcon,
    colorClassName: 'bg-status-todo-bg text-status-todo-fg shadow-[var(--glow-warn)]',
    title: 'G-Code not generated yet',
  }
}

function collapsedStepTitle(stepId: number, params: WizardParams): string {
  switch (stepId) {
    case 1: {
      const meta = OPERATION_META[params.operation]
      return `${meta.pickKind} — ${meta.pickSummary(params)}`
    }
    case 2:
      return `Geometry — ${OPERATION_META[params.operation].geometryTitle(params)}`
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

// UI chrome theme (see src/types/theme.ts, src/index.css) — an independent
// axis from dark/light above, applied the same way React Query-free apps
// usually do runtime CSS-variable theming: a data attribute on <html> that
// index.css's `[data-theme="..."]` selectors key off. `sloppy-indigo` is
// the default and needs no attribute at all (its tokens live on bare
// `:root`), so the attribute is removed rather than set to that value —
// keeps the DOM clean for the common case and matches how `.dark` is only
// ever added/removed, never set to an explicit "light" class.
function useChromeTheme(themeId: ThemeId) {
  useEffect(() => {
    if (themeId === 'sloppy-indigo') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', themeId)
    }
  }, [themeId])
}

// BL-115: the Header's "stop editing" pencil button — hidden on trial. The
// pencil badge on the edited preset slot ends editing just the same.
const SHOW_EDIT_BUTTON: boolean = false

function App() {
  const [initial] = useState(loadInitialState)
  const [activeStep, setActiveStep] = useState(initial.activeStep)
  const [params, setParams] = useState<WizardParams>(initial.params)
  const [showRestoredBanner, setShowRestoredBanner] = useState(initial.restored)
  const [presetSlots, setPresetSlots] = useState(loadPresetSlots)
  // BL-112: the project the preset slots belong to — its name and the
  // slots' fingerprint when it was last saved to or loaded from a file.
  const [project, setProject] = useState<ProjectInfo>(loadProjectInfo)
  const [isProjectNameOpen, setIsProjectNameOpen] = useState(false)
  const projectFileInputRef = useRef<HTMLInputElement>(null)
  const [isDark, setIsDark] = useDarkMode()
  const [appearance, setAppearance] = useState(loadAppearanceSettings)
  useChromeTheme(appearance.theme)
  const [generatedGCode, setGeneratedGCode] = useState<string[] | null>(null)
  const [previewTab, setPreviewTab] = useState<'2d' | '3d' | 'gcode'>('3d')
  const [machine, setMachine] = useState(loadMachineSettings)
  const [toolDiameters, setToolDiameters] = useState(loadToolDiameterOptions)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  // BL-68: Feedrate Calculator modal (opened from Step 3) and its own
  // remembered inputs (material, flutes, tool material).
  const [isFeedCalcOpen, setIsFeedCalcOpen] = useState(false)
  const [feedCalc, setFeedCalc] = useState(loadFeedCalcSettings)
  // Overlay has no switch of its own (BL-107): it is on while any preset
  // is picked for it (the checkmark badge on a slot).
  const [overlaySlots, setOverlaySlots] = useState<Set<PresetSlotId>>(new Set())
  const overlayEnabled = overlaySlots.size > 0
  // BL-36: independent of overlayEnabled/canGenerate — pure view toggles,
  // local-only (not persisted), shared between the 2D and 3D Preview Tabs.
  const [stockVisible, setStockVisible] = useState(true)
  const [toolpathVisible, setToolpathVisible] = useState(true)
  // BL-95: 3D only — opaque, lit stock instead of the translucent one.
  const [stockSolid, setStockSolid] = useState(false)
  const [justLoadedSlot, setJustLoadedSlot] = useState<PresetSlotId | null>(null)
  // BL-25: the preset slot armed for live auto-save (the pencil badge on a
  // slot; one at a time). BL-107: independent of Overlay — the edited
  // preset is shown as the live pattern whether or not it is overlaid.
  // Session-only, never persisted — always starts unarmed on reload.
  const [editingSlot, setEditingSlot] = useState<PresetSlotId | null>(null)
  // BL-47: bumped whenever params are replaced wholesale by a preset load,
  // and used as the key of the Step 2/3 panels. Their number fields keep
  // their own display text (useNumberField) and only resync from params on
  // blur, so without a remount an open step kept showing the previous
  // preset's values while Preview/G-code already used the new ones.
  const [paramsLoadGeneration, setParamsLoadGeneration] = useState(0)

  // Any parameter change invalidates the last generated snapshot — Copy/
  // Download must not act on G-code that no longer matches the current
  // parameters.
  const updateParams = (patch: Partial<WizardParams>) => {
    setParams((prev) => ({ ...prev, ...patch }))
    setGeneratedGCode(null)
    setShowRestoredBanner(false)
  }

  const goForward = () => setActiveStep((s) => Math.min(s + 1, TOTAL_STEPS))

  const presetCount = PRESET_SLOT_IDS.filter((id) => presetSlots[id]).length
  // The slots differ from the project's file. An untitled project has no
  // file to differ from.
  const projectFingerprint = useMemo(() => slotsFingerprint(presetSlots), [presetSlots])
  const projectDirty = project.name !== null && project.fingerprint !== projectFingerprint

  const updateProject = (next: ProjectInfo) => {
    saveProjectInfo(next)
    setProject(next)
  }

  // BL-112: downloads every preset slot as one file and makes it the
  // current project.
  const handleSaveProject = (name: string) => {
    downloadTextFile(projectFilename(name), buildProjectFile(name, presetSlots, __APP_VERSION__))
    updateProject({ name, fingerprint: projectFingerprint })
    setIsProjectNameOpen(false)
  }

  // BL-112: a project file replaces all seven preset slots (after a
  // confirmation when any is occupied) and is shown at once — every loaded
  // preset in the overlay, nothing armed for editing. The wizard's own
  // parameters are left as they are.
  const handleLoadProjectFile = async (file: File) => {
    const parsed = parseProjectFile(await file.text())
    if (!parsed.ok) {
      window.alert(PROJECT_ERROR_MESSAGE[parsed.reason])
      return
    }
    applyProject(parsed.name || projectNameFromFilename(file.name) || 'Project', parsed.slots)
  }

  // Makes `slots` the current project, for a loaded file and a template
  // alike. False when the user keeps the presets they have.
  const applyProject = (name: string, slots: PresetSlots): boolean => {
    if (presetCount > 0 && !window.confirm(`Replace all presets with the project "${name}"? The current presets will be lost unless you saved them.`)) {
      return false
    }
    replacePresetSlots(slots)
    setPresetSlots(slots)
    setEditingSlot(null)
    setOverlaySlots(new Set(PRESET_SLOT_IDS.filter((id) => slots[id])))
    updateProject({ name, fingerprint: slotsFingerprint(slots) })
    return true
  }

  // BL-113: a built-in template loads exactly like a project file; Settings
  // closes so the object is in view at once.
  const handleLoadTemplate = (template: ProjectTemplate) => {
    const slots = templateSlots(template)
    if (!slots) {
      window.alert(PROJECT_ERROR_MESSAGE.notProject)
      return
    }
    if (applyProject(template.title, slots)) setIsSettingsOpen(false)
  }

  // Display-only method info (Icon/shortLabel/title/stepdown), resolved
  // per operation — NOT the same as the generate() dispatch below, since
  // OutlineMethodMeta has no `generate` of its own (see lib/outline.ts).
  const operationMeta = OPERATION_META[params.operation]
  const activeMethodDisplay = operationMeta.method(params)
  // BL-79: Step 3 Summary shows the global spindle speed — as the router's
  // dial position when a hand-set router is selected in Settings.
  const spindleDial = routerDialHint(machine.router, machine.spindleSpeed)
  const isGeometryValid = isWizardParamsValid(params)
  const fitWarnings = machineFitWarnings(params, machine)
  // Shown next to the machine-fit warnings in Step 4, but kept out of
  // step4Badge(), whose color means "doesn't fit the machine" only.
  const step4Warnings = [...fitWarnings, ...feedsWarnings(params.feeds), ...descentWarnings(params)]
  const step4BadgeInfo = step4Badge(generatedGCode, fitWarnings)

  // BL-25: while a preset slot is armed for edit mode, every param change
  // writes straight back to it — live, no Generate click needed (unlike the
  // hidden session slot "0", which stays Generate-gated, see handleGenerate
  // above). Skips the write while params are invalid so a mid-edit/broken
  // value can never overwrite the saved preset; skipped moments are what
  // turns the "Auto-save Mode Enabled" banner red below. Doesn't depend on
  // presetSlots to avoid re-triggering itself off its own setPresetSlots
  // call.
  useEffect(() => {
    if (!editingSlot || !isGeometryValid) return
    saveSlot(editingSlot, params)
    setPresetSlots((prev) => ({ ...prev, [editingSlot]: params }))
  }, [editingSlot, params, isGeometryValid])
  // Memoized: this feeds Scene3D's content-rebuild effect deps, which
  // disposes and rebuilds all THREE geometry on reference change — without
  // memoizing, a fresh array literal on every App render (e.g. every
  // wizard keystroke) would trigger that rebuild constantly, not just on
  // an actual overlay-selection change.
  // BL-107: the armed preset is left out — the previews draw it from the
  // live params. Every live save replaces presetSlots, so an unchanged
  // list keeps its previous reference (overlayParamsRef).
  const overlayParamsRef = useRef<readonly WizardParams[]>([])
  const overlayParams = useMemo(() => {
    const next = deriveOverlayParams(overlaySlots, presetSlots, editingSlot)
    if (sameOverlayParams(next, overlayParamsRef.current)) return overlayParamsRef.current
    overlayParamsRef.current = next
    return next
  }, [overlaySlots, presetSlots, editingSlot])
  // Text (OP-4): its fonts are fetched on first use. `fontEpoch` counts the
  // fonts that have arrived since start-up — the engine and the previews
  // read fonts synchronously from a registry, so this is what tells React
  // (validation here, both previews below) that a text can now be laid out.
  const [fontEpoch, setFontEpoch] = useState(0)
  const neededFonts = [
    ...new Set([params, ...PRESET_SLOT_IDS.map((id) => presetSlots[id])].flatMap((p) => (p?.operation === 'text' ? [p.text.fontId] : []))),
  ]
    .sort()
    .join('|')
  useEffect(() => {
    let alive = true
    for (const id of neededFonts.split('|')) {
      if (!id || getLoadedFont(id)) continue
      ensureTextFont(id)
        .then(() => alive && setFontEpoch((n) => n + 1))
        .catch((err) => console.warn(`OnlyPaths: could not load the font "${id}"`, err))
    }
    return () => {
      alive = false
    }
  }, [neededFonts])

  // A font arriving changes what is on screen (a text appears), so it
  // re-fits the view like a change of the overlay does.
  const previewFitKey = useMemo(
    () => `${overlayFitKey(overlaySlots, presetSlots, editingSlot)}#${fontEpoch}`,
    [overlaySlots, presetSlots, editingSlot, fontEpoch],
  )
  // Plain Overlay (nothing armed for editing) hides the live pattern and
  // blocks Generate; with a preset armed, the live pattern IS that preset.
  const overlayHidesLive = overlayEnabled && editingSlot === null
  const editingInOverlay = editingSlot !== null && overlayParams.length > 0

  // BL-63: the 2D/3D previews rebuild from a deferred copy of params — a
  // keystroke re-renders the fields right away and the (possibly heavy,
  // e.g. Pocket Adaptive at a low Optimal Load) preview rebuild follows
  // once React has time, instead of every keystroke waiting on it.
  const previewParams = useDeferredValue(params)

  // BL-91: the previews draw no toolpath for parameters validation rejects
  // (e.g. a helix wider than its pocket) — stock and shape stay, with a
  // note. Judged on the deferred copy, the one the previews actually draw.
  // Overlay hides the live pattern, so its validity doesn't matter there.
  const previewToolpathBlocked =
    !overlayHidesLive && !(previewParams === params ? isGeometryValid : isWizardParamsValid(previewParams))

  // BL-76: each preview's last view, kept here because switching tabs
  // unmounts the preview itself — restored when its tab comes back.
  // Session-only (a page reload starts from Front / Fit View again).
  const saved2DViewRef = useRef<Saved2DView | null>(null)
  const saved3DViewRef = useRef<Saved3DView | null>(null)

  const handleSaveMachine = (next: typeof machine) => {
    // Unlike travel X/Y/Z (which only affect the soft machineFitWarnings
    // check), dialect/header/footer feed directly into the emitted G-code
    // (program.ts) — a stale generatedGCode snapshot would silently miss
    // the change, the same staleness Copy/Download already guard against
    // for WizardParams edits (see updateParams above).
    const affectsGCode =
      next.dialect !== machine.dialect ||
      next.headerText !== machine.headerText ||
      next.footerText !== machine.footerText ||
      next.spindleSpeed !== machine.spindleSpeed ||
      next.dwellSeconds !== machine.dwellSeconds
    saveMachineSettings(next)
    setMachine(next)
    if (affectsGCode) setGeneratedGCode(null)
  }

  const handleSaveFeedCalc = (next: FeedCalcSettings) => {
    saveFeedCalcSettings(next)
    setFeedCalc(next)
  }

  // BL-68: the calculator's result lands in params (and, when its RPM was
  // selected, in Settings → Machine). Remounts Steps 2/3 like a preset load
  // — their number fields only resync from params on blur, and the open
  // Step 3 would keep showing the old Plunge Rate/Stepdown text.
  const handleApplyFeedCalc = (patch: Partial<WizardParams>, spindleSpeed: number | null) => {
    updateParams(patch)
    if (spindleSpeed !== null && spindleSpeed !== machine.spindleSpeed) handleSaveMachine({ ...machine, spindleSpeed })
    setParamsLoadGeneration((n) => n + 1)
    setIsFeedCalcOpen(false)
  }

  const handleSaveAppearance = (next: AppearanceSettings) => {
    saveAppearanceSettings(next)
    setAppearance(next)
  }

  // Unlike machine settings (dialect/header/footer), this list never feeds
  // the G-code engine — it's only the enumerable choice set for the Tool
  // Diameter dropdowns — so no generatedGCode invalidation is needed here.
  const handleSaveToolDiameters = (next: ToolDiameterOption[]) => {
    saveToolDiameterOptions(next)
    setToolDiameters(next)
  }

  // BL-40: "Reset All Settings" — wipes every localStorage key the app
  // owns and syncs in-memory state to match, all five independent stores
  // at once (Appearance/Tool Diameters/Machine/Feedrate Calculator each
  // their own key, plus every preset slot including the hidden auto-save
  // session slot "0").
  // Leaves the live, currently-open wizard params untouched — this clears
  // what's saved, not what's on screen. generatedGCode is invalidated
  // since Machine's dialect/header/footer may have just changed underneath
  // it (same reasoning as handleSaveMachine's affectsGCode above).
  // Overlay/Edit Mode selections are cleared too since the presets they'd
  // reference no longer exist.
  const handleResetAllSettings = () => {
    clearAllSlots()
    setPresetSlots({})
    saveAppearanceSettings(DEFAULT_APPEARANCE_SETTINGS)
    setAppearance(DEFAULT_APPEARANCE_SETTINGS)
    saveToolDiameterOptions(DEFAULT_TOOL_DIAMETER_OPTIONS)
    setToolDiameters(DEFAULT_TOOL_DIAMETER_OPTIONS)
    saveMachineSettings(DEFAULT_MACHINE_SETTINGS)
    setMachine(DEFAULT_MACHINE_SETTINGS)
    saveFeedCalcSettings(DEFAULT_FEED_CALC_SETTINGS)
    setFeedCalc(DEFAULT_FEED_CALC_SETTINGS)
    setGeneratedGCode(null)
    setEditingSlot(null)
    setOverlaySlots(new Set())
    updateProject(NO_PROJECT)
  }

  // Generate is also the auto-save trigger for the hidden slot 0 — see
  // CLAUDE.md, Etap 5, "localStorage": persisted on Generate rather than on
  // every keystroke, so a snapshot only survives once the user considered
  // the params worth turning into G-code.
  const handleGenerate = () => {
    const gcode = operationMeta.generate(params, machine)
    setGeneratedGCode(gcode)
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

  // Plain load — what a click on a Preset Bar slot does, and only while
  // nothing is overlaid or edited (BL-107). BL-39: doesn't touch activeStep
  // — whichever wizard step was open stays open across a preset switch.
  const handleLoadPreset = (id: PresetSlotId) => {
    const preset = presetSlots[id]
    if (!preset || overlayEnabled || editingSlot) return
    setParams(preset)
    setParamsLoadGeneration((n) => n + 1)
    setGeneratedGCode(null)
    setShowRestoredBanner(false)
    // Brief flash on the loaded preset's icon — confirms "this is what just
    // got loaded" (same 1.5s timing convention as "Copied!"/"✓ Saved").
    setJustLoadedSlot(id)
    setTimeout(() => setJustLoadedSlot((s) => (s === id ? null : s)), 1500)
  }

  // BL-25/BL-107: the pencil badge on a slot — radio-button style. On the
  // armed slot it disarms; on any other it loads that preset AND arms it
  // (the previous one keeps what was saved). Overlay membership is not
  // touched either way.
  const handleEditSlot = (id: PresetSlotId) => {
    const preset = presetSlots[id]
    if (!preset) return
    if (editingSlot === id) {
      setEditingSlot(null)
      return
    }
    setParams(preset)
    setParamsLoadGeneration((n) => n + 1)
    setGeneratedGCode(null)
    setShowRestoredBanner(false)
    setEditingSlot(id)
  }

  // The checkmark badge on a slot.
  const handleToggleOverlaySlot = (id: PresetSlotId) => {
    setOverlaySlots((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // The eye: clears the overlay, or — with nothing overlaid — shows every
  // saved preset.
  const handleToggleOverlay = () => {
    setOverlaySlots(overlayEnabled ? new Set() : new Set(PRESET_SLOT_IDS.filter((id) => presetSlots[id])))
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
    // The deleted slot can no longer be edited or overlaid.
    if (editingSlot === id) setEditingSlot(null)
    setOverlaySlots((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  return (
    <div className="relative flex h-svh flex-col bg-bg text-fg shadow-[var(--frame-glow)]">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-border px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold">
            <span className="text-wordmark-only" style={{ textShadow: 'var(--wordmark-only-glow)' }}>
              Only
            </span>
            <span className="text-wordmark-paths" style={{ textShadow: 'var(--wordmark-paths-glow)' }}>
              Paths
            </span>
          </h1>
          <p className="text-xs text-muted">
            Helps you CAM. Every time!
          </p>
          <p className="text-[11px] text-muted">Envisioned by ThingsByPluzz</p>
        </div>

        <div className="flex items-center justify-self-center gap-4">
        <div
          className={[
            'relative flex items-center gap-2 rounded-lg border px-2 py-2 transition-colors',
            overlayEnabled || editingSlot ? 'border-border' : 'border-transparent',
          ].join(' ')}
        >
          {/* BL-25: absolutely positioned off the LEFT edge of the preset
              group (not a normal flex sibling) so it never pushes the
              icons/eye/pencil buttons sideways when it appears or
              disappears — they stay put, this floats. Two states: neutral
              "select a preset" text before anything is armed, then the
              validity-colored "Auto-save Mode Enabled" once a slot is
              picked (green/red per isGeometryValid — red flags moments
              live-save is being skipped for invalid params). */}
          {(overlayEnabled || editingSlot) && (
            <div className="absolute top-1/2 right-full mr-3 flex -translate-y-1/2 flex-col items-end gap-0.5 text-xs font-semibold whitespace-nowrap">
              {/* BL-105: Overlay's label, in Overlay's color; with a preset
                  being edited too it sits above Edit's (BL-107). */}
              {overlayEnabled && (
                <span className="text-accent-fg">
                  {`Overlay Mode — ${overlaySlots.size} ${overlaySlots.size === 1 ? 'preset' : 'presets'} shown`}
                </span>
              )}
              {editingSlot && (
                <span className={isGeometryValid ? 'text-status-success' : 'text-status-error'}>
                  Auto-save Mode Enabled
                </span>
              )}
            </div>
          )}
          {PRESET_SLOT_IDS.map((id) => {
            const preset = presetSlots[id]
            const PresetIcon = preset ? OPERATION_META[preset.operation].pickIcon(preset) : null
            const isOverlaySelected = overlaySlots.has(id)
            const isEditingSlot = editingSlot === id
            // A plain click loads the preset — only while nothing is
            // overlaid or edited (loading over an armed slot would be
            // live-saved straight into it).
            const canLoad = !overlayEnabled && !editingSlot
            const isJustLoaded = canLoad && justLoadedSlot === id
            const baseClassName = !preset
              ? 'flex h-11 w-11 cursor-default items-center justify-center rounded-md border border-empty-border text-xs font-semibold text-empty-fg'
              : isEditingSlot
                ? 'flex h-11 w-11 items-center justify-center rounded-md border-2 border-edit text-edit-fg shadow-[var(--glow-edit)]'
                : isOverlaySelected
                  ? 'flex h-11 w-11 items-center justify-center rounded-md border-2 border-accent text-accent-fg shadow-[var(--glow-accent)]'
                  : `flex h-11 w-11 items-center justify-center rounded-md border border-accent-border text-accent-fg shadow-[var(--glow-accent)]${canLoad ? ' hover:bg-accent-bg' : ''}`
            // The two corner badges (BL-107): an empty ring on hover/focus,
            // filled while on — so the state never rests on color alone.
            const badgeBase =
              'absolute flex h-5 w-5 items-center justify-center rounded-full border transition-opacity focus-visible:opacity-100'
            const badgeHidden = ' opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
            return (
              <div key={id} className="group relative">
                <button
                  type="button"
                  onClick={() => handleLoadPreset(id)}
                  disabled={!preset}
                  aria-disabled={preset && !canLoad ? true : undefined}
                  title={
                    !preset
                      ? `Preset [${id}] — empty`
                      : canLoad
                        ? `Load preset [${id}] — ${presetLabel(preset)}`
                        : `Preset [${id}] — ${presetLabel(preset)}`
                  }
                  className={`${baseClassName}${preset && !canLoad ? ' cursor-default' : ''} transition-shadow duration-700${isJustLoaded ? ' ring-2 ring-accent ring-offset-2 ring-offset-bg' : ''}`}
                >
                  {PresetIcon ? <PresetIcon className="h-7 w-7" /> : id}
                </button>
                {preset && (
                  <button
                    type="button"
                    onClick={() => handleToggleOverlaySlot(id)}
                    aria-pressed={isOverlaySelected}
                    aria-label={`Show preset ${id} in overlay`}
                    title={`${isOverlaySelected ? 'Remove' : 'Add'} preset [${id}] ${isOverlaySelected ? 'from' : 'to'} overlay`}
                    className={`${badgeBase} -top-1.5 -left-1.5 ${
                      isOverlaySelected
                        ? 'border-accent bg-accent text-btn-fg'
                        : `border-accent bg-bg text-accent-fg${badgeHidden}`
                    }`}
                  >
                    <CheckIcon className="h-3 w-3" />
                  </button>
                )}
                {preset && (
                  <button
                    type="button"
                    onClick={() => handleEditSlot(id)}
                    aria-pressed={isEditingSlot}
                    aria-label={`Edit preset ${id}`}
                    title={
                      isEditingSlot
                        ? `Editing preset [${id}] (auto-saving) — click to stop`
                        : `Edit preset [${id}] — loads it and auto-saves further changes`
                    }
                    className={`${badgeBase} -top-1.5 -right-1.5 ${
                      isEditingSlot
                        ? 'border-edit bg-edit text-edit-on'
                        : `border-edit bg-bg text-edit-fg${badgeHidden}`
                    }`}
                  >
                    <PencilIcon className="h-3 w-3" />
                  </button>
                )}
              </div>
            )
          })}
          {/* BL-107: the eye and the pencil show whether anything is
              overlaid / edited and switch it off; the unlit eye shows every
              saved preset at once. Picking happens on the slots' badges. */}
          <button
            type="button"
            onClick={handleToggleOverlay}
            aria-label="Toggle preset overlay"
            aria-pressed={overlayEnabled}
            title={
              overlayEnabled
                ? 'Overlay preview: on — click to remove every preset from the overlay'
                : 'Overlay preview: off — click to show all saved presets (or use the checkmark on a preset)'
            }
            className={[
              'ml-11 flex h-11 w-11 items-center justify-center rounded-md border transition',
              overlayEnabled
                ? 'border-2 border-accent bg-accent-bg text-accent-fg shadow-[var(--glow-accent)]'
                : 'border-border text-value hover:bg-border/40',
            ].join(' ')}
          >
            <EyeIcon className="h-5 w-5" />
          </button>
          {/* The Header's own "stop editing" pencil is hidden for now (BL-115):
              the pencil badge on the edited slot does the same job. Kept in
              the code until the decision to remove it for good. */}
          {SHOW_EDIT_BUTTON && (
            <button
              type="button"
              onClick={() => setEditingSlot(null)}
              disabled={!editingSlot}
              aria-label="Stop editing the preset"
              aria-pressed={editingSlot !== null}
              title={
                editingSlot
                  ? `Editing preset [${editingSlot}] — click to stop auto-saving`
                  : 'Not editing — use the pencil on a preset to edit it'
              }
              className={[
                'flex h-11 w-11 items-center justify-center rounded-md border transition',
                editingSlot
                  ? 'border-2 border-edit bg-edit-bg text-edit-fg shadow-[var(--glow-edit)]'
                  : 'border-border text-value opacity-50',
              ].join(' ')}
            >
              <PencilIcon className="h-5 w-5" />
            </button>
          )}
        </div>
        {/* BL-112: the presets as one project file, outside the preset
            group's frame — the project's name (with a dot while the slots
            differ from the file), then Load and Save. */}
        <div className="flex items-center gap-2">
          <span
            title={
              project.name === null
                ? 'No project saved or loaded yet'
                : projectDirty
                  ? `Project "${project.name}" — presets changed since it was saved`
                  : `Project "${project.name}"`
            }
            className="flex h-7 max-w-40 items-center gap-1.5 rounded-md border border-edit px-2 text-xs font-semibold text-edit-fg shadow-[var(--glow-edit)]"
          >
            <span className="truncate">{project.name ?? 'Untitled'}</span>
            {projectDirty && (
              <span className="flex shrink-0 items-center gap-1" role="status">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-edit" />
                <span className="sr-only">unsaved changes</span>
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => projectFileInputRef.current?.click()}
            aria-label="Load project from a file"
            title="Load project — replaces all presets with the ones in a project file"
            className="flex h-11 w-11 items-center justify-center rounded-md border border-border text-value transition hover:bg-border/40"
          >
            <OpenFileIcon className="h-5 w-5" />
          </button>
          <input
            ref={projectFileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              // Cleared so picking the same file again fires onChange again.
              e.target.value = ''
              if (file) void handleLoadProjectFile(file)
            }}
          />
          <button
            type="button"
            onClick={() => setIsProjectNameOpen(true)}
            disabled={presetCount === 0}
            aria-label="Save project to a file"
            title={presetCount === 0 ? 'Save project — no presets to save yet' : 'Save project — all presets to one file'}
            className={[
              'flex h-11 w-11 items-center justify-center rounded-md border border-border text-value transition',
              presetCount === 0 ? 'opacity-50' : 'hover:bg-border/40',
            ].join(' ')}
          >
            <SaveFileIcon className="h-5 w-5" />
          </button>
        </div>
        </div>

        <div className="flex items-center justify-self-end gap-2">
          <button
            type="button"
            onClick={() => setIsDark((d) => !d)}
            aria-label="Toggle dark mode"
            aria-pressed={isDark}
            title="Toggle dark mode"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-value hover:bg-border/40"
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
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-value hover:bg-border/40"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex shrink-0 overflow-x-auto border-r border-border">
          {STEP_META.map((step) => {
            if (step.id === activeStep) {
              return (
                <div
                  key={step.id}
                  className="flex w-[420px] shrink-0 flex-col overflow-y-auto border-r border-border p-6"
                >
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
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
                    <Step2Geometry
                      key={paramsLoadGeneration}
                      params={params}
                      onChange={updateParams}
                      machine={machine}
                      toolDiameters={toolDiameters}
                      flutes={feedCalc.flutes}
                      onFlutesChange={(flutes) => handleSaveFeedCalc({ ...feedCalc, flutes })}
                    />
                  )}
                  {step.id === 3 && (
                    <Step3Feeds
                      key={paramsLoadGeneration}
                      params={params}
                      onChange={updateParams}
                      machine={machine}
                      stepdownLabel={activeMethodDisplay.stepdown.fieldLabel}
                      onOpenCalculator={() => setIsFeedCalcOpen(true)}
                      onSaveMachine={handleSaveMachine}
                    />
                  )}
                  {step.id === 4 && (
                    <>
                      {showRestoredBanner && (
                        <div className="mb-4 rounded-md border border-accent-border bg-accent-bg px-3 py-2 text-xs text-accent-fg">
                          Restored from your last session — click Generate to refresh the G-code.
                        </div>
                      )}
                      <Step4Output
                        params={params}
                        onChange={updateParams}
                        generatedGCode={generatedGCode}
                        onGenerate={handleGenerate}
                        canGenerate={isGeometryValid && !overlayHidesLive}
                        overlayActive={overlayHidesLive}
                        presetSlots={presetSlots}
                        onSaveToPreset={handleSaveToPreset}
                        onDeletePreset={handleDeletePreset}
                        warnings={step4Warnings}
                      />
                    </>
                  )}

                  {STEPS_WITH_NEXT_BUTTON.has(step.id) && (
                    <div className="mt-6 flex justify-end">
                      <button
                        type="button"
                        onClick={goForward}
                        className="rounded-md bg-btn-bg px-4 py-2 text-sm font-medium text-btn-fg shadow-[var(--glow-btn)]"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
              )
            }

            if (step.id === 1) {
              return (
                <Step1Summary
                  key={step.id}
                  params={params}
                  title={collapsedStepTitle(step.id, params)}
                  onOpen={() => setActiveStep(step.id)}
                  onSwitchOperation={(operation) => {
                    updateParams({ operation })
                    setActiveStep(step.id)
                  }}
                />
              )
            }

            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setActiveStep(step.id)}
                title={collapsedStepTitle(step.id, params)}
                className="flex w-20 shrink-0 flex-col items-center gap-3 border-r border-border py-4 hover:bg-border/40"
              >
                {step.id === 2 && (
                  <div className="flex flex-col items-center gap-4">
                    <span className="text-[10px] font-semibold uppercase text-muted">
                      {step.title}
                    </span>
                    <MiniStat
                      icon={<activeMethodDisplay.Icon className="h-8 w-8" />}
                      label="METHOD"
                      value={activeMethodDisplay.shortLabel}
                      title={`Method: ${activeMethodDisplay.title}`}
                    />
                    {operationMeta.geometryStats(params).map((stat) => (
                      <MiniStat
                        key={stat.label}
                        icon={<stat.Icon className="h-8 w-8" />}
                        label={stat.label}
                        value={stat.value}
                        unit={stat.unit}
                        title={stat.title}
                      />
                    ))}
                  </div>
                )}

                {step.id === 3 && (
                  <div className="flex flex-col items-center gap-4">
                    <span className="text-[10px] font-semibold uppercase text-muted">
                      {step.title}
                    </span>
                    <MiniStat
                      icon={<SpindleIcon className="h-8 w-8" />}
                      label="SPINDLE"
                      value={spindleDial ? `dial ${spindleDial.position}` : `${machine.spindleSpeed}`}
                      unit={spindleDial ? undefined : 'RPM'}
                      title={`Spindle Speed: ${machine.spindleSpeed} RPM${spindleDial ? ` — ${spindleDial.label} dial ${spindleDial.position} (≈ ${spindleDial.rpm} RPM)` : ''} (global, Settings → Machine)`}
                    />
                    <MiniStat
                      icon={<FeedIcon className="h-8 w-8" />}
                      label="FEED"
                      value={`${params.feeds.feedrateXY}`}
                      unit="mm/min"
                      title={`Feedrate XY: ${params.feeds.feedrateXY} mm/min`}
                    />
                    <MiniStat
                      icon={<PlungeIcon className="h-8 w-8" />}
                      label="PLUNGE"
                      value={`${params.feeds.plungeRate}`}
                      unit="mm/min"
                      title={`Plunge Rate: ${params.feeds.plungeRate} mm/min`}
                    />
                    <MiniStat
                      icon={<StepdownIcon className="h-8 w-8" />}
                      label={activeMethodDisplay.stepdown.shortLabel}
                      value={`${params.feeds.stepdown}`}
                      unit="mm"
                      title={`Stepdown: ${params.feeds.stepdown} mm`}
                    />
                    {params.feeds.startZ !== 0 && (
                      <MiniStat
                        icon={<StartZIcon className="h-8 w-8" />}
                        label="STARTZ"
                        value={`${params.feeds.startZ}`}
                        unit="mm"
                        title={`Start Z: ${params.feeds.startZ} mm`}
                      />
                    )}
                  </div>
                )}

                {step.id === 4 && (
                  <>
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-full ${step4BadgeInfo.colorClassName}`}
                      title={step4BadgeInfo.title}
                    >
                      <step4BadgeInfo.Icon className="h-5 w-5" />
                    </span>
                    <span className="[writing-mode:vertical-rl] rotate-180 text-xs font-medium text-muted">
                      {step.title}
                    </span>
                  </>
                )}
              </button>
            )
          })}
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-6 py-3">
            <div className="flex gap-2" role="tablist" aria-label="Preview">
              {(['2d', '3d', 'gcode'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={previewTab === tab}
                  onClick={() => setPreviewTab(tab)}
                  className={[
                    'rounded-md px-2.5 py-1 text-xs font-semibold uppercase tracking-wide transition',
                    previewTab === tab
                      ? 'bg-tab-active-bg text-tab-active-fg shadow-[var(--glow-accent)]'
                      : 'text-muted hover:text-fg',
                  ].join(' ')}
                >
                  {tab === '2d' ? '2D Preview' : tab === '3d' ? '3D Preview' : 'G-Code'}
                </button>
              ))}
            </div>
            {previewTab === 'gcode' && generatedGCode && (
              <span className="text-xs text-muted">
                {generatedGCode.length} lines
              </span>
            )}
          </div>

          <div className="relative flex flex-1 flex-col overflow-hidden shadow-[var(--preview-inset)]">
            {overlayHidesLive && previewTab !== 'gcode' && (
              <div className="pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-btn-fg shadow-lg">
                Preview mode
              </div>
            )}
            {previewToolpathBlocked && previewTab !== 'gcode' && (
              <div
                role="status"
                className="pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-status-delete-fg bg-status-delete-bg px-3 py-1 text-xs font-semibold whitespace-nowrap text-status-delete-fg shadow-lg"
              >
                Fix the highlighted fields to see the toolpath
              </div>
            )}

            {previewTab === '2d' && (
              <ToolpathCanvas
                viewMemory={saved2DViewRef}
                params={previewParams}
                isDark={isDark}
                paletteId={appearance.palette}
                themeId={appearance.theme}
                overlayParams={overlayParams}
                showActivePattern={!overlayHidesLive}
                dimOverlay={editingInOverlay}
                activeToolpathVisible={!previewToolpathBlocked}
                fitKey={previewFitKey}
                fontEpoch={fontEpoch}
                stockVisible={stockVisible}
                toolpathVisible={toolpathVisible}
                cutShapeEnabled={appearance.cutShapeEnabled}
                onToggleStockVisible={() => setStockVisible((v) => !v)}
                onToggleToolpathVisible={() => setToolpathVisible((v) => !v)}
              />
            )}

            {previewTab === '3d' && (
              <Suspense
                fallback={
                  <div className="flex flex-1 items-center justify-center text-sm text-muted">
                    Loading 3D viewer…
                  </div>
                }
              >
                <Scene3D
                  viewMemory={saved3DViewRef}
                  params={previewParams}
                  isDark={isDark}
                  paletteId={appearance.palette}
                  themeId={appearance.theme}
                  overlayParams={overlayParams}
                  showActivePattern={!overlayHidesLive}
                  dimOverlay={editingInOverlay}
                  activeToolpathVisible={!previewToolpathBlocked}
                  fitKey={previewFitKey}
                  fontEpoch={fontEpoch}
                  gridLabelsEnabled={appearance.grid3DLabelsEnabled}
                  gridLabelSize={appearance.grid3DLabelSize}
                  stockVisible={stockVisible}
                  toolpathVisible={toolpathVisible}
                  stockSolid={stockSolid}
                  stockEdgesEnabled={appearance.stockEdges3DEnabled}
                  cutShapeEnabled={appearance.cutShapeEnabled}
                  onToggleStockSolid={() => setStockSolid((v) => !v)}
                  renderPaused={isSettingsOpen || isFeedCalcOpen || isProjectNameOpen}
                  onToggleStockVisible={() => setStockVisible((v) => !v)}
                  onToggleToolpathVisible={() => setToolpathVisible((v) => !v)}
                  onToggleGridLabels={() =>
                    handleSaveAppearance({
                      ...appearance,
                      grid3DLabelsEnabled: !appearance.grid3DLabelsEnabled,
                    })
                  }
                />
              </Suspense>
            )}

            {previewTab === 'gcode' &&
              (generatedGCode ? (
                <pre className="flex-1 overflow-auto bg-code-bg p-6 font-mono text-xs leading-relaxed text-value">
                  {generatedGCode.slice(0, GCODE_PREVIEW_LINES).join('\n')}
                  {generatedGCode.length > GCODE_PREVIEW_LINES && (
                    <span className="mt-4 block font-sans text-sm text-muted">
                      … {generatedGCode.length - GCODE_PREVIEW_LINES} more lines not shown. Download the file from
                      Step 4 for the full program.
                    </span>
                  )}
                </pre>
              ) : (
                <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted">
                  Go to Step 4 and click "Generate" to preview the G-code.
                </div>
              ))}
          </div>
        </div>
      </div>

      {isFeedCalcOpen && (
        <FeedCalculatorModal
          params={params}
          machine={machine}
          settings={feedCalc}
          toolDiameters={toolDiameters}
          onSaveSettings={handleSaveFeedCalc}
          onApply={handleApplyFeedCalc}
          onClose={() => setIsFeedCalcOpen(false)}
        />
      )}

      {isProjectNameOpen && (
        <ProjectNameModal
          initialName={project.name ?? ''}
          presetCount={presetCount}
          onSave={handleSaveProject}
          onClose={() => setIsProjectNameOpen(false)}
        />
      )}

      {isSettingsOpen && (
        <SettingsModal
          machine={machine}
          onSave={handleSaveMachine}
          appearance={appearance}
          onSaveAppearance={handleSaveAppearance}
          toolDiameters={toolDiameters}
          onSaveToolDiameters={handleSaveToolDiameters}
          onResetAll={handleResetAllSettings}
          onLoadTemplate={handleLoadTemplate}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      {/* CRT scanline overlay — driven entirely by the --scan/--scan-opacity
          tokens (src/index.css), which are `none`/0 for every theme except
          Arcade Studio Full Neon. One shared element for every theme so no
          component branches on which theme is active. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[9]"
        style={{
          backgroundImage: 'var(--scan)',
          backgroundSize: '100% 4px',
          opacity: 'var(--scan-opacity)',
        }}
      />
    </div>
  )
}

export default App
