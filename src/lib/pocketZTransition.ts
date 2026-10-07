import { computeDepthPasses } from './depthPasses'
import { fullTurn, toolpathToGcode, ToolpathBuilder } from './toolpath'
import { helixPitchForRampAngle } from './surfaceZTransition'
import type { InterpolationMode, PocketParams, Point2D, ZTransitionMode } from '../types/wizard'

export interface PocketZTransitionOptions {
  fromZ: number
  toZ: number
  mode: ZTransitionMode
  // Helix only: descent angle — pitch per turn from this and the radius.
  rampAngleDeg: number
  feedrateXY: number
  plungeRate: number
  helixRadius: number
  interpolation: InterpolationMode
  centerX: number
  centerY: number
}

// Adaptive always enters by Helix (constant engagement can't grow out of a
// plunge-sized bore) — the stored zTransitionMode is kept untouched, only
// ignored, the same way output.interpolation is ignored while Tabs force G1.
export function effectivePocketZTransitionMode(pocket: Pick<PocketParams, 'method' | 'zTransitionMode'>): ZTransitionMode {
  return pocket.method === 'adaptive' ? 'helix' : pocket.zTransitionMode
}

// Where the tool must be positioned (XY, before descending) for this
// Z-transition: the pocket center for Plunge, but the helix's own start
// point for Helix — its first arc starts there, and a G2/G3 whose start
// isn't on the arc's circle (e.g. starting from the center) is rejected by
// GRBL as an invalid target.
export function pocketEntryPoint(centerX: number, centerY: number, mode: ZTransitionMode, helixRadius: number): Point2D {
  return mode === 'helix' ? { x: centerX + helixRadius, y: centerY } : { x: centerX, y: centerY }
}

// Plunge: single vertical G1 straight down — the caller already
// positioned XY at the pocket's own center before calling this (same
// convention as Surface's zTransitionMoves: `G1 Z...` with no X/Y).
// Helix: full-turn arcs exactly like Surface's zTransitionMoves,
// but centered directly on the pocket's own center (always CCW — climb
// milling for an internal cut under M3) instead of offset from a
// corner. No tangent-continuity derivation needed (unlike Surface's
// helixCenterFor/helixDirectionFor): a centered circle has no preferred
// exit direction — the first ring's ramp (pocketSpiral.ts) picks its own
// start angle independently, starting wherever this helix ends
// (centerX + helixRadius, centerY — angle 0).
export function appendPocketZTransition(builder: ToolpathBuilder, opts: PocketZTransitionOptions): void {
  if (opts.mode === 'plunge') {
    builder.zTo('plunge', opts.toZ)
    return
  }

  const center = { x: opts.centerX, y: opts.centerY }
  const exact = { from: { x: opts.centerX + opts.helixRadius, y: opts.centerY }, radius: opts.helixRadius }
  let z = opts.fromZ
  for (const turnDepth of computeDepthPasses(opts.fromZ - opts.toZ, helixPitchForRampAngle(opts.helixRadius, opts.rampAngleDeg))) {
    z -= turnDepth
    builder.arc('cut', center, 'ccw', fullTurn, z, exact)
  }

  // Flat finishing pass at full depth — mirrors helix.ts's
  // helixCircleToolpath exactly: a spiral turn descends continuously as
  // it sweeps, so what the descent leaves at the bottom isn't a flat
  // surface at `toZ`, it's a helical ledge (only the single point where
  // the spiral ends is actually at `toZ`; the rest of that turn's
  // circumference was cut at shallower depths on the way down). Whatever
  // comes next — the first ring's ramp (Spiral) — only ever revisits this radius briefly near
  // its own start point, so without this pass most of the helix's own
  // boundary circle is left uncut at the true target depth.
  builder.arc('cut', center, 'ccw', fullTurn, opts.toZ, exact)
}

// G-code for one transition on its own (tests; lib/pocket.ts formats the
// whole toolpath at once).
export function pocketZTransitionMoves(opts: PocketZTransitionOptions): string[] {
  const start = opts.mode === 'helix' ? opts.centerX + opts.helixRadius : opts.centerX
  const builder = new ToolpathBuilder({ x: start, y: opts.centerY, z: opts.fromZ })
  appendPocketZTransition(builder, opts)
  return toolpathToGcode(builder.build(), {
    feeds: { cut: opts.feedrateXY, plunge: opts.plungeRate },
    interpolation: opts.interpolation,
    leadInRapid: false,
  })
}
