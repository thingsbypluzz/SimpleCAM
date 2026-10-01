import type { PocketParams, Point2D } from '../types/wizard'

// Lightened Pocket shapes (OP-6): the area is split into cells by ribs and
// each cell is pocketed on its own, leaving the ribs, and (Circle) the center hub
// as material; the cells fill the given size right up to its edge (BL-84). Pure geometry —
// shared by the engine, validation and both previews.
//
// Every cell is either
// - a triangle (every Rectangle Lightened cell, in both layouts), whose
//   boundary moved inward by d is the same triangle scaled about its
//   incenter — `loop(d)` is exact and trivial; or
// - an annular sector (Circle Lightened): rIn ≤ ρ ≤ rOut and at least s from
//   both spoke axes; moved inward by d it stays one (rIn+d, rOut−d, s+d).
// Loops run CCW (climb for an inside cut under M3, like every Pocket).

export interface TriangleCell {
  kind: 'triangle'
  vertices: [Point2D, Point2D, Point2D] // CCW
}

export interface SectorCell {
  kind: 'sector'
  origin: Point2D // circle center
  rIn: number // inner boundary radius (hub), 0 = none
  rOut: number // outer boundary radius (rim)
  a0: number // first spoke axis angle, rad
  a1: number // second spoke axis angle, rad (a1 > a0, a1 − a0 < π)
  s: number // distance kept from both spoke axes (rib / 2)
}

export type LightCell = TriangleCell | SectorCell

// Arcs of sector loops are sampled at 5°, like every G1 curve in the app.
const ARC_STEP = (5 * Math.PI) / 180
const EPS = 1e-9

export const MIN_LIGHT_COUNT = 1
export const MAX_LIGHT_COUNT = 20
export const MIN_SPOKES = 3
export const MAX_SPOKES = 24

// Adaptive handles triangular cells (BL-83); Circle Lightened's sectors are
// Spiral-only for now (BL-85).
export function isSpiralOnlyShape(shape: PocketParams['shape']): boolean {
  return shape === 'circleLightened'
}

export function isLightenedShape(shape: PocketParams['shape']): shape is 'rectLightened' | 'circleLightened' {
  return shape === 'rectLightened' || shape === 'circleLightened'
}

// ---------------------------------------------------------------------------
// Triangles

const sub = (a: Point2D, b: Point2D): Point2D => ({ x: a.x - b.x, y: a.y - b.y })
const cross = (a: Point2D, b: Point2D) => a.x * b.y - a.y * b.x
const dist = (a: Point2D, b: Point2D) => Math.hypot(a.x - b.x, a.y - b.y)

function signedArea(v: Point2D[]): number {
  let a = 0
  for (let i = 0; i < v.length; i++) a += cross(v[i], v[(i + 1) % v.length])
  return a / 2
}

function incircle(v: [Point2D, Point2D, Point2D]): { center: Point2D; radius: number } {
  const [a, b, c] = v
  const la = dist(b, c)
  const lb = dist(c, a)
  const lc = dist(a, b)
  const p = la + lb + lc
  if (!(p > EPS)) return { center: a, radius: 0 }
  return {
    center: { x: (la * a.x + lb * b.x + lc * c.x) / p, y: (la * a.y + lb * b.y + lc * c.y) / p },
    radius: (2 * Math.abs(signedArea(v))) / p,
  }
}

// A triangle whose edge i (vertex i → i+1) moved inward by offsets[i] —
// ribs by half their width, edges on the area's boundary by 0. Null when the offsets swallow
// it (the edges would cross over).
function offsetTriangle(v: Point2D[], offsets: [number, number, number]): TriangleCell | null {
  const ccw = signedArea(v) > 0 ? v : [v[0], v[2], v[1]]
  const offs = signedArea(v) > 0 ? offsets : [offsets[2], offsets[1], offsets[0]]
  // Edge line i: point + direction, shifted along its inward (left) normal.
  const lines = ccw.map((p, i) => {
    const q = ccw[(i + 1) % 3]
    const d = sub(q, p)
    const len = Math.hypot(d.x, d.y)
    const n = { x: -d.y / len, y: d.x / len }
    return { p: { x: p.x + n.x * offs[i], y: p.y + n.y * offs[i] }, d }
  })
  // Vertex i is where edge i−1 meets edge i.
  const out = [0, 1, 2].map((i) => {
    const l1 = lines[(i + 2) % 3]
    const l2 = lines[i]
    const den = cross(l1.d, l2.d)
    const t = cross(sub(l2.p, l1.p), l2.d) / den
    return { x: l1.p.x + l1.d.x * t, y: l1.p.y + l1.d.y * t }
  }) as [Point2D, Point2D, Point2D]
  // Pushed past each other the edges form a point-reflected triangle — same
  // orientation, so check every edge still runs its original way.
  const sameWay = out.every((a, i) => {
    const e = sub(out[(i + 1) % 3], a)
    const o = lines[i].d
    return e.x * o.x + e.y * o.y > 0
  })
  return sameWay && signedArea(out) > EPS ? { kind: 'triangle', vertices: out } : null
}

// ---------------------------------------------------------------------------
// Layouts

type Edge = 'rib' | 'edge'

function triangleCell(v: [Point2D, Point2D, Point2D], edges: [Edge, Edge, Edge], rib: number): TriangleCell | null {
  const half = rib / 2
  return offsetTriangle(
    v,
    edges.map((e) => (e === 'rib' ? half : 0)) as [number, number, number],
  )
}

interface RectArea {
  x0: number
  y0: number
  x1: number
  y1: number
}

// X-grid N×M: every sub-rectangle split by its diagonals into 4 triangles
// (bottom, right, top, left — CCW around its center). Sub-rectangles in a
// snake order: row by row, alternating direction.
function xGridCells(area: RectArea, n: number, m: number, rib: number): (TriangleCell | null)[] {
  const cells: (TriangleCell | null)[] = []
  const w = (area.x1 - area.x0) / n
  const h = (area.y1 - area.y0) / m
  for (let j = 0; j < m; j++) {
    const cols = [...Array(n).keys()]
    if (j % 2 === 1) cols.reverse()
    for (const i of cols) {
      const x0 = area.x0 + i * w
      const y0 = area.y0 + j * h
      const x1 = x0 + w
      const y1 = y0 + h
      const c = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }
      const side = (inner: boolean): Edge => (inner ? 'rib' : 'edge')
      cells.push(triangleCell([{ x: x0, y: y0 }, { x: x1, y: y0 }, c], [side(j > 0), 'rib', 'rib'], rib))
      cells.push(triangleCell([{ x: x1, y: y0 }, { x: x1, y: y1 }, c], [side(i < n - 1), 'rib', 'rib'], rib))
      cells.push(triangleCell([{ x: x1, y: y1 }, { x: x0, y: y1 }, c], [side(j < m - 1), 'rib', 'rib'], rib))
      cells.push(triangleCell([{ x: x0, y: y1 }, { x: x0, y: y0 }, c], [side(i > 0), 'rib', 'rib'], rib))
    }
  }
  return cells
}

// Triangles N×M: M rows; each row has N diagonal ribs zigzagging between
// nodes spaced W/N apart, the first starting at the row's bottom-left
// corner, so the row has N+1 cells — right triangles at both ends, N−1
// between. Odd rows are mirrored so their nodes meet the row below's.
// Cells left to right, rows alternating direction (snake).
function trianglesCells(area: RectArea, n: number, m: number, rib: number): (TriangleCell | null)[] {
  const cells: (TriangleCell | null)[] = []
  const p = (area.x1 - area.x0) / n
  const h = (area.y1 - area.y0) / m
  for (let j = 0; j < m; j++) {
    const yb = area.y0 + j * h
    const yt = yb + h
    const flip = j % 2 === 1
    // Row-local "low" side is the bottom, or the top for mirrored rows.
    const low = flip ? yt : yb
    const high = flip ? yb : yt
    const lowEdge: Edge = (flip ? j < m - 1 : j > 0) ? 'rib' : 'edge'
    const highEdge: Edge = (flip ? j > 0 : j < m - 1) ? 'rib' : 'edge'
    const x = (k: number) => area.x0 + k * p
    // Node k sits on the low side for even k, the high side for odd k.
    const node = (k: number): Point2D => ({ x: x(k), y: k % 2 === 0 ? low : high })
    const row: (TriangleCell | null)[] = []
    // Left end: rim edge, node 0 → node 1 diagonal.
    row.push(triangleCell([{ x: x(0), y: low }, node(1), { x: x(0), y: high }], ['rib', highEdge, 'edge'], rib))
    for (let k = 1; k < n; k++) {
      // Between diagonals k−1 (node k−1 → k) and k (node k → k+1): a
      // triangle with its base on the side opposite node k.
      const base: Edge = k % 2 === 0 ? highEdge : lowEdge
      row.push(triangleCell([node(k - 1), node(k + 1), node(k)], [base, 'rib', 'rib'], rib))
    }
    // Right end: diagonal node n−1 → n, rim edge on the right; its long
    // side lies on the side opposite node n.
    const otherIsHigh = n % 2 === 0
    row.push(
      triangleCell(
        [node(n), { x: x(n), y: otherIsHigh ? high : low }, node(n - 1)],
        ['edge', otherIsHigh ? highEdge : lowEdge, 'rib'],
        rib,
      ),
    )
    if (j % 2 === 1) row.reverse()
    cells.push(...row)
  }
  return cells
}

// ---------------------------------------------------------------------------
// Sectors

function sectorApexRadius(c: Pick<SectorCell, 'a0' | 'a1'>, s: number): number {
  return s / Math.sin((c.a1 - c.a0) / 2)
}

function sectorInradius(c: SectorCell): { center: Point2D; radius: number } {
  const sh = Math.sin((c.a1 - c.a0) / 2)
  const dMid = (c.rOut - c.rIn) / 2
  const dApex = (c.rOut * sh - c.s) / (1 + sh)
  const bis = (c.a0 + c.a1) / 2
  const radius = Math.min(dMid, dApex)
  const rho = dApex <= dMid ? c.rOut - dApex : (c.rIn + c.rOut) / 2
  return { center: { x: c.origin.x + rho * Math.cos(bis), y: c.origin.y + rho * Math.sin(bis) }, radius: Math.max(0, radius) }
}

function sectorLoop(c: SectorCell, d: number): Point2D[] {
  const rIn = c.rIn + d
  const rOut = c.rOut - d
  const s = c.s + d
  const at = (r: number, a: number) => ({ x: c.origin.x + r * Math.cos(a), y: c.origin.y + r * Math.sin(a) })
  const apex = sectorApexRadius(c, s)
  const bis = (c.a0 + c.a1) / 2
  if (!(rOut > Math.max(rIn, apex))) {
    // Degenerate (d at or past the inradius): the center.
    return [sectorInradius(c).center]
  }
  const pts: Point2D[] = []
  const arc = (r: number, from: number, to: number) => {
    const steps = Math.max(1, Math.ceil(Math.abs(to - from) / ARC_STEP))
    for (let k = 0; k <= steps; k++) pts.push(at(r, from + ((to - from) * k) / steps))
  }
  // Outer arc from the first spoke's side to the second's.
  arc(rOut, c.a0 + Math.asin(s / rOut), c.a1 - Math.asin(s / rOut))
  if (apex >= rIn) {
    pts.push(at(apex, bis))
  } else {
    // The hub arc is concave from inside the cell: chords between points on
    // radius rIn would dip into the hub. Vertices go on the circumscribed
    // radius instead, so every chord stays at or outside rIn.
    let r = rIn
    for (let i = 0; i < 3; i++) {
      const span = 2 * Math.asin(Math.min(1, s / r))
      const sweep = c.a1 - c.a0 - span
      const steps = Math.max(1, Math.ceil(sweep / ARC_STEP))
      r = rIn / Math.cos(sweep / steps / 2)
    }
    if (r <= apex) pts.push(at(apex, bis))
    else arc(r, c.a1 - Math.asin(s / r), c.a0 + Math.asin(s / r))
  }
  return pts
}

// ---------------------------------------------------------------------------
// Public cell API

// Center (farthest point from the walls) and inradius (that distance) of
// the cell's nominal boundary.
export function cellInscribed(cell: LightCell): { center: Point2D; radius: number } {
  return cell.kind === 'triangle' ? incircle(cell.vertices) : sectorInradius(cell)
}

// The closed loop (CCW, first point not repeated) at distance d inside the
// cell's nominal boundary; a single point at or past the inradius.
export function cellLoop(cell: LightCell, d: number): Point2D[] {
  if (cell.kind === 'sector') return sectorLoop(cell, d)
  const { center, radius } = incircle(cell.vertices)
  const k = radius > 0 ? Math.max(0, 1 - d / radius) : 0
  if (k === 0) return [center]
  return cell.vertices.map((v) => ({ x: center.x + (v.x - center.x) * k, y: center.y + (v.y - center.y) * k }))
}

// Signed distance from `p` to the cell's nominal boundary: positive
// inside. A point is inside the loop at d exactly when this is ≥ d.
export function cellWallDistance(cell: LightCell, p: Point2D): number {
  if (cell.kind === 'triangle') {
    const v = cell.vertices
    return Math.min(
      ...v.map((a, i) => {
        const b = v[(i + 1) % 3]
        const e = sub(b, a)
        return cross(e, sub(p, a)) / Math.hypot(e.x, e.y)
      }),
    )
  }
  const q = sub(p, cell.origin)
  const rho = Math.hypot(q.x, q.y)
  const n0 = { x: -Math.sin(cell.a0), y: Math.cos(cell.a0) }
  const n1 = { x: Math.sin(cell.a1), y: -Math.cos(cell.a1) }
  const side0 = q.x * n0.x + q.y * n0.y - cell.s
  const side1 = q.x * n1.x + q.y * n1.y - cell.s
  const inner = cell.rIn > 0 ? rho - cell.rIn : Infinity
  return Math.min(cell.rOut - rho, inner, side0, side1)
}

export function loopLength(loop: Point2D[]): number {
  if (loop.length < 2) return 0
  let len = 0
  for (let i = 0; i < loop.length; i++) len += dist(loop[i], loop[(i + 1) % loop.length])
  return len
}

// Point at `fraction` (any real number, wraps) of the way around a closed
// loop, measured by length from its first point.
export function loopPointAt(loop: Point2D[], fraction: number): Point2D {
  if (loop.length === 1) return loop[0]
  const total = loopLength(loop)
  let target = (((fraction % 1) + 1) % 1) * total
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]
    const b = loop[(i + 1) % loop.length]
    const len = dist(a, b)
    if (target <= len || i === loop.length - 1) {
      const t = len > 0 ? Math.min(1, target / len) : 0
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    }
    target -= len
  }
  return loop[0]
}

// Fraction of the loop point nearest to `p`.
export function loopNearestFraction(loop: Point2D[], p: Point2D): number {
  if (loop.length < 2) return 0
  const total = loopLength(loop)
  let best = { d: Infinity, f: 0 }
  let walked = 0
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]
    const b = loop[(i + 1) % loop.length]
    const e = sub(b, a)
    const len2 = e.x * e.x + e.y * e.y
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * e.x + (p.y - a.y) * e.y) / len2)) : 0
    const q = { x: a.x + e.x * t, y: a.y + e.y * t }
    const d = dist(p, q)
    if (d < best.d) best = { d, f: total > 0 ? (walked + Math.sqrt(len2) * t) / total : 0 }
    walked += Math.sqrt(len2)
  }
  return best.f
}

// Nominal cells of a Lightened pocket, in cutting order; null entries are
// cells the ribs swallowed (validation rejects those).
export function lightenedCellsOrNull(
  pocket: Pick<
    PocketParams,
    | 'shape'
    | 'width'
    | 'height'
    | 'diameter'
    | 'offsetX'
    | 'offsetY'
    | 'lightLayout'
    | 'lightCountX'
    | 'lightCountY'
    | 'ribWidth'
    | 'spokeCount'
    | 'hubDiameter'
    | 'spokeStartAngle'
  >,
): (LightCell | null)[] {
  const cx = pocket.offsetX
  const cy = pocket.offsetY
  if (pocket.shape === 'circleLightened') {
    // Out-of-range counts (a field mid-edit — validation flags them) give no
    // cells rather than thousands for the live preview to build.
    const k = Math.floor(pocket.spokeCount)
    if (!(k >= MIN_SPOKES && k <= MAX_SPOKES)) return []
    const step = (2 * Math.PI) / k
    const start = (pocket.spokeStartAngle * Math.PI) / 180
    const rOut = pocket.diameter / 2
    const rIn = Math.max(0, pocket.hubDiameter / 2)
    return [...Array(k).keys()].map((i) => {
      const cell: SectorCell = {
        kind: 'sector',
        origin: { x: cx, y: cy },
        rIn,
        rOut,
        a0: start + i * step,
        a1: start + (i + 1) * step,
        s: pocket.ribWidth / 2,
      }
      return sectorInradius(cell).radius > EPS && rOut > rIn ? cell : null
    })
  }
  if (pocket.shape !== 'rectLightened') return []
  const n = Math.floor(pocket.lightCountX)
  const m = Math.floor(pocket.lightCountY)
  if (!(n >= MIN_LIGHT_COUNT && m >= MIN_LIGHT_COUNT && n <= MAX_LIGHT_COUNT && m <= MAX_LIGHT_COUNT)) return []
  const area: RectArea = {
    x0: cx - pocket.width / 2,
    y0: cy - pocket.height / 2,
    x1: cx + pocket.width / 2,
    y1: cy + pocket.height / 2,
  }
  if (!(area.x1 > area.x0 && area.y1 > area.y0)) return []
  return pocket.lightLayout === 'xgrid'
    ? xGridCells(area, n, m, pocket.ribWidth)
    : trianglesCells(area, n, m, pocket.ribWidth)
}

export function lightenedCells(pocket: Parameters<typeof lightenedCellsOrNull>[0]): LightCell[] {
  return lightenedCellsOrNull(pocket).filter((c): c is LightCell => c !== null)
}
