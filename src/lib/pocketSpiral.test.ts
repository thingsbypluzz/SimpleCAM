import { describe, expect, it } from 'vitest'
import {
  circleRingMoves,
  pocketCircleRingRadii,
  pocketRectRingDims,
  rampSweepDegFor,
  RECT_HELIX_ENTRY_FRACTION,
  rectFullLapPoints,
  rectPointAtPerimeterFraction,
  rectRampSweepFor,
  rectRingMoves,
} from './pocketSpiral'

describe('pocketCircleRingRadii', () => {
  it('grows from startRadius to wallRadius, snapped exactly onto the wall', () => {
    expect(pocketCircleRingRadii(0, 10, 4)).toEqual([0, 4, 8, 10])
  })

  it('starts from a nonzero radius when entry is Helix', () => {
    expect(pocketCircleRingRadii(2, 10, 4)).toEqual([2, 6, 10])
  })

  it('degenerate (wallRadius <= startRadius) collapses to a single ring', () => {
    expect(pocketCircleRingRadii(5, 5, 2)).toEqual([5])
  })
})

describe('pocketRectRingDims', () => {
  it('square pocket: both axes grow together, snapped onto the wall', () => {
    expect(pocketRectRingDims(10, 10, 4)).toEqual([
      { halfWidth: 4, halfHeight: 4 },
      { halfWidth: 8, halfHeight: 8 },
      { halfWidth: 10, halfHeight: 10 },
    ])
  })

  it('non-square pocket: the shorter axis clamps at its wall while the longer keeps growing', () => {
    expect(pocketRectRingDims(6, 20, 4)).toEqual([
      { halfWidth: 4, halfHeight: 4 },
      { halfWidth: 6, halfHeight: 8 },
      { halfWidth: 6, halfHeight: 12 },
      { halfWidth: 6, halfHeight: 16 },
      { halfWidth: 6, halfHeight: 20 },
    ])
  })

  it('degenerate stepover falls back to a single ring at the wall', () => {
    expect(pocketRectRingDims(5, 5, 0)).toEqual([{ halfWidth: 5, halfHeight: 5 }])
  })
})

describe('rampSweepDegFor', () => {
  it('same Δr, larger radius -> smaller sweep (constant radial-engagement-per-arc-length, not constant angle)', () => {
    const innerSweep = rampSweepDegFor(10, 13) // Δr=3, avgRadius=11.5
    const outerSweep = rampSweepDegFor(40, 43) // Δr=3, avgRadius=41.5
    expect(innerSweep).toBeGreaterThan(outerSweep)
    expect(innerSweep).toBeCloseTo(44.85, 1)
    expect(outerSweep).toBeCloseTo(12.43, 1)
  })

  it('radiusFrom=0 (Plunge entry into the first ring) always sweeps the same angle, any radiusTo — the ratio Δr/avgRadius is a constant 2 in that case', () => {
    expect(rampSweepDegFor(0, 5)).toBeCloseTo(rampSweepDegFor(0, 50), 6)
    expect(rampSweepDegFor(0, 5)).toBeCloseTo(343.77, 1)
  })

  it('is capped at 360° (defensive — unreachable for any physically valid radiusFrom >= 0 at the current RAMP_LENGTH_FACTOR, since the worst case, radiusFrom=0, already tops out at ~344°)', () => {
    expect(rampSweepDegFor(-100, 1)).toBe(360) // synthetic, non-physical input — exercises the clamp directly
  })
})

describe('circleRingMoves', () => {
  it('arc mode: G1 ramp segments followed by exactly one G2/G3 flat pass, ramp always G1', () => {
    const { lines, nextAngleDeg } = circleRingMoves(0, 10, 0, {
      centerX: 0,
      centerY: 0,
      z: -1,
      feed: 800,
      interpolation: 'arc',
    })
    const rampLines = lines.slice(0, -1)
    const flatLine = lines[lines.length - 1]
    expect(rampLines.every((l) => l.startsWith('G1 '))).toBe(true)
    expect(flatLine.startsWith('G3 ')).toBe(true) // always CCW (conventional milling for an internal cut)
    expect(nextAngleDeg).toBe(rampSweepDegFor(0, 10))
  })

  it('G1 mode: every line (ramp AND the flat pass) is G1', () => {
    const { lines } = circleRingMoves(0, 10, 0, { centerX: 0, centerY: 0, z: -1, feed: 800, interpolation: 'linear' })
    expect(lines.every((l) => l.startsWith('G1 '))).toBe(true)
  })

  it('advances the start angle by that transition\'s own rampSweepDegFor() each call, never resetting', () => {
    const first = circleRingMoves(0, 4, 0, { centerX: 0, centerY: 0, z: -1, feed: 800, interpolation: 'arc' })
    const second = circleRingMoves(4, 8, first.nextAngleDeg, { centerX: 0, centerY: 0, z: -1, feed: 800, interpolation: 'arc' })
    expect(first.nextAngleDeg).toBeCloseTo(rampSweepDegFor(0, 4), 9)
    expect(second.nextAngleDeg).toBeCloseTo(rampSweepDegFor(0, 4) + rampSweepDegFor(4, 8), 9)
  })
})

describe('rectPointAtPerimeterFraction', () => {
  const dims = { halfWidth: 5, halfHeight: 3 }

  it('places the four quarter-fractions exactly on the four corners, CCW from bottom-left', () => {
    expect(rectPointAtPerimeterFraction(0, 0, dims.halfWidth, dims.halfHeight, 0)).toEqual({ x: -5, y: -3 })
    expect(rectPointAtPerimeterFraction(0, 0, dims.halfWidth, dims.halfHeight, 0.25)).toEqual({ x: 5, y: -3 })
    expect(rectPointAtPerimeterFraction(0, 0, dims.halfWidth, dims.halfHeight, 0.5)).toEqual({ x: 5, y: 3 })
    expect(rectPointAtPerimeterFraction(0, 0, dims.halfWidth, dims.halfHeight, 0.75)).toEqual({ x: -5, y: 3 })
  })

  it('wraps fractions outside [0,1) onto their mod-1 equivalent', () => {
    expect(rectPointAtPerimeterFraction(0, 0, dims.halfWidth, dims.halfHeight, 1)).toEqual({ x: -5, y: -3 })
    expect(rectPointAtPerimeterFraction(0, 0, dims.halfWidth, dims.halfHeight, -0.25)).toEqual({ x: -5, y: 3 }) // same as 0.75
  })

  it('collapses to the center at halfWidth=halfHeight=0, regardless of fraction — the Plunge Z-entry bootstrap', () => {
    expect(rectPointAtPerimeterFraction(4, 7, 0, 0, 0.6)).toEqual({ x: 4, y: 7 })
  })

  it('RECT_HELIX_ENTRY_FRACTION on a (r,r) square lands exactly on the Helix Z-entry exit point (centerX+r, centerY)', () => {
    expect(rectPointAtPerimeterFraction(2, -1, 3, 3, RECT_HELIX_ENTRY_FRACTION)).toEqual({ x: 5, y: -1 })
  })
})

describe('rectRampSweepFor', () => {
  it('same Δk, larger perimeter -> smaller sweep fraction (constant engagement-per-length, not constant fraction) — steady-state, one axis already clamped', () => {
    const nearWall = rectRampSweepFor({ halfWidth: 10, halfHeight: 3 }, { halfWidth: 10, halfHeight: 6 }) // Δk=3, avgPerimeter=58
    const farWall = rectRampSweepFor({ halfWidth: 40, halfHeight: 3 }, { halfWidth: 40, halfHeight: 6 }) // Δk=3, avgPerimeter=178
    expect(nearWall).toBeGreaterThan(farWall)
    expect(nearWall).toBeCloseTo(0.1552, 3)
    expect(farWall).toBeCloseTo(0.0506, 3)
  })

  it('square growth from zero (Plunge entry into ring 1) is a constant fraction regardless of ring size — already above the 1-full-loop cap', () => {
    expect(rectRampSweepFor({ halfWidth: 0, halfHeight: 0 }, { halfWidth: 5, halfHeight: 5 })).toBe(1)
    expect(rectRampSweepFor({ halfWidth: 0, halfHeight: 0 }, { halfWidth: 50, halfHeight: 50 })).toBe(1)
  })
})

describe('rectFullLapPoints', () => {
  it('starts and ends at a non-corner point when the fraction lands partway along an edge', () => {
    const dims = { halfWidth: 6, halfHeight: 6 }
    const points = rectFullLapPoints(0, 0, dims, 0.375) // midpoint of the right edge
    expect(points[0]).toEqual({ x: 6, y: 0 })
    expect(points[points.length - 1]).toEqual({ x: 6, y: 0 })
    expect(points).toHaveLength(6) // start + 4 corners + close
  })

  it('collapses to the historical corner-start shape when the fraction lands exactly on a corner (no duplicate closing point)', () => {
    const dims = { halfWidth: 5, halfHeight: 3 }
    const points = rectFullLapPoints(0, 0, dims, 0)
    expect(points).toEqual([
      { x: -5, y: -3 },
      { x: 5, y: -3 },
      { x: 5, y: 3 },
      { x: -5, y: 3 },
      { x: -5, y: -3 },
    ])
  })
})

describe('rectRingMoves', () => {
  it('ramp (multi-segment, growing gradually) then a full CCW lap starting exactly where the ramp ends', () => {
    const fromDims = { halfWidth: 3, halfHeight: 3 }
    const toDims = { halfWidth: 6, halfHeight: 6 }
    const { lines, nextFraction } = rectRingMoves(fromDims, toDims, 0, { centerX: 0, centerY: 0, z: -1, feed: 800 })

    const sweep = rectRampSweepFor(fromDims, toDims)
    expect(sweep).toBeCloseTo(0.3536, 3)
    expect(nextFraction).toBeCloseTo(sweep, 9)

    const rampSegments = Math.max(1, Math.round(72 * sweep))
    const lapPointCount = rectFullLapPoints(0, 0, toDims, nextFraction).length - 1 // ramp's last point already covers the lap's own start point
    expect(lines).toHaveLength(rampSegments + lapPointCount)

    // Rectangles are always straight lines — no G2/G3 interpolation-mode
    // branch, unlike Circle.
    expect(lines.every((l) => l.startsWith('G1 '))).toBe(true)

    // The whole point of the fix: the ramp's first point has NOT yet
    // jumped to the target size (no 100%-stepover-in-one-move).
    expect(lines[0]).not.toBe('G1 X-6 Y-6 Z-1 F800')

    // The lap closes back exactly onto the ramp's own last point.
    const rampEndPoint = rectPointAtPerimeterFraction(0, 0, toDims.halfWidth, toDims.halfHeight, nextFraction)
    const match = lines[lines.length - 1].match(/^G1 X(-?[\d.]+) Y(-?[\d.]+) Z/)
    expect(match).not.toBeNull()
    expect(Number(match![1])).toBeCloseTo(rampEndPoint.x, 3)
    expect(Number(match![2])).toBeCloseTo(rampEndPoint.y, 3)
  })

  it('degenerate Plunge bootstrap (fromDims = 0,0) grows outward from the pocket center, not straight to the ring corner', () => {
    const { lines } = rectRingMoves(
      { halfWidth: 0, halfHeight: 0 },
      { halfWidth: 5, halfHeight: 3 },
      0,
      { centerX: 0, centerY: 0, z: -1, feed: 800 },
    )
    expect(lines[0]).not.toBe('G1 X0 Y0 Z-1 F800')
    expect(lines[0]).not.toBe('G1 X-5 Y-3 Z-1 F800')
  })
})
