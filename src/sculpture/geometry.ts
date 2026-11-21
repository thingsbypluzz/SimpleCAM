import * as ClipperLib from 'clipper-lib'
import type { Point2D } from '../types/wizard'

// 2D regions for layer cross-sections: every layer is a list of pieces, each
// an outer ring (CCW) with hole rings (CW). All booleans and offsets go through
// Clipper, on integer micrometres. Rings are open: the first point is not
// repeated at the end.

export type Ring = Point2D[]

export interface Piece {
  outer: Ring
  holes: Ring[]
}

export type Region = Piece[]

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

// Turned CCW about X0 Y0 by `degrees`. A turn keeps every ring's direction.
export function turnPoint<T extends Point2D>(p: T, degrees: number): T {
  const a = (degrees * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  return { ...p, x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }
}

// Turned about X0 Y0, then shifted by (dx, dy).
export function placePoint<T extends Point2D>(p: T, degrees: number, dx: number, dy: number): T {
  const q = turnPoint(p, degrees)
  return { ...q, x: q.x + dx, y: q.y + dy }
}

export function placeRegion(region: Region, degrees: number, dx: number, dy: number): Region {
  const ring = (r: Ring) => r.map((p) => placePoint(p, degrees, dx, dy))
  return region.map((piece) => ({ outer: ring(piece.outer), holes: piece.holes.map(ring) }))
}

const SCALE = 1000
// How far a round join may stray from a true arc, in integer units (50 µm).
const ARC_TOLERANCE = 50

function toPath(ring: Ring): ClipperLib.Path {
  return ring.map((p) => ({ X: Math.round(p.x * SCALE), Y: Math.round(p.y * SCALE) }))
}

function fromPath(path: ClipperLib.Path): Ring {
  return path.map((p) => ({ x: p.X / SCALE, y: p.Y / SCALE }))
}

export function ringSignedArea(ring: Ring): number {
  let sum = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

function oriented(ring: Ring, ccw: boolean): Ring {
  return ringSignedArea(ring) > 0 === ccw ? ring : [...ring].reverse()
}

function regionPaths(region: Region): ClipperLib.Paths {
  const paths: ClipperLib.Paths = []
  for (const piece of region) {
    paths.push(toPath(oriented(piece.outer, true)))
    for (const hole of piece.holes) paths.push(toPath(oriented(hole, false)))
  }
  return paths
}

function regionFromTree(tree: ClipperLib.PolyTree): Region {
  const region: Region = []
  const addOuter = (node: ClipperLib.PolyNode) => {
    const holes: Ring[] = []
    for (const hole of node.Childs()) {
      holes.push(oriented(fromPath(hole.Contour()), false))
      for (const inner of hole.Childs()) addOuter(inner)
    }
    region.push({ outer: oriented(fromPath(node.Contour()), true), holes })
  }
  for (const node of tree.Childs()) addOuter(node)
  return region
}

function boolean(clipType: ClipperLib.ClipType, subject: ClipperLib.Paths, clip: ClipperLib.Paths): Region {
  const clipper = new ClipperLib.Clipper()
  clipper.AddPaths(subject, ClipperLib.PolyType.ptSubject, true)
  if (clip.length > 0) clipper.AddPaths(clip, ClipperLib.PolyType.ptClip, true)
  const tree = new ClipperLib.PolyTree()
  clipper.Execute(clipType, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero)
  return regionFromTree(tree)
}

// Rings carry their own direction: CCW adds material and CW takes it away, so
// overlapping shells of one mesh merge while a real cavity stays a hole.
export function regionFromRings(rings: Ring[]): Region {
  return boolean(ClipperLib.ClipType.ctUnion, rings.map(toPath), [])
}

export function union(a: Region, b: Region): Region {
  return boolean(ClipperLib.ClipType.ctUnion, regionPaths(a), regionPaths(b))
}

export function intersect(a: Region, b: Region): Region {
  if (a.length === 0 || b.length === 0) return []
  return boolean(ClipperLib.ClipType.ctIntersection, regionPaths(a), regionPaths(b))
}

export function difference(a: Region, b: Region): Region {
  if (a.length === 0) return []
  return boolean(ClipperLib.ClipType.ctDifference, regionPaths(a), regionPaths(b))
}

// Grows (delta > 0) or shrinks (delta < 0) with round joins. Growing closes any
// inlet narrower than 2 × delta, which is exactly what a round tool does.
export function offset(region: Region, delta: number): Region {
  if (region.length === 0 || delta === 0) return region
  const offsetter = new ClipperLib.ClipperOffset(2, ARC_TOLERANCE)
  offsetter.AddPaths(regionPaths(region), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon)
  const tree = new ClipperLib.PolyTree()
  offsetter.Execute(tree, delta * SCALE)
  return regionFromTree(tree)
}

export function pieceArea(piece: Piece): number {
  return Math.abs(ringSignedArea(piece.outer)) - piece.holes.reduce((sum, h) => sum + Math.abs(ringSignedArea(h)), 0)
}

export function regionArea(region: Region): number {
  return region.reduce((sum, piece) => sum + pieceArea(piece), 0)
}

export function regionBounds(region: Region): Bounds | null {
  let bounds: Bounds | null = null
  for (const piece of region) {
    for (const p of piece.outer) {
      if (!bounds) bounds = { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y }
      else {
        if (p.x < bounds.minX) bounds.minX = p.x
        if (p.y < bounds.minY) bounds.minY = p.y
        if (p.x > bounds.maxX) bounds.maxX = p.x
        if (p.y > bounds.maxY) bounds.maxY = p.y
      }
    }
  }
  return bounds
}

function pointInRing(p: Point2D, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

export function pieceContains(piece: Piece, p: Point2D): boolean {
  return pointInRing(p, piece.outer) && !piece.holes.some((h) => pointInRing(p, h))
}

export function regionContains(region: Region, p: Point2D): boolean {
  return region.some((piece) => pieceContains(piece, p))
}

function distanceToRing(p: Point2D, ring: Ring): number {
  let best = Infinity
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
    const d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
    if (d < best) best = d
  }
  return best
}

export function distanceToBoundary(region: Region, p: Point2D): number {
  let best = Infinity
  for (const piece of region) {
    best = Math.min(best, distanceToRing(p, piece.outer))
    for (const hole of piece.holes) best = Math.min(best, distanceToRing(p, hole))
  }
  return best
}

export function ringLength(ring: Ring): number {
  let sum = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    sum += Math.hypot(b.x - a.x, b.y - a.y)
  }
  return sum
}

function simplifyOpen(points: Ring, tolerance: number): Ring {
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length > 0) {
    const [first, last] = stack.pop() as [number, number]
    const a = points[first]
    const b = points[last]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    let worst = -1
    let worstDistance = tolerance
    for (let i = first + 1; i < last; i++) {
      const p = points[i]
      const d = len === 0 ? Math.hypot(p.x - a.x, p.y - a.y) : Math.abs(dx * (p.y - a.y) - dy * (p.x - a.x)) / len
      if (d > worstDistance) {
        worstDistance = d
        worst = i
      }
    }
    if (worst >= 0) {
      keep[worst] = 1
      stack.push([first, worst], [worst, last])
    }
  }
  return points.filter((_, i) => keep[i] === 1)
}

// Douglas-Peucker for a closed ring: cut at the point farthest from the first
// one, simplify both halves. A mesh section has thousands of tiny segments that
// only bloat the program and starve the controller's planner.
export function simplifyRing(ring: Ring, tolerance: number): Ring {
  if (ring.length < 4 || tolerance <= 0) return ring
  let far = 0
  let farDistance = -1
  for (let i = 1; i < ring.length; i++) {
    const d = Math.hypot(ring[i].x - ring[0].x, ring[i].y - ring[0].y)
    if (d > farDistance) {
      farDistance = d
      far = i
    }
  }
  const first = simplifyOpen(ring.slice(0, far + 1), tolerance)
  const second = simplifyOpen([...ring.slice(far), ring[0]], tolerance)
  return [...first.slice(0, -1), ...second.slice(0, -1)]
}

export function simplifyRegion(region: Region, tolerance: number): Region {
  const out: Region = []
  for (const piece of region) {
    const outer = simplifyRing(piece.outer, tolerance)
    if (outer.length < 3) continue
    const holes = piece.holes.map((h) => simplifyRing(h, tolerance)).filter((h) => h.length >= 3)
    out.push({ outer, holes })
  }
  return out
}

export function circlePiece(x: number, y: number, radius: number, segments = 96): Piece {
  const outer: Ring = []
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * 2 * Math.PI
    outer.push({ x: x + radius * Math.cos(a), y: y + radius * Math.sin(a) })
  }
  return { outer, holes: [] }
}
