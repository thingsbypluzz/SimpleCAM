import { fmt } from './format'
import { fullCircleMove } from './circle'
import { computeDepthPasses } from './depthPasses'
import type { InterpolationMode, ZTransitionMode } from '../types/wizard'

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
}

// Plunge: one straight vertical G1 line for the whole descend distance — no
// chunking needed, unlike the multi-turn helix below.
//
// Helix: reuses fullCircleMove exactly like helix.ts's no-tabs loop — one
// computeDepthPasses() increment per 360° turn. The spiral's center is
// offset toward -X from the corner by helixRadius, so that fullCircleMove's
// own start/end point (centerX + radius, centerY) lands exactly ON the
// corner, matching where the raster's first cutting line must begin.
// Direction is fixed 'ccw' (matches Hole(s)' Helix convention) — physically
// arbitrary here, there's no bore wall to climb-mill against.
export function zTransitionMoves(opts: ZTransitionOptions): string[] {
  if (opts.mode === 'plunge') {
    return [`G1 Z${fmt(opts.toZ)} F${fmt(opts.plungeRate)}`]
  }

  const centerX = opts.cornerX - opts.helixRadius
  const centerY = opts.cornerY
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
// preceding retract. Every subsequent level retracts UP by exactly
// `stepdown` mm from the previous level's floor before its own descent to
// the next target depth.
export function buildLevelDescents(startZ: number, totalDepth: number, stepdown: number): LevelDescent[] {
  const increments = computeDepthPasses(totalDepth + startZ, stepdown)
  const result: LevelDescent[] = []
  let prevTargetZ = startZ
  increments.forEach((inc, idx) => {
    const fromZ = idx === 0 ? prevTargetZ : prevTargetZ + stepdown
    const toZ = prevTargetZ - inc
    result.push({ fromZ, toZ })
    prevTargetZ = toZ
  })
  return result
}
