import { describe, expect, it } from 'vitest'
import { circleRingMoves, pocketCircleRingRadii, pocketRectRingDims, rampSweepDegFor, rectRingMoves } from './pocketSpiral'

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

describe('rectRingMoves', () => {
  it('one ramp line to the bottom-left corner, then a full CCW 4-edge lap back to it', () => {
    const { lines, corner } = rectRingMoves({ halfWidth: 5, halfHeight: 3 }, { centerX: 0, centerY: 0, z: -1, feed: 800 })
    expect(lines).toHaveLength(5) // 1 ramp + 4 edges
    expect(corner).toEqual({ x: -5, y: -3 })
    expect(lines[0]).toBe('G1 X-5 Y-3 Z-1 F800') // ramp destination = bottom-left
    expect(lines[1]).toBe('G1 X5 Y-3 Z-1 F800') // bottom-right
    expect(lines[2]).toBe('G1 X5 Y3 Z-1 F800') // top-right
    expect(lines[3]).toBe('G1 X-5 Y3 Z-1 F800') // top-left
    expect(lines[4]).toBe('G1 X-5 Y-3 Z-1 F800') // back to start
  })
})
