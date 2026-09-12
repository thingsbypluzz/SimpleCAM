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

// Which way the transition helix turns. Not a free/arbitrary choice like
// Hole(s)' Helix (which always turns 'ccw', since there's no bore wall to
// climb-mill against): for a GIVEN exit tangent, the arc's rotation sense
// forces a specific center position (90° to one side of the tangent, at
// `radius`), so the sense is what determines whether the loop sweeps over
// the material or clears it. At the shared start corner (min-X/min-Y),
// 'ccw' happens to center Direction Y's transition outside the material
// (-X of the corner), but would center Direction X's INSIDE it (+Y of the
// corner — straight into the raster area, see helixCenterFor below). 'cw'
// is the one that puts Direction X's center outside instead (-Y of the
// corner) while keeping the exit tangent exactly as continuous into the
// first raster line. See helixCenterFor for the derivation.
export function helixDirectionFor(rasterDirection: RasterDirection): 'cw' | 'ccw' {
  return rasterDirection === 'x' ? 'cw' : 'ccw'
}

// Where the helix's center must sit so that fullCircleMove's own start/end
// point (always exactly `radius` from the center) lands ON the corner, the
// tool's exit tangent there continues smoothly into the raster's first line
// (no 90° kink), AND the loop itself stays outside the material footprint
// instead of sweeping over future raster paths.
//
// A CCW sweep at a point offset (dx, dy) from center exits tangent to
// (-dy, dx) (a +90° rotation of the offset); CW exits tangent to (dy, -dx)
// (a -90° rotation) instead. Direction 'y' rasters need a +Y exit tangent —
// offset (radius, 0) [center -X of the corner] gives that under CCW, and
// that offset also happens to be OUTSIDE the material (which starts at the
// corner and extends toward +X), so 'y' stays CCW. Direction 'x' rasters
// need a +X exit tangent — under CCW that would need offset (0, -radius)
// [center +Y of the corner], which is INSIDE the material (which extends
// toward +Y); under CW the same +X tangent instead needs offset (0, radius)
// [center -Y of the corner], which IS outside. So 'x' uses CW specifically
// to land on the outside offset — see helixDirectionFor above.
export function helixCenterFor(
  cornerX: number,
  cornerY: number,
  radius: number,
  rasterDirection: RasterDirection,
): { x: number; y: number } {
  return rasterDirection === 'x' ? { x: cornerX, y: cornerY - radius } : { x: cornerX - radius, y: cornerY }
}

// Plunge: one straight vertical G1 line for the whole descend distance — no
// chunking needed, unlike the multi-turn helix below.
//
// Helix: reuses fullCircleMove exactly like helix.ts's no-tabs loop — one
// computeDepthPasses() increment per 360° turn. Rotation sense and center
// both depend on rasterDirection (helixDirectionFor/helixCenterFor above) —
// together they keep the exit tangent smooth AND the loop off the material.
export function zTransitionMoves(opts: ZTransitionOptions): string[] {
  if (opts.mode === 'plunge') {
    return [`G1 Z${fmt(opts.toZ)} F${fmt(opts.plungeRate)}`]
  }

  const { x: centerX, y: centerY } = helixCenterFor(opts.cornerX, opts.cornerY, opts.helixRadius, opts.rasterDirection)
  const direction = helixDirectionFor(opts.rasterDirection)
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
        direction,
      }),
    )
    z -= turnDepth
  }
  return lines
}

export interface LevelDescent {
  toZ: number
}

// Per-Z-level plan shared by Zigzag and Unidirectional — the target depth
// for each stepdown-sized level, from computeDepthPasses(). Every level's
// actual Plunge/Helix transition (see lib/surface.ts) starts from `startZ`,
// never from wherever the previous level happened to end — between levels,
// the caller retracts all the way to Safe Z, repositions to the start
// corner, THEN rapids back down to Start Z before running the transition.
// That "Safe Z, then Start Z" split matters specifically for Helix: helixing
// straight from Safe Z would spiral through open air for whatever gap sits
// above Start Z, and — since the descend distance would then be measured
// from Safe Z instead of Start Z — overshoot past the level's real target
// depth. Routing every level's transition through the same fixed Start Z
// keeps `toZ` exactly reachable, and reuses the identical entry shape level
// 0 already has (rapidToTop(startZ) then the transition).
export function buildLevelDescents(startZ: number, totalDepth: number, stepdown: number): LevelDescent[] {
  const increments = computeDepthPasses(totalDepth + startZ, stepdown)
  const result: LevelDescent[] = []
  let z = startZ
  for (const inc of increments) {
    z -= inc
    result.push({ toZ: z })
  }
  return result
}
