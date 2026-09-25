import { describe, expect, it } from 'vitest'
import {
  arcEngagement,
  chipThinnedFeed,
  chipThinningFactor,
  isFeedChipThinningCompensated,
  engagementAngleFor,
  nextConstantEngagementRadius,
  optimalLoadMm,
  optimalLoadPercentFromMm,
} from './pocketAdaptiveMath'

const deg = (rad: number) => (rad * 180) / Math.PI

describe('engagementAngleFor', () => {
  it('matches the straight-cut formula θ = arccos(1 − ae/R)', () => {
    expect(deg(engagementAngleFor(10))).toBeCloseTo(36.87, 2)
    expect(deg(engagementAngleFor(20))).toBeCloseTo(53.13, 2)
    expect(deg(engagementAngleFor(40))).toBeCloseTo(78.46, 2)
    expect(deg(engagementAngleFor(50))).toBeCloseTo(90, 6)
  })
})

describe('optimal load % ↔ mm', () => {
  it('derives mm from % of the tool diameter and back', () => {
    expect(optimalLoadMm(6, 10)).toBeCloseTo(0.6, 9)
    expect(optimalLoadPercentFromMm(6, 0.6)).toBeCloseTo(10, 9)
    expect(optimalLoadPercentFromMm(0, 1)).toBe(0)
  })
})

describe('chipThinningFactor', () => {
  it('is 1 / sin θ — ×1.67 at 10% D, 1 at 50% D', () => {
    expect(chipThinningFactor(10)).toBeCloseTo(1 / 0.6, 6)
    expect(chipThinningFactor(50)).toBeCloseTo(1, 6)
  })
})

describe('chip-thinning feed suggestion', () => {
  it('compensates from the remembered base, never compounding on an already-compensated feed', () => {
    expect(chipThinnedFeed(1440, 10)).toBe(2400)
    expect(isFeedChipThinningCompensated(2400, 1440, 10)).toBe(true)
    expect(isFeedChipThinningCompensated(2400, null, 10)).toBe(false) // no base → nothing was applied
  })

  it('tolerates 5% — a small Optimal Load tweak after applying still counts, a real mismatch does not', () => {
    expect(isFeedChipThinningCompensated(2400, 1440, 10.5)).toBe(true) // factor −2.3%
    expect(isFeedChipThinningCompensated(2400, 1440, 15)).toBe(false) // factor −17%
  })
})

describe('arcEngagement', () => {
  const R = 3
  it('rises inside smaller rings for the same radial step (concave cut)', () => {
    // Previous tool-center ring at ρ − ae → material cleared to ρ − ae + R.
    expect(deg(arcEngagement(20, 20 - 1.2 + R, R))).toBeCloseTo(56.5, 1)
    expect(deg(arcEngagement(2, 2 - 2.4 + R, R))).toBeCloseTo(121.3, 1)
  })

  it('reduces to the straight-cut formula far from the center', () => {
    const ae = 0.6
    expect(deg(arcEngagement(1e6, 1e6 - ae + R, R))).toBeCloseTo(deg(engagementAngleFor(10)), 2)
  })
})

describe('nextConstantEngagementRadius', () => {
  const R = 3
  const theta = engagementAngleFor(10)

  it('is the exact inverse of arcEngagement()', () => {
    for (const prev of [0.5, 1, 3, 10, 40]) {
      const next = nextConstantEngagementRadius(prev, R, theta)
      expect(next).toBeGreaterThan(prev)
      expect(arcEngagement(next, prev + R, R)).toBeCloseTo(theta, 9)
    }
  })

  it('steps by the straight-cut ae far from the center, less near it', () => {
    const far = nextConstantEngagementRadius(1e5, R, theta) - 1e5
    expect(far).toBeCloseTo(R * (1 - Math.cos(theta)), 3)
    expect(nextConstantEngagementRadius(1, R, theta) - 1).toBeLessThan(far)
  })

  it('cannot grow out of a zero-radius bore — the reason Adaptive forces a Helix entry', () => {
    expect(nextConstantEngagementRadius(0, R, theta)).toBeCloseTo(0, 9)
  })
})
