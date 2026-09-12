import type { Point2D, RasterDirection } from '../types/wizard'
import type { SurfaceBounds } from './surfaceGeometry'

// Same MAX_PASSES-style safety cap as depthPasses.ts — the 2D/3D previews
// recompute this live on every keystroke, including transient states while
// typing a stepover value, so this guards against a near-zero stepover
// freezing the tab.
const MAX_LINES = 5000

// Larger than depthPasses.ts's 1e-9: this loop can run hundreds of
// iterations of floating-point addition (`pos += spacing`), accumulating
// more drift than a handful of Z-pass subtractions ever would.
const LINE_EPSILON = 1e-6

// Splits [min, max] into raster line positions spaced `spacing` apart,
// always including both `min` and `max` exactly. The last gap is forced
// onto `max` even when `spacing` doesn't divide the span evenly (so the
// raster always reaches the far edge); when it DOES divide evenly, the last
// computed position is snapped onto `max` in place instead of appending a
// near-duplicate extra line one epsilon away.
export function computeLinePositions(min: number, max: number, spacing: number): number[] {
  if (max <= min) return [min]
  if (!(spacing > 0)) return [min, max]

  const positions: number[] = []
  let pos = min
  while (pos < max - LINE_EPSILON && positions.length < MAX_LINES) {
    positions.push(pos)
    pos += spacing
  }
  const last = positions[positions.length - 1]
  if (Math.abs(last - max) > LINE_EPSILON) {
    positions.push(max)
  } else {
    positions[positions.length - 1] = max
  }
  return positions
}

export interface RasterLine {
  from: Point2D // always the low-side end (minX for 'y' lines, minY for 'x' lines)
  to: Point2D // always the high-side end
}

// One full raster sweep's line list for the given bounds. `direction: 'x'`
// means lines run parallel to X (horizontal, stepping along Y); `'y'` means
// lines run parallel to Y (vertical, stepping along X). Line 0's `from`
// always equals the fixed start corner (bounds.minX, bounds.minY) by
// construction — no special-casing needed to satisfy the "always starts at
// min-X/min-Y" rule (see surfaceGeometry.ts's surfaceStartCorner).
export function computeRasterLines(bounds: SurfaceBounds, direction: RasterDirection, stepoverMm: number): RasterLine[] {
  if (direction === 'x') {
    return computeLinePositions(bounds.minY, bounds.maxY, stepoverMm).map((y) => ({
      from: { x: bounds.minX, y },
      to: { x: bounds.maxX, y },
    }))
  }
  return computeLinePositions(bounds.minX, bounds.maxX, stepoverMm).map((x) => ({
    from: { x, y: bounds.minY },
    to: { x, y: bounds.maxY },
  }))
}

// Zigzag: a single continuous back-and-forth path. Line i is walked forward
// (from -> to) on even i, reversed (to -> from) on odd i — the connector
// between consecutive lines is implicit: waypoints[2i+1] (line i's far end)
// and waypoints[2i+2] (line i+1's near end) always share the same
// line-axis coordinate, differing only in the step axis, so the straight G1
// between them IS the perpendicular connecting cut.
export function zigzagWaypoints(lines: RasterLine[]): Point2D[] {
  const points: Point2D[] = []
  lines.forEach((line, i) => {
    const forward = i % 2 === 0
    points.push(forward ? line.from : line.to)
    points.push(forward ? line.to : line.from)
  })
  return points
}
