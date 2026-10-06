import polygonClipping, { type MultiPolygon, type Polygon, type Ring } from 'polygon-clipping'
import type { Point2D, WizardParams } from '../types/wizard'
import { onLineCircleEdges } from './outlineCircle'
import { insetLoop, lobedInsideLoop, lobedUnionLoop, loopPolygon, translateLoop, type Loop } from './outlineLobedGeometry'
import { onLineRectDimensions, rectCorners, rectToolDimensions } from './outlineRectangleGeometry'
import { pocketCenter, pocketRectWallHalfDims } from './pocketGeometry'
import { cellLoop, isLightenedShape, lightenedCells } from './pocketLightened'
import { resolvePoints } from './positioning'

// A closed outline in CNC (x, y) — a circle or a polygon.
export type SheetVoid = { circle: Point2D; radius: number } | { polygon: Point2D[] }

// A Pocket's voids: its nominal boundary, or — Lightened (OP-6) — every
// cell's nominal outline (sharp corners, like the Rectangle's), leaving the
// ribs, rim and hub as material.
export function pocketVoids(pocket: WizardParams['pocket']): SheetVoid[] {
  if (isLightenedShape(pocket.shape)) {
    return lightenedCells(pocket)
      .map((cell) => cellLoop(cell, 0))
      .filter((polygon) => polygon.length >= 3)
      .map((polygon) => ({ polygon }))
  }
  const c = pocketCenter(pocket)
  if (pocket.shape === 'circle') return [{ circle: c, radius: pocket.diameter / 2 }]
  const hw = pocket.width / 2
  const hh = pocket.height / 2
  return [
    {
      polygon: [
        { x: c.x - hw, y: c.y - hh },
        { x: c.x + hw, y: c.y - hh },
        { x: c.x + hw, y: c.y + hh },
        { x: c.x - hw, y: c.y + hh },
      ],
    },
  ]
}

// Corner arcs of a cut contour are coarser than the app's 5° curves: the
// radius is a tool's, so the chord error stays in the hundredths of a mm,
// and a Lightened pocket rounds thousands of corners for the booleans.
const CORNER_STEP_RAD = (15 * Math.PI) / 180

// `loop` (CCW, not closed) moved outward by r, the way a tool of radius r
// whose center walks the loop leaves the wall: an arc of radius r around
// every convex corner, the offset edges' intersection at a concave or
// barely turning one (a sector cell's hub arc, the 5° steps of its outer
// arc).
export function roundedOffsetLoop(loop: Point2D[], r: number): Point2D[] {
  const points = loop.filter((p, i) => {
    const q = loop[(i + 1) % loop.length]
    return Math.hypot(q.x - p.x, q.y - p.y) > 1e-9
  })
  if (points.length < 3 || !(r > 0)) return loop
  const out: Point2D[] = []
  for (let i = 0; i < points.length; i++) {
    const prev = points[(i + points.length - 1) % points.length]
    const v = points[i]
    const next = points[(i + 1) % points.length]
    const inLength = Math.hypot(v.x - prev.x, v.y - prev.y)
    const outLength = Math.hypot(next.x - v.x, next.y - v.y)
    // Outward normals of the edges into and out of the corner.
    const n1 = { x: (v.y - prev.y) / inLength, y: -(v.x - prev.x) / inLength }
    const n2 = { x: (next.y - v.y) / outLength, y: -(next.x - v.x) / outLength }
    const turn = Math.atan2(n1.x * n2.y - n1.y * n2.x, n1.x * n2.x + n1.y * n2.y)
    if (turn < CORNER_STEP_RAD) {
      const k = r / Math.max(0.1, 1 + n1.x * n2.x + n1.y * n2.y)
      out.push({ x: v.x + (n1.x + n2.x) * k, y: v.y + (n1.y + n2.y) * k })
      continue
    }
    const steps = Math.ceil(turn / CORNER_STEP_RAD)
    const from = Math.atan2(n1.y, n1.x)
    for (let step = 0; step <= steps; step++) {
      const a = from + (turn * step) / steps
      out.push({ x: v.x + r * Math.cos(a), y: v.y + r * Math.sin(a) })
    }
  }
  return out
}

// Rounding multiplies a cell's vertices (a triangle: 3 → about 25) and
// every boolean of the model sweeps all of them: at 300 cells the model
// builds in roughly 200 ms, at 1600 (X-grid 20×20) it would take over
// 700 ms on every edit. Past this count the cells keep their nominal,
// sharp outline.
const MAX_ROUNDED_CELLS = 300

// A Pocket's voids as the tool leaves them (BL-86): the wall its center
// runs along, grown by its radius — every inside corner comes out rounded
// to that radius. A circle already is; a shape the tool does not fit in
// (which validation rejects) stays nominal.
function pocketCutVoids(pocket: WizardParams['pocket']): SheetVoid[] {
  const r = pocket.toolDiameter / 2
  if (!(r > 0) || pocket.shape === 'circle') return pocketVoids(pocket)
  if (isLightenedShape(pocket.shape)) {
    const cells = lightenedCells(pocket)
    if (cells.length > MAX_ROUNDED_CELLS) return pocketVoids(pocket)
    return cells
      .map((cell) => {
        const wall = cellLoop(cell, r)
        return wall.length >= 3 ? roundedOffsetLoop(wall, r) : cellLoop(cell, 0)
      })
      .filter((polygon) => polygon.length >= 3)
      .map((polygon) => ({ polygon }))
  }
  const { halfWidth, halfHeight } = pocketRectWallHalfDims(pocket)
  if (!(halfWidth > 0 && halfHeight > 0)) return pocketVoids(pocket)
  const c = pocketCenter(pocket)
  return [
    {
      polygon: roundedOffsetLoop(
        [
          { x: c.x - halfWidth, y: c.y - halfHeight },
          { x: c.x + halfWidth, y: c.y - halfHeight },
          { x: c.x + halfWidth, y: c.y + halfHeight },
          { x: c.x - halfWidth, y: c.y + halfHeight },
        ],
        r,
      ),
    },
  ]
}

// Lobed Circle (OP-8), in the shape's place on the sheet.
function lobedPolygon(outline: WizardParams['outline'], loop: Loop | null): Point2D[] {
  return loop ? loopPolygon(translateLoop(loop, outline.offsetX, outline.offsetY)) : []
}

// Lobed Circle cut Outside: the part the tool actually leaves — its path
// (the circles grown by the tool radius) inset by the tool radius, which
// rounds every notch between the main circle and a lobe and fills a gap
// the tool can't enter. Null for the other modes: Inside leaves the nominal
// outline, On-line's band is drawn from the tool path either way.
function lobedCutEdge(outline: WizardParams['outline']): Point2D[] | null {
  const r = outline.toolDiameter / 2
  if (outline.offsetMode !== 'outside' || !(r > 0)) return null
  const polygon = lobedPolygon(outline, insetLoop(lobedUnionLoop(outline, r), r))
  return polygon.length >= 3 ? polygon : null
}

// Rectangle Outline's one edge the tool rounds (BL-86): Inside — the void
// (tool path grown by the tool radius); On-line — the band's outer edge
// (the nominal rectangle grown by it; the inner island keeps its sharp
// corners). Null where nothing changes: Outside (the tool goes around the
// part's corners), a circle, a tool that does not fit. The Lobed Circle has
// its own rule (lobedCutEdge()).
function outlineCutEdge(outline: WizardParams['outline']): Point2D[] | null {
  const r = outline.toolDiameter / 2
  if (outline.shape === 'lobedCircle') return lobedCutEdge(outline)
  if (outline.shape === 'circle') return null
  if (outline.offsetMode === 'outside' || !(r > 0)) return null
  const { toolWidth, toolHeight } = rectToolDimensions(outline.width, outline.height, outline.toolDiameter, outline.offsetMode)
  if (!(toolWidth > 0 && toolHeight > 0)) return null
  return roundedOffsetLoop(
    rectCorners(outline.shape, outline.width, outline.height, toolWidth, toolHeight, outline.offsetX, outline.offsetY, 'ccw'),
    r,
  )
}

// The contours of a preset that differ from its nominal ones once the tool
// radius is accounted for — what the 2D Preview dots next to the nominal
// outline. Empty where the cut shape is the nominal one.
export function cutContours(params: WizardParams): Point2D[][] {
  if (params.operation === 'pocket') {
    const { pocket } = params
    if (pocket.shape === 'circle' || !(pocket.toolDiameter > 0)) return []
    if (isLightenedShape(pocket.shape) && lightenedCells(pocket).length > MAX_ROUNDED_CELLS) return []
    return pocketCutVoids(params.pocket).flatMap((v) => ('polygon' in v ? [v.polygon] : []))
  }
  if (params.operation === 'outline') {
    const edge = outlineCutEdge(params.outline)
    return edge ? [edge] : []
  }
  return []
}

// Same density as every G1-approximated circle in the app (72 per turn).
const CIRCLE_SEGMENTS = 72

// Coordinates are snapped to a grid of 1/`grid` mm: polygon-clipping gives
// up ("Unable to complete output ring") on edges that almost coincide —
// floating-point noise between presets that share an origin or an edge —
// and copes once they coincide exactly.
function outlineRing(v: SheetVoid, grid: number): Ring {
  const snap = (value: number) => Math.round(value * grid) / grid
  if ('circle' in v) {
    return Array.from({ length: CIRCLE_SEGMENTS }, (_, i) => {
      const a = (2 * Math.PI * i) / CIRCLE_SEGMENTS
      return [snap(v.circle.x + v.radius * Math.cos(a)), snap(v.circle.y + v.radius * Math.sin(a))] as [number, number]
    })
  }
  return v.polygon.map((p) => [snap(p.x), snap(p.y)] as [number, number])
}

// Nothing to cut or keep: a zero-radius circle, a polygon without area.
function isDegenerate(v: SheetVoid): boolean {
  if ('circle' in v) return !(v.radius > 0)
  const xs = v.polygon.map((p) => p.x)
  const ys = v.polygon.map((p) => p.y)
  return v.polygon.length < 3 || !(Math.max(...xs) > Math.min(...xs)) || !(Math.max(...ys) > Math.min(...ys))
}

interface StockIsland {
  region: Polygon
  depth: number
}

interface StockVoid {
  region: Polygon
  depth: number
  // A Pocket keeps a floor at −depth; everything else is cut through.
  floor: boolean
}

interface StockFeatures {
  islands: StockIsland[]
  voids: StockVoid[]
  // Outline Outside: a part of its own, with no stock around it.
  part: boolean
}

// What one preset means for the material, by the physical sense of its
// operation — the one place the previews' stock branches on the operation.
// Surface and Facing are not part of the model (null): each draws its own
// "remaining material" block. `cutShape` (BL-86) swaps the nominal contours for the
// ones the tool actually leaves.
function stockFeatures(params: WizardParams, grid: number, cutShape: boolean): StockFeatures | null {
  if (params.operation === 'surface' || params.operation === 'facing') return null
  const ring = (v: SheetVoid) => outlineRing(v, grid)
  if (params.operation === 'pocket') {
    const depth = params.pocket.totalDepth
    return {
      islands: [],
      voids: (cutShape ? pocketCutVoids(params.pocket) : pocketVoids(params.pocket))
        .filter((v) => !isDegenerate(v))
        .map((v) => ({ region: [ring(v)], depth, floor: true })),
      part: false,
    }
  }
  if (params.operation === 'outline') {
    const { outline } = params
    const depth = outline.totalDepth
    if (outline.shape === 'lobedCircle') {
      const r = outline.toolDiameter / 2
      const nominal: SheetVoid = { polygon: lobedPolygon(outline, lobedUnionLoop(outline, 0)) }
      if (isDegenerate(nominal)) return { islands: [], voids: [], part: false }
      if (outline.offsetMode === 'inside') return { islands: [], voids: [{ region: [ring(nominal)], depth, floor: false }], part: false }
      if (outline.offsetMode === 'outside') {
        const cut = cutShape ? lobedCutEdge(outline) : null
        return { islands: [{ region: [ring(cut ? { polygon: cut } : nominal)], depth }], voids: [], part: true }
      }
      // On-line: the band the tool removes, from the outline grown by the
      // tool radius in to the outline inset by it (no island when the
      // tool doesn't fit inside).
      const outer: SheetVoid = { polygon: lobedPolygon(outline, lobedUnionLoop(outline, r)) }
      const inner: SheetVoid = { polygon: lobedPolygon(outline, lobedInsideLoop(outline, r)) }
      const hasInner = !isDegenerate(inner)
      return {
        islands: hasInner ? [{ region: [ring(inner)], depth }] : [],
        voids: [{ region: hasInner ? [ring(outer), ring(inner)] : [ring(outer)], depth, floor: false }],
        part: false,
      }
    }
    const shape = outline.shape
    const edge = (radius: number, width: number, height: number): SheetVoid =>
      shape === 'circle'
        ? { circle: { x: outline.offsetX, y: outline.offsetY }, radius }
        : { polygon: rectCorners(shape, outline.width, outline.height, width, height, outline.offsetX, outline.offsetY, 'ccw') }
    const nominal = edge(outline.diameter / 2, outline.width, outline.height)
    const cutEdge = cutShape ? outlineCutEdge(outline) : null
    if (outline.offsetMode === 'inside') {
      const cut: SheetVoid = cutEdge ? { polygon: cutEdge } : nominal
      return { islands: [], voids: isDegenerate(cut) ? [] : [{ region: [ring(cut)], depth, floor: false }], part: false }
    }
    if (outline.offsetMode === 'outside') {
      return { islands: isDegenerate(nominal) ? [] : [{ region: [ring(nominal)], depth }], voids: [], part: true }
    }
    // On-line: the tool-wide band between the two edges is cut away, the
    // inner island stays (none when the tool is as wide as the shape).
    const { innerRadius, outerRadius } = onLineCircleEdges(outline)
    const rect = onLineRectDimensions(outline.width, outline.height, outline.toolDiameter)
    const inner = edge(innerRadius, rect.innerWidth, rect.innerHeight)
    const outer: SheetVoid = cutEdge ? { polygon: cutEdge } : edge(outerRadius, rect.outerWidth, rect.outerHeight)
    if (isDegenerate(outer)) return { islands: [], voids: [], part: false }
    const hasInner = !isDegenerate(inner)
    return {
      islands: hasInner ? [{ region: [ring(inner)], depth }] : [],
      voids: [{ region: hasInner ? [ring(outer), ring(inner)] : [ring(outer)], depth, floor: false }],
      part: false,
    }
  }
  const { geometry } = params
  const radius = geometry.holeDiameter / 2
  return {
    islands: [],
    voids:
      radius > 0
        ? resolvePoints(geometry).map((p) => ({ region: [ring({ circle: p, radius })], depth: geometry.totalDepth, floor: false }))
        : [],
    part: false,
  }
}

export interface SheetRect {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

// One horizontal face of the material: a region at a Z level (≤ 0).
export interface StockFace {
  z: number
  region: MultiPolygon
}

// A band of vertical faces: every ring of `region`, from zTop down to zBottom.
export interface StockWallBand {
  zTop: number
  zBottom: number
  region: MultiPolygon
}

// The material left by a set of presets (BL-77) — one preset for the live
// pattern, every overlaid preset in Overlay. All of it is prisms with
// vertical walls, so the whole solid comes from 2D booleans on its
// cross-sections.
export interface StockModel {
  // The uncut face at Z0.
  top: MultiPolygon
  // Pocket floors, shallowest first.
  floors: StockFace[]
  walls: StockWallBand[]
  // The underside — only for a part (`solid`), whose thickness is known.
  bottom: StockFace | null
  // true: the material is the Outline Outside part(s), a closed solid with
  // outer walls. false: the stock sheet, of unknown thickness and without
  // walls on its own edge.
  solid: boolean
}

function unionAll(regions: Polygon[]): MultiPolygon {
  if (regions.length === 0) return []
  return polygonClipping.union(regions[0], ...regions.slice(1))
}

function subtract(from: MultiPolygon, cut: MultiPolygon): MultiPolygon {
  if (from.length === 0 || cut.length === 0) return from
  return polygonClipping.difference(from, cut)
}

function intersect(a: MultiPolygon, b: MultiPolygon): MultiPolygon {
  if (a.length === 0 || b.length === 0) return []
  return polygonClipping.intersection(a, b)
}

function buildModel(presets: readonly WizardParams[], sheet: SheetRect, grid: number, cutShape: boolean): StockModel | null {
  const features = presets.map((params) => stockFeatures(params, grid, cutShape)).filter((f): f is StockFeatures => f !== null)
  if (features.length === 0) return null

  // The material before any void: the parts, when a preset cuts one out
  // (every island then joins it), otherwise the sheet — where an On-line
  // island is simply what its band leaves standing.
  const solid = features.some((f) => f.part)
  const islands = features.flatMap((f) => f.islands)
  const material: MultiPolygon = solid
    ? unionAll(islands.map((i) => i.region))
    : [
        [
          [
            [sheet.minX, sheet.minY],
            [sheet.maxX, sheet.minY],
            [sheet.maxX, sheet.maxY],
            [sheet.minX, sheet.maxY],
          ],
        ],
      ]
  // A part's cut depth is its thickness: nothing reaches below it, and a
  // pocket that deep has no floor left.
  const thickness = solid ? Math.max(0, ...islands.map((i) => i.depth)) : Infinity
  const voids = features
    .flatMap((f) => f.voids)
    .filter((v) => v.depth > 0)
    .map((v) => ({ ...v, depth: Math.min(v.depth, thickness), floor: v.floor && v.depth < thickness }))

  // Each boolean sweeps every vertex of every void — a Lightened pocket has
  // thousands — so a union is computed once per depth and reused.
  const unions = new Map<number, MultiPolygon>()
  const reaching = (depth: number) => {
    let union = unions.get(depth)
    if (!union) {
      union = unionAll(voids.filter((v) => v.depth >= depth).map((v) => v.region))
      unions.set(depth, union)
    }
    return union
  }
  // The material's cross-section in the band ending at `depth`.
  const section = (depth: number) => subtract(material, reaching(depth))

  const depths = [...new Set(voids.map((v) => v.depth))].sort((a, b) => a - b)
  const walls: StockWallBand[] = []
  const floors: StockFace[] = []
  let above = 0
  for (const depth of depths) {
    // The sheet's own edge is not a wall, so its bands follow the voids.
    walls.push({ zTop: -above, zBottom: -depth, region: solid ? section(depth) : reaching(depth) })
    above = depth

    // A floor: the pockets ending here, less whatever goes deeper or
    // through. Nothing does in the common case — then it is the union
    // already at hand. The sheet contains every void, so only a part
    // needs the floor clipped to it.
    const pockets = voids.filter((v) => v.floor && v.depth === depth)
    const cutThrough = voids.filter((v) => v.depth > depth || (v.depth === depth && !v.floor))
    if (pockets.length === 0) continue
    const open =
      cutThrough.length === 0
        ? reaching(depth)
        : subtract(unionAll(pockets.map((v) => v.region)), unionAll(cutThrough.map((v) => v.region)))
    const floor = solid ? intersect(open, material) : open
    if (floor.length > 0) floors.push({ z: -depth, region: floor })
  }
  if (solid && above < thickness) walls.push({ zTop: -above, zBottom: -thickness, region: material })

  return {
    top: depths.length > 0 ? section(depths[0]) : material,
    floors,
    walls: walls.filter((w) => w.region.length > 0),
    bottom: solid ? { z: -thickness, region: section(thickness) } : null,
    solid,
  }
}

// Snapping grids tried in turn, in steps per mm — from invisible (1 nm)
// to still far below anything a preview can show (10 µm).
const SNAP_GRIDS = [1e6, 1e4, 1e3, 1e2]

// The stock of `presets` within `sheet` (the previews' stock sheet,
// stockSheetRect()); null when no preset has stock of this kind (Surface
// only). `cutShape`: voids as the tool leaves them (inside corners rounded
// to its radius) instead of the nominal shapes. When polygon-clipping gives up on an input, the next coarser grid
// is tried; null — no stock drawn — if every grid fails, which beats
// taking the preview down.
export function stockModel(presets: readonly WizardParams[], sheet: SheetRect, cutShape = false): StockModel | null {
  let failure: unknown
  for (const grid of SNAP_GRIDS) {
    try {
      return buildModel(presets, sheet, grid, cutShape)
    } catch (error) {
      failure = error
    }
  }
  console.warn('Stock model failed', failure)
  return null
}
