import { describe, expect, it } from 'vitest'
import { computeDepthPasses } from './depthPasses'

describe('computeDepthPasses', () => {
  it('splits evenly when stepdown divides totalDepth exactly', () => {
    expect(computeDepthPasses(4, 1)).toEqual([1, 1, 1, 1])
  })

  it('leaves a smaller remainder pass when it does not divide evenly', () => {
    expect(computeDepthPasses(4.5, 1)).toEqual([1, 1, 1, 1, 0.5])
  })

  it('returns an empty array for zero or negative totalDepth', () => {
    expect(computeDepthPasses(0, 1)).toEqual([])
    expect(computeDepthPasses(-5, 1)).toEqual([])
  })

  it('falls back to a single full-depth pass when stepdown is zero, instead of looping forever', () => {
    expect(computeDepthPasses(4, 0)).toEqual([4])
  })

  it('falls back to a single full-depth pass when stepdown is negative', () => {
    expect(computeDepthPasses(4, -1)).toEqual([4])
  })

  it('falls back to a single full-depth pass when stepdown is NaN', () => {
    expect(computeDepthPasses(4, NaN)).toEqual([4])
  })

  it('caps the number of passes instead of hanging on a pathological ratio', () => {
    const passes = computeDepthPasses(1_000_000, 0.0001)
    expect(passes.length).toBe(5000)
  })
})
