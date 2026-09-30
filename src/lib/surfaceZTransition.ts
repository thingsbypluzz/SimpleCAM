import { computeDepthPasses, exceedsPassLimit } from './depthPasses'
import { fullTurn, toolpathToGcode, ToolpathBuilder } from './toolpath'
import type { InterpolationMode, RasterDirection, ZTransitionMode } from '../types/wizard'
import { pitchForRampAngle } from './rampPitch'

export interface ZTransitionOptions {
  fromZ: number
  toZ: number
  mode: ZTransitionMode
  // Helix only: how steeply it descends — pitch per turn comes from this
  // and the radius (helixPitchForRampAngle), not from Stepdown.
  rampAngleDeg: number
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

// Where the helix's center must sit so that a full turn's own start/end
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

// Plunge: one straight vertical G1 (`G1 Z… F<plunge>`) for the whole
// descend distance — no chunking needed, unlike the multi-turn helix below.
//
// Helix: turns of helixPitchForRampAngle() depth each (the last one
// shorter), like helix.ts's no-tabs loop but at a fixed descent angle. Rotation sense and center both depend on rasterDirection
// (helixDirectionFor/helixCenterFor above) — together they keep the exit
// tangent smooth AND the loop off the material. Appends to `builder`, whose
// current point must be the corner at `fromZ`.
export function appendZTransition(builder: ToolpathBuilder, opts: ZTransitionOptions): void {
  if (opts.mode === 'plunge') {
    builder.zTo('plunge', opts.toZ)
    return
  }
  const center = helixCenterFor(opts.cornerX, opts.cornerY, opts.helixRadius, opts.rasterDirection)
  const direction = helixDirectionFor(opts.rasterDirection)
  let z = opts.fromZ
  for (const turnDepth of computeDepthPasses(opts.fromZ - opts.toZ, helixPitchForRampAngle(opts.helixRadius, opts.rampAngleDeg))) {
    z -= turnDepth
    builder.arc('cut', center, direction, fullTurn, z)
  }
}

// G-code for one transition on its own (tests; lib/surface.ts formats the
// whole toolpath at once).
export function zTransitionMoves(opts: ZTransitionOptions): string[] {
  const builder = new ToolpathBuilder({ x: opts.cornerX, y: opts.cornerY, z: opts.fromZ })
  appendZTransition(builder, opts)
  return toolpathToGcode(builder.build(), {
    feeds: { cut: opts.feedrateXY, plunge: opts.plungeRate },
    interpolation: opts.interpolation,
    leadInRapid: false,
  })
}

// Depth per turn of an entry helix descending at `rampAngleDeg` on
// `radius` — the turn's path length × tan(angle). Shared by every entry
// helix (Surface, Pocket Raster/Spiral, Pocket Adaptive).
export function helixPitchForRampAngle(radius: number, rampAngleDeg: number): number {
  return pitchForRampAngle(2 * Math.PI * radius, rampAngleDeg)
}

// Clearance kept above the previous level's floor when rapiding back down
// (Surface/Pocket level entries, Surface Unidirectional line re-entry) —
// its highest point, since a helix or ramp leaves nothing above it.
export const LEVEL_REENTRY_CLEARANCE = 0.5

// Where a level's Plunge/Helix transition starts: level 0 at Start Z (the
// first entry into the stock); every later one rapids back down to just
// above the previous level's floor — the entry area was already cut there,
// so descending through it again (at a gentle ramp angle, many turns) would
// only cut air. Never above Start Z.
export function levelEntryZ(levelIndex: number, previousToZ: number, startZ: number): number {
  return levelIndex === 0 ? startZ : Math.min(startZ, previousToZ + LEVEL_REENTRY_CLEARANCE)
}

// Would any level's entry helix hit MAX_PASSES turns (and stop short of
// the level's depth)? Validation blocks Generate before that.
export function entryHelixExceedsTurnLimit(
  startZ: number,
  totalDepth: number,
  stepdown: number,
  helixRadius: number,
  rampAngleDeg: number,
): boolean {
  const pitch = helixPitchForRampAngle(helixRadius, rampAngleDeg)
  let previousToZ = startZ
  return buildLevelDescents(startZ, totalDepth, stepdown).some(({ toZ }, idx) => {
    const fromZ = levelEntryZ(idx, previousToZ, startZ)
    previousToZ = toZ
    return exceedsPassLimit(fromZ - toZ, pitch)
  })
}

export interface LevelDescent {
  toZ: number
}

// Per-Z-level plan shared by Surface and Pocket — the target depth for each
// stepdown-sized level, from computeDepthPasses(). Between levels the
// caller retracts to Safe Z, repositions over the entry point, rapids down
// to levelEntryZ() and runs the Plunge/Helix transition from there — never
// straight from Safe Z, which would helix through open air and (with the
// descent measured from Safe Z) overshoot the level's target depth.
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
