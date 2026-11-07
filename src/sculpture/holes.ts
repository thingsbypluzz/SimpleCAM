import type { Point2D } from '../types/wizard'
import {
  type Piece,
  type Region,
  circlePiece,
  distanceToBoundary,
  intersect,
  offset,
  pieceArea,
  pieceContains,
  regionBounds,
  regionContains,
} from './geometry'
import type { Layer } from './layers'
import type { SculptureParams } from './params'

// One master set of holes for the whole sculpture, drilled in every plate and
// matching threaded inserts in the fixture. `rod` holes run through every
// layer; `island` holes hold a piece the rods miss, such as a separated arm.
export type HoleKind = 'rod' | 'island'

export interface Hole {
  id: number
  x: number
  y: number
  kind: HoleKind
  // Layer numbers (inclusive) the rod runs through; unset = from the first or
  // to the last. Outside this range the master file still drills the hole, it
  // just carries no screw.
  from?: number
  to?: number
  // On: the layer's contour file bores it too, before the contour, in the
  // layers of its range where it lies inside the layer. The tool would hit a
  // screw there, so in those layers it holds none. Unset = off.
  cut?: boolean
}

type PlacedHole = Point2D & Pick<Hole, 'from' | 'to' | 'cut'>

export function holeInRange(hole: PlacedHole, layerNumber: number): boolean {
  return (hole.from === undefined || layerNumber >= hole.from) && (hole.to === undefined || layerNumber <= hole.to)
}


// mount    — inside the layer, screw goes here
// empty    — inside the layer, too close to an edge for a screw head
// waste    — outside the layer, in the offcut
// conflict — the hole would bite into the layer's edge
export type HoleState = 'mount' | 'empty' | 'waste' | 'conflict'

export interface LayerHoles {
  states: Map<number, HoleState>
  mountIds: number[]
  conflictIds: number[]
  // Holes with Cut on that this layer's contour file bores.
  cutIds: number[]
  // Pieces (by index in layer.region) no screw reaches: only tabs hold them.
  unheldPieces: number[]
}

// Distance a screw needs from the section's edge. The tool runs entirely
// outside the section, so only the head and the wall matter.
export function screwClearance(p: SculptureParams): number {
  return Math.max(p.holeDiameter / 2 + p.minWall, p.headDiameter / 2 + 1)
}

export function holeState(layer: Layer, hole: PlacedHole, p: SculptureParams): HoleState {
  const radius = p.holeDiameter / 2
  const distance = distanceToBoundary(layer.region, hole)
  if (!regionContains(layer.region, hole)) return distance >= radius ? 'waste' : 'conflict'
  if (distance < radius + p.minWall) return 'conflict'
  const inRange = holeInRange(hole, layer.number)
  return distance >= p.headDiameter / 2 + 1 && inRange && !hole.cut ? 'mount' : 'empty'
}

export function analyzeLayer(layer: Layer, holes: Hole[], p: SculptureParams): LayerHoles {
  const states = new Map<number, HoleState>()
  const mountIds: number[] = []
  const conflictIds: number[] = []
  const cutIds: number[] = []
  for (const hole of holes) {
    const state = holeState(layer, hole, p)
    states.set(hole.id, state)
    if (state === 'mount') mountIds.push(hole.id)
    if (state === 'conflict') conflictIds.push(hole.id)
    // Only where the hole lies inside the layer: in the offcut it would only
    // cost time, on the edge it would bite into it.
    if (hole.cut === true && holeInRange(hole, layer.number) && state === 'empty') cutIds.push(hole.id)
  }
  const mounts = holes.filter((h) => states.get(h.id) === 'mount')
  const unheldPieces: number[] = []
  layer.region.forEach((piece, index) => {
    if (!mounts.some((h) => pieceContains(piece, h))) unheldPieces.push(index)
  })
  return { states, mountIds, conflictIds, cutIds, unheldPieces }
}

function samplePoints(region: Region, maxPerAxis: number): Point2D[] {
  const bounds = regionBounds(region)
  if (!bounds) return []
  const step = Math.max(Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / maxPerAxis, 0.5)
  const points: Point2D[] = []
  for (let x = bounds.minX; x <= bounds.maxX; x += step) {
    for (let y = bounds.minY; y <= bounds.maxY; y += step) {
      if (regionContains(region, { x, y })) points.push({ x, y })
    }
  }
  // A region thinner than the grid still has its own vertices.
  if (points.length === 0) for (const piece of region) points.push(...piece.outer)
  return points
}

// The point of a region farthest from its edge.
export function deepestPoint(region: Region): Point2D | null {
  let best: Point2D | null = null
  let bestDistance = -1
  for (const point of samplePoints(region, 30)) {
    const d = distanceToBoundary(region, point)
    if (d > bestDistance) {
      bestDistance = d
      best = point
    }
  }
  return best
}

const dist = (a: Point2D, b: Point2D) => Math.hypot(a.x - b.x, a.y - b.y)

// True when turning the pattern half a turn lands every point on another one
// (within `tolerance`): a plate would then fit the fixture rotated. One rod and
// two rods always do.
export function canMountRotated(points: Point2D[], tolerance: number): boolean {
  if (points.length === 0) return false
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length
  const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length
  return points.every((p) => points.some((q) => Math.hypot(2 * cx - p.x - q.x, 2 * cy - p.y - q.y) <= tolerance))
}

function widestPair(points: Point2D[]): [Point2D, Point2D, number] {
  let a = points[0]
  let b = points[0]
  let widest = 0
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const d = dist(points[i], points[j])
      if (d > widest) {
        widest = d
        a = points[i]
        b = points[j]
      }
    }
  }
  return [a, b, widest]
}

// The third rod: the largest triangle with three clearly different sides, so
// the plate has one way on. Failing that, any triangle far enough apart.
function pickThird(points: Point2D[], a: Point2D, b: Point2D, widest: number, minSpacing: number): Point2D | null {
  const triangleArea = (q: Point2D) => Math.abs((b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x)) / 2
  const spaced = points.filter((q) => Math.min(dist(q, a), dist(q, b)) >= minSpacing && triangleArea(q) > 0)
  const scalene = spaced.filter((q) => {
    const da = dist(q, a)
    const db = dist(q, b)
    return Math.abs(da - db) >= 0.1 * widest && Math.abs(widest - Math.max(da, db)) >= 0.1 * widest
  })
  const pool = scalene.length > 0 ? scalene : spaced
  let best: Point2D | null = null
  let bestArea = 0
  for (const q of pool) {
    const area = triangleArea(q)
    if (area > bestArea) {
      bestArea = area
      best = q
    }
  }
  return best
}

// Up to `count` rods as widely spread as the common area allows; fewer when no
// further rod keeps its distance from the others. Beyond three, each new rod
// goes where it is farthest from the rest, and the last one avoids a pattern
// that would fit rotated.
function pickRodPoints(common: Region, count: number, minSpacing: number, tolerance: number): Point2D[] {
  if (count <= 0) return []
  const points = samplePoints(common, 30)
  if (points.length === 0) return []
  const [a, b, widest] = widestPair(points)
  if (count === 1 || widest < minSpacing) {
    const deepest = deepestPoint(common)
    return deepest ? [deepest] : []
  }
  const rods = [a, b]
  if (count === 2) return rods
  const third = pickThird(points, a, b, widest, minSpacing)
  if (!third) return rods
  rods.push(third)
  while (rods.length < count) {
    const isLast = rods.length + 1 === count
    let next: Point2D | null = null
    let farthest = minSpacing
    for (const q of points) {
      const nearest = Math.min(...rods.map((r) => dist(q, r)))
      if (nearest < farthest) continue
      if (isLast && canMountRotated([...rods, q], tolerance)) continue
      farthest = nearest
      next = q
    }
    if (!next) break
    rods.push(next)
  }
  return rods
}

// Chains an unheld piece through consecutive layers while an area common to all
// of them remains, and puts one hole there; a bent arm simply gets several.
// Each hole comes with the layers of its chain, so it holds only those.
function islandHoles(layers: Layer[], rods: Point2D[], p: SculptureParams): PlacedHole[] {
  const clearance = screwClearance(p)
  const found: PlacedHole[] = []
  interface Chain {
    last: Piece
    area: Region
    from: number
    to: number
  }
  let open: Chain[] = []
  const close = (chain: Chain) => {
    const point = deepestPoint(chain.area)
    if (point) found.push({ ...point, from: chain.from, to: chain.to })
  }
  for (const layer of layers) {
    const pieces = layer.region.filter((piece) => !rods.some((r) => pieceContains(piece, r)))
    const next: Chain[] = []
    for (const piece of pieces) {
      const shrunk = offset([piece], -clearance)
      if (shrunk.length === 0) continue
      const parentIndex = open.findIndex((c) => intersect([c.last], [piece]).length > 0)
      if (parentIndex >= 0) {
        const parent = open[parentIndex]
        open.splice(parentIndex, 1)
        const common = intersect(parent.area, shrunk)
        if (common.length > 0) {
          next.push({ last: piece, area: common, from: parent.from, to: layer.number })
          continue
        }
        close(parent)
      }
      next.push({ last: piece, area: shrunk, from: layer.number, to: layer.number })
    }
    open.forEach(close)
    open = next
  }
  open.forEach(close)
  return found
}

export interface HoleProposal {
  holes: Hole[]
  // False when no spot is shared by every layer, so no rod can fit.
  hasCommonArea: boolean
}

// With a hub the rods stand in the hub: where every layer leaves room, or, when
// a crescent somewhere takes that room, anywhere in the disc (that layer then
// shows the conflict).
export function proposeHoles(layers: Layer[], p: SculptureParams): HoleProposal {
  if (layers.length === 0) return { holes: [], hasCommonArea: false }
  const clearance = screwClearance(p)
  const disc = p.hub ? offset([circlePiece(p.hubX, p.hubY, p.hubDiameter / 2)], -clearance) : null
  let common = disc ?? offset(layers[0].region, -clearance)
  for (const layer of disc ? layers : layers.slice(1)) {
    if (common.length === 0) break
    common = intersect(common, offset(layer.region, -clearance))
  }
  const rodArea = disc && common.length === 0 ? disc : common
  const rods = pickRodPoints(
    [...rodArea].sort((a, b) => pieceArea(b) - pieceArea(a)).slice(0, 1),
    p.rodCount,
    Math.max(3 * p.holeDiameter, p.headDiameter + 4),
    p.holeDiameter,
  )
  const islands = p.islandMode === 'screw' ? islandHoles(layers, rods, p) : []
  const round = (v: number) => Math.round(v * 10) / 10
  const holes: Hole[] = [
    ...rods.map((r) => ({ x: round(r.x), y: round(r.y), kind: 'rod' as const })),
    ...islands.map((r) => ({ x: round(r.x), y: round(r.y), kind: 'island' as const, from: r.from, to: r.to })),
  ].map((h, i) => ({ ...h, id: i + 1 }))
  return { holes, hasCommonArea: rodArea.length > 0 }
}

// Ids stay with their hole for good (the mounting card and the G-code comments
// name them), so a new hole takes the next free number.
export function addHole(holes: Hole[], at: Point2D, kind: HoleKind): Hole[] {
  const id = holes.reduce((max, h) => Math.max(max, h.id), 0) + 1
  return [...holes, { id, x: at.x, y: at.y, kind }]
}

export interface HoleSummary {
  mount: number
  conflict: number
  // Layers whose contour file bores it (Cut on).
  cut: number
}

// How a hole fares over the whole stack: in how many layers it takes a screw,
// and in how many it would bite into the edge.
export function holeSummary(analyses: LayerHoles[], id: number): HoleSummary {
  let mount = 0
  let conflict = 0
  let cut = 0
  for (const a of analyses) {
    const state = a.states.get(id)
    if (state === 'mount') mount++
    if (state === 'conflict') conflict++
    if (a.cutIds.includes(id)) cut++
  }
  return { mount, conflict, cut }
}
