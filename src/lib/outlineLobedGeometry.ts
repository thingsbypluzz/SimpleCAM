import type { OutlineParams, Point2D } from '../types/wizard'

// Lobed Circle (OP-8): the outline is the union of a main circle and N
// "lobe" circles whose centers sit on a pitch circle. Everything here is
// exact arc geometry in the shape's own frame (origin at the main circle's
// center) — no polygon clipping: the boundary of a union of discs is made
// of arcs of those discs, and so are its offsets.

// One arc of a closed loop. `sweep` > 0 is the angle travelled, `ccw` the
// way it turns. `circle` tells which disc it belongs to: 0 = main circle,
// 1…N = lobes, -1 = a fillet around a vertex (insetLoop()).
export interface LoopArc {
  center: Point2D
  radius: number
  start: number
  sweep: number
  ccw: boolean
  circle: number
}

export type Loop = LoopArc[]

type LobedParams = Pick<OutlineParams, 'lobeMainDiameter' | 'lobeCount' | 'lobePitchDiameter' | 'lobeDiameter' | 'lobeStartAngle'>

const TWO_PI = 2 * Math.PI
const EPS = 1e-9
// Loop-chaining tolerance: an intersection point is computed once from each
// of its two circles.
const JOIN_EPS = 1e-6
// 5° per segment, like every sampled curve in the app.
const SAMPLE_RAD = (5 * Math.PI) / 180

interface Disc {
  center: Point2D
  radius: number
}

const norm = (angle: number) => ((angle % TWO_PI) + TWO_PI) % TWO_PI

// Lobe count as the engine uses it: a whole number, never more than the
// validated ceiling — the previews run on unvalidated input.
export const MAX_LOBE_COUNT = 100

export function lobeCountOf(outline: Pick<OutlineParams, 'lobeCount'>): number {
  return Math.max(0, Math.min(MAX_LOBE_COUNT, Math.floor(outline.lobeCount)))
}

export function lobeCenters(outline: LobedParams): Point2D[] {
  const count = lobeCountOf(outline)
  const pitchRadius = outline.lobePitchDiameter / 2
  const startRad = (outline.lobeStartAngle * Math.PI) / 180
  return Array.from({ length: count }, (_, i) => {
    const angle = startRad + (TWO_PI * i) / count
    return { x: pitchRadius * Math.cos(angle), y: pitchRadius * Math.sin(angle) }
  })
}

// The main circle (index 0) and the lobes, every radius grown by `grow`.
function lobedDiscs(outline: LobedParams, grow: number): Disc[] {
  return [
    { center: { x: 0, y: 0 }, radius: outline.lobeMainDiameter / 2 + grow },
    ...lobeCenters(outline).map((center) => ({ center, radius: outline.lobeDiameter / 2 + grow })),
  ]
}

export function arcPoint(arc: LoopArc, t: number): Point2D {
  const angle = arc.start + (arc.ccw ? 1 : -1) * arc.sweep * t
  return { x: arc.center.x + arc.radius * Math.cos(angle), y: arc.center.y + arc.radius * Math.sin(angle) }
}

export function arcLength(arc: LoopArc): number {
  return arc.radius * arc.sweep
}

export function loopLength(loop: Loop): number {
  return loop.reduce((sum, arc) => sum + arcLength(arc), 0)
}

// Signed area enclosed by a loop of arcs (positive = counter-clockwise).
function loopArea(loop: Loop): number {
  let area = 0
  for (const arc of loop) {
    const a = arcPoint(arc, 0)
    const b = arcPoint(arc, 1)
    const sign = arc.ccw ? 1 : -1
    // Chord's shoelace term plus the circular segment between chord and arc.
    area += (a.x * b.y - b.x * a.y) / 2 + (sign * arc.radius * arc.radius * (arc.sweep - Math.sin(arc.sweep))) / 2
  }
  return area
}

// Angular intervals of disc `i`'s circle that lie inside another disc, as
// [from, to] pairs with from in [0, 2π) and to ≥ from; null when the whole
// circle is covered.
function coveredIntervals(discs: Disc[], i: number): [number, number][] | null {
  const self = discs[i]
  const intervals: [number, number][] = []
  for (let j = 0; j < discs.length; j++) {
    if (j === i) continue
    const other = discs[j]
    const dx = other.center.x - self.center.x
    const dy = other.center.y - self.center.y
    const d = Math.hypot(dx, dy)
    if (d + self.radius <= other.radius + EPS) {
      // Inside the other disc. Two identical discs would hide each other —
      // the lower index keeps its circle.
      if (d < EPS && Math.abs(self.radius - other.radius) < EPS && j > i) continue
      return null
    }
    if (d >= self.radius + other.radius - EPS || d + other.radius <= self.radius + EPS) continue
    const toward = Math.atan2(dy, dx)
    const half = Math.acos(Math.max(-1, Math.min(1, (d * d + self.radius * self.radius - other.radius * other.radius) / (2 * d * self.radius))))
    const from = norm(toward - half)
    intervals.push([from, from + 2 * half])
  }
  return intervals
}

// The parts of disc `i`'s circle on the union's boundary, as CCW arcs.
function exposedArcs(discs: Disc[], i: number): LoopArc[] {
  const covered = coveredIntervals(discs, i)
  if (covered === null) return []
  const { center, radius } = discs[i]
  if (!(radius > 0)) return []
  if (covered.length === 0) return [{ center, radius, start: 0, sweep: TWO_PI, ccw: true, circle: i }]

  // Merge the intervals on the unrolled circle [first.from, first.from + 2π).
  const sorted = [...covered].sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const [from, to] of sorted) {
    const last = merged[merged.length - 1]
    if (last && from <= last[1] + EPS) last[1] = Math.max(last[1], to)
    else merged.push([from, to])
  }
  // The last interval may wrap past 2π into the first ones.
  const wrapEnd = merged[merged.length - 1][1] - TWO_PI
  while (merged.length > 1 && merged[0][0] <= wrapEnd + EPS) {
    merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], merged[0][1] + TWO_PI)
    merged.shift()
  }
  if (merged.length === 1 && merged[0][1] - merged[0][0] >= TWO_PI - EPS) return []

  const arcs: LoopArc[] = []
  for (let k = 0; k < merged.length; k++) {
    const start = merged[k][1]
    const end = k + 1 < merged.length ? merged[k + 1][0] : merged[0][0] + TWO_PI
    if (end - start > EPS) arcs.push({ center, radius, start: norm(start), sweep: end - start, ccw: true, circle: i })
  }
  return arcs
}

// Outer boundary of the union of the main circle and the lobes, each grown
// by `grow` — a CCW loop of CCW arcs. grow = 0 is the nominal outline (and
// the On-line tool path); grow = tool radius is the Outside tool path, where
// a gap too narrow for the tool simply closes up. Loops around enclosed
// voids (between lobes that overlap each other beyond the main circle) are
// dropped: the outline is the outer contour. Empty when there is no shape.
export function lobedUnionLoop(outline: LobedParams, grow = 0): Loop {
  const discs = lobedDiscs(outline, grow)
  const arcs = discs.flatMap((_, i) => exposedArcs(discs, i))
  if (arcs.length === 0) return []

  const used = new Array<boolean>(arcs.length).fill(false)
  let best: Loop = []
  let bestArea = 0
  for (let first = 0; first < arcs.length; first++) {
    if (used[first]) continue
    const loop: Loop = []
    let current = first
    // Follow each arc's end to the arc that starts there.
    while (!used[current]) {
      used[current] = true
      loop.push(arcs[current])
      const end = arcPoint(arcs[current], 1)
      let next = -1
      let nextDist = JOIN_EPS
      for (let k = 0; k < arcs.length; k++) {
        if (used[k] && k !== first) continue
        const start = arcPoint(arcs[k], 0)
        const dist = Math.hypot(start.x - end.x, start.y - end.y)
        if (dist < nextDist) {
          nextDist = dist
          next = k
        }
      }
      if (next === -1 || next === first) break
      current = next
    }
    const area = loopArea(loop)
    if (area > bestArea) {
      bestArea = area
      best = loop
    }
  }
  return best
}

// The loop moved inward by `d`: every arc keeps its center and span with
// its radius reduced by `d`, and each vertex between two arcs (always a
// concave one on a union of discs — a cusp pointing into the shape) gets a
// clockwise fillet of radius `d` around it. Inset of the nominal outline by
// the tool radius = the Inside tool path; inset of the Outside tool path =
// the shape that cut actually leaves. null when an arc is too small to
// inset. Takes a CCW loop of CCW arcs.
export function insetLoop(loop: Loop, d: number): Loop | null {
  if (loop.length === 0) return []
  if (loop.some((arc) => !(arc.radius - d > EPS))) return null
  if (loop.length === 1) return [{ ...loop[0], radius: loop[0].radius - d }]
  const result: Loop = []
  for (let k = 0; k < loop.length; k++) {
    const arc = loop[k]
    const next = loop[(k + 1) % loop.length]
    result.push({ ...arc, radius: arc.radius - d })
    const vertex = arcPoint(arc, 1)
    // From the vertex toward each arc's center: where the inset arcs meet
    // the fillet.
    const from = Math.atan2(arc.center.y - vertex.y, arc.center.x - vertex.x)
    const to = Math.atan2(next.center.y - vertex.y, next.center.x - vertex.x)
    const sweep = norm(from - to)
    if (sweep > EPS && sweep < TWO_PI - EPS) {
      result.push({ center: vertex, radius: d, start: from, sweep, ccw: false, circle: -1 })
    }
  }
  return result
}

// The same loop travelled the other way.
export function reverseLoop(loop: Loop): Loop {
  return [...loop].reverse().map((arc) => ({
    ...arc,
    start: arc.start + (arc.ccw ? 1 : -1) * arc.sweep,
    ccw: !arc.ccw,
  }))
}

export function translateLoop(loop: Loop, dx: number, dy: number): Loop {
  return loop.map((arc) => ({ ...arc, center: { x: arc.center.x + dx, y: arc.center.y + dy } }))
}

// The point `s` mm along the loop from its start (wraps around).
export function loopPointAtLength(loop: Loop, s: number): Point2D {
  const total = loopLength(loop)
  if (!(total > 0)) return loop.length > 0 ? arcPoint(loop[0], 0) : { x: 0, y: 0 }
  let rest = ((s % total) + total) % total
  for (const arc of loop) {
    const length = arcLength(arc)
    if (rest <= length) return arcPoint(arc, length > 0 ? rest / length : 0)
    rest -= length
  }
  return arcPoint(loop[0], 0)
}

// The same loop, starting `s` mm further along (the arc there is split).
export function loopStartingAt(loop: Loop, s: number): Loop {
  const total = loopLength(loop)
  if (!(total > 0) || loop.length === 0) return loop
  let rest = ((s % total) + total) % total
  for (let k = 0; k < loop.length; k++) {
    const arc = loop[k]
    const length = arcLength(arc)
    if (rest < length - EPS) {
      if (rest < EPS) return [...loop.slice(k), ...loop.slice(0, k)]
      const cut = rest / arc.radius
      const sign = arc.ccw ? 1 : -1
      const tail: LoopArc = { ...arc, start: arc.start + sign * cut, sweep: arc.sweep - cut }
      const head: LoopArc = { ...arc, sweep: cut }
      return [tail, ...loop.slice(k + 1), ...loop.slice(0, k), head]
    }
    rest -= length
  }
  return loop
}

// Positions along the loop [mm] at which it is sampled: every arc's ends
// and a point every 5° in between. Starts at 0, ends at the loop length.
export function loopSamplePositions(loop: Loop): number[] {
  const positions = [0]
  let walked = 0
  for (const arc of loop) {
    const segments = Math.max(1, Math.round(arc.sweep / SAMPLE_RAD))
    const length = arcLength(arc)
    for (let i = 1; i <= segments; i++) positions.push(walked + (length * i) / segments)
    walked += length
  }
  return positions
}

// The loop as a polygon (5° per segment), without repeating the first point.
export function loopPolygon(loop: Loop): Point2D[] {
  const points: Point2D[] = []
  for (const arc of loop) {
    const segments = Math.max(1, Math.round(arc.sweep / SAMPLE_RAD))
    for (let i = 0; i < segments; i++) points.push(arcPoint(arc, i / segments))
  }
  return points
}

function arcContainsAngle(arc: LoopArc, angle: number): boolean {
  const travelled = arc.ccw ? norm(angle - arc.start) : norm(arc.start - angle)
  return travelled <= arc.sweep + EPS
}

export interface LoopBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

// Exact extent: arc ends plus every axis-aligned extreme an arc passes.
export function loopBounds(loop: Loop): LoopBounds | null {
  if (loop.length === 0) return null
  const xs: number[] = []
  const ys: number[] = []
  for (const arc of loop) {
    for (const p of [arcPoint(arc, 0), arcPoint(arc, 1)]) {
      xs.push(p.x)
      ys.push(p.y)
    }
    for (let quarter = 0; quarter < 4; quarter++) {
      const angle = (quarter * Math.PI) / 2
      if (!arcContainsAngle(arc, angle)) continue
      xs.push(arc.center.x + arc.radius * Math.cos(angle))
      ys.push(arc.center.y + arc.radius * Math.sin(angle))
    }
  }
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
}

// Where the ray from the origin at `angleRad` crosses the loop farthest
// out, as a position along the loop [mm]; 0 when it never does.
export function loopOutermostOnRay(loop: Loop, angleRad: number): number {
  const ux = Math.cos(angleRad)
  const uy = Math.sin(angleRad)
  let best = 0
  let bestDist = -Infinity
  let walked = 0
  for (const arc of loop) {
    const along = ux * arc.center.x + uy * arc.center.y
    const disc = along * along - (arc.center.x * arc.center.x + arc.center.y * arc.center.y) + arc.radius * arc.radius
    if (disc >= 0) {
      for (const t of [along + Math.sqrt(disc), along - Math.sqrt(disc)]) {
        if (!(t > EPS) || t <= bestDist) continue
        const angle = Math.atan2(t * uy - arc.center.y, t * ux - arc.center.x)
        if (!arcContainsAngle(arc, angle)) continue
        const travelled = arc.ccw ? norm(angle - arc.start) : norm(arc.start - angle)
        bestDist = t
        best = walked + arc.radius * Math.min(travelled, arc.sweep)
      }
    }
    walked += arcLength(arc)
  }
  return best
}

// Distance from a point to the nearest point of the loop.
export function distanceToLoop(loop: Loop, p: Point2D): number {
  let best = Infinity
  for (const arc of loop) {
    const angle = Math.atan2(p.y - arc.center.y, p.x - arc.center.x)
    if (arcContainsAngle(arc, angle)) {
      best = Math.min(best, Math.abs(Math.hypot(p.x - arc.center.x, p.y - arc.center.y) - arc.radius))
    } else {
      for (const end of [arcPoint(arc, 0), arcPoint(arc, 1)]) best = Math.min(best, Math.hypot(p.x - end.x, p.y - end.y))
    }
  }
  return best
}

// Every lobe has to be part of one piece with the main circle and add
// something to it: its circle crosses the main circle's (not apart from
// it, not swallowed by it, not swallowing it).
export function lobesAttached(outline: LobedParams): boolean {
  const mainRadius = outline.lobeMainDiameter / 2
  const lobeRadius = outline.lobeDiameter / 2
  const pitchRadius = Math.abs(outline.lobePitchDiameter / 2)
  if (!(mainRadius > 0) || !(lobeRadius > 0)) return false
  return pitchRadius < mainRadius + lobeRadius - EPS && pitchRadius > Math.abs(mainRadius - lobeRadius) + EPS
}

// Tool-center loop for an Inside cut (CCW), or null when the tool doesn't
// fit: an arc too small to inset, or the path coming closer than the tool
// radius to the outline somewhere (a neck between the main circle and a
// lobe narrower than the tool).
export function lobedInsideLoop(outline: LobedParams, toolRadius: number): Loop | null {
  const nominal = lobedUnionLoop(outline, 0)
  if (nominal.length === 0) return null
  const inset = insetLoop(nominal, toolRadius)
  if (inset === null) return null
  const tolerance = 1e-6
  for (const p of loopPolygon(inset)) {
    if (distanceToLoop(nominal, p) < toolRadius - tolerance) return null
  }
  return inset
}

// Outside: the tool can't get into a gap narrower than itself — the grown
// circles merge there and the path has fewer arcs than the outline.
export function lobedOutsideGapTooNarrow(outline: LobedParams, toolRadius: number): boolean {
  const nominal = lobedUnionLoop(outline, 0)
  return nominal.length > 0 && lobedUnionLoop(outline, toolRadius).length < nominal.length
}
