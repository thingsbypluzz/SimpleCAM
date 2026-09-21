import { fmt } from './format'
import { fullCircleMove } from './circle'
import { computeDepthPasses } from './depthPasses'
import type { InterpolationMode, ZTransitionMode } from '../types/wizard'

export interface PocketZTransitionOptions {
  fromZ: number
  toZ: number
  mode: ZTransitionMode
  stepdown: number
  feedrateXY: number
  plungeRate: number
  helixRadius: number
  interpolation: InterpolationMode
  centerX: number
  centerY: number
}

// Plunge: single vertical G1 straight down — the caller already
// positioned XY at the pocket's own center before calling this (same
// convention as Surface's zTransitionMoves: `G1 Z...` with no X/Y).
// Helix: reuses fullCircleMove exactly like Surface's zTransitionMoves,
// but centered directly on the pocket's own center (always CCW —
// conventional milling for an internal cut) instead of offset from a
// corner. No tangent-continuity derivation needed (unlike Surface's
// helixCenterFor/helixDirectionFor): a centered circle has no preferred
// exit direction — the first ring's ramp (pocketSpiral.ts) picks its own
// start angle independently, starting wherever this helix ends
// (centerX + helixRadius, centerY — angle 0).
export function pocketZTransitionMoves(opts: PocketZTransitionOptions): string[] {
  if (opts.mode === 'plunge') {
    return [`G1 Z${fmt(opts.toZ)} F${fmt(opts.plungeRate)}`]
  }

  const lines: string[] = []
  let z = opts.fromZ
  for (const turnDepth of computeDepthPasses(opts.fromZ - opts.toZ, opts.stepdown)) {
    lines.push(
      ...fullCircleMove({
        centerX: opts.centerX,
        centerY: opts.centerY,
        radius: opts.helixRadius,
        startX: opts.centerX + opts.helixRadius,
        startY: opts.centerY,
        zStart: z,
        zEnd: z - turnDepth,
        feed: opts.feedrateXY,
        interpolation: opts.interpolation,
        direction: 'ccw',
      }),
    )
    z -= turnDepth
  }

  // Flat finishing pass at full depth — mirrors helix.ts's
  // helixCircleToolpath exactly: a spiral turn descends continuously as
  // it sweeps, so what the descent leaves at the bottom isn't a flat
  // surface at `toZ`, it's a helical ledge (only the single point where
  // the spiral ends is actually at `toZ`; the rest of that turn's
  // circumference was cut at shallower depths on the way down). Whatever
  // comes next — the first ring's ramp (Spiral), or a rectangle/raster
  // line (Rectangle/Raster) — only ever revisits this radius briefly near
  // its own start point, so without this pass most of the helix's own
  // boundary circle is left uncut at the true target depth.
  lines.push(
    ...fullCircleMove({
      centerX: opts.centerX,
      centerY: opts.centerY,
      radius: opts.helixRadius,
      startX: opts.centerX + opts.helixRadius,
      startY: opts.centerY,
      zStart: opts.toZ,
      zEnd: opts.toZ,
      feed: opts.feedrateXY,
      interpolation: opts.interpolation,
      direction: 'ccw',
    }),
  )

  return lines
}
