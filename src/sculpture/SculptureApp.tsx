import { type ReactNode, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { OpenFileIcon, SaveFileIcon } from '../components/icons'
import { ProjectNameModal } from '../components/ProjectNameModal'
import { SettingsModal } from '../components/SettingsModal'
import { SimpleModeContext } from '../components/uiModeContext'
import { useCoarsePointer, useLayoutMode } from '../components/useViewport'
import { loadAppearanceSettings, saveAppearanceSettings } from '../lib/appearanceStorage'
import { clearHints } from '../lib/hintStorage'
import { loadMachineSettings, saveMachineSettings } from '../lib/machineStorage'
import { DEFAULT_FEED_CALC_SETTINGS, saveFeedCalcSettings } from '../lib/feedCalcStorage'
import { NO_PROJECT, saveProjectInfo } from '../lib/projectStorage'
import { clearAllSlots } from '../lib/storage'
import { loadToolDiameterOptions, saveToolDiameterOptions } from '../lib/toolDiameterStorage'
import { DEFAULT_APPEARANCE_SETTINGS, type AppearanceSettings } from '../types/appearance'
import { DEFAULT_MACHINE_SETTINGS, type MachineSettings } from '../types/machine'
import { DEFAULT_TOOL_DIAMETER_OPTIONS, type ToolDiameterOption } from '../types/toolDiameters'
import { type FileEntry, type FileKind, blankOnSheet, gcodeFiles, holePitch, isPlaced, layerBlank, layerPlacement, mountingCard } from './gcode'
import { HOLE_STATE_LABELS, holeStateColor } from './holeColors'
import { LayerView } from './LayerView'
import { type Hole, type HoleKind, type HoleState, addHole, canMountRotated, holeSummary, screwClearance } from './holes'
import demoBustUrl from './assets/demo-bust.stl?url'
import { parseStl, type UpAxis, type ViewUp } from './mesh'
import { type ContourPlane, type HoleMethod, type IslandMode, type LayerPlacement, type SculptureParams, layerSignature, minHubDiameter, withSettings } from './params'
import type { SpacerShape } from './spacers'
import { type StackMode, StackScene } from './StackScene'
import { ToolpathScene } from './ToolpathScene'
import { SCULPTURE_PROJECT_ERRORS, buildSculptureProject, parseSculptureProject, sculptureFilename } from './projectFile'
import { loadParams, useSculpture } from './useSculpture'
import { buildZip, type ZipEntry } from './zip'

const fieldClass =
  'w-full rounded border border-field-border bg-field-bg px-2 py-1 text-sm text-fg outline-none focus:border-accent'
const buttonClass =
  'rounded border border-border px-2 py-1 text-xs text-fg hover:border-accent disabled:cursor-not-allowed disabled:opacity-40'

function NumberField({ label, value, onChange, unit, ariaLabel }: { label: string; value: number; onChange: (v: number) => void; unit?: string; ariaLabel?: string }) {
  // The text is kept apart from the number so "1." or an empty field can pass
  // through while typing; only a real number reaches the parameters.
  const [draft, setDraft] = useState<string | null>(null)
  const valid = draft === null || Number.isFinite(Number(draft.replace(',', '.'))) && draft.trim() !== ''
  return (
    <label className="block text-xs text-muted">
      {label}
      {unit ? ` (${unit})` : ''}
      <input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        className={`${fieldClass} ${label ? 'mt-0.5' : ''} ${valid ? '' : 'border-status-error'}`}
        value={draft ?? String(value)}
        onChange={(e) => {
          const text = e.target.value
          setDraft(text)
          const parsed = Number(text.replace(',', '.'))
          if (text.trim() !== '' && Number.isFinite(parsed)) onChange(parsed)
        }}
        onBlur={() => setDraft(null)}
      />
    </label>
  )
}

function SelectField<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <label className="block text-xs text-muted">
      {label}
      <select className={`${fieldClass} mt-0.5`} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  )
}

// The tool comes from the Tool Diameters list in Settings; a value saved before
// it left the list stays selectable.
function ToolDiameterField({ value, options, onChange }: { value: number; options: ToolDiameterOption[]; onChange: (v: number) => void }) {
  const list = options.some((o) => o.value === value) ? options : [...options, { value, label: `${value} mm` }]
  return (
    <label className="block text-xs text-muted">
      Tool diameter
      <select className={`${fieldClass} mt-0.5`} value={String(value)} onChange={(e) => onChange(Number(e.target.value))}>
        {list.map((o) => (
          <option key={o.value} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-border p-3">
      <h2 className="mb-2 text-sm font-semibold text-fg">{title}</h2>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </section>
  )
}

function Toggle({ label, pressed, onClick }: { label: string; pressed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`${buttonClass} ${pressed ? 'border-accent bg-tab-active-bg text-tab-active-fg' : ''}`}
    >
      {label}
    </button>
  )
}

function downloadBlob(filename: string, data: BlobPart, type = 'application/zip') {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

// Settings are shared with OnlyPaths (same origin, same storage keys): a change
// saved in the other tab reaches this one through the storage event.
const SHARED_KEYS = ['simplecam.machine', 'simplecam.appearance', 'simplecam.toolDiameters']

const HOLE_STATES: HoleState[] = ['mount', 'empty', 'waste', 'conflict']

// As in OnlyPaths' G-Code tab; the full program is in the ZIP.
const GCODE_PREVIEW_LINES = 5000

type PreviewView = 'stack' | 'toolpath' | 'gcode'

const PLATE_TURNS = [0, 45, 90, 135, 180, 225, 270, 315]

const FILE_KIND_LABELS: Record<FileKind, string> = {
  fixture: 'Fixture',
  holes: 'Holes',
  layer: 'Layer',
  layerHoles: 'Layer holes',
  spacerHoles: 'Hub spacer holes',
  spacer: 'Hub spacer',
}

// Four steps as in OnlyPaths: the open one beside the other three collapsed
// to a column with their key values; any can be opened, in any order.
const STEPS = [
  { id: 1, title: 'Model' },
  { id: 2, title: 'Layers' },
  { id: 3, title: 'Tool' },
  { id: 4, title: 'Holes' },
] as const

export function SculptureApp() {
  const [stored, setParams] = useState<SculptureParams>(loadParams)
  const [raw, setRaw] = useState<Float32Array | null>(null)
  const [modelName, setModelName] = useState('')
  // The project's name since it was last saved or loaded; empty = Untitled.
  const [projectName, setProjectName] = useState('')
  const [saveOpen, setSaveOpen] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState(1)
  const [mode, setMode] = useState<StackMode>('stack')
  const [showModel, setShowModel] = useState(false)
  const [showRods, setShowRods] = useState(true)
  // The gluing jig (hub, its bridges and spacers) or the sculpture alone.
  const [showHub, setShowHub] = useState(true)
  const [isDark, setIsDark] = useState(true)
  const [addMode, setAddMode] = useState(false)
  const [superimposed, setSuperimposed] = useState(false)
  const [view, setView] = useState<PreviewView>('stack')
  // The file the Toolpath and G-code views show; layer files follow the slider.
  const [fileKind, setFileKind] = useState<FileKind>('layer')
  // The file whose G-code was just copied, for the button's confirmation.
  const [copied, setCopied] = useState<string | null>(null)
  const [activeStep, setActiveStep] = useState<number>(1)
  const [machine, setMachine] = useState<MachineSettings>(loadMachineSettings)
  const [appearance, setAppearance] = useState<AppearanceSettings>(loadAppearanceSettings)
  const [toolDiameters, setToolDiameters] = useState<ToolDiameterOption[]>(loadToolDiameterOptions)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const layout = useLayoutMode()
  const touch = useCoarsePointer()
  const params = useMemo(() => withSettings(stored, machine), [stored, machine])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && !SHARED_KEYS.includes(e.key)) return
      setMachine(loadMachineSettings())
      setAppearance(loadAppearanceSettings())
      setToolDiameters(loadToolDiameterOptions())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const saveMachine = (next: MachineSettings) => {
    saveMachineSettings(next)
    setMachine(next)
  }
  const saveAppearance = (next: AppearanceSettings) => {
    saveAppearanceSettings(next)
    setAppearance(next)
  }
  const saveToolDiameters = (next: ToolDiameterOption[]) => {
    saveToolDiameterOptions(next)
    setToolDiameters(next)
  }
  // The same reset as in OnlyPaths: everything both tools keep, presets
  // included. The sculpture's own parameters stay.
  const resetAll = () => {
    clearAllSlots()
    saveProjectInfo(NO_PROJECT)
    clearHints()
    saveFeedCalcSettings(DEFAULT_FEED_CALC_SETTINGS)
    saveAppearance(DEFAULT_APPEARANCE_SETTINGS)
    saveToolDiameters(DEFAULT_TOOL_DIAMETER_OPTIONS)
    saveMachine(DEFAULT_MACHINE_SETTINGS)
  }

  // Layout effects: the views read theme tokens in their own effects, and a
  // child's passive effect would otherwise run before these.
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  useLayoutEffect(() => {
    const { theme } = appearance
    if (theme === 'sloppy-indigo') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', theme)
  }, [appearance])

  const set = <K extends keyof SculptureParams>(key: K, value: SculptureParams[K]) => setParams((p) => ({ ...p, [key]: value }))
  const state = useSculpture(raw, params)
  const { mesh, layers, holes, analyses, errors } = state

  const current = Math.min(selected, Math.max(layers.length, 1))
  const layer = layers[current - 1] ?? null
  const analysis = analyses[current - 1] ?? null

  const openFile = async (file: File) => {
    try {
      setRaw(parseStl(await file.arrayBuffer()))
      setModelName(file.name)
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not read this file.')
    }
  }

  // The demo model ships as its own asset, fetched only when asked for.
  const openDemo = async () => {
    try {
      const response = await fetch(demoBustUrl)
      if (!response.ok) throw new Error('Could not load the demo bust.')
      setRaw(parseStl(await response.arrayBuffer()))
      setModelName('Demo bust')
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load the demo bust.')
    }
  }

  // The model, every step's parameters and the holes as they stand, in one file.
  const saveProject = (name: string) => {
    if (!raw) return
    const text = buildSculptureProject({ name, modelName, params: stored, holes, raw }, __APP_VERSION__)
    downloadBlob(sculptureFilename(name), text, 'application/json')
    setProjectName(name)
    setSaveOpen(false)
  }

  const loadProject = async (file: File) => {
    const result = parseSculptureProject(await file.text())
    if (!result.ok) {
      window.alert(SCULPTURE_PROJECT_ERRORS[result.reason])
      return
    }
    if (raw && !window.confirm('Replace the current model, its settings and holes with this project?')) return
    const { project } = result
    setRaw(project.raw)
    setModelName(project.modelName)
    setLoadError(null)
    setParams(project.params)
    state.restoreHoles(project.holes, withSettings(project.params, machine))
    setProjectName(project.name || file.name.replace(/\.json$/i, ''))
    setSelected(1)
  }

  const warnings = useMemo(() => {
    const list: string[] = []
    if (layers.length === 0) return list
    const rods = holes.filter((h) => h.kind === 'rod')
    if (params.hub && state.thinHubLayers.length > 0) {
      const shown = state.thinHubLayers.slice(0, 8).join(', ')
      const more = state.thinHubLayers.length > 8 ? ` and ${state.thinHubLayers.length - 8} more` : ''
      list.push(
        `The hub is narrower than ${params.holeDiameter + 2 * params.minWall} mm in layer(s) ${shown}${more}: move it or change its diameter.`,
      )
    }
    if (params.rodCount > 0 && !state.hasCommonArea) list.push('No spot is shared by every layer: no rods fit. Try a smaller hole or screw head.')
    else if (rods.length < params.rodCount) list.push(`Only ${rods.length} of ${params.rodCount} rods fit in the area shared by every layer.`)
    if (canMountRotated(rods, params.holeDiameter)) list.push('This rod pattern fits a plate rotated by half a turn. Check its orientation by eye.')
    const open = layers.filter((l) => l.openChains > 0).length
    if (open > 0) list.push(`${open} layer(s) cross holes in the mesh: parts of them may be missing. Repair the model in Blender.`)
    const conflict = analyses.filter((a) => a.conflictIds.length > 0).length
    if (conflict > 0) list.push(`${conflict} layer(s) get their own holes file: a master hole would bite into their edge.`)
    const moved = layers.filter((l) => isPlaced(layerPlacement(params, l.number))).map((l) => l.number)
    if (moved.length > 0) {
      const more = moved.length > 8 ? ` and ${moved.length - 8} more` : ''
      list.push(
        `Layer(s) ${moved.slice(0, 8).join(', ')}${more} are turned or shifted on the machine: their holes miss the fixture inserts, so hold those plates by their edges.`,
      )
    }
    const unheld = analyses.filter((a) => a.unheldPieces.length > 0).length
    if (unheld > 0) list.push(`${unheld} layer(s) have pieces held by tabs only.`)
    const noTabs = params.tabCount === 0 && unheld > 0
    if (noTabs) list.push('With no tabs those pieces will come loose at the end of the cut.')
    const reach = Math.max(...layers.map((l) => Math.max(Math.abs(l.bounds.minX), Math.abs(l.bounds.maxX), Math.abs(l.bounds.minY), Math.abs(l.bounds.maxY))))
    const limit = Math.min(machine.travelX, machine.travelY) / 2
    if (reach + params.toolDiameter > limit) {
      list.push(`The section reaches ${Math.round(reach)} mm from the center; the machine has ${Math.round(limit)} mm (Settings → Machine).`)
    }
    return list
  }, [layers, holes, analyses, state.hasCommonArea, state.thinHubLayers, params, machine])

  // Every file of the ZIP, built only when shown or generated.
  const files = useMemo(
    () => (errors.length === 0 && layers.length > 0 ? gcodeFiles(layers, analyses, holes, params, machine) : []),
    [errors.length, layers, analyses, holes, params, machine],
  )
  const fileChoices = files.filter((f) => f.layer === undefined || f.layer === current)
  const shownFile: FileEntry | null = fileChoices.find((f) => f.kind === fileKind) ?? fileChoices.find((f) => f.kind === 'layer') ?? null
  const builtFile = useMemo(() => (view !== 'stack' && shownFile ? shownFile.build() : null), [view, shownFile])
  // The master holes are drilled into every layer's plate: the current one is shown.
  const shownPlate =
    shownFile?.kind === 'holes' ? (fileChoices.find((f) => f.kind === 'layer')?.plate ?? null) : (shownFile?.plate ?? null)
  const gcodeLines = useMemo(() => (view === 'gcode' && builtFile ? builtFile.content.trimEnd().split('\n') : null), [view, builtFile])

  // The whole program, not only the lines the G-code view shows.
  const copyGcode = async () => {
    if (!shownFile || !builtFile) return
    try {
      await navigator.clipboard.writeText(builtFile.content)
      setCopied(shownFile.name)
      setTimeout(() => setCopied((name) => (name === shownFile.name ? null : name)), 1500)
    } catch {
      window.alert('Could not copy: the browser did not allow access to the clipboard.')
    }
  }

  const generate = () => {
    const entries: ZipEntry[] = [
      { name: 'mounting-card.txt', content: mountingCard(layers, analyses, holes, params) },
      ...files.map((f) => ({ name: f.name, content: f.build().content })),
    ]
    const date = new Date().toISOString().slice(0, 10)
    downloadBlob(`sculpture-${date}.zip`, buildZip(entries))
  }

  const pitchText = (diameter: number) => {
    const pitch = holePitch(diameter, params)
    return pitch > 0 ? `${Math.round(pitch * 100) / 100} mm` : 'pecked'
  }

  // Turning the plates turns the holes and the hub with them, about X0 Y0
  // (the model turns about its own center, which sits there).
  const turnPlates = (degrees: number) => {
    const delta = ((degrees - params.plateTurn) * Math.PI) / 180
    const cos = Math.cos(delta)
    const sin = Math.sin(delta)
    const round = (v: number) => Math.round(v * 10) / 10
    const turn = (x: number, y: number) => ({ x: round(x * cos - y * sin), y: round(x * sin + y * cos) })
    const hub = turn(stored.hubX, stored.hubY)
    const next = { ...stored, plateTurn: degrees, hubX: hub.x, hubY: hub.y }
    setParams(next)
    const turned = holes.map((h) => ({ ...h, ...turn(h.x, h.y) }))
    // Held as an edit made on the turned stack, so it is not flagged as stale.
    state.setHoles(turned, layerSignature(withSettings(next, machine)))
  }

  // The current layer's own placement on the machine; all zero removes it.
  const placement = layer ? layerPlacement(params, layer.number) : { turn: 0, x: 0, y: 0 }
  const placed = isPlaced(placement)
  const placedCount = Object.keys(params.layerPlacements).length
  const setPlacement = (patch: Partial<LayerPlacement> | null) => {
    if (!layer) return
    const key = String(layer.number)
    setParams((p) => {
      const placements = { ...p.layerPlacements }
      const next = { ...(placements[key] ?? { turn: 0, x: 0, y: 0 }), ...patch }
      if (patch !== null && isPlaced(next)) placements[key] = next
      else delete placements[key]
      return { ...p, layerPlacements: placements }
    })
  }

  const editHole = (id: number, patch: Partial<Hole>) => state.setHoles(holes.map((h) => (h.id === id ? { ...h, ...patch } : h)))
  const removeHole = (id: number) => state.setHoles(holes.filter((h) => h.id !== id))
  const canGenerate = errors.length === 0 && layers.length > 0 && !state.computing

  // The plate each layer needs (path, tool and a margin), and the sheet that
  // covers every one of them; checked against the machine both ways round.
  const plates = useMemo(() => {
    if (layers.length === 0) return null
    let largest = { number: 0, width: 0, height: 0 }
    let width = 0
    let height = 0
    // Layers whose plate does not lie entirely on the given sheet.
    const offSheet: number[] = []
    for (const l of layers) {
      const blank = layerBlank(l, params)
      if (blank.width * blank.height > largest.width * largest.height) largest = { number: l.number, width: blank.width, height: blank.height }
      width = Math.max(width, blank.width)
      height = Math.max(height, blank.height)
      if (!blankOnSheet(blank, params)) offSheet.push(l.number)
    }
    return {
      largest,
      width,
      height,
      fits: width <= machine.travelX && height <= machine.travelY,
      fitsTurned: height <= machine.travelX && width <= machine.travelY,
      offSheet,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, params.toolDiameter, params.tolerance, params.sheetX, params.sheetY, params.sheetOffsetX, params.sheetOffsetY, machine.travelX, machine.travelY])

  const PLANE_SHORT: Record<ContourPlane, string> = { bottom: 'Bottom', middle: 'Middle', top: 'Top' }
  const ISLAND_SHORT: Record<IslandMode, string> = { screw: 'Screw', bridge: 'Bridge', none: 'Tabs' }
  const stepStats: Record<number, [string, string][]> = {
    1: [
      ['Height', `${params.height}`],
      ['Plate', `${params.thickness}`],
      ['Gap', `${params.gap}`],
      ['Layers', `${layers.length}`],
      ['Sheet', plates ? `${plates.width}×${plates.height}` : '–'],
      ['Turn', `${params.plateTurn}°`],
    ],
    2: [
      ['Contour', PLANE_SHORT[params.plane]],
      ['Islands', ISLAND_SHORT[params.islandMode]],
      ['Spacers', params.spacers ? 'On' : 'Off'],
    ],
    3: [
      ['Tool', `Ø${params.toolDiameter}`],
      ['Feed', `${params.feed}`],
      ['Tabs', `${params.tabCount}`],
      ['Holes', params.holeMethod === 'helix' ? `${params.rampAngle}°` : 'Std'],
    ],
    4: [
      ['Holes', `${holes.length}`],
      ['Rods', `${holes.filter((h) => h.kind === 'rod').length}`],
      ['Own files', `${analyses.filter((a) => a.conflictIds.length > 0).length}`],
      ['Hub', params.hub ? `Ø${params.hubDiameter}` : 'Off'],
    ],
  }

  // Off only hides the hub's own parts; without a hub there is nothing to hide
  // (island bridges belong to the cut and are always shown).
  const hubShown = !params.hub || showHub
  const totalHeight = layers.length > 0 ? layers[layers.length - 1].zBottom + params.thickness : 0
  const blank = layer ? layerBlank(layer, params) : null

  return (
    <SimpleModeContext.Provider value={appearance.uiMode === 'simple'}>
    <div className="flex h-screen flex-col bg-bg text-fg">
      <header className="flex items-center gap-3 border-b border-border px-4 py-2">
        <h1 className="text-base font-semibold">SculptureTool</h1>
        <span className="text-xs text-muted">prototype</span>
        <div className="ml-4 flex items-center gap-1">
          <span
            title={projectName || 'Untitled'}
            className="max-w-40 truncate rounded border border-edit bg-edit-bg px-2 py-1 text-xs text-edit-fg"
          >
            {projectName || 'Untitled'}
          </span>
          <label className={`${buttonClass} flex cursor-pointer items-center`} title="Load project">
            <OpenFileIcon className="h-4 w-4" />
            <span className="sr-only">Load project</span>
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void loadProject(file)
                e.target.value = ''
              }}
            />
          </label>
          <button type="button" className={`${buttonClass} flex items-center`} title="Save project" disabled={!raw} onClick={() => setSaveOpen(true)}>
            <SaveFileIcon className="h-4 w-4" />
            <span className="sr-only">Save project</span>
          </button>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted">
            Machine {machine.travelX} × {machine.travelY}, {machine.dialect}
          </span>
          <button type="button" aria-pressed={isDark} className={buttonClass} onClick={() => setIsDark((d) => !d)}>
            {isDark ? 'Dark' : 'Light'}
          </button>
          <button type="button" className={buttonClass} onClick={() => setSettingsOpen(true)}>
            Settings
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex shrink-0 border-r border-border">
          {STEPS.map((step) =>
            step.id === activeStep ? (
              <div key={step.id} className="w-80 shrink-0 overflow-y-auto border-r border-border">
                <h2 className="px-3 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">
                  Step {step.id} · {step.title}
                </h2>
                {step.id === 1 && (
                  <>
                    <section className="border-b border-border p-3">
                      <h2 className="mb-2 text-sm font-semibold">Model</h2>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className={`${buttonClass} cursor-pointer`}>
                          Load STL
                          <input
                            type="file"
                            accept=".stl"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) void openFile(file)
                              e.target.value = ''
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          className={buttonClass}
                          onClick={() => void openDemo()}
                        >
                          Demo bust
                        </button>
                      </div>
                      <p className="mt-2 break-all text-xs text-muted">{modelName || 'No model loaded.'}</p>
                      {mesh && (
                        <p className="text-xs text-muted">
                          {Math.round(mesh.width)} × {Math.round(mesh.depth)} × {Math.round(mesh.height)} mm, {(mesh.positions.length / 9).toLocaleString('en')} triangles
                        </p>
                      )}
                      {loadError && <p className="mt-1 text-xs text-status-error">{loadError}</p>}
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <SelectField<UpAxis> label="Up axis" value={params.upAxis} options={[['z', 'Z'], ['y', 'Y'], ['x', 'X']]} onChange={(v) => set('upAxis', v)} />
                        <NumberField label="Height" unit="mm" value={params.height} onChange={(v) => set('height', v)} />
                        <label className="col-span-2 flex items-center gap-2 text-xs text-muted">
                          <input type="checkbox" checked={params.flipUp} onChange={(e) => set('flipUp', e.target.checked)} />
                          Upside down
                        </label>
                        <SelectField<ViewUp>
                          label="View up"
                          value={params.viewUp}
                          options={[['same', 'Same as Up axis'], ['z', 'Z'], ['y', 'Y'], ['x', 'X']]}
                          onChange={(v) => set('viewUp', v)}
                        />
                        <label className={`flex items-end gap-2 pb-1 text-xs ${params.viewUp === 'same' ? 'text-muted' : 'text-fg'}`}>
                          <input
                            type="checkbox"
                            checked={params.viewUp !== 'same' && params.viewFlip}
                            disabled={params.viewUp === 'same'}
                            onChange={(e) => set('viewFlip', e.target.checked)}
                          />
                          View upside down
                        </label>
                        {params.viewUp !== 'same' && mesh && (
                          <p className="col-span-2 text-xs text-muted">
                            Height {params.height} mm along the view up axis → stack {Math.round(mesh.height)} mm, {layers.length} layers. View up turns only the
                            3D preview.
                          </p>
                        )}
                        <NumberField label="Plate thickness" unit="mm" value={params.thickness} onChange={(v) => set('thickness', v)} />
                        <NumberField label="Gap between plates" unit="mm" value={params.gap} onChange={(v) => set('gap', v)} />
                        <SelectField<string>
                          label="Turn every plate (CCW)"
                          value={String(params.plateTurn)}
                          options={PLATE_TURNS.map((d) => [String(d), `${d}°`])}
                          onChange={(v) => turnPlates(Number(v))}
                        />
                        <span />
                        <NumberField label="Sheet X" unit="mm, 0 = none" value={params.sheetX} onChange={(v) => set('sheetX', v)} />
                        <NumberField label="Sheet Y" unit="mm, 0 = none" value={params.sheetY} onChange={(v) => set('sheetY', v)} />
                        {params.sheetX > 0 && params.sheetY > 0 && (
                          <>
                            <NumberField label="Sheet offset X" unit="mm" value={params.sheetOffsetX} onChange={(v) => set('sheetOffsetX', v)} />
                            <NumberField label="Sheet offset Y" unit="mm" value={params.sheetOffsetY} onChange={(v) => set('sheetOffsetY', v)} />
                            <p className="col-span-2 text-xs text-muted">The sheet's center sits at X0 Y0 (the fixture center) plus the offset.</p>
                          </>
                        )}
                        {plates && (
                          <div className="col-span-2 space-y-0.5 text-xs">
                            <p className="text-muted">
                              Largest plate: {plates.largest.width} × {plates.largest.height} mm (layer {plates.largest.number}). Every layer fits a{' '}
                              {plates.width} × {plates.height} mm sheet (X × Y).
                            </p>
                            {!plates.fits && (
                              <p className="text-edit-fg">
                                Larger than the machine ({machine.travelX} × {machine.travelY} mm).
                                {plates.fitsTurned ? ' Fits with the plates turned another 90°.' : ' Try another turn or a smaller height.'}
                              </p>
                            )}
                            {plates.offSheet.length > 0 && (
                              <p className="text-edit-fg">
                                {plates.offSheet.length} layer(s) reach past the {params.sheetX} × {params.sheetY} mm sheet: {plates.offSheet.slice(0, 8).join(', ')}
                                {plates.offSheet.length > 8 ? ` and ${plates.offSheet.length - 8} more` : ''}.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </section>
                  </>
                )}
                {step.id === 2 && (
                  <>
                    <Section title="Contour">
                      <SelectField<ContourPlane>
                        label="Contour taken at"
                        value={params.plane}
                        options={[['bottom', 'Bottom of plate'], ['middle', 'Middle of plate'], ['top', 'Top of plate']]}
                        onChange={(v) => set('plane', v)}
                      />
                      <NumberField label="Contour tolerance" unit="mm" value={params.tolerance} onChange={(v) => set('tolerance', v)} />
                    </Section>

                    <Section title="Islands">
                      <SelectField<IslandMode>
                        label="Separate pieces"
                        value={params.islandMode}
                        options={[['screw', 'Own screw'], ['bridge', 'Bridge to main'], ['none', 'Leave on tabs']]}
                        onChange={(v) => set('islandMode', v)}
                      />
                      <NumberField label="Bridge width" unit="mm" value={params.bridgeWidth} onChange={(v) => set('bridgeWidth', v)} />
                      <NumberField label="Drop pieces under" unit="mm²" value={params.minIslandArea} onChange={(v) => set('minIslandArea', v)} />
                      <NumberField label="Close gaps under" unit="mm" value={params.closeGap} onChange={(v) => set('closeGap', v)} />
                    </Section>

                    <Section title="Spacers (preview only)">
                      <label className="col-span-2 flex items-center gap-2 text-xs text-muted">
                        <input type="checkbox" checked={params.spacers} onChange={(e) => set('spacers', e.target.checked)} />
                        Spacers between plates
                      </label>
                      <SelectField<SpacerShape>
                        label="Shape"
                        value={params.spacerShape}
                        options={[['disc', 'Disc'], ['inset', 'Shared area, inset']]}
                        onChange={(v) => set('spacerShape', v)}
                      />
                      <NumberField
                        label={params.spacerShape === 'disc' ? 'Disc diameter' : 'Inset from edge'}
                        unit="mm"
                        value={params.spacerSize}
                        onChange={(v) => set('spacerSize', v)}
                      />
                      {params.spacers && (
                        <p className="col-span-2 text-xs text-muted">
                          {params.gap > 0
                            ? `${state.spacers.length} spacers, ${params.gap} mm thick. Not in the ZIP yet.`
                            : 'Needs a gap between plates.'}
                        </p>
                      )}
                    </Section>
                  </>
                )}
                {step.id === 3 && (
                  <>
                    <Section title="Tool and cutting">
                      <ToolDiameterField value={params.toolDiameter} options={toolDiameters} onChange={(v) => set('toolDiameter', v)} />
                      <NumberField label="Stepdown" unit="mm" value={params.stepdown} onChange={(v) => set('stepdown', v)} />
                      <NumberField label="Feed" unit="mm/min" value={params.feed} onChange={(v) => set('feed', v)} />
                      <NumberField label="Plunge rate" unit="mm/min" value={params.plungeRate} onChange={(v) => set('plungeRate', v)} />
                      <NumberField label="Cut below plate" unit="mm" value={params.overshoot} onChange={(v) => set('overshoot', v)} />
                      <NumberField label="Safe Z above plate" unit="mm" value={params.safeAbove} onChange={(v) => set('safeAbove', v)} />
                      <label className="col-span-2 flex items-center gap-2 text-xs text-fg">
                        <input type="checkbox" checked={params.tabs} onChange={(e) => set('tabs', e.target.checked)} />
                        Tabs: {machine.defaultTabCount} × {machine.defaultTabWidth} mm, {machine.defaultTabHeight} mm high
                      </label>
                      <p className="col-span-2 text-xs text-muted">Tab count and size come from Settings → Tabs, shared with OnlyPaths.</p>
                    </Section>
                    <Section title="Holes">
                      <SelectField<HoleMethod>
                        label="Hole method"
                        value={params.holeMethod}
                        options={[['helix', 'Helix'], ['standard', 'Standard']]}
                        onChange={(v) => set('holeMethod', v)}
                      />
                      {params.holeMethod === 'helix' ? (
                        <NumberField label="Ramp angle" unit="°" value={params.rampAngle} onChange={(v) => set('rampAngle', v)} />
                      ) : (
                        <span />
                      )}
                      <p className="col-span-2 text-xs text-muted">
                        {params.holeMethod === 'helix' ? (
                          <>
                            One helix down, each turn at most Stepdown deep and no steeper than the ramp angle:{' '}
                            {pitchText(params.holeDiameter)} per turn in the plate holes, {pitchText(params.insertDiameter)} in the fixture inserts.
                          </>
                        ) : (
                          'A plunge and a full circle every Stepdown.'
                        )}{' '}
                        For plate holes, fixture inserts and holes cut with the contour; a hole the tool's own size is pecked straight down.
                      </p>
                    </Section>
                  </>
                )}
                {step.id === 4 && (
                  <>
                    <Section title="Holes and fixture">
                      <NumberField label="Rods" value={params.rodCount} onChange={(v) => set('rodCount', v)} />
                      <NumberField label="Hole diameter" unit="mm" value={params.holeDiameter} onChange={(v) => set('holeDiameter', v)} />
                      <NumberField label="Minimum wall" unit="mm" value={params.minWall} onChange={(v) => set('minWall', v)} />
                      <NumberField label="Screw head diameter" unit="mm" value={params.headDiameter} onChange={(v) => set('headDiameter', v)} />
                      <NumberField label="Screw head height" unit="mm" value={params.headHeight} onChange={(v) => set('headHeight', v)} />
                      <NumberField label="Insert diameter" unit="mm" value={params.insertDiameter} onChange={(v) => set('insertDiameter', v)} />
                      <NumberField label="Insert hole depth" unit="mm" value={params.insertDepth} onChange={(v) => set('insertDepth', v)} />
                      <NumberField label="Insert below surface" unit="mm" value={params.insertRecess} onChange={(v) => set('insertRecess', v)} />
                    </Section>

                    <Section title="Hub">
                      <label className="col-span-2 flex items-center gap-2 text-xs text-fg">
                        <input type="checkbox" checked={params.hub} onChange={(e) => set('hub', e.target.checked)} />
                        Mounting hub in every layer
                      </label>
                      {params.hub && (
                        <>
                          <NumberField label="Diameter" unit="mm" value={params.hubDiameter} onChange={(v) => set('hubDiameter', v)} />
                          <NumberField label="Slot" unit="mm" value={params.hubSlot} onChange={(v) => set('hubSlot', v)} />
                          <NumberField label="Center X" unit="mm" value={params.hubX} onChange={(v) => set('hubX', v)} />
                          <NumberField label="Center Y" unit="mm" value={params.hubY} onChange={(v) => set('hubY', v)} />
                          <SelectField
                            label="Bridges per piece"
                            value={String(params.hubBridges) as '1' | '2'}
                            options={[
                              ['1', '1'],
                              ['2', '2'],
                            ]}
                            onChange={(v) => set('hubBridges', Number(v))}
                          />
                          <NumberField label="Bridge width" unit="mm" value={params.hubBridgeWidth} onChange={(v) => set('hubBridgeWidth', v)} />
                          <p className="col-span-2 text-xs text-muted">
                            {params.rodCount} rods need a hub of at least about {minHubDiameter(params, screwClearance(params))} mm. Hub and
                            bridges stay on until the stack is glued.
                            {params.gap > 0 ? ` ${Math.max(layers.length - 1, 0)} hub spacers, ${params.gap} mm thick.` : ''}
                          </p>
                        </>
                      )}
                    </Section>

                    <section className="border-b border-border p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <h2 className="text-sm font-semibold">Master holes</h2>
                        <div className="flex gap-1">
                          <button type="button" className={buttonClass} disabled={holes.length === 0} onClick={() => state.setHoles([])}>
                            Clear
                          </button>
                          <button type="button" className={buttonClass} onClick={state.reproposeHoles}>
                            Re-propose
                          </button>
                        </div>
                      </div>
                      {state.holesStale && <p className="mb-2 text-xs text-edit-fg">Layers changed since these holes were edited. Check them or re-propose.</p>}
                      {holes.length === 0 && <p className="text-xs text-muted">None yet.</p>}
                      <div className="space-y-1">
                        {holes.map((hole) => {
                          const summary = holeSummary(analyses, hole.id)
                          return (
                            <div key={hole.id} className="border-b border-border pb-1 last:border-b-0">
                              <div className="grid grid-cols-[1.25rem_4.5rem_1fr_1fr_1.5rem] items-end gap-1">
                                <span className="pb-1.5 text-xs font-semibold">{hole.id}</span>
                                <select
                                  aria-label={`Hole ${hole.id} kind`}
                                  className={fieldClass}
                                  value={hole.kind}
                                  onChange={(e) => editHole(hole.id, { kind: e.target.value as HoleKind })}
                                >
                                  <option value="rod">Rod</option>
                                  <option value="island">Island</option>
                                </select>
                                <NumberField label="X" value={hole.x} onChange={(x) => editHole(hole.id, { x })} />
                                <NumberField label="Y" value={hole.y} onChange={(y) => editHole(hole.id, { y })} />
                                <button type="button" aria-label={`Remove hole ${hole.id}`} className={`${buttonClass} mb-0.5`} onClick={() => removeHole(hole.id)}>
                                  ×
                                </button>
                              </div>
                              <div className="mt-1 grid grid-cols-[1.25rem_4.5rem_1fr_1fr_1.5rem] items-end gap-1">
                                <span />
                                <span className="pb-1.5 text-xs text-muted">Layers</span>
                                <NumberField label="From" value={hole.from ?? 1} onChange={(from) => editHole(hole.id, { from })} />
                                <NumberField label="To" value={hole.to ?? layers.length} onChange={(to) => editHole(hole.id, { to })} />
                                <span />
                              </div>
                              <div className="mt-0.5 flex items-start justify-between gap-2 text-xs text-muted">
                                <p>
                                  Screw in {summary.mount} of {layers.length} layers
                                  {summary.conflict > 0 && <span className="text-status-error">, conflicts in {summary.conflict}</span>}
                                  {hole.cut && `, cut with the contour in ${summary.cut}`}
                                  {(hole.from ?? 1) > (hole.to ?? layers.length) && <span className="text-status-error">, From is above To</span>}
                                </p>
                                <label
                                  className="flex shrink-0 items-center gap-1 text-fg"
                                  title="Also bore this hole in the layer files, before the contour, in the layers of its range"
                                >
                                  <input type="checkbox" checked={hole.cut === true} onChange={(e) => editHole(hole.id, { cut: e.target.checked })} />
                                  Cut
                                </label>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </section>
                  </>
                )}
              </div>
            ) : (
              <button
                key={step.id}
                type="button"
                onClick={() => setActiveStep(step.id)}
                className="flex w-16 shrink-0 flex-col items-center gap-3 border-r border-border px-1 py-3 text-center hover:bg-border/40"
              >
                <span className="text-[10px] font-semibold uppercase text-muted">Step {step.id}</span>
                <span className="text-[10px] font-semibold uppercase text-fg">{step.title}</span>
                {stepStats[step.id].map(([label, value]) => (
                  <span key={label} className="flex flex-col items-center">
                    <span className="text-[9px] uppercase text-muted">{label}</span>
                    <span className="break-all text-xs text-fg">{value}</span>
                  </span>
                ))}
              </button>
            ),
          )}
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
            <div role="tablist" aria-label="Preview" className="mr-2 flex gap-1">
              {(
                [
                  ['stack', 'Stack'],
                  ['toolpath', 'Toolpath'],
                  ['gcode', 'G-code'],
                ] as const
              ).map(([id, name]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={view === id}
                  onClick={() => setView(id)}
                  className={`${buttonClass} ${view === id ? 'border-accent bg-tab-active-bg text-tab-active-fg' : ''}`}
                >
                  {name}
                </button>
              ))}
            </div>
            {view === 'stack' ? (
              <>
                <Toggle label="Whole stack" pressed={mode === 'stack'} onClick={() => setMode('stack')} />
                <Toggle label="Single layer" pressed={mode === 'single'} onClick={() => setMode('single')} />
                <Toggle label="Show model" pressed={showModel} onClick={() => setShowModel((v) => !v)} />
                <Toggle label="Show rods" pressed={showRods} onClick={() => setShowRods((v) => !v)} />
                {params.hub && <Toggle label="Show hub" pressed={showHub} onClick={() => setShowHub((v) => !v)} />}
              </>
            ) : (
              <label className="flex items-center gap-1 text-xs text-muted">
                File
                <select
                  className={`${fieldClass} w-auto`}
                  value={shownFile?.kind ?? 'layer'}
                  disabled={!shownFile}
                  onChange={(e) => setFileKind(e.target.value as FileKind)}
                >
                  {fileChoices.map((f) => (
                    <option key={f.name} value={f.kind}>
                      {FILE_KIND_LABELS[f.kind]}
                      {f.layer !== undefined ? ` ${f.layer}` : ''} — {f.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {view !== 'stack' && (
              <button type="button" className={buttonClass} disabled={!builtFile} onClick={copyGcode}>
                {copied !== null && copied === shownFile?.name ? 'Copied' : 'Copy G-code'}
              </button>
            )}
            <span className="ml-2 text-xs text-muted">
              {layers.length} layers, {Math.round(totalHeight)} mm tall{state.computing ? ', calculating…' : ''}
            </span>
            <button
              type="button"
              disabled={!canGenerate}
              onClick={generate}
              className="ml-auto rounded bg-btn-bg px-3 py-1 text-sm font-medium text-btn-fg hover:bg-btn-bg-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              Generate ZIP
            </button>
          </div>

          {(errors.length > 0 || warnings.length > 0 || state.computeError) && (
            <div className="max-h-32 space-y-0.5 overflow-y-auto border-b border-border px-3 py-2 text-xs">
              {state.computeError && <p className="text-status-error">Could not slice this model: {state.computeError}</p>}
              {errors.map((text) => (
                <p key={text} className="text-status-error">
                  {text}
                </p>
              ))}
              {warnings.map((text) => (
                <p key={text} className="text-edit-fg">
                  {text}
                </p>
              ))}
            </div>
          )}

          <div className="grid min-h-0 flex-1 grid-cols-2">
            <div className="min-h-0 border-r border-border">
              {!raw ? (
                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted">Load an STL, or try the demo bust.</div>
              ) : view !== 'stack' && !builtFile ? (
                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted">
                  {state.computing ? 'Calculating…' : 'Fix the errors above to see the toolpath.'}
                </div>
              ) : view === 'toolpath' && builtFile && shownFile ? (
                <ToolpathScene file={builtFile} kind={shownFile.kind} plate={shownPlate} appearance={appearance} isDark={isDark} />
              ) : view === 'gcode' && gcodeLines ? (
                <pre className="h-full overflow-auto bg-code-bg p-4 font-mono text-xs leading-relaxed text-value">
                  {gcodeLines.slice(0, GCODE_PREVIEW_LINES).join('\n')}
                  {gcodeLines.length > GCODE_PREVIEW_LINES && (
                    <span className="mt-4 block font-sans text-sm text-muted">
                      … {gcodeLines.length - GCODE_PREVIEW_LINES} more lines not shown. The full program is in the ZIP.
                    </span>
                  )}
                </pre>
              ) : (
                <StackScene mesh={mesh} layers={layers} holes={holes} spacers={hubShown ? [...state.spacers, ...state.hubSpacers] : state.spacers} params={params} showHub={hubShown} selected={current} mode={mode} showModel={showModel} showRods={showRods} isDark={isDark} />
              )}
            </div>
            <div className="flex min-h-0 flex-col">
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <button type="button" className={buttonClass} disabled={current <= 1} onClick={() => setSelected(current - 1)} aria-label="Previous layer">
                  ‹
                </button>
                <input
                  type="range"
                  aria-label="Layer"
                  className="min-w-0 flex-1"
                  min={1}
                  max={Math.max(layers.length, 1)}
                  value={current}
                  onChange={(e) => setSelected(Number(e.target.value))}
                />
                <button type="button" className={buttonClass} disabled={current >= layers.length} onClick={() => setSelected(current + 1)} aria-label="Next layer">
                  ›
                </button>
                <Toggle label="Superimposed" pressed={superimposed} onClick={() => setSuperimposed((v) => !v)} />
                <Toggle label="Add rod" pressed={addMode} onClick={() => setAddMode((v) => !v)} />
                <span className="w-16 text-right text-xs">
                  {layers.length > 0 ? `${current} / ${layers.length}` : '–'}
                </span>
              </div>
              {layer && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-3 py-1.5 text-xs text-muted">
                  <span>Layer {layer.number} on the machine: turn</span>
                  <div className="w-16">
                    <NumberField
                      key={`turn-${layer.number}`}
                      label=""
                      ariaLabel={`Turn of layer ${layer.number} in degrees`}
                      value={placement.turn}
                      onChange={(turn) => setPlacement({ turn })}
                    />
                  </div>
                  <span>° CCW, shift X</span>
                  <div className="w-16">
                    <NumberField key={`x-${layer.number}`} label="" ariaLabel={`Shift X of layer ${layer.number} in mm`} value={placement.x} onChange={(x) => setPlacement({ x })} />
                  </div>
                  <span>Y</span>
                  <div className="w-16">
                    <NumberField key={`y-${layer.number}`} label="" ariaLabel={`Shift Y of layer ${layer.number} in mm`} value={placement.y} onChange={(y) => setPlacement({ y })} />
                  </div>
                  <span>mm</span>
                  <button type="button" className={buttonClass} disabled={!placed} onClick={() => setPlacement(null)}>
                    Reset
                  </button>
                  <span className="ml-auto" title="Turned about X0 Y0, then shifted. G-code and this view only; the 3D model stays as it is.">
                    {placedCount > 0 ? `${placedCount} layer(s) moved` : 'G-code and this view only'}
                  </span>
                </div>
              )}
              <div className="min-h-0 flex-1">
                <LayerView
                  layers={layers}
                  layer={layer}
                  analysis={analysis}
                  holes={holes}
                  params={params}
                  isDark={isDark}
                  addMode={addMode}
                  superimposed={superimposed}
                  showHub={hubShown}
                  onAdd={(at) => state.setHoles(addHole(holes, at, 'rod'))}
                  onMove={(id, at) => editHole(id, at)}
                  onRemove={removeHole}
                />
              </div>
              <div className="border-t border-border px-3 py-2 text-xs">
                {layer && analysis && blank && (
                  <p className="mb-1">
                    Plate at least {blank.width} × {blank.height} mm at X{blank.centerX} Y{blank.centerY}. Screws:{' '}
                    {placed
                      ? 'none: the layer is moved, hold the plate by its edges'
                      : analysis.mountIds.length > 0
                        ? analysis.mountIds.join(', ')
                        : 'none'}
                    .
                    {analysis.unheldPieces.length > 0 ? ` ${analysis.unheldPieces.length} piece(s) on tabs only.` : ''}
                    {layer.removedPieces > 0 ? ` ${layer.removedPieces} small piece(s) dropped.` : ''}
                  </p>
                )}
                <p className="flex flex-wrap gap-3 text-muted">
                  {HOLE_STATES.map((s) => (
                    <span key={s} className="flex items-center gap-1">
                      <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: holeStateColor(s) }} />
                      {HOLE_STATE_LABELS[s]}
                    </span>
                  ))}
                  {superimposed ? (
                    <span className="flex items-center gap-1">
                      Where a screw clears the edge: in one layer
                      <span aria-hidden className="inline-block h-2 w-16 rounded-sm" style={{ background: 'linear-gradient(to right, hsl(0 85% 50%), hsl(60 85% 50%), hsl(120 85% 50%))' }} />
                      in every layer. Outline: current layer.
                    </span>
                  ) : (
                    <span>Dashed: tool path. Red fill: out of the tool's reach. Dashed ring: hole cut with the contour.</span>
                  )}
                  <span>Drag a hole to move it, right-click to remove it{addMode ? ', click empty space to add a rod' : ''}.</span>
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
      {saveOpen && (
        <ProjectNameModal
          initialName={projectName}
          presetCount={0}
          description={
            <p className="text-sm text-muted">
              Saves the model, every step's settings, the plate turn and all holes to one file you can load back later, here or on another
              computer. Machine, tool list and appearance are not included.
            </p>
          }
          filename={(name) => sculptureFilename(name)}
          onSave={saveProject}
          onClose={() => setSaveOpen(false)}
          fullScreen={layout !== 'wide' || touch}
        />
      )}
      {settingsOpen && (
        <SettingsModal
          machine={machine}
          onSave={saveMachine}
          appearance={appearance}
          onSaveAppearance={saveAppearance}
          toolDiameters={toolDiameters}
          onSaveToolDiameters={saveToolDiameters}
          onResetAll={resetAll}
          onClose={() => setSettingsOpen(false)}
          fullScreen={layout !== 'wide' || touch}
        />
      )}
    </div>
    </SimpleModeContext.Provider>
  )
}
