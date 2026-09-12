import { describe, expect, it } from 'vitest'
import { computeLinePositions, computeRasterLines, zigzagWaypoints } from './surfaceRaster'

describe('computeLinePositions', () => {
  it('always includes both min and max', () => {
    const positions = computeLinePositions(0, 10, 2)
    expect(positions[0]).toBe(0)
    expect(positions[positions.length - 1]).toBe(10)
  })

  it('evenly divisible span: snaps the last position onto max instead of duplicating it', () => {
    // 0,2,4,6,8,10 — spacing divides the span exactly, no extra near-duplicate line.
    expect(computeLinePositions(0, 10, 2)).toEqual([0, 2, 4, 6, 8, 10])
  })

  it('unevenly divisible span: forces the last line onto the exact far edge', () => {
    // 0,3,6,9 would be the last full step; max=10 is 1mm further, still forced in.
    expect(computeLinePositions(0, 10, 3)).toEqual([0, 3, 6, 9, 10])
  })

  it('degenerate span (max <= min): a single line at min', () => {
    expect(computeLinePositions(5, 5, 2)).toEqual([5])
    expect(computeLinePositions(5, 3, 2)).toEqual([5])
  })

  it('invalid spacing falls back to just the two edges', () => {
    expect(computeLinePositions(0, 10, 0)).toEqual([0, 10])
    expect(computeLinePositions(0, 10, -1)).toEqual([0, 10])
  })

  it('caps the number of lines for a pathologically small spacing (live-preview safety net)', () => {
    const positions = computeLinePositions(0, 10000, 0.001)
    expect(positions.length).toBeLessThanOrEqual(5001)
    expect(positions[positions.length - 1]).toBe(10000)
  })
})

describe('computeRasterLines', () => {
  const bounds = { minX: 0, maxX: 10, minY: 0, maxY: 5 }

  it("direction 'x': lines run parallel to X, stepping along Y", () => {
    const lines = computeRasterLines(bounds, 'x', 5)
    expect(lines).toEqual([
      { from: { x: 0, y: 0 }, to: { x: 10, y: 0 } },
      { from: { x: 0, y: 5 }, to: { x: 10, y: 5 } },
    ])
  })

  it("direction 'y': lines run parallel to Y, stepping along X", () => {
    const lines = computeRasterLines(bounds, 'y', 5)
    expect(lines).toEqual([
      { from: { x: 0, y: 0 }, to: { x: 0, y: 5 } },
      { from: { x: 5, y: 0 }, to: { x: 5, y: 5 } },
      { from: { x: 10, y: 0 }, to: { x: 10, y: 5 } },
    ])
  })

  it('line 0 always starts at the min-X/min-Y corner', () => {
    const lines = computeRasterLines(bounds, 'x', 2)
    expect(lines[0].from).toEqual({ x: bounds.minX, y: bounds.minY })
  })
})

describe('zigzagWaypoints', () => {
  it('alternates forward/reverse so consecutive lines connect end-to-end', () => {
    const lines = [
      { from: { x: 0, y: 0 }, to: { x: 10, y: 0 } },
      { from: { x: 0, y: 5 }, to: { x: 10, y: 5 } },
      { from: { x: 0, y: 10 }, to: { x: 10, y: 10 } },
    ]
    expect(zigzagWaypoints(lines)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 0, y: 5 },
      { x: 0, y: 10 },
      { x: 10, y: 10 },
    ])
  })
})
