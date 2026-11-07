import { fmt } from '../lib/format'
import { cappedRampPitch } from '../lib/rampPitch'
import { endOfProgramCode, modalPreamble, spindleStartLines } from '../lib/program'
import { type Toolpath, ToolpathBuilder, fullTurn, toolpathToGcode } from '../lib/toolpath'
import type { MachineSettings } from '../types/machine'
import type { Point2D } from '../types/wizard'
import { type Region, type Ring, circlePiece, regionBounds, pieceArea, ringLength } from './geometry'
import type { Hole, LayerHoles } from './holes'
import { type Layer, toolRegion } from './layers'
import type { SculptureParams } from './params'

function program(comments: string[], safeZ: number, body: string[], machine: MachineSettings): string {
  const lines = comments.map((c) => `; ${c}`)
  const header = machine.headerText.trim()
  if (header) lines.push(...machine.headerText.split('\n'))
  lines.push(...modalPreamble(machine.dialect), ...spindleStartLines(machine), `G0 Z${fmt(safeZ)}`)
  for (const line of body) lines.push(line)
  lines.push(`G0 Z${fmt(safeZ)}`, 'M5', 'G0 X0 Y0')
  const footer = machine.footerText.trim()
  if (footer) lines.push(...machine.footerText.split('\n'))
  lines.push(endOfProgramCode(machine.dialect))
  return lines.join('\n') + '\n'
}

// Z0 is the top of the plate being cut (the fixture board's top for the
// fixture file): the plate's bottom is at -thickness, a through cut ends
// `overshoot` lower, in the fixture.
function safeZFor(p: SculptureParams): number {
  return p.safeAbove
}

function cutBottom(p: SculptureParams): number {
  return -(p.thickness + p.overshoot)
}

const PLATE_ZERO = 'Z0 = top of this plate, X0 Y0 = fixture center'

interface TabSpan {
  start: number
  end: number
}

// Evenly spaced along the path, half a step off its start point, as on
// OnlyPaths' circles: the pass never starts inside a tab. A contour too short
// for the requested tabs gets fewer.
export function tabSpans(length: number, p: SculptureParams): TabSpan[] {
  // The material left behind is tabWidth wide, so the tool center stays out
  // over tabWidth plus the tool itself.
  const width = p.tabWidth + p.toolDiameter
  const count = Math.min(p.tabCount, Math.floor(length / (2 * width)))
  const spans: TabSpan[] = []
  for (let k = 0; k < count; k++) {
    const center = (length * (k + 0.5)) / count
    spans.push({ start: center - width / 2, end: center + width / 2 })
  }
  return spans
}

interface PathPoint extends Point2D {
  s: number
}

// The closed path as points with their distance from the start, split at tab
// boundaries so each stretch is entirely in or out of a tab.
function pathPoints(ring: Ring, spans: TabSpan[]): PathPoint[] {
  const cuts = spans.flatMap((t) => [t.start, t.end])
  const points: PathPoint[] = []
  let s = 0
  let nextCut = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    points.push({ x: a.x, y: a.y, s })
    while (nextCut < cuts.length && cuts[nextCut] <= s + length) {
      const t = length === 0 ? 0 : (cuts[nextCut] - s) / length
      points.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, s: cuts[nextCut] })
      nextCut++
    }
    s += length
  }
  points.push({ x: ring[0].x, y: ring[0].y, s })
  return points
}

// A contour descends continuously along its own path (no plunge into the wall),
// one stepdown per lap, then one flat lap on the bottom. Across a tab the tool
// stays at the tab's top, `tabHeight` above the plate's bottom.
function cutContour(builder: ToolpathBuilder, ring: Ring, top: number, bottom: number, p: SculptureParams) {
  const length = ringLength(ring)
  const spans = tabSpans(length, p)
  const points = pathPoints(ring, spans)
  const laps = Math.max(1, Math.ceil((top - bottom) / p.stepdown))
  const drop = (top - bottom) / laps
  builder.zTo('rapid', top + 1)
  builder.zTo('plunge', top)
  for (let lap = 0; lap <= laps; lap++) {
    const rampZ = (s: number) => (lap === laps ? bottom : top - drop * (lap + s / length))
    for (let i = 0; i + 1 < points.length; i++) {
      const from = points[i]
      const to = points[i + 1]
      const middle = (from.s + to.s) / 2
      const inTab = spans.some((t) => middle > t.start && middle < t.end)
      const zAt = (s: number) => (inTab ? Math.max(rampZ(s), p.tabHeight - p.thickness) : rampZ(s))
      if (Math.abs(builder.current.z - zAt(from.s)) > 1e-6) builder.zTo('plunge', zAt(from.s))
      builder.lineTo('cut', to.x, to.y, zAt(to.s))
    }
  }
}

// The holes with Cut on (`bores`) first, while the plate is still whole, then
// the contour.
function contourPath(layer: Layer, safeZ: number, p: SculptureParams, bores: Hole[] = []): Toolpath {
  const region = [...toolRegion(layer, p)].sort((a, b) => pieceArea(a) - pieceArea(b))
  // Under M3 climb means CW outside, CCW inside. Rings come CCW outer, CW hole.
  const contours = region.flatMap((piece) => [
    ...piece.holes.map((hole) => [...hole].reverse()),
    [...piece.outer].reverse(),
  ])
  const first = contours[0]
  const builder = new ToolpathBuilder({ x: first[0].x, y: first[0].y, z: safeZ })
  for (const hole of bores) boreHole(builder, hole, p.holeDiameter, 0, cutBottom(p), safeZ, p)
  contours.forEach((ring, i) => {
    if (i > 0 || bores.length > 0) builder.rapidXY(ring[0].x, ring[0].y)
    cutContour(builder, ring, 0, cutBottom(p), p)
    builder.zTo('rapid', safeZ)
  })
  return builder.build()
}

function contourBody(toolpath: Toolpath, p: SculptureParams): string[] {
  return toolpathToGcode(toolpath, {
    feeds: { cut: p.feed, plunge: p.plungeRate },
    interpolation: 'linear',
  })
}

// One file as written to the ZIP, with the moves it was formatted from (for
// the toolpath preview) and the Safe Z the program returns to at the end.
export interface GcodeFile {
  content: string
  toolpath: Toolpath
  safeZ: number
}

export function layerFile(
  layer: Layer,
  analysis: LayerHoles,
  total: number,
  p: SculptureParams,
  machine: MachineSettings,
  holes: Hole[] = [],
): GcodeFile {
  const safeZ = safeZFor(p)
  const bores = holes.filter((h) => analysis.cutIds.includes(h.id))
  const toolpath = contourPath(layer, safeZ, p, bores)
  const comments = [
    `Layer ${layer.number} of ${total}`,
    ...blankComments(layer, p),
    `Screws: ${analysis.mountIds.length > 0 ? analysis.mountIds.join(', ') : 'none'}`,
    ...(bores.length > 0 ? [`Holes cut before the contour: ${bores.map((h) => h.id).join(', ')}`] : []),
    PLATE_ZERO,
  ]
  return { content: program(comments, safeZ, contourBody(toolpath, p), machine), toolpath, safeZ }
}

export function layerGcode(layer: Layer, analysis: LayerHoles, total: number, p: SculptureParams, machine: MachineSettings, holes: Hole[] = []): string {
  return layerFile(layer, analysis, total, p, machine, holes).content
}

export function layerBlank(layer: Layer, p: SculptureParams): { width: number; height: number; centerX: number; centerY: number } {
  const bounds = regionBounds(toolRegion(layer, p)) ?? layer.bounds
  // The path plus the tool's other half, plus room to hold the waste together.
  const margin = p.toolDiameter / 2 + 5
  return {
    width: Math.ceil(bounds.maxX - bounds.minX + 2 * margin),
    height: Math.ceil(bounds.maxY - bounds.minY + 2 * margin),
    centerX: Math.round((bounds.minX + bounds.maxX) / 2),
    centerY: Math.round((bounds.minY + bounds.maxY) / 2),
  }
}

// True when the layer's plate lies entirely on the sheet given in Step 1;
// true as well when no sheet is given.
export function blankOnSheet(blank: ReturnType<typeof layerBlank>, p: SculptureParams): boolean {
  if (!(p.sheetX > 0 && p.sheetY > 0)) return true
  const eps = 1e-6
  return (
    blank.centerX - blank.width / 2 >= p.sheetOffsetX - p.sheetX / 2 - eps &&
    blank.centerX + blank.width / 2 <= p.sheetOffsetX + p.sheetX / 2 + eps &&
    blank.centerY - blank.height / 2 >= p.sheetOffsetY - p.sheetY / 2 - eps &&
    blank.centerY + blank.height / 2 <= p.sheetOffsetY + p.sheetY / 2 + eps
  )
}

function blankComments(layer: Layer, p: SculptureParams): string[] {
  const blank = layerBlank(layer, p)
  return [`Plate: at least ${blank.width} x ${blank.height} mm, centered on X${blank.centerX} Y${blank.centerY}`]
}

// Depth per helix turn in a hole of `diameter`; 0 when the hole is the tool's
// own size (pecked straight down).
export function holePitch(diameter: number, p: SculptureParams): number {
  const pathLength = Math.PI * (diameter - p.toolDiameter)
  return pathLength < 0.01 ? 0 : cappedRampPitch(pathLength, p.stepdown, p.rampAngle)
}

// From `top` to `bottom`, climbing the wall (CCW inside under M3): one helix at
// holePitch(), or (Standard) a plunge and a full circle per Stepdown; a flat
// turn on the bottom to finish. A hole the tool's own size is pecked.
function boreHole(builder: ToolpathBuilder, hole: Point2D, diameter: number, top: number, bottom: number, safeZ: number, p: SculptureParams) {
  const radius = (diameter - p.toolDiameter) / 2
  const depth = top - bottom
  builder.rapidXY(hole.x + radius, hole.y)
  builder.zTo('rapid', top + 1)
  builder.zTo('plunge', top)
  const center = { x: hole.x, y: hole.y }
  if (radius < 0.01) {
    const pecks = Math.max(1, Math.ceil(depth / p.stepdown))
    for (let peck = 1; peck <= pecks; peck++) {
      builder.zTo('plunge', top - (depth / pecks) * peck)
      builder.zTo('rapid', top + 1)
    }
  } else if (p.holeMethod === 'standard') {
    const levels = Math.max(1, Math.ceil(depth / p.stepdown))
    for (let level = 1; level <= levels; level++) {
      builder.zTo('plunge', top - (depth / levels) * level)
      builder.arc('cut', center, 'ccw', fullTurn)
    }
    builder.lineTo('cut', hole.x, hole.y, bottom)
  } else {
    // Whole turns, each no deeper than the pitch.
    const laps = Math.max(1, Math.ceil(depth / holePitch(diameter, p) - 1e-9))
    for (let lap = 1; lap <= laps; lap++) builder.arc('cut', center, 'ccw', fullTurn, top - (depth / laps) * lap)
    builder.arc('cut', center, 'ccw', fullTurn, bottom)
    builder.lineTo('cut', hole.x, hole.y, bottom)
  }
  builder.zTo('rapid', safeZ)
}

function holesPath(holes: Hole[], diameter: number, top: number, bottom: number, safeZ: number, p: SculptureParams, leadIn?: (b: ToolpathBuilder) => void): Toolpath {
  const builder = new ToolpathBuilder({ x: 0, y: 0, z: safeZ })
  leadIn?.(builder)
  for (const hole of holes) boreHole(builder, hole, diameter, top, bottom, safeZ, p)
  return builder.build()
}

function holesBody(toolpath: Toolpath, p: SculptureParams): string[] {
  return toolpathToGcode(toolpath, {
    feeds: { cut: p.feed, plunge: p.plungeRate },
    interpolation: 'arc',
    leadInRapid: false,
  })
}

function holeListComments(holes: Hole[]): string[] {
  return holes.map((h) => `Hole ${h.id} (${h.kind}): X${fmt(h.x)} Y${fmt(h.y)}`)
}

// The master set, or a layer's own set when `label` names it (master minus the
// holes that would bite into that layer).
export function holesFile(holes: Hole[], label: string, p: SculptureParams, machine: MachineSettings): GcodeFile {
  const safeZ = safeZFor(p)
  const toolpath = holesPath(holes, p.holeDiameter, 0, cutBottom(p), safeZ, p)
  return {
    content: program([label, ...holeListComments(holes), PLATE_ZERO], safeZ, holesBody(toolpath, p), machine),
    toolpath,
    safeZ,
  }
}

export function holesGcode(holes: Hole[], label: string, p: SculptureParams, machine: MachineSettings): string {
  return holesFile(holes, label, p, machine).content
}

// Run once with nothing but the fixture board on the table: bores for the
// threaded inserts, and a shallow mark at X0 Y0 to find the zero again.
export function fixtureFile(holes: Hole[], p: SculptureParams, machine: MachineSettings): GcodeFile {
  const safeZ = p.safeAbove
  const toolpath = holesPath(holes, p.insertDiameter, 0, -p.insertDepth, safeZ, p, (builder) => {
    builder.zTo('rapid', 1)
    builder.zTo('plunge', -1)
    builder.zTo('rapid', safeZ)
  })
  const content = program(
    [
      'Fixture',
      ...holeListComments(holes),
      `Set inserts at least ${fmt(p.insertRecess)} mm below the surface`,
      'Mark at X0 Y0 = XY zero for every later file; Z0 = top of this board (later files: top of each plate)',
    ],
    safeZ,
    holesBody(toolpath, p),
    machine,
  )
  return { content, toolpath, safeZ }
}

export function fixtureGcode(holes: Hole[], p: SculptureParams, machine: MachineSettings): string {
  return fixtureFile(holes, p, machine).content
}

// The hub spacer is cut like a layer from a plate as thick as the gap: its
// holes first (only those inside the hub), screwed on through them, then the
// disc. Tabs only when they fit in that plate.
function hubSpacerParams(p: SculptureParams): SculptureParams {
  return { ...p, thickness: p.gap, tabCount: p.tabHeight < p.gap ? p.tabCount : 0 }
}

export function hubSpacerHoles(holes: Hole[], p: SculptureParams): Hole[] {
  return holes.filter((h) => Math.hypot(h.x - p.hubX, h.y - p.hubY) < p.hubDiameter / 2)
}

function hubSpacerLayer(p: SculptureParams): Layer {
  const disc = circlePiece(p.hubX, p.hubY, p.hubDiameter / 2)
  return {
    number: 1,
    zBottom: 0,
    zPlane: 0,
    region: [disc],
    section: [disc],
    hub: [],
    bridges: [],
    bounds: regionBounds([disc]) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    openChains: 0,
    removedPieces: 0,
  }
}

export function hubSpacerFiles(holes: Hole[], count: number, p: SculptureParams, machine: MachineSettings): { holes: GcodeFile; contour: GcodeFile } {
  const q = hubSpacerParams(p)
  const layer = hubSpacerLayer(p)
  const inside = hubSpacerHoles(holes, p)
  const safeZ = safeZFor(q)
  const toolpath = contourPath(layer, safeZ, q)
  const content = program(
    [
      `Hub spacer, ${count} pieces, plate ${fmt(p.gap)} mm`,
      ...blankComments(layer, q),
      `Screws: ${inside.length > 0 ? inside.map((h) => h.id).join(', ') : 'none'}`,
      PLATE_ZERO,
    ],
    safeZ,
    contourBody(toolpath, q),
    machine,
  )
  return {
    holes: holesFile(inside, `Hub spacer holes (${count} spacers, plate ${fmt(p.gap)} mm)`, q, machine),
    contour: { content, toolpath, safeZ },
  }
}

export function hubSpacerGcode(holes: Hole[], count: number, p: SculptureParams, machine: MachineSettings): { holes: string; contour: string } {
  const files = hubSpacerFiles(holes, count, p, machine)
  return { holes: files.holes.content, contour: files.contour.content }
}

export type FileKind = 'fixture' | 'holes' | 'layer' | 'layerHoles' | 'spacerHoles' | 'spacer'

// The plate a file is cut from, as the preview draws it: the region it ends up
// as, and the stock around it. The fixture is cut into the board itself.
export interface FilePlate {
  region: Region
  thickness: number
  blank: { width: number; height: number; centerX: number; centerY: number }
}

// Every G-code file of the ZIP in its order, built only when asked for: the
// preview builds the one it shows, Generate all of them.
export interface FileEntry {
  name: string
  kind: FileKind
  // The layer it belongs to, for the layer files.
  layer?: number
  plate: FilePlate | null
  build: () => GcodeFile
}

export function gcodeFiles(layers: Layer[], analyses: LayerHoles[], holes: Hole[], p: SculptureParams, machine: MachineSettings): FileEntry[] {
  const pad = (n: number) => String(n).padStart(3, '0')
  const plate = (layer: Layer, q: SculptureParams): FilePlate => ({ region: toolRegion(layer, q), thickness: q.thickness, blank: layerBlank(layer, q) })
  const entries: FileEntry[] = [
    { name: 'fixture.gcode', kind: 'fixture', plate: null, build: () => fixtureFile(holes, p, machine) },
    { name: 'holes.gcode', kind: 'holes', plate: null, build: () => holesFile(holes, 'All holes', p, machine) },
  ]
  layers.forEach((l, i) => {
    entries.push({
      name: `layer-${pad(l.number)}.gcode`,
      kind: 'layer',
      layer: l.number,
      plate: plate(l, p),
      build: () => layerFile(l, analyses[i], layers.length, p, machine, holes),
    })
    if (analyses[i].conflictIds.length > 0) {
      const own = holes.filter((h) => !analyses[i].conflictIds.includes(h.id))
      entries.push({
        name: `layer-${pad(l.number)}-holes.gcode`,
        kind: 'layerHoles',
        layer: l.number,
        plate: plate(l, p),
        build: () => holesFile(own, `Holes for layer ${l.number}`, p, machine),
      })
    }
  })
  if (p.hub && p.gap > 0 && layers.length > 1) {
    const q = hubSpacerParams(p)
    const spacer = plate(hubSpacerLayer(p), q)
    let files: ReturnType<typeof hubSpacerFiles> | null = null
    const spacerFiles = () => (files ??= hubSpacerFiles(holes, layers.length - 1, p, machine))
    entries.push(
      { name: 'hub-spacer-holes.gcode', kind: 'spacerHoles', plate: spacer, build: () => spacerFiles().holes },
      { name: 'hub-spacer.gcode', kind: 'spacer', plate: spacer, build: () => spacerFiles().contour },
    )
  }
  return entries
}

export function mountingCard(layers: Layer[], analyses: LayerHoles[], holes: Hole[], p: SculptureParams): string {
  const lines = [
    'SculptureTool mounting card',
    `${layers.length} layers, plate ${fmt(p.thickness)} mm, gap ${fmt(p.gap)} mm, tool ${fmt(p.toolDiameter)} mm`,
    '',
    'Holes (X0 Y0 = fixture center):',
    ...holes.map((h) => {
      const range = h.from !== undefined || h.to !== undefined ? `  layers ${h.from ?? 1}-${h.to ?? layers.length}` : ''
      return `  ${h.id}  ${h.kind.padEnd(6)}  X${fmt(h.x)}  Y${fmt(h.y)}${range}${h.cut ? '  cut with contour' : ''}`
    }),
    '',
    'Layers:',
  ]
  layers.forEach((layer, i) => {
    const blank = layerBlank(layer, p)
    const a = analyses[i]
    const parts = [
      `  ${String(layer.number).padStart(3, '0')}`,
      `plate ${blank.width}x${blank.height} at X${blank.centerX} Y${blank.centerY}`,
      `screws ${a.mountIds.length > 0 ? a.mountIds.join(',') : 'none'}`,
    ]
    if (a.conflictIds.length > 0) parts.push(`OWN HOLES FILE (skips ${a.conflictIds.join(',')})`)
    if (a.cutIds.length > 0) parts.push(`holes ${a.cutIds.join(',')} cut with the contour`)
    if (a.unheldPieces.length > 0) parts.push(`${a.unheldPieces.length} piece(s) on tabs only`)
    lines.push(parts.join(' | '))
  })
  if (p.hub) {
    lines.push('', `Hub: diameter ${fmt(p.hubDiameter)} mm at X${fmt(p.hubX)} Y${fmt(p.hubY)}; cut its bridges only after gluing.`)
    if (p.gap > 0 && layers.length > 1) {
      lines.push(
        `Hub spacers: ${layers.length - 1} pieces from a ${fmt(p.gap)} mm plate (hub-spacer-holes.gcode, then hub-spacer.gcode), one between every two hubs.`,
      )
    }
  }
  return lines.join('\n') + '\n'
}
