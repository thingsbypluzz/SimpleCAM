import { type ReactNode, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { BitIcon, ChevronDownIcon, FeedIcon, HelixIcon, StandardHoleIcon, TabBridgeIcon, ChevronLeftIcon, ChevronRightIcon, OpenFileIcon, SaveFileIcon, XIcon } from '../components/icons'
import { previewButtonClass, previewTopBarClass } from '../components/preview/previewToolbar'
import { Checkbox } from '../components/wizard/Checkbox'
import { MiniStat } from '../components/wizard/MiniStat'
import { FieldRow, inputClass } from '../components/wizard/FieldRow'
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
import { CompactNumberField, NumberField, SelectField, ToolDiameterField } from './fields'
import {
  CollapseAllIcon,
  ContourIcon,
  CopyIcon,
  DownloadIcon,
  GapIcon,
  HeightIcon,
  HubIcon,
  IslandIcon,
  LayersIcon,
  OwnFileIcon,
  PlateHolesIcon,
  PlateIcon,
  RodsIcon,
  SheetIcon,
  SpacersIcon,
  TurnIcon,
} from './icons'
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

const smallButtonClass =
  'rounded-md border border-field-border px-2.5 py-1 text-xs font-medium text-value hover:bg-border/40 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent'
const pressedClass = 'border-accent bg-accent-bg text-accent-fg hover:bg-accent-bg'
// The Header's icon buttons, as in OnlyPaths' wide layout.
const headerButtonClass = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-value hover:bg-border/40'
const projectButtonClass = 'flex h-11 w-11 items-center justify-center rounded-md border border-border text-value transition hover:bg-border/40'

// A part of a step, under a hairline like OnlyPaths' step sections.
function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        {aside}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</div>
    </section>
  )
}

function Toggle({ label, pressed, onClick }: { label: string; pressed: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} className={`${smallButtonClass} ${pressed ? pressedClass : ''}`}>
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
// OnlySculpture's own exception: every step can be collapsed, so the preview
// gets the room.
const STEPS = [
  { id: 1, title: 'Model' },
  { id: 2, title: 'Layers' },
  { id: 3, title: 'Tool' },
  { id: 4, title: 'Support and Alignment' },
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
  // The plate under the path in the Toolpath tab.
  const [stockVisible, setStockVisible] = useState(true)
  const [isDark, setIsDark] = useState(true)
  const [addMode, setAddMode] = useState(false)
  const [superimposed, setSuperimposed] = useState(false)
  const [view, setView] = useState<PreviewView>('stack')
  // The file the Toolpath and G-code views show; layer files follow the slider.
  const [fileKind, setFileKind] = useState<FileKind>('layer')
  // The file whose G-code was just copied, for the button's confirmation.
  const [copied, setCopied] = useState<string | null>(null)
  // 0 = every step collapsed.
  const [activeStep, setActiveStep] = useState<number>(1)
  const [warningsOpen, setWarningsOpen] = useState(true)
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
  const icon = 'h-8 w-8'
  // Each collapsed step's key values, with an icon each as in OnlyPaths.
  const stepStats: Record<number, { Icon: ReactNode; label: string; value: string; unit?: string; title: string }[]> = {
    1: [
      { Icon: <HeightIcon className={icon} />, label: 'HEIGHT', value: `${params.height}`, unit: 'mm', title: `Height: ${params.height} mm` },
      { Icon: <PlateIcon className={icon} />, label: 'PLATE', value: `${params.thickness}`, unit: 'mm', title: `Plate thickness: ${params.thickness} mm` },
      { Icon: <GapIcon className={icon} />, label: 'GAP', value: `${params.gap}`, unit: 'mm', title: `Gap between plates: ${params.gap} mm` },
      { Icon: <LayersIcon className={icon} />, label: 'LAYERS', value: `${layers.length}`, title: `${layers.length} layers` },
      {
        Icon: <SheetIcon className={icon} />,
        label: 'SHEET',
        value: plates ? `${plates.width}×${plates.height}` : '–',
        title: plates ? `Every layer fits a ${plates.width} × ${plates.height} mm sheet` : 'No layers yet',
      },
      { Icon: <TurnIcon className={icon} />, label: 'TURN', value: `${params.plateTurn}°`, title: `Every plate turned ${params.plateTurn}° CCW` },
    ],
    2: [
      {
        Icon: <ContourIcon className={icon} plane={params.plane} />,
        label: 'CONTOUR',
        value: PLANE_SHORT[params.plane],
        title: `Contour taken at the ${PLANE_SHORT[params.plane].toLowerCase()} of the plate`,
      },
      {
        Icon: <IslandIcon className={icon} mode={params.islandMode} />,
        label: 'ISLANDS',
        value: ISLAND_SHORT[params.islandMode],
        title: `Separate pieces: ${ISLAND_SHORT[params.islandMode].toLowerCase()}`,
      },
      { Icon: <SpacersIcon className={icon} />, label: 'SPACERS', value: params.spacers ? 'On' : 'Off', title: `Spacers between plates: ${params.spacers ? 'on' : 'off'}` },
    ],
    3: [
      { Icon: <BitIcon className={icon} />, label: 'TOOL', value: `Ø${params.toolDiameter}`, unit: 'mm', title: `Tool diameter: ${params.toolDiameter} mm` },
      { Icon: <FeedIcon className={icon} />, label: 'FEED', value: `${params.feed}`, unit: 'mm/min', title: `Feed: ${params.feed} mm/min` },
      { Icon: <TabBridgeIcon className={icon} />, label: 'TABS', value: `${params.tabCount}`, title: `${params.tabCount} tabs per piece` },
      params.holeMethod === 'helix'
        ? { Icon: <HelixIcon className={icon} />, label: 'HOLES', value: `${params.rampAngle}°`, title: `Holes: helix, ramp angle ${params.rampAngle}°` }
        : { Icon: <StandardHoleIcon className={icon} />, label: 'HOLES', value: 'Std', title: 'Holes: standard' },
    ],
    4: [
      { Icon: <PlateHolesIcon className={icon} />, label: 'HOLES', value: `${holes.length}`, title: `${holes.length} master holes` },
      { Icon: <RodsIcon className={icon} />, label: 'RODS', value: `${holes.filter((h) => h.kind === 'rod').length}`, title: 'Rods through the stack' },
      {
        Icon: <OwnFileIcon className={icon} />,
        label: 'OWN FILES',
        value: `${analyses.filter((a) => a.conflictIds.length > 0).length}`,
        title: 'Layers that get their own holes file',
      },
      {
        Icon: <HubIcon className={icon} />,
        label: 'HUB',
        value: params.hub ? `Ø${params.hubDiameter}` : 'Off',
        title: params.hub ? `Mounting hub Ø${params.hubDiameter} mm` : 'No mounting hub',
      },
    ],
  }

  // Off only hides the hub's own parts; without a hub there is nothing to hide
  // (island bridges belong to the cut and are always shown).
  const hubShown = !params.hub || showHub
  const totalHeight = layers.length > 0 ? layers[layers.length - 1].zBottom + params.thickness : 0
  const blank = layer ? layerBlank(layer, params) : null
  const issueCount = errors.length + warnings.length + (state.computeError ? 1 : 0)

  // One file of the ZIP on its own, as the Toolpath and G-code tabs show it.
  const downloadShown = () => {
    if (shownFile && builtFile) downloadBlob(shownFile.name, builtFile.content, 'text/plain')
  }

  const renderStep = (id: number) => {
    if (id === 1)
      return (
        <>
        <Section title="Model">
          <div className="col-span-2 flex flex-wrap items-center gap-2">
            <label className={`${smallButtonClass} cursor-pointer`}>
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
            <button type="button" className={smallButtonClass} onClick={() => void openDemo()}>
              Demo bust
            </button>
            <span className="min-w-0 break-all text-xs text-muted">{modelName || 'No model loaded.'}</span>
          </div>
          {mesh && (
            <p className="col-span-2 -mt-1 text-xs text-muted">
              {Math.round(mesh.width)} × {Math.round(mesh.depth)} × {Math.round(mesh.height)} mm, {(mesh.positions.length / 9).toLocaleString('en')} triangles
            </p>
          )}
          {loadError && <p className="col-span-2 text-xs text-status-error">{loadError}</p>}
          <SelectField<UpAxis> label="Up axis" value={params.upAxis} options={[['z', 'Z'], ['y', 'Y'], ['x', 'X']]} onChange={(v) => set('upAxis', v)} />
          <NumberField label="Height" unit="mm" value={params.height} onChange={(v) => set('height', v)} />
          <Checkbox className="col-span-2 text-sm text-value" checked={params.flipUp} onChange={(v) => set('flipUp', v)} label="Upside down" />
          <SelectField<ViewUp>
            label="View up"
            value={params.viewUp}
            options={[['same', 'Same as Up axis'], ['z', 'Z'], ['y', 'Y'], ['x', 'X']]}
            onChange={(v) => set('viewUp', v)}
          />
          {params.viewUp === 'same' ? (
            <span />
          ) : (
            <Checkbox className="self-end pb-2.5 text-sm text-value" checked={params.viewFlip} onChange={(v) => set('viewFlip', v)} label="View upside down" />
          )}
          {params.viewUp !== 'same' && mesh && (
            <p className="col-span-2 text-xs text-muted">
              Height {params.height} mm along the view up axis → stack {Math.round(mesh.height)} mm, {layers.length} layers. View up turns only the 3D
              preview.
            </p>
          )}
          <NumberField label="Plate thickness" unit="mm" value={params.thickness} onChange={(v) => set('thickness', v)} step={0.1} />
          <NumberField label="Gap between plates" unit="mm" value={params.gap} onChange={(v) => set('gap', v)} step={0.1} />
          <SelectField<string>
            label="Turn every plate (CCW)"
            value={String(params.plateTurn)}
            options={PLATE_TURNS.map((d) => [String(d), `${d}°`])}
            onChange={(v) => turnPlates(Number(v))}
          />
          <span />
        </Section>
        <Section title="Stock Preview">
          <NumberField label="Sheet X" unit="mm, 0 = none" value={params.sheetX} onChange={(v) => set('sheetX', v)} step={10} />
          <NumberField label="Sheet Y" unit="mm, 0 = none" value={params.sheetY} onChange={(v) => set('sheetY', v)} step={10} />
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
                Largest plate: {plates.largest.width} × {plates.largest.height} mm (layer {plates.largest.number}). Every layer fits a {plates.width} ×{' '}
                {plates.height} mm sheet (X × Y).
              </p>
              {!plates.fits && (
                <p className="text-status-warn-fg">
                  Larger than the machine ({machine.travelX} × {machine.travelY} mm).
                  {plates.fitsTurned ? ' Fits with the plates turned another 90°.' : ' Try another turn or a smaller height.'}
                </p>
              )}
              {plates.offSheet.length > 0 && (
                <p className="text-status-warn-fg">
                  {plates.offSheet.length} layer(s) reach past the {params.sheetX} × {params.sheetY} mm sheet: {plates.offSheet.slice(0, 8).join(', ')}
                  {plates.offSheet.length > 8 ? ` and ${plates.offSheet.length - 8} more` : ''}.
                </p>
              )}
            </div>
          )}
        </Section>
        </>
      )
    if (id === 2)
      return (
        <>
          <Section title="Contour">
            <SelectField<ContourPlane>
              label="Contour taken at"
              value={params.plane}
              options={[['bottom', 'Bottom of plate'], ['middle', 'Middle of plate'], ['top', 'Top of plate']]}
              onChange={(v) => set('plane', v)}
            />
            <NumberField label="Contour tolerance" unit="mm" value={params.tolerance} onChange={(v) => set('tolerance', v)} step={0.05} />
          </Section>
          <Section title="Islands">
            <SelectField<IslandMode>
              label="Separate pieces"
              value={params.islandMode}
              options={[['screw', 'Own screw'], ['bridge', 'Bridge to main'], ['none', 'Leave on tabs']]}
              onChange={(v) => set('islandMode', v)}
            />
            <NumberField label="Bridge width" unit="mm" value={params.bridgeWidth} onChange={(v) => set('bridgeWidth', v)} />
            <NumberField label="Drop pieces under" unit="mm²" value={params.minIslandArea} onChange={(v) => set('minIslandArea', v)} step={10} />
            <NumberField label="Close gaps under" unit="mm" value={params.closeGap} onChange={(v) => set('closeGap', v)} step={0.1} />
          </Section>
          <Section title="Spacers (preview only)">
            <Checkbox className="col-span-2 text-sm text-value" checked={params.spacers} onChange={(v) => set('spacers', v)} label="Spacers between plates" />
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
                {params.gap > 0 ? `${state.spacers.length} spacers, ${params.gap} mm thick. Not in the ZIP yet.` : 'Needs a gap between plates.'}
              </p>
            )}
          </Section>
        </>
      )
    if (id === 3)
      return (
        <>
          <Section title="Tool and cutting">
            <ToolDiameterField value={params.toolDiameter} options={toolDiameters} onChange={(v) => set('toolDiameter', v)} />
            <NumberField label="Stepdown" unit="mm" value={params.stepdown} onChange={(v) => set('stepdown', v)} step={0.1} />
            <NumberField label="Feed" unit="mm/min" value={params.feed} onChange={(v) => set('feed', v)} step={50} />
            <NumberField label="Plunge rate" unit="mm/min" value={params.plungeRate} onChange={(v) => set('plungeRate', v)} step={50} />
            <NumberField label="Cut below plate" unit="mm" value={params.overshoot} onChange={(v) => set('overshoot', v)} step={0.1} />
            <NumberField label="Safe Z above plate" unit="mm" value={params.safeAbove} onChange={(v) => set('safeAbove', v)} />
            <Checkbox
              className="col-span-2 text-sm text-value"
              checked={params.tabs}
              onChange={(v) => set('tabs', v)}
              label={`Tabs: ${machine.defaultTabCount} × ${machine.defaultTabWidth} mm, ${machine.defaultTabHeight} mm high`}
            />
            <p className="col-span-2 -mt-1 text-xs text-muted">Tab count and size come from Settings → Tabs, shared with OnlyPaths.</p>
          </Section>
          <Section title="Holes">
            <SelectField<HoleMethod>
              label="Hole method"
              value={params.holeMethod}
              options={[['helix', 'Helix'], ['standard', 'Standard']]}
              onChange={(v) => set('holeMethod', v)}
            />
            {params.holeMethod === 'helix' ? (
              <NumberField label="Ramp angle" unit="°" value={params.rampAngle} onChange={(v) => set('rampAngle', v)} step={0.5} />
            ) : (
              <span />
            )}
            <p className="col-span-2 text-xs text-muted">
              {params.holeMethod === 'helix' ? (
                <>
                  One helix down, each turn at most Stepdown deep and no steeper than the ramp angle: {pitchText(params.holeDiameter)} per turn in the
                  plate holes, {pitchText(params.insertDiameter)} in the fixture inserts.
                </>
              ) : (
                'A plunge and a full circle every Stepdown.'
              )}{' '}
              For plate holes, fixture inserts and holes cut with the contour; a hole the tool's own size is pecked straight down.
            </p>
          </Section>
        </>
      )
    return (
      <>
        <Section title="Holes and screws">
          <NumberField label="Rods" value={params.rodCount} onChange={(v) => set('rodCount', v)} />
          <NumberField label="Hole diameter" unit="mm" value={params.holeDiameter} onChange={(v) => set('holeDiameter', v)} step={0.5} />
          <NumberField label="Minimum wall" unit="mm" value={params.minWall} onChange={(v) => set('minWall', v)} step={0.5} />
          <NumberField label="Screw head diameter" unit="mm" value={params.headDiameter} onChange={(v) => set('headDiameter', v)} step={0.5} />
          <NumberField label="Screw head height" unit="mm" value={params.headHeight} onChange={(v) => set('headHeight', v)} step={0.5} />
        </Section>

        <Section title="Fixture inserts">
          <NumberField label="Insert diameter" unit="mm" value={params.insertDiameter} onChange={(v) => set('insertDiameter', v)} step={0.5} />
          <NumberField label="Insert hole depth" unit="mm" value={params.insertDepth} onChange={(v) => set('insertDepth', v)} step={0.5} />
          <NumberField label="Insert below surface" unit="mm" value={params.insertRecess} onChange={(v) => set('insertRecess', v)} step={0.5} />
        </Section>

        <Section title="Hub">
          <Checkbox className="col-span-2 text-sm text-value" checked={params.hub} onChange={(v) => set('hub', v)} label="Mounting hub in every layer" />
          {params.hub && (
            <>
              <NumberField label="Diameter" unit="mm" value={params.hubDiameter} onChange={(v) => set('hubDiameter', v)} />
              <NumberField label="Slot" unit="mm" value={params.hubSlot} onChange={(v) => set('hubSlot', v)} step={0.5} />
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
                {params.rodCount} rods need a hub of at least about {minHubDiameter(params, screwClearance(params))} mm. Hub and bridges stay on until the
                stack is glued.
                {params.gap > 0 ? ` ${Math.max(layers.length - 1, 0)} hub spacers, ${params.gap} mm thick.` : ''}
              </p>
            </>
          )}
        </Section>

        <section className="flex flex-col gap-3 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-fg">Master holes</h3>
            <div className="flex gap-1.5">
              <button type="button" className={smallButtonClass} disabled={holes.length === 0} onClick={() => state.setHoles([])}>
                Clear
              </button>
              <button type="button" className={smallButtonClass} onClick={state.reproposeHoles}>
                Re-propose
              </button>
            </div>
          </div>
          {state.holesStale && <p className="text-xs text-status-warn-fg">Layers changed since these holes were edited. Check them or re-propose.</p>}
          {holes.length === 0 && <p className="text-xs text-muted">None yet.</p>}
          {holes.map((hole) => {
            const summary = holeSummary(analyses, hole.id)
            return (
              <div key={hole.id} className="flex flex-col gap-2 border-b border-border pb-3 last:border-b-0">
                <div className="grid grid-cols-[1.5rem_6.5rem_1fr_1fr_2.25rem] items-end gap-2">
                  <span className="pb-2.5 text-sm font-semibold">{hole.id}</span>
                  <FieldRow label="Kind">
                    <select className={inputClass} value={hole.kind} onChange={(e) => editHole(hole.id, { kind: e.target.value as HoleKind })}>
                      <option value="rod">Rod</option>
                      <option value="island">Island</option>
                    </select>
                  </FieldRow>
                  <NumberField label="X" value={hole.x} onChange={(x) => editHole(hole.id, { x })} step={0.5} />
                  <NumberField label="Y" value={hole.y} onChange={(y) => editHole(hole.id, { y })} step={0.5} />
                  <button
                    type="button"
                    aria-label={`Remove hole ${hole.id}`}
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-field-border text-value hover:bg-border/40"
                    onClick={() => removeHole(hole.id)}
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-[1.5rem_6.5rem_1fr_1fr_2.25rem] items-end gap-2">
                  <span />
                  <Checkbox
                    className="pb-2.5 text-sm text-value"
                    checked={hole.cut === true}
                    onChange={(cut) => editHole(hole.id, { cut })}
                    label={<span title="Also bore this hole in the layer files, before the contour, in the layers of its range">Cut</span>}
                  />
                  <NumberField label="From layer" value={hole.from ?? 1} onChange={(from) => editHole(hole.id, { from })} />
                  <NumberField label="To layer" value={hole.to ?? layers.length} onChange={(to) => editHole(hole.id, { to })} />
                  <span />
                </div>
                <p className="pl-8 text-xs text-muted">
                  Screw in {summary.mount} of {layers.length} layers
                  {summary.conflict > 0 && <span className="text-status-error">, conflicts in {summary.conflict}</span>}
                  {hole.cut && `, cut with the contour in ${summary.cut}`}
                  {(hole.from ?? 1) > (hole.to ?? layers.length) && <span className="text-status-error">, From is above To</span>}
                </p>
              </div>
            )
          })}
        </section>
      </>
    )
  }

  // Errors, then warnings: under the steps, above Generate ZIP.
  const issueList = (
    <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-status-warn-border bg-status-warn-bg px-3 py-2 text-xs text-status-warn-fg">
      {state.computeError && <p className="text-status-error">Could not slice this model: {state.computeError}</p>}
      {errors.map((text) => (
        <p key={text} className="text-status-error">
          {text}
        </p>
      ))}
      {warnings.map((text) => (
        <p key={text}>{text}</p>
      ))}
    </div>
  )
  const issueTitle = [
    errors.length + (state.computeError ? 1 : 0) > 0 ? `${errors.length + (state.computeError ? 1 : 0)} error(s)` : '',
    warnings.length > 0 ? `${warnings.length} warning(s)` : '',
  ]
    .filter(Boolean)
    .join(', ')
  const issueToggle = (
    <button
      type="button"
      aria-expanded={warningsOpen}
      onClick={() => setWarningsOpen((v) => !v)}
      className="flex w-full items-center justify-between gap-2 text-xs font-semibold text-fg"
    >
      <span className={errors.length > 0 || state.computeError ? 'text-status-error' : 'text-status-warn-fg'}>{issueTitle}</span>
      <span className="flex items-center gap-1 font-normal text-muted">
        {warningsOpen ? 'Hide' : 'Show'}
        {warningsOpen ? <ChevronDownIcon className="h-3.5 w-3.5" /> : <ChevronRightIcon className="h-3.5 w-3.5" />}
      </span>
    </button>
  )
  const generateButton = (
    <button
      type="button"
      disabled={!canGenerate}
      onClick={generate}
      className="rounded-md bg-btn-bg px-5 py-2 text-sm font-medium text-btn-fg shadow-[var(--glow-btn)] hover:bg-btn-bg-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-btn-bg"
    >
      Generate ZIP
    </button>
  )
  const stackSummary = state.computing
    ? 'Calculating…'
    : layers.length > 0
      ? `${layers.length} layers, ${Math.round(totalHeight)} mm tall · ${files.length + 1} files${plates ? ` · plates up to ${plates.largest.width} × ${plates.largest.height} mm` : ''}`
      : 'No layers yet.'

  const allCollapsed = activeStep === 0
  const fileHint = shownFile?.layer !== undefined ? 'follows the layer slider' : ''

  return (
    <SimpleModeContext.Provider value={appearance.uiMode === 'simple'}>
    <div className="flex h-screen flex-col bg-bg text-fg">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-border px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold" aria-label="OnlySculpture">
            <span className="text-wordmark-only" style={{ textShadow: 'var(--wordmark-only-glow)' }}>
              Only
            </span>
            <span className="text-wordmark-paths" style={{ textShadow: 'var(--wordmark-paths-glow)' }}>
              Sculpture
            </span>
          </h1>
          {/* The slogan is still to be decided (BL-125). */}
          <p className="text-xs text-muted">Prototype</p>
          <p className="text-[11px] text-muted">Envisioned by ThingsByPluzz</p>
        </div>

        <div className="flex items-center justify-self-center gap-2">
          <span
            title={projectName ? `Project "${projectName}"` : 'No project saved or loaded yet'}
            className="flex h-7 max-w-40 items-center rounded-md border border-edit px-2 text-xs font-semibold text-edit-fg shadow-[var(--glow-edit)]"
          >
            <span className="truncate">{projectName || 'Untitled'}</span>
          </span>
          <label className={`${projectButtonClass} cursor-pointer`} title="Load project — the model, its settings and holes from a project file">
            <OpenFileIcon className="h-5 w-5" />
            <span className="sr-only">Load project from a file</span>
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
          <button
            type="button"
            aria-label="Save project to a file"
            title={raw ? 'Save project — the model, its settings and holes to one file' : 'Save project — load a model first'}
            disabled={!raw}
            onClick={() => setSaveOpen(true)}
            className={`${projectButtonClass} disabled:opacity-50 disabled:hover:bg-transparent`}
          >
            <SaveFileIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center justify-self-end gap-2">
          <span className="mr-2 text-xs text-muted">
            Machine {machine.travelX} × {machine.travelY} · {machine.dialect}
          </span>
          <button
            type="button"
            onClick={() => setIsDark((d) => !d)}
            aria-label="Toggle dark mode"
            aria-pressed={isDark}
            title="Toggle dark mode"
            className={headerButtonClass}
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
          <button type="button" onClick={() => setSettingsOpen(true)} aria-label="Settings" title="Settings" className={headerButtonClass}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
              />
            </svg>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* The accordion as in OnlyPaths' wide layout; with every step
            collapsed only the four 80 px columns are left. */}
        <aside
          aria-label="Wizard"
          className={`flex shrink-0 flex-col border-r border-border ${allCollapsed ? 'w-80' : 'w-[42%] max-w-[760px] min-w-[660px]'}`}
        >
          <div className="flex min-h-0 flex-1">
            {STEPS.map((step) =>
              step.id === activeStep ? (
                <div key={step.id} className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto border-r border-border p-6">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Step {step.id} · {step.title}
                    </h2>
                    <button
                      type="button"
                      onClick={() => setActiveStep(0)}
                      aria-label="Collapse all steps"
                      title="Collapse all steps — the preview takes the room"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-value hover:bg-border/40"
                    >
                      <CollapseAllIcon className="h-4 w-4" />
                    </button>
                  </div>
                  {renderStep(step.id)}
                </div>
              ) : (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setActiveStep(step.id)}
                  title={`Step ${step.id} · ${step.title}`}
                  className="flex w-20 shrink-0 flex-col items-center gap-4 border-r border-border py-4 hover:bg-border/40"
                >
                  <span className="flex flex-col items-center gap-1">
                    <span className="text-[10px] font-semibold uppercase text-muted">Step {step.id}</span>
                    <span className="px-1 text-center text-[10px] font-semibold uppercase text-fg">{step.title}</span>
                  </span>
                  {stepStats[step.id].map((stat) => (
                    <MiniStat key={stat.label} icon={stat.Icon} label={stat.label} value={stat.value} unit={stat.unit} title={stat.title} />
                  ))}
                </button>
              ),
            )}
          </div>

          {allCollapsed ? (
            <div className="flex flex-col gap-2.5 border-t border-border px-4 py-3">
              {issueCount > 0 && (
                <>
                  <div className="rounded-md border border-field-border px-2.5 py-1.5">{issueToggle}</div>
                  {warningsOpen && issueList}
                </>
              )}
              {generateButton}
            </div>
          ) : (
            <>
              {issueCount > 0 && (
                <div className="flex flex-col gap-2 border-t border-border px-6 py-3">
                  {issueToggle}
                  {warningsOpen && issueList}
                </div>
              )}
              <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-3">
                <span className="min-w-0 text-xs text-muted">{stackSummary}</span>
                {generateButton}
              </div>
            </>
          )}
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          {/* One row over both panes, split where they split: the preview's
              tabs as in OnlyPaths, then the layer bar. */}
          <div className="grid h-12 shrink-0 grid-cols-2 border-b border-border">
            <div className="flex items-center gap-2 border-r border-border px-6" role="tablist" aria-label="Preview">
              {(
                [
                  ['stack', 'Stack'],
                  ['toolpath', 'Toolpath'],
                  ['gcode', 'G-Code'],
                ] as const
              ).map(([id, name]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={view === id}
                  onClick={() => setView(id)}
                  className={[
                    'rounded-md px-2.5 py-1 text-xs font-semibold uppercase tracking-wide transition',
                    view === id ? 'bg-tab-active-bg text-tab-active-fg shadow-[var(--glow-accent)]' : 'text-muted hover:text-fg',
                  ].join(' ')}
                >
                  {name}
                </button>
              ))}
            </div>
            <div className="flex min-w-0 items-center gap-2 px-4">
              <button type="button" className={smallButtonClass} disabled={current <= 1} onClick={() => setSelected(current - 1)} aria-label="Previous layer">
                <ChevronLeftIcon className="h-3.5 w-3.5" />
              </button>
              <input
                type="range"
                aria-label="Layer"
                className="min-w-0 flex-1 accent-accent"
                min={1}
                max={Math.max(layers.length, 1)}
                value={current}
                onChange={(e) => setSelected(Number(e.target.value))}
              />
              <button
                type="button"
                className={smallButtonClass}
                disabled={current >= layers.length}
                onClick={() => setSelected(current + 1)}
                aria-label="Next layer"
              >
                <ChevronRightIcon className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-14 text-center font-mono text-xs font-semibold tabular-nums">{layers.length > 0 ? `${current} / ${layers.length}` : '–'}</span>
              <Toggle label="Superimposed" pressed={superimposed} onClick={() => setSuperimposed((v) => !v)} />
              <Toggle label="Add rod" pressed={addMode} onClick={() => setAddMode((v) => !v)} />
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-2">
            <div className="relative min-h-0 overflow-hidden border-r border-border shadow-[var(--preview-inset)]">
              {!raw ? (
                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted">Load an STL, or try the demo bust.</div>
              ) : view === 'stack' ? (
                <>
                  <StackScene
                    mesh={mesh}
                    layers={layers}
                    holes={holes}
                    spacers={hubShown ? [...state.spacers, ...state.hubSpacers] : state.spacers}
                    params={params}
                    showHub={hubShown}
                    selected={current}
                    mode={mode}
                    showModel={showModel}
                    showRods={showRods}
                    isDark={isDark}
                  />
                  <div className={previewTopBarClass}>
                    <div role="group" aria-label="Stack view" className="flex overflow-hidden rounded-md border border-field-border shadow-sm">
                      {(
                        [
                          ['stack', 'Whole stack'],
                          ['single', 'Single layer'],
                        ] as const
                      ).map(([id, name], i) => (
                        <button
                          key={id}
                          type="button"
                          aria-pressed={mode === id}
                          onClick={() => setMode(id)}
                          className={[
                            'px-2.5 py-1 text-xs font-medium',
                            i > 0 ? 'border-l border-field-border' : '',
                            mode === id ? 'bg-accent-bg text-accent-fg' : 'bg-field-bg/90 text-value hover:bg-field-bg',
                          ].join(' ')}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                    <button type="button" aria-pressed={showModel} onClick={() => setShowModel((v) => !v)} className={previewButtonClass}>
                      {showModel ? 'Hide Model' : 'Show Model'}
                    </button>
                    <button type="button" aria-pressed={showRods} onClick={() => setShowRods((v) => !v)} className={previewButtonClass}>
                      {showRods ? 'Hide Rods' : 'Show Rods'}
                    </button>
                    {params.hub && (
                      <button type="button" aria-pressed={showHub} onClick={() => setShowHub((v) => !v)} className={previewButtonClass}>
                        {showHub ? 'Hide Hub' : 'Show Hub'}
                      </button>
                    )}
                  </div>
                </>
              ) : !builtFile || !shownFile ? (
                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted">
                  {state.computing ? 'Calculating…' : 'Fix the errors under the steps to see the toolpath.'}
                </div>
              ) : (
                <>
                  {view === 'toolpath' ? (
                    <ToolpathScene
                      file={builtFile}
                      kind={shownFile.kind}
                      plate={shownPlate}
                      appearance={appearance}
                      isDark={isDark}
                      stockVisible={stockVisible}
                    />
                  ) : (
                    gcodeLines && (
                      <>
                        <pre className="h-full overflow-auto bg-code-bg px-4 pt-14 pb-12 font-mono text-xs leading-relaxed text-value">
                          {gcodeLines.slice(0, GCODE_PREVIEW_LINES).join('\n')}
                          {gcodeLines.length > GCODE_PREVIEW_LINES && (
                            <span className="mt-4 block font-sans text-sm text-muted">
                              … {gcodeLines.length - GCODE_PREVIEW_LINES} more lines not shown. The full program is in the ZIP.
                            </span>
                          )}
                        </pre>
                        <span className="pointer-events-none absolute right-3 bottom-3 rounded-md bg-code-bg/90 px-2 py-1 text-xs text-muted">
                          {gcodeLines.length} lines
                        </span>
                      </>
                    )
                  )}
                  {/* The file shown, then what can be done with it. */}
                  <div className="absolute top-3 right-3 left-3 flex flex-wrap items-center gap-1.5">
                    <label className="flex items-center gap-1.5 text-xs text-muted">
                      File
                      <select
                        className="rounded-md border border-field-border bg-field-bg/90 px-2 py-1 text-xs font-medium text-value shadow-sm focus:border-accent-strong focus:outline-none"
                        value={shownFile.kind}
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
                    {fileHint && <span className="text-xs text-muted">{fileHint}</span>}
                    {view === 'toolpath' && (
                      <button type="button" aria-pressed={stockVisible} onClick={() => setStockVisible((v) => !v)} className={previewButtonClass}>
                        {stockVisible ? 'Hide Stock' : 'Show Stock'}
                      </button>
                    )}
                    <span className="ml-auto" />
                    <button type="button" className={`${previewButtonClass} flex items-center gap-1.5`} onClick={copyGcode}>
                      <CopyIcon className="h-3.5 w-3.5" />
                      {copied !== null && copied === shownFile.name ? 'Copied' : 'Copy G-code'}
                    </button>
                    <button type="button" className={`${previewButtonClass} flex items-center gap-1.5`} onClick={downloadShown} title={`Download ${shownFile.name}`}>
                      <DownloadIcon className="h-3.5 w-3.5" />
                      Download
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="flex min-h-0 flex-col">
              <div className="relative min-h-0 flex-1 shadow-[var(--preview-inset)]">
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
                {layer && (
                  <div className="absolute top-3 right-3 left-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-field-border bg-code-bg/90 px-2.5 py-1.5 text-xs text-muted shadow-sm">
                    <span className="font-semibold text-fg">Layer {layer.number} on the machine</span>
                    <span>turn</span>
                    <CompactNumberField
                      key={`turn-${layer.number}`}
                      ariaLabel={`Turn of layer ${layer.number} in degrees`}
                      value={placement.turn}
                      onChange={(turn) => setPlacement({ turn })}
                      step={5}
                    />
                    <span>° CCW, X</span>
                    <CompactNumberField key={`x-${layer.number}`} ariaLabel={`Shift X of layer ${layer.number} in mm`} value={placement.x} onChange={(x) => setPlacement({ x })} />
                    <span>Y</span>
                    <CompactNumberField key={`y-${layer.number}`} ariaLabel={`Shift Y of layer ${layer.number} in mm`} value={placement.y} onChange={(y) => setPlacement({ y })} />
                    <span>mm</span>
                    <button type="button" className={smallButtonClass} disabled={!placed} onClick={() => setPlacement(null)}>
                      Reset
                    </button>
                    <span className="ml-auto" title="Turned about X0 Y0, then shifted. G-code and this view only; the 3D model stays as it is.">
                      {placedCount > 0 ? `${placedCount} layer(s) moved` : 'G-code and this view only'}
                    </span>
                  </div>
                )}
              </div>
              <div className="border-t border-border px-4 py-2.5 text-xs leading-relaxed">
                {layer && analysis && blank && (
                  <p className="mb-1 text-fg">
                    Plate at least {blank.width} × {blank.height} mm at X{blank.centerX} Y{blank.centerY}. Screws:{' '}
                    {placed ? 'none: the layer is moved, hold the plate by its edges' : analysis.mountIds.length > 0 ? analysis.mountIds.join(', ') : 'none'}.
                    {analysis.unheldPieces.length > 0 ? ` ${analysis.unheldPieces.length} piece(s) on tabs only.` : ''}
                    {layer.removedPieces > 0 ? ` ${layer.removedPieces} small piece(s) dropped.` : ''}
                  </p>
                )}
                <p className="flex flex-wrap gap-x-3 text-muted">
                  {HOLE_STATES.map((s) => (
                    <span key={s} className="flex items-center gap-1">
                      <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: holeStateColor(s) }} />
                      {HOLE_STATE_LABELS[s]}
                    </span>
                  ))}
                  {superimposed ? (
                    <span className="flex items-center gap-1">
                      Where a screw clears the edge: in one layer
                      <span
                        aria-hidden
                        className="inline-block h-2 w-16 rounded-sm"
                        style={{ background: 'linear-gradient(to right, hsl(0 85% 50%), hsl(60 85% 50%), hsl(120 85% 50%))' }}
                      />
                      in every layer. Outline: current layer.
                    </span>
                  ) : (
                    <span>Dashed: tool path. Box: cut extent incl. tool radius. Red fill: out of the tool's reach. Dashed ring: hole cut with the contour.</span>
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
