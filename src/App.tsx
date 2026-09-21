import { lazy, Suspense, useEffect, useMemo, useState, type ComponentType } from 'react'
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
  EyeIcon,
  FeedIcon,
  OffsetIcon,
  PencilIcon,
  PlungeIcon,
  StartZIcon,
  StepdownIcon,
  TabBridgeIcon,
  WarningIcon,
  XIcon,
} from './components/icons'
import { METHOD_META } from './config/methodMeta'
import { positioningIcon, positioningLines, positioningSummary } from './config/positioningMeta'
import {
  activeOutlineMethodMeta,
  offsetModeLabel,
  OUTLINE_SHAPE_META,
  outlineShapeIcon,
  outlineShapeLines,
  outlineSummary,
} from './config/outlineMeta'
import { SURFACE_METHOD_META } from './config/surfaceMethodMeta'
import { SURFACE_SHAPE_META, surfaceShapeIcon, surfaceShapeLines, surfaceSummary } from './config/surfaceMeta'
import { POCKET_METHOD_META } from './config/pocketMethodMeta'
import { POCKET_SHAPE_META, pocketShapeIcon, pocketShapeLines, pocketSummary } from './config/pocketMeta'
import { fmt } from './lib/format'
import { deriveOverlayParams } from './lib/overlayParams'
import { generateOutline } from './lib/outline'
import { presetLabel } from './lib/presetLabel'
import {
  AUTO_SAVE_SLOT,
  PRESET_SLOT_IDS,
  clearAllSlots,
  deleteSlot,
  loadPresetSlots,
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
  isCircleHoleCountValid,
  isOutlineTabHeightValid,
  isOutlineTabWidthValid,
  isOutlineToolDiameterValid,
  isPocketHelixRadiusValid,
  isPocketStepoverValid,
  isPocketToolDiameterValid,
  isStartZValid,
  isStepdownValid,
  isSurfaceHelixRadiusValid,
  isSurfaceStepoverValid,
  isSurfaceToolDiameterValid,
  isTabHeightValid,
  isTabWidthValid,
  isToolDiameterValid,
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
function offsetSummary(offset: { offsetX: number; offsetY: number }): string | null {
  if (offset.offsetX === 0 && offset.offsetY === 0) return null
  return `(${fmt(offset.offsetX)};${fmt(offset.offsetY)})mm`
}

function outlineSizeValue(outline: WizardParams['outline']): string {
  return outline.shape === 'circle' ? `⌀${outline.diameter}` : `${outline.width}×${outline.height}`
}

function surfaceSizeValue(surface: WizardParams['surface']): string {
  return `${surface.width}×${surface.height}`
}

function pocketSizeValue(pocket: WizardParams['pocket']): string {
  return pocket.shape === 'circle' ? `⌀${pocket.diameter}` : `${pocket.width}×${pocket.height}`
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
    case 1:
      if (params.operation === 'outline') return `Shape — ${outlineSummary(params.outline)}`
      if (params.operation === 'surface') return `Shape — ${surfaceSummary(params.surface)}`
      if (params.operation === 'pocket') return `Shape — ${pocketSummary(params.pocket)}`
      return `Pattern — ${positioningSummary(params.geometry)}`
    case 2: {
      if (params.operation === 'outline') {
        const { outline } = params
        const offset = offsetSummary(outline)
        return `Geometry — Tool ⌀${outline.toolDiameter}mm, ${OUTLINE_SHAPE_META[outline.shape].title} ${outlineSizeValue(outline)}mm, Depth ${outline.totalDepth}mm (${offsetModeLabel(outline.offsetMode)})${offset ? ` — Offset ${offset}` : ''} — Method: ${activeOutlineMethodMeta(outline).title}`
      }
      if (params.operation === 'surface') {
        const { surface } = params
        const offset = offsetSummary(surface)
        return `Geometry — Tool ⌀${surface.toolDiameter}mm, ${SURFACE_SHAPE_META[surface.shape].title} ${surfaceSizeValue(surface)}mm, Depth ${surface.totalDepth}mm${offset ? ` — Offset ${offset}` : ''} — Method: ${SURFACE_METHOD_META[surface.method].title}`
      }
      if (params.operation === 'pocket') {
        const { pocket } = params
        const offset = offsetSummary(pocket)
        return `Geometry — Tool ⌀${pocket.toolDiameter}mm, ${POCKET_SHAPE_META[pocket.shape].title} ${pocketSizeValue(pocket)}mm, Depth ${pocket.totalDepth}mm${offset ? ` — Offset ${offset}` : ''} — Method: ${POCKET_METHOD_META[pocket.method].title}`
      }
      const offset = offsetSummary(params.geometry)
      return `Geometry — Tool ⌀${params.geometry.toolDiameter}mm, Hole ⌀${params.geometry.holeDiameter}mm, Depth ${params.geometry.totalDepth}mm${offset ? ` — Offset ${offset}` : ''} — Method: ${METHOD_META[params.method].title}`
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

function App() {
  const [initial] = useState(loadInitialState)
  const [activeStep, setActiveStep] = useState(initial.activeStep)
  const [params, setParams] = useState<WizardParams>(initial.params)
  const [showRestoredBanner, setShowRestoredBanner] = useState(initial.restored)
  const [presetSlots, setPresetSlots] = useState(loadPresetSlots)
  const [isDark, setIsDark] = useDarkMode()
  const [appearance, setAppearance] = useState(loadAppearanceSettings)
  useChromeTheme(appearance.theme)
  const [generatedGCode, setGeneratedGCode] = useState<string[] | null>(null)
  const [previewTab, setPreviewTab] = useState<'2d' | '3d' | 'gcode'>('3d')
  const [machine, setMachine] = useState(loadMachineSettings)
  const [toolDiameters, setToolDiameters] = useState(loadToolDiameterOptions)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [overlayEnabled, setOverlayEnabled] = useState(false)
  const [overlaySlots, setOverlaySlots] = useState<Set<PresetSlotId>>(new Set())
  // BL-36: independent of overlayEnabled/canGenerate — pure view toggles,
  // local-only (not persisted), shared between the 2D and 3D Preview Tabs.
  const [stockVisible, setStockVisible] = useState(true)
  const [toolpathVisible, setToolpathVisible] = useState(true)
  const [justLoadedSlot, setJustLoadedSlot] = useState<PresetSlotId | null>(null)
  // BL-25: global toggle for edit mode, next to overlayEnabled — mutually
  // exclusive with it (see handleToggleEditMode/handleToggleOverlay). While
  // on, clicking a preset slot loads it AND arms it for live auto-save
  // (radio-button style: only one slot armed at a time); while off, Preset
  // Bar clicks are plain, ordinary loads with no arming path at all.
  const [editModeEnabled, setEditModeEnabled] = useState(false)
  // BL-25: the preset slot currently armed for live auto-save. "No slot
  // selected" is a valid state even while editModeEnabled is true (before
  // the first pick, or after re-clicking the armed slot to deselect it).
  // Session-only, never persisted — always starts unarmed on reload.
  const [editingSlot, setEditingSlot] = useState<PresetSlotId | null>(null)

  // Any parameter change invalidates the last generated snapshot — Copy/
  // Download must not act on G-code that no longer matches the current
  // parameters.
  const updateParams = (patch: Partial<WizardParams>) => {
    setParams((prev) => ({ ...prev, ...patch }))
    setGeneratedGCode(null)
    setShowRestoredBanner(false)
  }

  const goForward = () => setActiveStep((s) => Math.min(s + 1, TOTAL_STEPS))

  // Display-only method info (Icon/shortLabel/title/stepdown), resolved
  // per operation — NOT the same as the generate() dispatch below, since
  // OutlineMethodMeta has no `generate` of its own (see lib/outline.ts).
  const activeMethodDisplay =
    params.operation === 'outline'
      ? activeOutlineMethodMeta(params.outline)
      : params.operation === 'surface'
        ? SURFACE_METHOD_META[params.surface.method]
        : params.operation === 'pocket'
          ? POCKET_METHOD_META[params.pocket.method]
          : METHOD_META[params.method]
  const offset = offsetSummary(
    params.operation === 'outline'
      ? params.outline
      : params.operation === 'surface'
        ? params.surface
        : params.operation === 'pocket'
          ? params.pocket
          : params.geometry,
  )
  const isGeometryValid =
    params.operation === 'outline'
      ? isOutlineToolDiameterValid(params.outline) &&
        isStepdownValid(params.feeds) &&
        isStartZValid(params.feeds) &&
        isOutlineTabHeightValid(params.outline) &&
        isOutlineTabWidthValid(params.outline)
      : params.operation === 'surface'
        ? isSurfaceToolDiameterValid(params.surface) &&
          isStepdownValid(params.feeds) &&
          isStartZValid(params.feeds) &&
          isSurfaceStepoverValid(params.surface) &&
          isSurfaceHelixRadiusValid(params.surface)
        : params.operation === 'pocket'
          ? isPocketToolDiameterValid(params.pocket) &&
            isStepdownValid(params.feeds) &&
            isStartZValid(params.feeds) &&
            isPocketStepoverValid(params.pocket) &&
            isPocketHelixRadiusValid(params.pocket)
          : isToolDiameterValid(params.geometry) &&
            isStepdownValid(params.feeds) &&
            isStartZValid(params.feeds) &&
            isCircleHoleCountValid(params.geometry) &&
            isTabHeightValid(params.geometry) &&
            isTabWidthValid(params.geometry)
  const fitWarnings = machineFitWarnings(params, machine)
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
  const overlayParams = useMemo(
    () => deriveOverlayParams(overlaySlots, presetSlots),
    [overlaySlots, presetSlots],
  )

  const handleSaveMachine = (next: typeof machine) => {
    // Unlike travel X/Y/Z (which only affect the soft machineFitWarnings
    // check), dialect/header/footer feed directly into the emitted G-code
    // (program.ts) — a stale generatedGCode snapshot would silently miss
    // the change, the same staleness Copy/Download already guard against
    // for WizardParams edits (see updateParams above).
    const affectsGCode =
      next.dialect !== machine.dialect ||
      next.headerText !== machine.headerText ||
      next.footerText !== machine.footerText
    saveMachineSettings(next)
    setMachine(next)
    if (affectsGCode) setGeneratedGCode(null)
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
  // owns and syncs in-memory state to match, all four independent stores
  // at once (Appearance/Tool Diameters/Machine each their own key, plus
  // every preset slot including the hidden auto-save session slot "0").
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
    setGeneratedGCode(null)
    setEditModeEnabled(false)
    setEditingSlot(null)
    setOverlayEnabled(false)
    setOverlaySlots(new Set())
  }

  // Generate is also the auto-save trigger for the hidden slot 0 — see
  // CLAUDE.md, Etap 5, "localStorage": persisted on Generate rather than on
  // every keystroke, so a snapshot only survives once the user considered
  // the params worth turning into G-code.
  const handleGenerate = () => {
    const gcode =
      params.operation === 'outline'
        ? generateOutline(params, machine)
        : params.operation === 'surface'
          ? SURFACE_METHOD_META[params.surface.method].generate(params, machine)
          : params.operation === 'pocket'
            ? POCKET_METHOD_META[params.pocket.method].generate(params, machine)
            : METHOD_META[params.method].generate(params, machine)
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

  // BL-25: plain, ordinary load — the only thing a Preset Bar click does
  // outside edit mode. No arming path exists here at all; that only ever
  // happens through handlePresetSlotClick below, and only while
  // editModeEnabled. BL-39: doesn't touch activeStep — whichever wizard
  // step was open stays open across a preset switch.
  const handleLoadPreset = (id: PresetSlotId) => {
    const preset = presetSlots[id]
    if (!preset) return
    setParams(preset)
    setGeneratedGCode(null)
    setShowRestoredBanner(false)
    // Brief flash on the loaded preset's icon — confirms "this is what just
    // got loaded" (same 1.5s timing convention as "Copied!"/"✓ Saved").
    setJustLoadedSlot(id)
    setTimeout(() => setJustLoadedSlot((s) => (s === id ? null : s)), 1500)
  }

  // BL-25: Preset Bar click while edit mode is armed — radio-button style.
  // Clicking the already-armed slot deselects it (edit mode itself stays
  // on, "nothing selected" is a valid state). Clicking any other occupied
  // slot loads it AND arms it in the same action — the explicit Edit Mode
  // toggle is the deliberate gesture now, so load+arm together is safe and
  // predictable, unlike the old two-click model this replaces. BL-39:
  // doesn't touch activeStep either, same reasoning as handleLoadPreset.
  const handlePresetSlotClick = (id: PresetSlotId) => {
    const preset = presetSlots[id]
    if (!preset) return
    if (editingSlot === id) {
      setEditingSlot(null)
      return
    }
    setParams(preset)
    setGeneratedGCode(null)
    setShowRestoredBanner(false)
    setEditingSlot(id)
  }

  const handleToggleOverlaySlot = (id: PresetSlotId) => {
    setOverlaySlots((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Turning overlay off also clears the selection — re-enabling starts from
  // a clean slate rather than silently resuming a stale comparison set.
  // Turning overlay ON drops BL-25 edit mode first — overlay clicks mean
  // something else entirely, the two mechanisms never run at the same time.
  const handleToggleOverlay = () => {
    if (overlayEnabled) {
      setOverlaySlots(new Set())
    } else {
      setEditModeEnabled(false)
      setEditingSlot(null)
    }
    setOverlayEnabled((v) => !v)
  }

  // BL-25: symmetric to handleToggleOverlay — turning edit mode on drops
  // Overlay first, since both repurpose the same Preset Bar click.
  const handleToggleEditMode = () => {
    if (!editModeEnabled && overlayEnabled) {
      setOverlaySlots(new Set())
      setOverlayEnabled(false)
    }
    if (editModeEnabled) setEditingSlot(null)
    setEditModeEnabled((v) => !v)
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
    // BL-25: the deleted slot can no longer be a live-save target — clears
    // the selection but leaves editModeEnabled itself untouched (a slot-less
    // edit mode is a normal, valid state).
    if (editingSlot === id) setEditingSlot(null)
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

        <div
          className={[
            'relative flex items-center justify-self-center gap-2 rounded-lg border px-2 py-2 transition-colors',
            overlayEnabled || editModeEnabled ? 'border-border' : 'border-transparent',
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
          {editModeEnabled && (
            <span
              className={`absolute top-1/2 right-full mr-3 -translate-y-1/2 text-xs font-semibold whitespace-nowrap ${
                editingSlot ? (isGeometryValid ? 'text-status-success' : 'text-status-error') : 'text-muted'
              }`}
            >
              {editingSlot ? 'Auto-save Mode Enabled' : 'Edit Mode — select a preset'}
            </span>
          )}
          {PRESET_SLOT_IDS.map((id) => {
            const preset = presetSlots[id]
            const PresetIcon = preset
              ? preset.operation === 'outline'
                ? outlineShapeIcon(preset.outline.shape)
                : preset.operation === 'surface'
                  ? surfaceShapeIcon(preset.surface.shape)
                  : preset.operation === 'pocket'
                    ? pocketShapeIcon(preset.pocket.shape)
                    : positioningIcon(preset.geometry.positioning)
              : null
            const isOverlaySelected = overlayEnabled && overlaySlots.has(id)
            const isEditingSlot = editModeEnabled && editingSlot === id
            // BL-25: edit-mode selection uses the checkmark badge below
            // (same visual grammar as Overlay's multi-select), not this
            // flash — the two never coincide since editModeEnabled and a
            // plain load are mutually exclusive click paths.
            const isJustLoaded = !overlayEnabled && !editModeEnabled && justLoadedSlot === id
            const isSelected = isOverlaySelected || isEditingSlot
            const baseClassName = !preset
              ? 'flex h-11 w-11 cursor-default items-center justify-center rounded-md border border-empty-border text-xs font-semibold text-empty-fg'
              : isSelected
                ? 'flex h-11 w-11 items-center justify-center rounded-md border-2 border-accent text-accent-fg hover:bg-accent-bg shadow-[var(--glow-accent)]'
                : 'flex h-11 w-11 items-center justify-center rounded-md border border-accent-border text-accent-fg hover:bg-accent-bg shadow-[var(--glow-accent)]'
            return (
              <div key={id} className="group relative">
                <button
                  type="button"
                  onClick={() =>
                    overlayEnabled
                      ? handleToggleOverlaySlot(id)
                      : editModeEnabled
                        ? handlePresetSlotClick(id)
                        : handleLoadPreset(id)
                  }
                  disabled={!preset}
                  title={
                    !preset
                      ? `Preset [${id}] — empty`
                      : overlayEnabled
                        ? `${isOverlaySelected ? 'Remove' : 'Add'} preset [${id}] — ${presetLabel(preset)} ${isOverlaySelected ? 'from' : 'to'} overlay`
                        : editModeEnabled
                          ? isEditingSlot
                            ? `Editing preset [${id}] — ${presetLabel(preset)} (auto-saving, click to deselect)`
                            : `Select preset [${id}] — ${presetLabel(preset)} (loads it and starts auto-save)`
                          : `Load preset [${id}] — ${presetLabel(preset)}`
                  }
                  className={`${baseClassName} transition-shadow duration-700${isJustLoaded ? ' ring-2 ring-accent ring-offset-2 ring-offset-bg' : ''}`}
                >
                  {PresetIcon ? <PresetIcon className="h-7 w-7" /> : id}
                </button>
                {preset && isSelected && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1 -left-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-btn-fg"
                  >
                    <CheckIcon className="h-2.5 w-2.5" />
                  </span>
                )}
                {preset && !overlayEnabled && (
                  <button
                    type="button"
                    onClick={() => handleDeletePreset(id)}
                    aria-label={`Delete preset ${id}`}
                    title="Delete preset"
                    className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-status-delete-bg text-xs leading-none font-bold text-status-delete-fg opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                  >
                    ×
                  </button>
                )}
              </div>
            )
          })}
          <button
            type="button"
            onClick={handleToggleOverlay}
            aria-label="Toggle preset overlay"
            title={
              overlayEnabled
                ? 'Overlay preview: on — click preset slots to add/remove them from the 2D/3D overlay'
                : 'Overlay preview: off — click to compare saved presets against the current pattern'
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
          {/* BL-25: Edit Mode toggle — same visual pattern as the Overlay
              eye button, always clickable (never disabled), mutually
              exclusive with Overlay via handleToggleEditMode/
              handleToggleOverlay. */}
          <button
            type="button"
            onClick={handleToggleEditMode}
            aria-label="Toggle preset edit mode"
            title={
              editModeEnabled
                ? 'Edit mode: on — click a preset slot to load it and auto-save further changes back to it live'
                : 'Edit mode: off — click to select a preset and auto-save changes back to it'
            }
            className={[
              'flex h-11 w-11 items-center justify-center rounded-md border transition',
              editModeEnabled
                ? 'border-2 border-accent bg-accent-bg text-accent-fg shadow-[var(--glow-accent)]'
                : 'border-border text-value hover:bg-border/40',
            ].join(' ')}
          >
            <PencilIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center justify-self-end gap-2">
          <button
            type="button"
            onClick={() => setIsDark((d) => !d)}
            aria-label="Toggle dark mode"
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
                      params={params}
                      onChange={updateParams}
                      machine={machine}
                      toolDiameters={toolDiameters}
                    />
                  )}
                  {step.id === 3 && (
                    <Step3Feeds params={params} onChange={updateParams} machine={machine} />
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
                        canGenerate={isGeometryValid && !overlayEnabled}
                        overlayActive={overlayEnabled}
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
                        className="rounded-md bg-btn-bg px-4 py-2 text-sm font-medium text-btn-fg shadow-[var(--glow-btn)]"
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
                className="flex w-20 shrink-0 flex-col items-center gap-3 border-r border-border py-4 hover:bg-border/40"
              >
                {step.id === 1 && (
                  <div
                    className="flex flex-col items-center gap-1"
                    title={
                      params.operation === 'outline'
                        ? `Shape: ${outlineSummary(params.outline)}`
                        : params.operation === 'surface'
                          ? `Shape: ${surfaceSummary(params.surface)}`
                          : params.operation === 'pocket'
                            ? `Shape: ${pocketSummary(params.pocket)}`
                            : `Pattern: ${positioningSummary(params.geometry)}`
                    }
                  >
                    <span className="text-[10px] font-semibold uppercase text-muted">
                      {params.operation === 'outline'
                        ? 'Outline'
                        : params.operation === 'surface'
                          ? 'Surface'
                          : params.operation === 'pocket'
                            ? 'Pocket'
                            : 'Hole(s)'}
                    </span>
                    {(() => {
                      const Icon =
                        params.operation === 'outline'
                          ? outlineShapeIcon(params.outline.shape)
                          : params.operation === 'surface'
                            ? surfaceShapeIcon(params.surface.shape)
                            : params.operation === 'pocket'
                              ? pocketShapeIcon(params.pocket.shape)
                              : positioningIcon(params.geometry.positioning)
                      return <Icon className="h-8 w-8 text-accent" />
                    })()}
                    <div className="flex flex-col items-center">
                      {(params.operation === 'outline'
                        ? outlineShapeLines(params.outline)
                        : params.operation === 'surface'
                          ? surfaceShapeLines(params.surface)
                          : params.operation === 'pocket'
                            ? pocketShapeLines(params.pocket)
                            : positioningLines(params.geometry)
                      ).map((line, i) => (
                        <span
                          key={i}
                          className="text-center text-[9px] leading-tight font-semibold whitespace-nowrap text-stat-value"
                        >
                          {line}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {step.id === 2 && params.operation === 'outline' && (
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
                    <MiniStat
                      icon={(() => {
                        const ShapeIcon = outlineShapeIcon(params.outline.shape)
                        return <ShapeIcon className="h-8 w-8" />
                      })()}
                      label="SIZE"
                      value={outlineSizeValue(params.outline)}
                      unit="mm"
                      title={`${OUTLINE_SHAPE_META[params.outline.shape].title}: ${outlineSizeValue(params.outline)}mm — ${offsetModeLabel(params.outline.offsetMode)}`}
                    />
                    {offset && (
                      <MiniStat
                        icon={<OffsetIcon className="h-8 w-8" />}
                        label="OFFSET"
                        value={offset}
                        title={`Offset: ${offset}`}
                      />
                    )}
                    <MiniStat
                      icon={<BitIcon className="h-8 w-8" />}
                      label="BIT"
                      value={`${params.outline.toolDiameter}`}
                      unit="mm"
                      title={`Tool Diameter: ${params.outline.toolDiameter} mm`}
                    />
                    <MiniStat
                      icon={<DepthIcon className="h-8 w-8" />}
                      label="DEPTH"
                      value={`${params.outline.totalDepth}`}
                      unit="mm"
                      title={`Cutting Depth: ${params.outline.totalDepth} mm`}
                    />
                    {params.outline.tabsEnabled && (
                      <MiniStat
                        icon={<TabBridgeIcon className="h-8 w-8" />}
                        label="TABS"
                        value="YES"
                        title="Tabs: enabled"
                      />
                    )}
                  </div>
                )}

                {step.id === 2 && params.operation === 'surface' && (
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
                    <MiniStat
                      icon={(() => {
                        const ShapeIcon = surfaceShapeIcon(params.surface.shape)
                        return <ShapeIcon className="h-8 w-8" />
                      })()}
                      label="SIZE"
                      value={surfaceSizeValue(params.surface)}
                      unit="mm"
                      title={`${SURFACE_SHAPE_META[params.surface.shape].title}: ${surfaceSizeValue(params.surface)}mm`}
                    />
                    {offset && (
                      <MiniStat
                        icon={<OffsetIcon className="h-8 w-8" />}
                        label="OFFSET"
                        value={offset}
                        title={`Offset: ${offset}`}
                      />
                    )}
                    <MiniStat
                      icon={<BitIcon className="h-8 w-8" />}
                      label="BIT"
                      value={`${params.surface.toolDiameter}`}
                      unit="mm"
                      title={`Tool Diameter: ${params.surface.toolDiameter} mm`}
                    />
                    <MiniStat
                      icon={<DepthIcon className="h-8 w-8" />}
                      label="DEPTH"
                      value={`${params.surface.totalDepth}`}
                      unit="mm"
                      title={`Depth to Remove: ${params.surface.totalDepth} mm`}
                    />
                  </div>
                )}

                {step.id === 2 && params.operation === 'pocket' && (
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
                    <MiniStat
                      icon={(() => {
                        const ShapeIcon = pocketShapeIcon(params.pocket.shape)
                        return <ShapeIcon className="h-8 w-8" />
                      })()}
                      label="SIZE"
                      value={pocketSizeValue(params.pocket)}
                      unit="mm"
                      title={`${POCKET_SHAPE_META[params.pocket.shape].title}: ${pocketSizeValue(params.pocket)}mm`}
                    />
                    {offset && (
                      <MiniStat
                        icon={<OffsetIcon className="h-8 w-8" />}
                        label="OFFSET"
                        value={offset}
                        title={`Offset: ${offset}`}
                      />
                    )}
                    <MiniStat
                      icon={<BitIcon className="h-8 w-8" />}
                      label="BIT"
                      value={`${params.pocket.toolDiameter}`}
                      unit="mm"
                      title={`Tool Diameter: ${params.pocket.toolDiameter} mm`}
                    />
                    <MiniStat
                      icon={<DepthIcon className="h-8 w-8" />}
                      label="DEPTH"
                      value={`${params.pocket.totalDepth}`}
                      unit="mm"
                      title={`Total Depth: ${params.pocket.totalDepth} mm`}
                    />
                  </div>
                )}

                {step.id === 2 && params.operation === 'holes' && (
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
                    {offset && (
                      <MiniStat
                        icon={<OffsetIcon className="h-8 w-8" />}
                        label="OFFSET"
                        value={offset}
                        title={`Offset: ${offset}`}
                      />
                    )}
                    <MiniStat
                      icon={<BitIcon className="h-8 w-8" />}
                      label="BIT"
                      value={`${params.geometry.toolDiameter}`}
                      unit="mm"
                      title={`Tool Diameter: ${params.geometry.toolDiameter} mm`}
                    />
                    <MiniStat
                      icon={<DiameterIcon className="h-8 w-8" />}
                      label="HOLE"
                      value={`${params.geometry.holeDiameter}`}
                      unit="mm"
                      title={`Hole Diameter: ${params.geometry.holeDiameter} mm`}
                    />
                    <MiniStat
                      icon={<DepthIcon className="h-8 w-8" />}
                      label="DEPTH"
                      value={`${params.geometry.totalDepth}`}
                      unit="mm"
                      title={`Total Depth: ${params.geometry.totalDepth} mm`}
                    />
                    {params.geometry.tabsEnabled && (
                      <MiniStat
                        icon={<TabBridgeIcon className="h-8 w-8" />}
                        label="TABS"
                        value="YES"
                        title="Tabs: enabled"
                      />
                    )}
                  </div>
                )}

                {step.id === 3 && (
                  <div className="flex flex-col items-center gap-4">
                    <span className="text-[10px] font-semibold uppercase text-muted">
                      {step.title}
                    </span>
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
            <div className="flex gap-2">
              {(['2d', '3d', 'gcode'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
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
            {overlayEnabled && previewTab !== 'gcode' && (
              <div className="pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-btn-fg shadow-lg">
                Preview mode
              </div>
            )}

            {previewTab === '2d' && (
              <ToolpathCanvas
                params={params}
                isDark={isDark}
                paletteId={appearance.palette}
                themeId={appearance.theme}
                overlayParams={overlayParams}
                showActivePattern={!overlayEnabled}
                stockVisible={stockVisible}
                toolpathVisible={toolpathVisible}
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
                  params={params}
                  isDark={isDark}
                  paletteId={appearance.palette}
                  themeId={appearance.theme}
                  overlayParams={overlayParams}
                  showActivePattern={!overlayEnabled}
                  gridLabelsEnabled={appearance.grid3DLabelsEnabled}
                  gridLabelSize={appearance.grid3DLabelSize}
                  stockVisible={stockVisible}
                  toolpathVisible={toolpathVisible}
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
                  {generatedGCode.join('\n')}
                </pre>
              ) : (
                <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted">
                  Go to Step 4 and click "Generate" to preview the G-code.
                </div>
              ))}
          </div>
        </div>
      </div>

      {isSettingsOpen && (
        <SettingsModal
          machine={machine}
          onSave={handleSaveMachine}
          appearance={appearance}
          onSaveAppearance={handleSaveAppearance}
          toolDiameters={toolDiameters}
          onSaveToolDiameters={handleSaveToolDiameters}
          onResetAll={handleResetAllSettings}
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
