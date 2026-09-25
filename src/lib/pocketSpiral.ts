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

// Perimeter of a (halfWidth, halfHeight) rectangle — the Rectangle
// equivalent of Circle's circumference (2*PI*radius), used the same way:
// converting a physical ramp LENGTH into a fraction of one full trip
// around the boundary. width=2*halfWidth, height=2*halfHeight, perimeter
// = 2*(width+height) = 4*halfWidth + 4*halfHeight.
function rectPerimeter(halfWidth: number, halfHeight: number): number {
  return 4 * halfWidth + 4 * halfHeight
}

// Direct Rectangle analogue of Circle's angle: a single scalar `fraction`
// (any real number, wrapped mod 1) locating a point on a (halfWidth,
// halfHeight) rectangle's boundary, CCW from the bottom-left corner
// (fraction 0). Each of the 4 edges spans exactly 0.25 of the loop,
// regardless of the rectangle's aspect ratio (an approximation — arc
// length isn't literally uniform across mismatched edge lengths, same
// level of rigor Circle's own linear radius/angle interpolation already
// uses, not a physically exact parametrization). At halfWidth=halfHeight=0
// every fraction collapses to (centerX, centerY) — correct for the Plunge
// Z-entry bootstrap (see rectRingMoves() below).
export function rectPointAtPerimeterFraction(
  centerX: number,
  centerY: number,
  halfWidth: number,
  halfHeight: number,
  fraction: number,
): Point2D {
  const u = ((fraction % 1) + 1) % 1
  const edgePos = u * 4
  const edgeIndex = Math.min(3, Math.floor(edgePos))
  const local = edgePos - edgeIndex
  const hw = halfWidth
  const hh = halfHeight
  switch (edgeIndex) {
    case 0: // bottom edge: (-hw,-hh) -> (hw,-hh)
      return { x: centerX - hw + local * 2 * hw, y: centerY - hh }
    case 1: // right edge: (hw,-hh) -> (hw,hh)
      return { x: centerX + hw, y: centerY - hh + local * 2 * hh }
    case 2: // top edge: (hw,hh) -> (-hw,hh)
      return { x: centerX + hw - local * 2 * hw, y: centerY + hh }
    default: // left edge: (-hw,hh) -> (-hw,-hh)
      return { x: centerX - hw, y: centerY + hh - local * 2 * hh }
  }
}

// Direct Rectangle analogue of rampSweepDegFor() — see that function's
// comment for the full derivation; only the "radius" metric changes.
// deltaK is the Euclidean magnitude of this transition's own growth
// (usually ~stepover in both axes, but the first/last ring or a clamped
// axis can differ), avgPerimeter is the Rectangle equivalent of avgRadius
// (using perimeter instead of circumference — same proportionality:
// physical length / a size measure of the loop = fraction of the loop).
// Returned as a 0-1 fraction of one full trip around the perimeter
// (Circle returns degrees; Rectangle has no natural "degrees", so this
// stays in fraction units — rectRingRampPoints() below converts it to the
// same segment-density input rampSegmentCountFor() already expects).
// Capped at 1 (one full loop) for the same defensive reason as Circle's
// 360° cap — reachable here: the from-zero/square case lands just over
// 100% before the cap (see pocketSpiral.test.ts).
export function rectRampSweepFor(fromDims: RectRingDims, toDims: RectRingDims): number {
  const deltaHW = toDims.halfWidth - fromDims.halfWidth
  const deltaHH = toDims.halfHeight - fromDims.halfHeight
  const deltaK = Math.sqrt(deltaHW * deltaHW + deltaHH * deltaHH)
  const avgPerimeter = (rectPerimeter(fromDims.halfWidth, fromDims.halfHeight) + rectPerimeter(toDims.halfWidth, toDims.halfHeight)) / 2
  if (avgPerimeter <= 0) return 1
  const rampLength = RAMP_LENGTH_FACTOR * deltaK
  return Math.min(1, rampLength / avgPerimeter)
}

// Pure geometry for one ring transition's ramp — the Rectangle analogue of
// circleRingRampPoints(): (halfWidth, halfHeight) AND perimeter fraction
// interpolated together, linearly, over rectRampSweepFor()'s sweep.
// Shared by rectRingMoves() below (formats these into G1 lines) and by
// both previews, so the ramp drawn on screen can never drift from what
// the engine actually cuts — same reasoning as Circle's shared ramp point
// function.
export function rectRingRampPoints(
  fromDims: RectRingDims,
  toDims: RectRingDims,
  startFraction: number,
  centerX: number,
  centerY: number,
): Point2D[] {
  const sweep = rectRampSweepFor(fromDims, toDims)
  const segments = rampSegmentCountFor(sweep * 360)
  const points: Point2D[] = []
  for (let step = 1; step <= segments; step++) {
    const t = step / segments
    const halfWidth = fromDims.halfWidth + (toDims.halfWidth - fromDims.halfWidth) * t
    const halfHeight = fromDims.halfHeight + (toDims.halfHeight - fromDims.halfHeight) * t
    const fraction = startFraction + sweep * t
    points.push(rectPointAtPerimeterFraction(centerX, centerY, halfWidth, halfHeight, fraction))
  }
  return points
}

// Full CCW lap of one ring's boundary, starting and ending at whatever
// point `startFraction` lands on — NOT always the bottom-left corner
// (see rectRingMoves() below: the ramp advancing `fraction` past 1 full
// edge or more, exactly like Circle's angle, means the lap's own start
// point keeps moving around the perimeter across rings). Walks whichever
// corners remain ahead in CCW order, then closes back to the exact start
// point — skipped when the start already lands exactly on the last corner
// visited (the historical "always starts at the corner" case), so no
// zero-length G1 gets emitted. Includes the start point itself as the
// first element (self-contained, mirrors rectRingCorners()) — callers
// chaining onto an already-drawn ramp that ends at this same point (both
// rectRingMoves() and both previews) drop that first element themselves.
export function rectFullLapPoints(centerX: number, centerY: number, dims: RectRingDims, startFraction: number): Point2D[] {
  const u = ((startFraction % 1) + 1) % 1
  const startPoint = rectPointAtPerimeterFraction(centerX, centerY, dims.halfWidth, dims.halfHeight, u)
  const corners = rectRingCorners(centerX, centerY, dims)
  const edgeIndex = Math.min(3, Math.floor(u * 4))
  const points: Point2D[] = [startPoint]
  for (let i = 1; i <= 4; i++) {
    points.push(corners[(edgeIndex + i) % 4])
  }
  const last = points[points.length - 1]
  if (last.x !== startPoint.x || last.y !== startPoint.y) {
    points.push(startPoint)
  }
  return points
}

interface RectRingOptions {
  centerX: number
  centerY: number
  z: number
  feed: number
}

// The midpoint of the right edge of a (helixRadius, helixRadius) square —
// i.e. rectPointAtPerimeterFraction(cx, cy, helixRadius, helixRadius,
// RECT_HELIX_ENTRY_FRACTION) === (cx + helixRadius, cy) exactly (verified
// by hand: edge index 1 at local=0.5 -> (cx+hw, cy-hh+hh) = (cx+hw, cy)).
// That point is exactly where the Helix Z-entry's own flat finishing pass
// (pocketZTransitionMoves()) already ends. Treating the circular Helix
// boundary as its bounding square, entered at this fraction, lets
// rectRingMoves() bootstrap ring 1 with no special-casing — same call as
// every later ring, just seeded with this fromDims/startFraction instead
// of the Plunge case's degenerate (0,0)/0.
export const RECT_HELIX_ENTRY_FRACTION = 0.375

// One ring transition for Rectangle Spiral: a gradual ramp (G1 polygon —
// rectangles are always straight lines, so no interpolation-mode branch
// like Circle has) growing (halfWidth, halfHeight) from fromDims to
// toDims WHILE sweeping rectRampSweepFor()'s fraction of the perimeter
// (rectRingRampPoints()), then a full CCW lap of toDims starting exactly
// where the ramp left off (rectFullLapPoints()) — mirrors circleRingMoves
// exactly, just with perimeter fraction standing in for angle and
// (halfWidth,halfHeight) standing in for radius. Returns `nextFraction`
// for the caller to chain into the next ring — never wraps, keeps
// advancing across rings, same as Circle's nextAngleDeg.
export function rectRingMoves(
  fromDims: RectRingDims,
  toDims: RectRingDims,
  startFraction: number,
  opts: RectRingOptions,
): { lines: string[]; nextFraction: number } {
  const toLine = (p: Point2D) => `G1 X${fmt(p.x)} Y${fmt(p.y)} Z${fmt(opts.z)} F${fmt(opts.feed)}`

  const rampPoints = rectRingRampPoints(fromDims, toDims, startFraction, opts.centerX, opts.centerY)
  const nextFraction = startFraction + rectRampSweepFor(fromDims, toDims)
  const lapPoints = rectFullLapPoints(opts.centerX, opts.centerY, toDims, nextFraction).slice(1)

  return { lines: [...rampPoints.map(toLine), ...lapPoints.map(toLine)], nextFraction }
}
