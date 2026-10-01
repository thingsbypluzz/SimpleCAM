import type { Point2D } from '../types/wizard'
import {
  ADAPTIVE_MAX_STEPS,
  MIN_PEEL_RADIUS_FRACTION,
  phaseA,
  phaseARadii,
  type LevelContext,
} from './pocketAdaptive'
import { largestStepWithin, maxArcEngagement } from './pocketAdaptiveMath'
import { cellInscribed, cellLoop, type LightCell } from './pocketLightened'
import type { ToolpathBuilder } from './toolpath'

// Adaptive clearing of one triangular Lightened cell (BL-83, OP-6 stage 2).
// A triangle's inscribed circle touches all three sides, so the Rectangle's
// three phases shrink to two: phase A — the same constant-engagement rings
// (phaseARadii()/phaseA()) around the incenter, out to the roughing wall's
// inscribed circle — then phase C at each of the three corners, generalized
// from 90° to the corner's own angle α. No phase B: nothing is left between
// the circle and the sides except the corners.
//
// Corner peeling at a vertex V with angle α: quarter-arcs become arcs of
// π − α whose center sits on the bisector r / sin(α/2) from V and which
// touch both sides r / tan(α/2) from V. The first radius is the inscribed
// circle's (its center is then the incenter itself); each next one is the
// largest step keeping engagement along the whole arc within θ*
// (maxArcEngagement, the previous arc's circle offset Δ / sin(α/2) back
// along the bisector), until a final straight cut into V. Same move pattern
// as the Rectangle: cut along the side the arc starts on, cut the arc, link
// back along its chord (through area the arc and the previous circle
// already cleared — the tests measure that it removes no material).

const EPS = 1e-6

// Peel radii for a corner of angle `alpha` (rad), from `r0` down to 0.
// alpha = 90° gives phaseCRadii()'s sequence.
// The peel sequence depends only on these four numbers, and a Lightened
// layout repeats the same corners many times (every inner Warren triangle,
// both halves of an X-grid cell) — while validation recomputes on every
// keystroke. Memoized, bounded.
const peelCache = new Map<string, number[]>()
const PEEL_CACHE_LIMIT = 256

export function cornerPeelRadii(toolRadius: number, theta: number, r0: number, alpha: number): number[] {
  const key = [toolRadius, theta, r0, alpha].map((v) => v.toFixed(9)).join('|')
  const hit = peelCache.get(key)
  if (hit) return hit
  const radii = computeCornerPeelRadii(toolRadius, theta, r0, alpha)
  if (peelCache.size >= PEEL_CACHE_LIMIT) peelCache.clear()
  peelCache.set(key, radii)
  return radii
}

function computeCornerPeelRadii(toolRadius: number, theta: number, r0: number, alpha: number): number[] {
  const half = (Math.PI - alpha) / 2
  const offset = 1 / Math.sin(alpha / 2)
  const radii: number[] = [r0]
  for (let r = r0; radii.length < ADAPTIVE_MAX_STEPS; ) {
    const rPrev = r
    const dr = largestStepWithin(
      (step) => maxArcEngagement(rPrev - step, -half, half, { x: -step * offset, y: 0 }, rPrev + toolRadius, toolRadius),
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

interface Corner {
  vertex: Point2D
  bisector: Point2D // unit, from the vertex into the cell
  alpha: number
  sideIn: Point2D // unit, from the vertex along the side the travel arrives on
  sideOut: Point2D // unit, from the vertex along the side it leaves on
  radii: number[]
}

export interface CellAdaptivePlan {
  center: Point2D // incenter of the roughing wall
  ringRadii: number[]
  ringsComplete: boolean
  corners: Corner[] // in travel order
}

const unit = (p: Point2D): Point2D => {
  const l = Math.hypot(p.x, p.y)
  return l > 0 ? { x: p.x / l, y: p.y / l } : { x: 0, y: 0 }
}

// Everything an Adaptive cell needs, computed once per toolpath (the same
// on every Z level). Null when the cell is no triangle or has no roughing
// room (validation rejects those).
export function planCellAdaptive(
  cell: LightCell,
  opts: { toolRadius: number; theta: number; roughWallDepth: number; helixRadius: number; sign: 1 | -1 },
): CellAdaptivePlan | null {
  if (cell.kind !== 'triangle') return null
  const wall = cellLoop(cell, opts.roughWallDepth)
  if (wall.length !== 3) return null
  const { center, radius } = cellInscribed(cell)
  const rho = radius - opts.roughWallDepth
  if (!(rho > 0)) return null
  const rings = phaseARadii(opts.toolRadius, opts.theta, opts.helixRadius, rho)
  // CCW travel visits the (CCW) vertices in order, arriving on the side from
  // the previous vertex and leaving along the one to the next; CW mirrors it.
  const order = opts.sign > 0 ? [0, 1, 2] : [0, 2, 1]
  const corners = order.map((i) => {
    const vertex = wall[i]
    const prev = wall[(i + 2) % 3]
    const next = wall[(i + 1) % 3]
    const toPrev = unit({ x: prev.x - vertex.x, y: prev.y - vertex.y })
    const toNext = unit({ x: next.x - vertex.x, y: next.y - vertex.y })
    const alpha = Math.acos(Math.max(-1, Math.min(1, toPrev.x * toNext.x + toPrev.y * toNext.y)))
    return {
      vertex,
      bisector: unit({ x: toPrev.x + toNext.x, y: toPrev.y + toNext.y }),
      alpha,
      sideIn: opts.sign > 0 ? toPrev : toNext,
      sideOut: opts.sign > 0 ? toNext : toPrev,
      radii: cornerPeelRadii(opts.toolRadius, opts.theta, rho, alpha),
    }
  })
  return { center, ringRadii: rings.radii, ringsComplete: rings.complete, corners }
}

// True when the cell's toolpath would be cut short by a safety cap.
export function cellAdaptiveExceedsLimits(plan: CellAdaptivePlan | null): boolean {
  if (plan === null) return false
  return !plan.ringsComplete || plan.corners.some((c) => c.radii[c.radii.length - 1] !== 0)
}

// Phase A + corner peeling for one Z level, the tool at the helix start
// (incenter + helix radius along +X) at the level's depth.
export function appendCellAdaptiveLevel(ctx: LevelContext, plan: CellAdaptivePlan): void {
  const { b, direction } = ctx
  phaseA({ ...ctx, cx: plan.center.x, cy: plan.center.y }, plan.ringRadii, 0)
  // The first corner is reached across the cleared inscribed circle (a
  // link); every next one along the side from the vertex just finished,
  // which also shaves the scallops the previous peel's arc ends left on
  // that wall — a cut, at Feedrate XY.
  plan.corners.forEach((corner, i) => appendCornerPeel(b, corner, direction, i === 0 ? 'link' : 'cut'))
}

function appendCornerPeel(b: ToolpathBuilder, corner: Corner, direction: 'ccw' | 'cw', approach: 'link' | 'cut'): void {
  const { vertex, bisector, alpha, sideIn } = corner
  const along = (side: Point2D, r: number): Point2D => {
    const d = r / Math.tan(alpha / 2)
    return { x: vertex.x + side.x * d, y: vertex.y + side.y * d }
  }
  const arcCenter = (r: number): Point2D => {
    const d = r / Math.sin(alpha / 2)
    return { x: vertex.x + bisector.x * d, y: vertex.y + bisector.y * d }
  }
  const radii = corner.radii
  const start0 = along(sideIn, radii[0])
  b.lineTo(approach, start0.x, start0.y)
  for (let j = 1; j < radii.length; j++) {
    const r = radii[j]
    if (r === 0) {
      b.lineTo('cut', vertex.x, vertex.y)
      break
    }
    const start = along(sideIn, r)
    b.lineTo('cut', start.x, start.y)
    b.arc('cut', arcCenter(r), direction, Math.PI - alpha)
    b.lineTo('link', start.x, start.y)
  }
}
