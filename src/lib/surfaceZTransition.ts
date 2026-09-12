import { fmt } from './format'
import { fullCircleMove } from './circle'
import { computeDepthPasses } from './depthPasses'
import type { InterpolationMode, RasterDirection, ZTransitionMode } from '../types/wizard'

export interface ZTransitionOptions {
  fromZ: number
  toZ: number
  mode: ZTransitionMode
  stepdown: number
  feedrateXY: number
  plungeRate: number
  helixRadius: number
  interpolation: InterpolationMode
  // The raster start corner — every transition must start AND end exactly
  // here (see CLAUDE.md's Surface design notes).
  cornerX: number
  cornerY: number
  // Which way the raster's first line leaves the corner — determines which
  // side the helix's center sits on, see helixCenterFor() below.
  rasterDirection: RasterDirection
}

// Where the helix's center must sit so that fullCircleMove's own start/end
// point (always exactly `radius` from the center) lands ON the corner AND
// the tool's exit tangent there continues smoothly into the raster's first
// line, instead of meeting it at a 90° kink.
//
// fullCircleMove's 'ccw' sweep at a point offset (dx, dy) from center exits
// tangent to (-dy, dx) (a +90° rotation of the offset) — e.g. offset
// (radius, 0) [center directly -X of the corner] exits tangent (0, radius),
// i.e. moving +Y. Direction 'y' rasters need exactly that (their first line
// runs +Y from the corner), so centering -X of the corner is correct there.
// Direction 'x' rasters need a +X exit tangent instead, which needs offset
// (0, -radius) — i.e. the center sits +Y of the corner, not -X of it. The
// two cases use different offset axes, not just a sign flip, so both are
// spelled out explicitly rather than derived from one shared formula.
export function helixCenterFor(
  cornerX: number,
  cornerY: number,
  radius: number,
  rasterDirection: RasterDirection,
): { x: number; y: number } {
  return rasterDirection === 'x' ? { x: cornerX, y: cornerY + radius } : { x: cornerX - radius, y: cornerY }
}

// Plunge: one straight vertical G1 line for the whole descend distance — no
// chunking needed, unlike the multi-turn helix below.
//
// Helix: reuses fullCircleMove exactly like helix.ts's no-tabs loop — one
// computeDepthPasses() increment per 360° turn. Direction is fixed 'ccw'
// (matches Hole(s)' Helix convention) — physically arbitrary here, there's
// no bore wall to climb-mill against; only the CENTER placement
// (helixCenterFor) needs to track rasterDirection, to keep the exit tangent
// smooth.
export function zTransitionMoves(opts: ZTransitionOptions): string[] {
  if (opts.mode === 'plunge') {
    return [`G1 Z${fmt(opts.toZ)} F${fmt(opts.plungeRate)}`]
  }

  const { x: centerX, y: centerY } = helixCenterFor(opts.cornerX, opts.cornerY, opts.helixRadius, opts.rasterDirection)
  const lines: string[] = []
  let z = opts.fromZ
  for (const turnDepth of computeDepthPasses(opts.fromZ - opts.toZ, opts.stepdown)) {
    lines.push(
      ...fullCircleMove({
        centerX,
        centerY,
        radius: opts.helixRadius,
        startX: opts.cornerX,
        startY: opts.cornerY,
        zStart: z,
        zEnd: z - turnDepth,
        feed: opts.feedrateXY,
        interpolation: opts.interpolation,
        direction: 'ccw',
      }),
    )
    z -= turnDepth
  }
  return lines
}

export interface LevelDescent {
  fromZ: number
  toZ: number
}

// Per-Z-level plan shared by Zigzag and Unidirectional. Level 0 starts from
// `startZ` (the material top, already reached via the caller's
// rapidToTop(startZ) — mirrors Hole(s)/Outline's own convention) with no
// preceding retract. Every subsequent level retracts all the way to Safe Z
// before its own descent to the next target depth — same "retract to Safe
// Z before G0 to the next point" convention used everywhere else in the
// app (this deliberately replaces an earlier, stepdown-only partial
// retract: full Safe Z is safer when traveling back across the whole
// raster area, not just a few mm up).
export function buildLevelDescents(startZ: number, totalDepth: number, stepdown: number, safeZ: number): LevelDescent[] {
  const increments = computeDepthPasses(totalDepth + startZ, stepdown)
  const result: LevelDescent[] = []
  let prevTargetZ = startZ
  increments.forEach((inc, idx) => {
    const fromZ = idx === 0 ? prevTargetZ : safeZ
    const toZ = prevTargetZ - inc
    result.push({ fromZ, toZ })
    prevTargetZ = toZ
  })
  return result
}
