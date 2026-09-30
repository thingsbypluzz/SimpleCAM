import type { Point2D } from '../types/wizard'
import { cellInscribed, cellLoop, loopLength, loopNearestFraction, loopPointAt, type LightCell } from './pocketLightened'
import { computeLinePositions } from './surfaceRaster'
import type { ToolpathBuilder } from './toolpath'

// Spiral clearing of one Lightened cell (OP-6) — the cell analogue of
// Rectangle Spiral (pocketSpiral.ts): contour-parallel rings from the cell's
// center out to its roughing wall, `stepover` apart, each reached by a
// gradual ramp (distance from the wall AND position along the loop
// interpolated together) and then cut as a full CCW lap. The ramp spans
// Ramp Length × the ring spacing of travel, capped at one loop — same rule
// as rectRampSweepFor(). Always G1.
//
// Rings are measured as distance d inside the cell's nominal boundary
// (cellLoop()): the roughing wall is at d = tool radius + Stock to Leave,
// the center at d = the cell's inradius.

// Positions of the rings as distance from the cell's wall, innermost first.
export function cellRingDepths(cell: LightCell, roughWallDepth: number, stepover: number, startRadius: number): number[] {
  const { radius } = cellInscribed(cell)
  const reach = radius - roughWallDepth
  if (!(reach > 0)) return []
  return computeLinePositions(Math.min(startRadius, reach), reach, stepover).map((p) => radius - p)
}

// The lap of `loop` starting and ending at `fraction`, without the start
// point itself (the tool is already there).
export function lapPoints(loop: Point2D[], fraction: number): Point2D[] {
  const start = loopPointAt(loop, fraction)
  if (loop.length === 1) return []
  const total = loopLength(loop)
  let target = (((fraction % 1) + 1) % 1) * total
  let idx = 0
  for (; idx < loop.length; idx++) {
    const a = loop[idx]
    const b = loop[(idx + 1) % loop.length]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (target < len || idx === loop.length - 1) break
    target -= len
  }
  const pts: Point2D[] = []
  for (let k = 1; k <= loop.length; k++) pts.push(loop[(idx + k) % loop.length])
  pts.push(start)
  return pts.filter((p, i, arr) => i === 0 || p.x !== arr[i - 1].x || p.y !== arr[i - 1].y)
}

// Appends the rings of one cell at depth `z`, the tool starting at the
// cell's center (Plunge) or at `helixEnd` on the entry helix of radius
// `startRadius` around it.
export function appendCellSpiral(
  b: ToolpathBuilder,
  cell: LightCell,
  opts: { roughWallDepth: number; stepover: number; startRadius: number; helixEnd: Point2D | null; z: number; rampLengthFactor: number },
): void {
  const depths = cellRingDepths(cell, opts.roughWallDepth, opts.stepover, opts.startRadius)
  if (depths.length === 0) return
  let prev = depths[0]
  let fraction = 0
  if (opts.helixEnd) {
    // Continue from the helix onto the first contour at its nearest point.
    const first = cellLoop(cell, prev)
    fraction = loopNearestFraction(first, opts.helixEnd)
    const p = loopPointAt(first, fraction)
    b.lineTo('cut', p.x, p.y, opts.z)
  }
  for (let k = 1; k < depths.length; k++) {
    const next = depths[k]
    const avgPerimeter = (loopLength(cellLoop(cell, prev)) + loopLength(cellLoop(cell, next))) / 2
    const sweep = avgPerimeter > 0 ? Math.min(1, (opts.rampLengthFactor * (prev - next)) / avgPerimeter) : 1
    const segments = Math.max(1, Math.round(72 * sweep))
    for (let step = 1; step <= segments; step++) {
      const t = step / segments
      const p = loopPointAt(cellLoop(cell, prev + (next - prev) * t), fraction + sweep * t)
      b.lineTo('cut', p.x, p.y, opts.z)
    }
    fraction += sweep
    for (const p of lapPoints(cellLoop(cell, next), fraction)) b.lineTo('cut', p.x, p.y, opts.z)
    prev = next
  }
}
