import { fmt } from './format'
import { fullCircleMove } from './circle'
import { computeLinePositions } from './surfaceRaster'
import type { InterpolationMode, Point2D } from '../types/wizard'

// How many multiples of this ring transition's OWN radial delta (Δr,
// normally ≈ stepover, but the first/last ring can differ — see
// pocketCircleRingRadii()) its ramp's arc length spans. A fixed ramp
// ANGLE (the original, since-corrected design — see CLAUDE.md's Pocket
// design notes and the /grill-me session, 2026-09-21) makes arc length
// scale with radius while Δr stays roughly constant, so the radial
// engagement rate (Δr per unit of arc length traveled — what actually
// determines how "aggressive" the sideways bite feels) scales as 1/radius:
// steep near the center, near-invisible at the outer wall (confirmed by
// a second round of visual QA, no machine access). Fixing the ARC LENGTH
// instead — proportional to Δr, via this factor — keeps that engagement
// rate constant at every radius: arcLength = RAMP_LENGTH_FACTOR × Δr, and
// sweepRad = arcLength / avgRadius, so Δr / arcLength = 1 / RAMP_LENGTH_FACTOR
// regardless of ring size. 3 is a moderate choice (gentler than 1:1,
// without inflating ramp length past what's still a small fraction of
// the ring's own circumference at any reasonable stepover) — not derived
// from a physical constant, same category of judgment call as
// SEGMENTS_PER_TURN-style sampling density elsewhere in this codebase.
const RAMP_LENGTH_FACTOR = 3

// Ramp sweep angle (degrees) for one ring transition — see
// RAMP_LENGTH_FACTOR above. Uses the transition's own average radius
// (radiusFrom+radiusTo)/2, not radiusTo alone: for the very first ring
// (radiusFrom = 0 for Plunge entry, or a small helixRadius for Helix),
// this pulls the effective radius down further, correctly demanding an
// even gentler (larger) sweep exactly where curvature is most severe.
// Capped at 360° — a hard geometric ceiling, not a preference: sweeping
// further wouldn't reach a new point, just retrace the same one twice.
// The subsequent flat pass in circleRingMoves() is NOT skipped even at
// the 360° cap — the ramp only ever touches radiusTo at its own single
// end point, never around the rest of the circle, exactly the same
// reasoning as pocketZTransitionMoves()'s Helix flat-finishing-pass fix
// (lib/pocketZTransition.ts) just above this in the session history.
export function rampSweepDegFor(radiusFrom: number, radiusTo: number): number {
  const deltaR = radiusTo - radiusFrom
  const avgRadius = (radiusFrom + radiusTo) / 2
  if (avgRadius <= 0) return 360
  const sweepRad = (RAMP_LENGTH_FACTOR * deltaR) / avgRadius
  return Math.min(360, (sweepRad * 180) / Math.PI)
}

// Same 5°-per-segment density as circle.ts's LINEAR_SEGMENTS (72 per
// 360°), scaled to whatever sweep rampSweepDegFor() actually returns for
// this transition — floored at 1 so even a near-zero sweep still emits a
// valid segment.
function rampSegmentCountFor(sweepDeg: number): number {
  return Math.max(1, Math.round(72 * (sweepDeg / 360)))
}

interface CircleRingOptions {
  centerX: number
  centerY: number
  z: number
  feed: number
  interpolation: InterpolationMode
}

// Pure geometry for one ring transition's ramp (radius AND angle
// interpolated together, linearly, over rampSweepDegFor()'s sweep) —
// shared by circleRingMoves() below (which formats these into G1 lines)
// and by both previews (2D drawToolpath.ts, 3D buildScene.ts), so the
// ramp drawn on screen can never drift from what the engine actually cuts.
export function circleRingRampPoints(
  radiusFrom: number,
  radiusTo: number,
  startAngleDeg: number,
  centerX: number,
  centerY: number,
): Point2D[] {
  const sweepDeg = rampSweepDegFor(radiusFrom, radiusTo)
  const segments = rampSegmentCountFor(sweepDeg)
  const startRad = (startAngleDeg * Math.PI) / 180
  const sweepRad = (sweepDeg * Math.PI) / 180
  const points: Point2D[] = []
  for (let step = 1; step <= segments; step++) {
    const t = step / segments
    const angle = startRad + sweepRad * t
    const radius = radiusFrom + (radiusTo - radiusFrom) * t
    points.push({ x: centerX + radius * Math.cos(angle), y: centerY + radius * Math.sin(angle) })
  }
  return points
}

// One ring transition for Circle Spiral: a short ramp (G1 polygon —
// G2/G3 in this dialect's common subset can't sweep a changing radius, so
// the ramp always emits G1 regardless of the interpolation toggle) from
// (radiusFrom, startAngleDeg) to (radiusTo, startAngleDeg + sweep, see
// rampSweepDegFor()), then a full flat 360° turn at radiusTo
// (fullCircleMove, unchanged — DOES respect the G2/G3 vs G1 toggle, same
// as every other full circle in the engine). Always CCW (conventional
// milling for an internal cut, same convention as Hole(s) Helix / Outline
// Inside). Returns the angle the NEXT ring's ramp should start from —
// this ring's flat pass returns to its own start point, so it's simply
// startAngleDeg + sweep; the angle keeps advancing (never wraps/resets)
// as rings grow outward.
export function circleRingMoves(
  radiusFrom: number,
  radiusTo: number,
  startAngleDeg: number,
  opts: CircleRingOptions,
): { lines: string[]; nextAngleDeg: number } {
  const lines = circleRingRampPoints(radiusFrom, radiusTo, startAngleDeg, opts.centerX, opts.centerY).map(
    (p) => `G1 X${fmt(p.x)} Y${fmt(p.y)} Z${fmt(opts.z)} F${fmt(opts.feed)}`,
  )

  const nextAngleDeg = startAngleDeg + rampSweepDegFor(radiusFrom, radiusTo)
  const endRad = (nextAngleDeg * Math.PI) / 180
  const endX = opts.centerX + radiusTo * Math.cos(endRad)
  const endY = opts.centerY + radiusTo * Math.sin(endRad)

  lines.push(
    ...fullCircleMove({
      centerX: opts.centerX,
      centerY: opts.centerY,
      radius: radiusTo,
      startX: endX,
      startY: endY,
      zStart: opts.z,
      zEnd: opts.z,
      feed: opts.feed,
      interpolation: opts.interpolation,
      direction: 'ccw',
    }),
  )

  return { lines, nextAngleDeg }
}

// Ring radii for Circle Spiral, growing from `startRadius` (wherever the
// Z-entry left the tool — 0 for Plunge at the exact center, helixRadius
// for Helix) out to `wallRadius`, spaced by stepover and snapped exactly
// onto the wall on the last ring (computeLinePositions already handles
// this — same helper Surface's raster lines use, reused unchanged).
export function pocketCircleRingRadii(startRadius: number, wallRadius: number, stepoverMm: number): number[] {
  return computeLinePositions(startRadius, wallRadius, stepoverMm)
}

export interface RectRingDims {
  halfWidth: number
  halfHeight: number
}

// Ring half-dimensions for Rectangle Spiral, growing from a degenerate
// (0,0) point out to (wallHalfWidth, wallHalfHeight). Grown per-axis off a
// SHARED step index (via the larger of the two half-dimensions) so a
// non-square pocket's rings aren't similar (scaled) copies of each other —
// once an axis reaches its wall target it clamps there while the other
// axis keeps growing, same "snap to the far edge, don't overshoot" shape
// computeLinePositions already gives on a single axis. The degenerate
// leading (0,0) entry (always present — computeLinePositions(0, max, ...)
// always starts at 0) is dropped: it isn't a real ring to cut, just the
// pocket's own center point.
export function pocketRectRingDims(wallHalfWidth: number, wallHalfHeight: number, stepoverMm: number): RectRingDims[] {
  const maxWallHalf = Math.max(wallHalfWidth, wallHalfHeight)
  const rings = computeLinePositions(0, maxWallHalf, stepoverMm)
    .filter((p) => p > 0)
    .map((p) => ({ halfWidth: Math.min(p, wallHalfWidth), halfHeight: Math.min(p, wallHalfHeight) }))
  return rings.length > 0 ? rings : [{ halfWidth: wallHalfWidth, halfHeight: wallHalfHeight }]
}

// Four tool-center corners for one ring, CCW from bottom-left — same
// winding/origin convention as rectCorners()'s 'ccw' order
// (outlineRectangleGeometry.ts), just centered on the pocket's own center
// instead of derived from shape-specific origin math (Pocket rings are
// always concentric around pocketCenter(), regardless of
// rectCornered/rectCentered — see pocketGeometry.ts).
function rectRingCorners(centerX: number, centerY: number, dims: RectRingDims): Point2D[] {
  const { halfWidth: hw, halfHeight: hh } = dims
  return [
    { x: centerX - hw, y: centerY - hh },
    { x: centerX + hw, y: centerY - hh },
    { x: centerX + hw, y: centerY + hh },
    { x: centerX - hw, y: centerY + hh },
  ]
}

interface RectRingOptions {
  centerX: number
  centerY: number
  z: number
  feed: number
}

// One ring transition for Rectangle Spiral: a single straight ramp (G1)
// from wherever the tool currently is (the previous ring's start corner,
// or the Z-entry point for the first ring — G-code is sequential, so no
// explicit "from" coordinate is needed here) to this ring's start corner
// (bottom-left), then a full CCW 4-edge lap back to that same corner. In
// the steady-state case for an elongated (non-square) pocket, one axis is
// already clamped at its wall target between consecutive rings, so this
// straight ramp degenerates to a pure single-axis move — i.e. literally
// "ramp along the [currently growing] edge" (see CLAUDE.md's Pocket design
// notes). No G2/G3 involved anywhere here (rectangles are always straight
// lines), so unlike Circle there's no interpolation-mode branch. Returns
// `corner` so the caller (pocket.ts) can chain ring-to-ring purely for its
// own bookkeeping — not read by this function itself.
export function rectRingMoves(dims: RectRingDims, opts: RectRingOptions): { lines: string[]; corner: Point2D } {
  const corners = rectRingCorners(opts.centerX, opts.centerY, dims)
  const start = corners[0]
  const lines: string[] = [`G1 X${fmt(start.x)} Y${fmt(start.y)} Z${fmt(opts.z)} F${fmt(opts.feed)}`]
  for (let i = 1; i <= corners.length; i++) {
    const p = corners[i % corners.length]
    lines.push(`G1 X${fmt(p.x)} Y${fmt(p.y)} Z${fmt(opts.z)} F${fmt(opts.feed)}`)
  }
  return { lines, corner: start }
}
