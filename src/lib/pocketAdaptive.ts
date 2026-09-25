import { computeDepthPasses } from './depthPasses'
import { fmt } from './format'
import { pocketCenter, pocketCircleWallRadius, pocketRectWallHalfDims } from './pocketGeometry'
import { engagementAngleFor, largestStepWithin, maxArcEngagement, nextConstantEngagementRadius } from './pocketAdaptiveMath'
import { pocketEntryPoint } from './pocketZTransition'
import { buildLevelDescents } from './surfaceZTransition'
import type { InterpolationMode, Point2D, WizardParams } from '../types/wizard'

// Pocket Adaptive — engagement-controlled clearing for Circle and
// Rectangle, pure closed-form geometry (no material simulation). Produces
// ONE move list that the G-code engine (adaptiveMovesToGcode() below) and both
// previews consume, so what is drawn can never drift from what is cut.
// See CLAUDE.md's Pocket Adaptive notes for the phase structure.

export type AdaptiveMoveKind = 'cut' | 'link'
export type ArcDirection = 'cw' | 'ccw'

export interface Point3D {
  x: number
  y: number
  z: number
}

export type AdaptiveMove =
  | { type: 'line'; kind: AdaptiveMoveKind; to: Point3D }
  | { type: 'arc'; kind: AdaptiveMoveKind; to: Point3D; center: Point2D; direction: ArcDirection; sweep: number }

export interface AdaptiveToolpath {
  start: Point3D
  moves: AdaptiveMove[]
}

// Share of the target engagement reserved for the outward tilt of the
// ring-to-ring ramp in phase A: rings are spaced for (1 − f)·θ*, and the
// ramp is made just long enough that its tilt adds at most f·θ* — the
// engagement along the ramp (ring engagement + tilt) never exceeds θ*.
const RAMP_TILT_FRACTION = 0.2
// Same 5° sampling density used for every G1-approximated curve in the app.
const SEGMENT_RAD = (5 * Math.PI) / 180
// Phase-A ramps are always G1 polygons (a changing radius has no G2/G3
// form). Each chord leaves its end point tilted outward by half its own
// angle, which adds straight onto engagement — 2° segments keep that ≤ 1°.
const RAMP_SEGMENT_RAD = (2 * Math.PI) / 180
// Corner peeling (phase C) converges geometrically toward the sharp
// corner; below this fraction of the tool radius the remaining sliver is
// taken in one final straight move into the corner.
const MIN_PEEL_RADIUS_FRACTION = 0.01
// Safety net for transient/invalid values while typing (the previews
// regenerate on every keystroke) — never loop forever.
const MAX_STEPS = 5000
const EPS = 1e-6

function arcEndPoint(from: Point3D, center: Point2D, direction: ArcDirection, sweep: number, z: number): Point3D {
  const r = Math.hypot(from.x - center.x, from.y - center.y)
  const a = Math.atan2(from.y - center.y, from.x - center.x) + (direction === 'ccw' ? sweep : -sweep)
  return { x: center.x + r * Math.cos(a), y: center.y + r * Math.sin(a), z }
}

// Points along one move, excluding its start (the previous move's end).
// Arcs are sampled at SEGMENT_RAD, Z interpolated linearly (helix turns),
// last point snapped exactly onto `to`. Shared by the G1 G-code output and
// both previews.
export function adaptiveMovePoints(from: Point3D, move: AdaptiveMove): Point3D[] {
  if (move.type === 'line') return [move.to]
  const segments = Math.max(1, Math.round(move.sweep / SEGMENT_RAD))
  const r = Math.hypot(from.x - move.center.x, from.y - move.center.y)
  const a0 = Math.atan2(from.y - move.center.y, from.x - move.center.x)
  const sign = move.direction === 'ccw' ? 1 : -1
  const points: Point3D[] = []
  for (let i = 1; i < segments; i++) {
    const t = i / segments
    const a = a0 + sign * move.sweep * t
    points.push({ x: move.center.x + r * Math.cos(a), y: move.center.y + r * Math.sin(a), z: from.z + (move.to.z - from.z) * t })
  }
  points.push(move.to)
  return points
}

class MoveBuilder {
  readonly moves: AdaptiveMove[] = []
  current: Point3D

  constructor(start: Point3D) {
    this.current = start
  }

  lineTo(kind: AdaptiveMoveKind, x: number, y: number, z = this.current.z) {
    const c = this.current
    if (Math.abs(x - c.x) < EPS && Math.abs(y - c.y) < EPS && Math.abs(z - c.z) < EPS) return
    const to = { x, y, z }
    this.moves.push({ type: 'line', kind, to })
    this.current = to
  }

  arc(kind: AdaptiveMoveKind, center: Point2D, direction: ArcDirection, sweep: number, z = this.current.z) {
    const to = arcEndPoint(this.current, center, direction, sweep, z)
    this.moves.push({ type: 'arc', kind, to, center, direction, sweep })
    this.current = to
  }
}

interface LevelContext {
  b: MoveBuilder
  cx: number
  cy: number
  toolRadius: number
  theta: number
  sign: 1 | -1
  direction: ArcDirection
}

// Phase A — concentric tool-center rings around the pocket center, from
// `fromRho` (the helix bore) out to `toRho`, spaced so each full lap
// engages (1 − RAMP_TILT_FRACTION)·θ*, joined by a spiral ramp just long
// enough that its outward tilt tops engagement up to θ* at most. The last
// ring is snapped onto `toRho`. Returns the angle the last lap ends at.
function phaseA(ctx: LevelContext, fromRho: number, toRho: number, startAngle: number): number {
  const { b, cx, cy, toolRadius, theta, sign, direction } = ctx
  const ringTheta = theta * (1 - RAMP_TILT_FRACTION)
  const tanTilt = Math.tan(theta * RAMP_TILT_FRACTION)
  let rho = fromRho
  let angle = startAngle
  for (let step = 0; step < MAX_STEPS && rho < toRho - EPS; step++) {
    let next = nextConstantEngagementRadius(rho, toolRadius, ringTheta)
    if (!(next > rho + EPS) && rho > EPS) break
    if (next > toRho - EPS || !(next > rho + EPS)) next = toRho
    const dr = next - rho
    const sweep = dr / tanTilt / ((rho + next) / 2)
    const segments = Math.max(1, Math.ceil(sweep / RAMP_SEGMENT_RAD))
    for (let i = 1; i <= segments; i++) {
      const t = i / segments
      const a = angle + sign * sweep * t
      const r = rho + dr * t
      b.lineTo('cut', cx + r * Math.cos(a), cy + r * Math.sin(a))
    }
    angle += sign * sweep
    b.arc('cut', { x: cx, y: cy }, direction, 2 * Math.PI)
    rho = next
  }
  return angle
}

// Rectangle local frame: u = the pocket's longer axis, v = the shorter.
// For a taller-than-wide pocket the frame is rotated +90° (u → +Y), a
// proper rotation, so CCW/CW arcs keep their meaning.
function localMapper(cx: number, cy: number, longAxisIsX: boolean) {
  return (u: number, v: number): Point2D => (longAxisIsX ? { x: cx + u, y: cy + v } : { x: cx - v, y: cy + u })
}

// Phase B — non-square Rectangle only. The phase-A circle (radius h = the
// shorter half-dimension) already touches both long walls; each end is
// then pushed out along u to the short wall by constant-radius half-arcs
// whose centers advance by the largest step p that keeps engagement along
// the whole half-arc (maxArcEngagement) within θ*. Each step: cut along the start wall to the next arc's start,
// cut the arc, link straight back across the just-cleared disk. One end
// is finished completely before travelling to the other.
// Station positions (arc-center offsets along u) for phase B — the same on
// every Z level, so computed once per toolpath.
function phaseBStations(toolRadius: number, theta: number, hu: number, h: number): number[] {
  const lMax = hu - h
  if (lMax <= EPS) return []
  // Arc of radius h around (L, 0), previous one around (L − p, 0): its
  // apex engages like a phase-A ring, its ends add an outward tilt.
  const p = largestStepWithin(
    (step) => maxArcEngagement(h, -Math.PI / 2, Math.PI / 2, { x: -step, y: 0 }, h + toolRadius, toolRadius),
    theta,
    Math.max(h, toolRadius),
  )
  if (!(p > EPS)) return []
  const stations: number[] = []
  for (let l = p; stations.length < MAX_STEPS; l += p) {
    if (l >= lMax - EPS) {
      stations.push(lMax)
      break
    }
    stations.push(l)
  }
  return stations
}

function phaseB(ctx: LevelContext, map: (u: number, v: number) => Point2D, h: number, stations: number[]) {
  const { b, sign, direction } = ctx
  if (stations.length === 0) return

  const to = (kind: 'cut' | 'link', u: number, v: number) => {
    const pt = map(u, v)
    b.lineTo(kind, pt.x, pt.y)
  }

  for (const e of [1, -1]) {
    const vStart = -e * sign * h
    to('link', 0, vStart)
    stations.forEach((l, i) => {
      to('cut', e * l, vStart)
      b.arc('cut', map(e * l, 0), direction, Math.PI)
      if (i < stations.length - 1) to('link', e * l, vStart)
    })
  }
}

// Phase C — the four corner remnants left between the rounded ends and the
// sharp tool-center corners. Each corner is peeled separately with
// quarter-arcs of shrinking corner radius r (centered hu − r, hv − r from
// the center), the radius step Δr the largest for which engagement along
// the WHOLE quarter-arc (maxArcEngagement) stays within θ*. Each step
// mirrors phase B: cut along the start wall, cut the quarter-arc, link
// back along its chord. Ends with one straight cut into the sharp corner.
// Corners are visited in the cut direction's own rotation order, so every
// hop between corners runs along an already-cleared wall.
// Corner-peel radii for phase C (hv down to 0) — the same on every Z level
// and for all four corners, so computed once per toolpath.
function phaseCRadii(toolRadius: number, theta: number, hv: number): number[] {
  // Canonical corner (+u, +v): arc of radius r − Δ around the origin from
  // the u-wall (angle 0) to the v-wall (90°); the previous arc's center sits
  // Δ back along both axes. The worst point is near the arc's start (and
  // the straight wall cut leading into it), not the diagonal apex.
  const radii: number[] = [hv]
  for (let r = hv; radii.length < MAX_STEPS; ) {
    const rPrev = r
    const dr = largestStepWithin(
      (step) => maxArcEngagement(rPrev - step, 0, Math.PI / 2, { x: -step, y: -step }, rPrev + toolRadius, toolRadius),
      theta,
      rPrev,
    )
    r = rPrev - dr
    if (r < toolRadius * MIN_PEEL_RADIUS_FRACTION || !(dr > EPS)) {
      radii.push(0)
      break
    }
    radii.push(r)
  }
  return radii
}

function phaseC(ctx: LevelContext, map: (u: number, v: number) => Point2D, hu: number, hv: number, radii: number[]) {
  const { b, sign, direction } = ctx
  const corners: [number, number][] =
    sign > 0
      ? [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ]
      : [
          [-1, 1],
          [1, 1],
          [1, -1],
          [-1, -1],
        ]

  const to = (kind: 'cut' | 'link', pt: Point2D) => b.lineTo(kind, pt.x, pt.y)

  for (const [su, sv] of corners) {
    const startOnU = su * sv > 0 === sign > 0
    const onU = (r: number) => map(su * hu, sv * (hv - r))
    const onV = (r: number) => map(su * (hu - r), sv * hv)
    const start = (r: number) => (startOnU ? onU(r) : onV(r))

    to('link', start(radii[0]))
    for (let j = 1; j < radii.length; j++) {
      const r = radii[j]
      to('cut', start(r))
      if (r === 0) break
      b.arc('cut', map(su * (hu - r), sv * (hv - r)), direction, Math.PI / 2)
      to('link', start(r))
    }
  }
}

export function buildAdaptiveToolpath(params: Pick<WizardParams, 'pocket' | 'feeds'>): AdaptiveToolpath {
  const { pocket, feeds } = params
  const center = pocketCenter(pocket)
  const toolRadius = pocket.toolDiameter / 2
  const helixRadius = pocket.helixRadius
  const entry = pocketEntryPoint(center.x, center.y, 'helix', helixRadius)
  const start: Point3D = { x: entry.x, y: entry.y, z: feeds.startZ }
  const b = new MoveBuilder(start)

  const theta = engagementAngleFor(pocket.optimalLoadPercent)
  if (!(toolRadius > 0) || !(helixRadius > 0) || !(theta > 0)) return { start, moves: [] }

  const sign: 1 | -1 = pocket.cutDirection === 'climb' ? -1 : 1
  const direction: ArcDirection = sign > 0 ? 'ccw' : 'cw'
  const ctx: LevelContext = { b, cx: center.x, cy: center.y, toolRadius, theta, sign, direction }
  const rampRad = (pocket.rampAngleDeg * Math.PI) / 180
  const pitch = 2 * Math.PI * helixRadius * Math.tan(rampRad)

  const isCircle = pocket.shape === 'circle'
  const wallRadius = pocketCircleWallRadius(pocket)
  const { halfWidth, halfHeight } = pocketRectWallHalfDims(pocket)
  const longAxisIsX = halfWidth >= halfHeight
  const hu = Math.max(halfWidth, halfHeight)
  const hv = Math.min(halfWidth, halfHeight)
  if (isCircle ? !(wallRadius > 0) : !(hv > 0)) return { start, moves: [] }
  const map = localMapper(center.x, center.y, longAxisIsX)
  const stations = isCircle ? [] : phaseBStations(toolRadius, theta, hu, hv)
  const peelRadii = isCircle ? [] : phaseCRadii(toolRadius, theta, hv)

  let fromZ = feeds.startZ
  for (const { toZ } of buildLevelDescents(feeds.startZ, pocket.totalDepth, feeds.stepdown)) {
    // Stay down between levels: the pocket is fully cleared at the
    // previous depth, so a straight link back to the helix start is safe.
    b.lineTo('link', entry.x, entry.y)
    let z = fromZ
    for (const turn of computeDepthPasses(fromZ - toZ, pitch)) {
      z -= turn
      b.arc('cut', center, direction, 2 * Math.PI, z)
    }
    // Flat pass squaring off the helical ledge — same reason as
    // pocketZTransitionMoves()'s finishing pass.
    b.arc('cut', center, direction, 2 * Math.PI, toZ)

    phaseA(ctx, helixRadius, isCircle ? wallRadius : hv, 0)
    if (!isCircle) {
      phaseB(ctx, map, hv, stations)
      phaseC(ctx, map, hu, hv, peelRadii)
    }
    fromZ = toZ
  }

  return { start, moves: b.moves }
}

// G-code for a move list. Cutting moves run at `cutFeed`, linking moves
// (through already-cleared area) at `linkFeed` — always G1, never G0 below
// Safe Z. Arcs follow the G2/G3 vs G1 toggle like every other circle in
// the app; a full turn (start === end) uses the same I/J full-circle
// convention as fullCircleMove().
export function adaptiveMovesToGcode(
  toolpath: AdaptiveToolpath,
  opts: { cutFeed: number; linkFeed: number; interpolation: InterpolationMode },
): string[] {
  const lines: string[] = []
  let current = toolpath.start
  for (const move of toolpath.moves) {
    const feed = move.kind === 'cut' ? opts.cutFeed : opts.linkFeed
    if (move.type === 'arc' && opts.interpolation === 'arc') {
      const code = move.direction === 'cw' ? 'G2' : 'G3'
      const i = move.center.x - current.x
      const j = move.center.y - current.y
      lines.push(`${code} X${fmt(move.to.x)} Y${fmt(move.to.y)} Z${fmt(move.to.z)} I${fmt(i)} J${fmt(j)} F${fmt(feed)}`)
    } else {
      for (const p of adaptiveMovePoints(current, move)) {
        lines.push(`G1 X${fmt(p.x)} Y${fmt(p.y)} Z${fmt(p.z)} F${fmt(feed)}`)
      }
    }
    current = move.to
  }
  return lines
}
