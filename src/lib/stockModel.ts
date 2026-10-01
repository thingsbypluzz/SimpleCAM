import polygonClipping, { type MultiPolygon, type Polygon, type Ring } from 'polygon-clipping'
import type { Point2D, WizardParams } from '../types/wizard'
import { onLineCircleEdges } from './outlineCircle'
import { onLineRectDimensions, rectCorners } from './outlineRectangleGeometry'
import { pocketCenter } from './pocketGeometry'
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
// Surface is not part of the model (null): it draws its own "remaining
// material" block.
function stockFeatures(params: WizardParams, grid: number): StockFeatures | null {
  if (params.operation === 'surface') return null
  const ring = (v: SheetVoid) => outlineRing(v, grid)
  if (params.operation === 'pocket') {
    const depth = params.pocket.totalDepth
    return {
      islands: [],
      voids: pocketVoids(params.pocket)
        .filter((v) => !isDegenerate(v))
        .map((v) => ({ region: [ring(v)], depth, floor: true })),
      part: false,
    }
  }
  if (params.operation === 'outline') {
    const { outline } = params
    const depth = outline.totalDepth
    const edge = (radius: number, width: number, height: number): SheetVoid =>
      outline.shape === 'circle'
        ? { circle: { x: outline.offsetX, y: outline.offsetY }, radius }
        : { polygon: rectCorners(outline.shape, outline.width, outline.height, width, height, outline.offsetX, outline.offsetY, 'ccw') }
    const nominal = edge(outline.diameter / 2, outline.width, outline.height)
    if (outline.offsetMode === 'inside') {
      return { islands: [], voids: isDegenerate(nominal) ? [] : [{ region: [ring(nominal)], depth, floor: false }], part: false }
    }
    if (outline.offsetMode === 'outside') {
      return { islands: isDegenerate(nominal) ? [] : [{ region: [ring(nominal)], depth }], voids: [], part: true }
    }
    // On-line: the tool-wide band between the two edges is cut away, the
    // inner island stays (none when the tool is as wide as the shape).
    const { innerRadius, outerRadius } = onLineCircleEdges(outline)
    const rect = onLineRectDimensions(outline.width, outline.height, outline.toolDiameter)
    const inner = edge(innerRadius, rect.innerWidth, rect.innerHeight)
    const outer = edge(outerRadius, rect.outerWidth, rect.outerHeight)
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

function buildModel(presets: readonly WizardParams[], sheet: SheetRect, grid: number): StockModel | null {
  const features = presets.map((params) => stockFeatures(params, grid)).filter((f): f is StockFeatures => f !== null)
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

  const reaching = (depth: number) => unionAll(voids.filter((v) => v.depth >= depth).map((v) => v.region))
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

    const pockets = unionAll(voids.filter((v) => v.floor && v.depth === depth).map((v) => v.region))
    const cutThrough = unionAll(voids.filter((v) => v.depth > depth || (v.depth === depth && !v.floor)).map((v) => v.region))
    const floor = intersect(subtract(pockets, cutThrough), material)
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
// only). When polygon-clipping gives up on an input, the next coarser grid
// is tried; null — no stock drawn — if every grid fails, which beats
// taking the preview down.
export function stockModel(presets: readonly WizardParams[], sheet: SheetRect): StockModel | null {
  let failure: unknown
  for (const grid of SNAP_GRIDS) {
    try {
      return buildModel(presets, sheet, grid)
    } catch (error) {
      failure = error
    }
  }
  console.warn('Stock model failed', failure)
  return null
}
