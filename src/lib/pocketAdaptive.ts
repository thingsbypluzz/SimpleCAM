import { computeDepthPasses, exceedsPassLimit } from './depthPasses'
import { pocketCenter, pocketCircleWallRadius, pocketRectWallHalfDims } from './pocketGeometry'
import { engagementAngleFor, largestStepWithin, maxArcEngagement, nextConstantEngagementRadius } from './pocketAdaptiveMath'
import { pocketEntryPoint } from './pocketZTransition'
import { buildLevelDescents } from './surfaceZTransition'
import type { InterpolationMode, Point2D, WizardParams } from '../types/wizard'
import { movePoints, toolpathToGcode, ToolpathBuilder, type ArcDirection, type Move, type MoveKind, type Point3D, type Toolpath } from './toolpath'

// Pocket Adaptive — engagement-controlled clearing for Circle and
// Rectangle, pure closed-form geometry (no material simulation). Produces
// ONE move list that the G-code engine (adaptiveMovesToGcode() below) and both
// previews consume, so what is drawn can never drift from what is cut.
// See CLAUDE.md's Pocket Adaptive notes for the phase structure.

// The move list itself is the shared lib/toolpath.ts model; these names are
// kept for the existing call sites (pocket.ts, both previews, tests).
export type { ArcDirection, Point3D }
export type AdaptiveMove = Move
export type AdaptiveMoveKind = MoveKind
export type AdaptiveToolpath = Toolpath
export const adaptiveMovePoints = movePoints

// Share of the target engagement reserved for the outward tilt of the
// ring-to-ring ramp in phase A: rings are spaced for (1 − f)·θ*, and the
// ramp is made just long enough that its tilt adds at most f·θ* — the
// engagement along the ramp (ring engagement + tilt) never exceeds θ*.
const RAMP_TILT_FRACTION = 0.2
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


interface LevelContext {
  b: ToolpathBuilder
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
// Ring radii for phase A, `fromRho` first — the same on every Z level, so
// computed once per toolpath. `complete` is false when the loop stopped
// before reaching `toRho` (MAX_STEPS or no progress), i.e. a ring of
// material next to the wall would be left uncut (BL-55).
function phaseARadii(toolRadius: number, theta: number, fromRho: number, toRho: number): { radii: number[]; complete: boolean } {
  const ringTheta = theta * (1 - RAMP_TILT_FRACTION)
  const radii = [fromRho]
  let rho = fromRho
  for (let step = 0; step < MAX_STEPS && rho < toRho - EPS; step++) {
    let next = nextConstantEngagementRadius(rho, toolRadius, ringTheta)
    if (!(next > rho + EPS) && rho > EPS) break
    if (next > toRho - EPS || !(next > rho + EPS)) next = toRho
    radii.push(next)
    rho = next
  }
  return { radii, complete: !(rho < toRho - EPS) }
}

function phaseA(ctx: LevelContext, radii: number[], startAngle: number): number {
  const { b, cx, cy, theta, sign, direction } = ctx
  const tanTilt = Math.tan(theta * RAMP_TILT_FRACTION)
  let angle = startAngle
  for (let i = 1; i < radii.length; i++) {
    const rho = radii[i - 1]
    const next = radii[i]
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
  return phaseBStationsWithStatus(toolRadius, theta, hu, h).stations
}

// `complete` is false when MAX_STEPS stopped the stations short of the
// short wall (BL-55).
function phaseBStationsWithStatus(
  toolRadius: number,
  theta: number,
  hu: number,
  h: number,
): { stations: number[]; complete: boolean } {
  const lMax = hu - h
  if (lMax <= EPS) return { stations: [], complete: true }
  // Arc of radius h around (L, 0), previous one around (L − p, 0): its
  // apex engages like a phase-A ring, its ends add an outward tilt.
  const p = largestStepWithin(
    (step) => maxArcEngagement(h, -Math.PI / 2, Math.PI / 2, { x: -step, y: 0 }, h + toolRadius, toolRadius),
    theta,
    Math.max(h, toolRadius),
  )
  if (!(p > EPS)) return { stations: [], complete: false }
  const stations: number[] = []
  for (let l = p; stations.length < MAX_STEPS; l += p) {
    if (l >= lMax - EPS) {
      stations.push(lMax)
      return { stations, complete: true }
    }
    stations.push(l)
  }
  return { stations, complete: false }
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

// BL-55: true when the toolpath would be cut short by a MAX_STEPS/
// MAX_PASSES safety cap instead of reaching the walls and full depth —
// validation blocks Generate on it. Only the per-toolpath sequences are
// computed here (cheap), not the move list itself.
export function adaptiveExceedsLimits(params: Pick<WizardParams, 'pocket' | 'feeds'>): boolean {
  const { pocket, feeds } = params
  const toolRadius = pocket.toolDiameter / 2
  const theta = engagementAngleFor(pocket.optimalLoadPercent)
  const helixRadius = pocket.helixRadius
  if (!(toolRadius > 0) || !(helixRadius > 0) || !(theta > 0)) return false

  const pitch = 2 * Math.PI * helixRadius * Math.tan((pocket.rampAngleDeg * Math.PI) / 180)
  let fromZ = feeds.startZ
  for (const { toZ } of buildLevelDescents(feeds.startZ, pocket.totalDepth, feeds.stepdown)) {
    if (exceedsPassLimit(fromZ - toZ, pitch)) return true
    fromZ = toZ
  }

  if (pocket.shape === 'circle') {
    const wallRadius = pocketCircleWallRadius(pocket)
    return wallRadius > 0 && !phaseARadii(toolRadius, theta, helixRadius, wallRadius).complete
  }
  const { halfWidth, halfHeight } = pocketRectWallHalfDims(pocket)
  const hu = Math.max(halfWidth, halfHeight)
  const hv = Math.min(halfWidth, halfHeight)
  if (!(hv > 0)) return false
  const peel = phaseCRadii(toolRadius, theta, hv)
  return (
    !phaseARadii(toolRadius, theta, helixRadius, hv).complete ||
    !phaseBStationsWithStatus(toolRadius, theta, hu, hv).complete ||
    peel[peel.length - 1] !== 0
  )
}

export function buildAdaptiveToolpath(params: Pick<WizardParams, 'pocket' | 'feeds'>): AdaptiveToolpath {
  const { pocket, feeds } = params
  const center = pocketCenter(pocket)
  const toolRadius = pocket.toolDiameter / 2
  const helixRadius = pocket.helixRadius
  const entry = pocketEntryPoint(center.x, center.y, 'helix', helixRadius)
  const start: Point3D = { x: entry.x, y: entry.y, z: feeds.startZ }
  const b = new ToolpathBuilder(start, true)

  const theta = engagementAngleFor(pocket.optimalLoadPercent)
  if (!(toolRadius > 0) || !(helixRadius > 0) || !(theta > 0)) return { start, moves: [] }

  // Under M3 (spindle CW seen from above) an internal cut travelling CCW has
  // the uncut material on its right — climb milling; CW is conventional
  // (BL-44: this mapping used to be inverted).
  const sign: 1 | -1 = pocket.cutDirection === 'climb' ? 1 : -1
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
  const ringRadii = phaseARadii(toolRadius, theta, helixRadius, isCircle ? wallRadius : hv).radii
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

    phaseA(ctx, ringRadii, 0)
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
  return toolpathToGcode(toolpath, {
    feeds: { cut: opts.cutFeed, link: opts.linkFeed },
    interpolation: opts.interpolation,
    leadInRapid: false,
  })
}
