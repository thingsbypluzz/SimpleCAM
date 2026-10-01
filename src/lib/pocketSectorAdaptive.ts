import type { Point2D } from '../types/wizard'
import { ADAPTIVE_MAX_STEPS, MIN_PEEL_RADIUS_FRACTION, phaseA, phaseARadii, type LevelContext } from './pocketAdaptive'
import { largestStepWithin, maxArcEngagement } from './pocketAdaptiveMath'
import type { SectorCell } from './pocketLightened'
import type { ArcDirection } from './toolpath'

// Adaptive clearing of one annular-sector Lightened cell (BL-85) — Circle
// Lightened. After phase A (the constant-engagement rings around the
// largest inscribed circle, same as every Adaptive), what is left always
// lies between two walls. Each such remnant is cleared by one mechanism: a
// circle that keeps touching both walls, moved along the curve midway
// between them, its radius the distance to them. The step along that curve
// is the largest that keeps engagement along the new circle's leading arc
// within θ* (maxArcEngagement against the previous circle) — the Rectangle's
// phase B (two parallel walls, constant radius) and phase C (two walls
// meeting in a corner, shrinking radius) are both special cases.
//
// The sector's walls, for the tool center (the roughing wall): the two
// straight sides (parallel to the spoke axes), the outer arc, and the hub
// arc when the hub reaches between the sides. Two shapes of remnants:
// - narrow sector — the inscribed circle touches both sides and the outer
//   arc: two outer corners (side/outer arc) and a stem toward the hub
//   between the sides, ending in the apex or, with a hub, splitting into
//   the two hub corners (side/hub arc);
// - wide sector — it touches the hub and the outer arc: two wings around
//   the ring (hub/outer arc, constant radius), each splitting at its side
//   into an outer and a hub corner.
// Every step repeats the Rectangle's move pattern: cut along the wall the
// arc starts on, cut the arc, link back along its chord. Branches are
// reached and left along their own circle centers (all cleared), so no
// link ever crosses the hub.
//
// Geometry is worked in the sector's local frame — circle center at the
// origin, bisector along +X — and rotated into place; all cells of one
// pocket share one plan.

const EPS = 1e-6
// Hub-wall moves are polylines; 5° per segment like every G1 curve.
const WALL_SEGMENT = (5 * Math.PI) / 180

interface Circle {
  c: Point2D
  r: number
}

type Wall = { kind: 'side'; sigma: 1 | -1 } | { kind: 'outer' } | { kind: 'inner' }

interface Geo {
  rIn: number // hub wall radius (tool center), 0 = none
  rOut: number
  s: number // distance of the sides from the spoke axes
  phi: number // half the angle between the spoke axes
}

interface Family {
  walls: [Wall, Wall]
  at: (u: number) => Circle
  span: number
  // Where the two walls meet when the family ends in a corner.
  corner: Point2D | null
}

export interface SectorBranch {
  walls: [Wall, Wall]
  circles: Circle[] // circles[0] is the base circle (already cut)
  corner: Point2D | null
  children: SectorBranch[]
  complete: boolean
}

export interface SectorAdaptivePlan {
  center: Point2D // world: the inscribed circle's center
  ringRadii: number[]
  ringsComplete: boolean
  geo: Geo
  origin: Point2D
  bisector: number // rad
  root: Circle // local
  branches: SectorBranch[]
}

const sideN = (g: Geo, sigma: 1 | -1): Point2D => ({ x: Math.sin(g.phi), y: -sigma * Math.cos(g.phi) })
const sideU = (g: Geo, sigma: 1 | -1): Point2D => ({ x: Math.cos(g.phi), y: sigma * Math.sin(g.phi) })

// Point where `circle` touches `wall`.
function tangency(g: Geo, wall: Wall, circle: Circle): Point2D {
  const { c, r } = circle
  if (wall.kind === 'side') {
    const n = sideN(g, wall.sigma)
    return { x: c.x - n.x * r, y: c.y - n.y * r }
  }
  const d = Math.hypot(c.x, c.y)
  const k = d > 0 ? (wall.kind === 'outer' ? r : -r) / d : 0
  return { x: c.x + c.x * k, y: c.y + c.y * k }
}

// The leading arc of `next` (the part facing away from `prev`), from one
// wall's tangency to the other's, as a CCW sweep.
function leadingArc(g: Geo, walls: [Wall, Wall], next: Circle, prev: Circle) {
  const ta = tangency(g, walls[0], next)
  const tb = tangency(g, walls[1], next)
  const angA = Math.atan2(ta.y - next.c.y, ta.x - next.c.x)
  const angB = Math.atan2(tb.y - next.c.y, tb.x - next.c.x)
  const sweepAB = (((angB - angA) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  const mid = angA + sweepAB / 2
  const forward = Math.cos(mid) * (next.c.x - prev.c.x) + Math.sin(mid) * (next.c.y - prev.c.y) > 0
  return forward
    ? { a0: angA, sweep: sweepAB, startWall: walls[0], endWall: walls[1] }
    : { a0: angB, sweep: 2 * Math.PI - sweepAB, startWall: walls[1], endWall: walls[0] }
}

function stepEngagement(g: Geo, walls: [Wall, Wall], next: Circle, prev: Circle, toolRadius: number): number {
  const arc = leadingArc(g, walls, next, prev)
  return maxArcEngagement(
    next.r,
    arc.a0,
    arc.a0 + arc.sweep,
    { x: prev.c.x - next.c.x, y: prev.c.y - next.c.y },
    prev.r + toolRadius,
    toolRadius,
  )
}

// Circles touching both sides, from radius rStart down to rEnd (the apex at
// 0): centers on the bisector.
function sideSide(g: Geo, rStart: number, rEnd: number): Family {
  const at = (u: number): Circle => {
    const r = rStart - u
    return { c: { x: (r + g.s) / Math.sin(g.phi), y: 0 }, r }
  }
  return {
    walls: [
      { kind: 'side', sigma: 1 },
      { kind: 'side', sigma: -1 },
    ],
    at,
    span: rStart - rEnd,
    corner: rEnd === 0 ? at(rStart).c : null,
  }
}

// Circles touching a side and the outer arc (or the hub arc), radius from
// rStart down to 0 at the corner where the two walls meet.
function sideArc(g: Geo, sigma: 1 | -1, arc: 'outer' | 'inner', rStart: number): Family {
  const n = sideN(g, sigma)
  const u = sideU(g, sigma)
  const at = (step: number): Circle => {
    const r = rStart - step
    const dist = arc === 'outer' ? g.rOut - r : g.rIn + r
    const t = Math.sqrt(Math.max(0, dist * dist - (g.s + r) * (g.s + r)))
    return { c: { x: n.x * (g.s + r) + u.x * t, y: n.y * (g.s + r) + u.y * t }, r }
  }
  return { walls: [{ kind: 'side', sigma }, { kind: arc }], at, span: rStart, corner: at(rStart).c }
}

// Circles touching the hub and the outer arc: constant radius, centers on
// the mid circle, turning toward the side `sigma` by up to psiEnd.
function wing(g: Geo, sigma: 1 | -1, psiEnd: number): Family {
  const mid = (g.rIn + g.rOut) / 2
  const r = (g.rOut - g.rIn) / 2
  return {
    walls: [{ kind: 'inner' }, { kind: 'outer' }],
    at: (u) => ({ c: { x: mid * Math.cos(sigma * u), y: mid * Math.sin(sigma * u) }, r }),
    span: psiEnd,
    corner: null,
  }
}

function walk(g: Geo, family: Family, toolRadius: number, theta: number): SectorBranch {
  const circles: Circle[] = [family.at(0)]
  let u = 0
  let complete = false
  let reachedCorner = false
  // Corner families converge geometrically toward the corner; below this
  // radius the last sliver is one straight cut into it (same rule as the
  // Rectangle's phase C). Candidates never go all the way to radius 0: a
  // zero-radius circle has no arc to measure engagement along, and one
  // arbitrary sample could wrongly approve jumping the whole corner.
  const minRadius = toolRadius * MIN_PEEL_RADIUS_FRACTION
  while (circles.length < ADAPTIVE_MAX_STEPS) {
    const remaining = family.span - u
    if (!(remaining > EPS)) {
      complete = true
      break
    }
    const from = u
    const prev = circles[circles.length - 1]
    const reach = family.corner ? remaining - minRadius / 2 : remaining
    if (family.corner && !(reach > EPS)) {
      complete = true
      reachedCorner = true
      break
    }
    const du = largestStepWithin((step) => stepEngagement(g, family.walls, family.at(from + step), prev, toolRadius), theta, reach)
    if (family.corner) {
      if (!(du > EPS) || family.at(u + du).r < minRadius) {
        complete = true
        reachedCorner = true
        break
      }
    } else if (!(du > EPS)) {
      break
    }
    u += du
    circles.push(family.at(u))
  }
  return { walls: family.walls, circles, corner: reachedCorner ? family.corner : null, children: [], complete }
}

const planCache = new Map<string, Omit<SectorAdaptivePlan, 'center' | 'origin' | 'bisector'>>()

// Everything a sector cell needs, the same on every Z level. Null when the
// cell has no roughing room (validation rejects those).
export function planSectorAdaptive(
  cell: SectorCell,
  opts: { toolRadius: number; theta: number; roughWallDepth: number; helixRadius: number },
): SectorAdaptivePlan | null {
  const d = opts.roughWallDepth
  const phi = (cell.a1 - cell.a0) / 2
  const s = cell.s + d
  const rOut = cell.rOut - d
  const apex = s / Math.sin(phi)
  // The hub only matters when it reaches between the sides.
  const hub = cell.rIn + d
  const rIn = hub > apex ? hub : 0
  const g: Geo = { rIn, rOut, s, phi }
  const bisector = (cell.a0 + cell.a1) / 2
  const toWorld = (p: Point2D): Point2D => ({
    x: cell.origin.x + p.x * Math.cos(bisector) - p.y * Math.sin(bisector),
    y: cell.origin.y + p.x * Math.sin(bisector) + p.y * Math.cos(bisector),
  })

  // Inscribed circle: touching both sides and the outer arc, unless the hub
  // gets in the way — then touching the hub and the outer arc.
  const xNarrow = (rOut + s) / (1 + Math.sin(phi))
  const rNarrow = rOut - xNarrow
  const wide = rIn > 0 && xNarrow - rIn < rNarrow
  const root: Circle = wide ? { c: { x: (rIn + rOut) / 2, y: 0 }, r: (rOut - rIn) / 2 } : { c: { x: xNarrow, y: 0 }, r: rNarrow }
  if (!(root.r > 0)) return null

  const key = [rIn, rOut, s, phi, opts.toolRadius, opts.theta, opts.helixRadius].map((v) => v.toFixed(9)).join('|')
  let shared = planCache.get(key)
  if (!shared) {
    const rings = phaseARadii(opts.toolRadius, opts.theta, opts.helixRadius, root.r)
    const go = (family: Family) => walk(g, family, opts.toolRadius, opts.theta)
    const branches: SectorBranch[] = []
    if (wide) {
      const psiEnd = phi - Math.asin(Math.min(1, (s + root.r) / root.c.x))
      for (const sigma of [1, -1] as const) {
        const w = go(wing(g, sigma, Math.max(0, psiEnd)))
        if (w.complete) w.children = [go(sideArc(g, sigma, 'outer', root.r)), go(sideArc(g, sigma, 'inner', root.r))]
        branches.push(w)
      }
    } else {
      branches.push(go(sideArc(g, 1, 'outer', root.r)))
      if (rIn > 0) {
        // The stem ends where its circle meets the hub, then splits.
        const rHub = ((rIn - s) / (1 - Math.sin(phi))) * Math.sin(phi) - s
        const stem = go(sideSide(g, root.r, Math.max(0, rHub)))
        if (stem.complete) stem.children = [go(sideArc(g, 1, 'inner', rHub)), go(sideArc(g, -1, 'inner', rHub))]
        branches.push(stem)
      } else {
        branches.push(go(sideSide(g, root.r, 0)))
      }
      branches.push(go(sideArc(g, -1, 'outer', root.r)))
    }
    shared = { ringRadii: rings.radii, ringsComplete: rings.complete, geo: g, root, branches }
    if (planCache.size >= 16) planCache.clear()
    planCache.set(key, shared)
  }
  return { ...shared, center: toWorld(root.c), origin: cell.origin, bisector }
}

function branchComplete(b: SectorBranch): boolean {
  return b.complete && b.children.every(branchComplete)
}

// True when the cell's toolpath would be cut short by a safety cap.
export function sectorAdaptiveExceedsLimits(plan: SectorAdaptivePlan | null): boolean {
  if (plan === null) return false
  return !plan.ringsComplete || !plan.branches.every(branchComplete)
}

// Phase A + every branch for one Z level, the tool at the helix start
// (inscribed center + helix radius along +X) at the level's depth. Ends
// back at the inscribed circle's center.
export function appendSectorAdaptiveLevel(ctx: LevelContext, plan: SectorAdaptivePlan): void {
  const { b, sign, direction } = ctx
  const g = plan.geo
  const cosB = Math.cos(plan.bisector)
  const sinB = Math.sin(plan.bisector)
  const w = (p: Point2D): Point2D => ({ x: plan.origin.x + p.x * cosB - p.y * sinB, y: plan.origin.y + p.x * sinB + p.y * cosB })
  const to = (kind: 'cut' | 'link', p: Point2D) => {
    const q = w(p)
    b.lineTo(kind, q.x, q.y)
  }
  // Follows `wall` from `from` to `target`: straight along a side, an arc
  // around the circle's center along the outer or hub arc.
  const cutAlongWall = (wall: Wall, from: Point2D, target: Point2D) => {
    if (wall.kind === 'side') return to('cut', target)
    const a0 = Math.atan2(from.y, from.x)
    let delta = Math.atan2(target.y, target.x) - a0
    while (delta > Math.PI) delta -= 2 * Math.PI
    while (delta < -Math.PI) delta += 2 * Math.PI
    if (Math.abs(delta) < 1e-12) return
    if (wall.kind === 'inner') {
      // The hub is convex from the cell's side: any chord of its arc (G1
      // mode, or a controller's own arc segments) would dip into it. A
      // polyline circumscribed about the arc — tangent to it at both ends
      // and at every segment's middle — never does.
      const n = Math.max(1, Math.ceil(Math.abs(delta) / WALL_SEGMENT))
      const step = delta / n
      const r = g.rIn / Math.cos(step / 2)
      for (let j = 0; j < n; j++) {
        const a = a0 + (j + 0.5) * step
        to('cut', { x: r * Math.cos(a), y: r * Math.sin(a) })
      }
      return to('cut', target)
    }
    const dir: ArcDirection = delta > 0 ? 'ccw' : 'cw'
    b.arc('cut', plan.origin, dir, Math.abs(delta))
  }
  const involvesHub = (br: SectorBranch) => br.walls.some((wall) => wall.kind === 'inner')

  // The tool starts and ends at the branch's base circle center.
  const emit = (br: SectorBranch) => {
    const { circles } = br
    let startWall: Wall = br.walls[0]
    let sPrev = tangency(g, startWall, circles[0])
    for (let k = 1; k < circles.length; k++) {
      const arc = leadingArc(g, br.walls, circles[k], circles[k - 1])
      const wall = sign > 0 ? arc.startWall : arc.endWall
      const angle = sign > 0 ? arc.a0 : arc.a0 + arc.sweep
      const start = { x: circles[k].c.x + circles[k].r * Math.cos(angle), y: circles[k].c.y + circles[k].r * Math.sin(angle) }
      if (k === 1) {
        startWall = wall
        sPrev = tangency(g, wall, circles[0])
        to('link', sPrev)
      }
      cutAlongWall(wall, sPrev, start)
      b.arc('cut', w(circles[k].c), direction, arc.sweep)
      to('link', start)
      sPrev = start
    }
    if (circles.length === 1 && br.corner) to('link', sPrev)
    if (br.corner) cutAlongWall(startWall, sPrev, br.corner)
    const end = circles[circles.length - 1]
    if (br.children.length > 0) {
      to('link', end.c)
      for (const child of br.children) emit(child)
    }
    // Back to the base center: straight when that cannot cross the hub,
    // otherwise retracing the branch's own centers.
    if (involvesHub(br)) for (let k = circles.length - 1; k >= 0; k--) to('link', circles[k].c)
    else to('link', circles[0].c)
  }

  phaseA({ ...ctx, cx: plan.center.x, cy: plan.center.y }, plan.ringRadii, 0)
  to('link', plan.root.c)
  for (const br of plan.branches) emit(br)
}
