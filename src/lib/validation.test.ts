import { describe, expect, it } from 'vitest'
import {
  isCircleHoleCountValid,
  isStartZValid,
  isStepdownValid,
  isToolDiameterValid,
  machineFitWarnings,
  patternSpan,
  zSpan,
} from './validation'
import { DEFAULT_WIZARD_PARAMS } from '../types/wizard'
import { DEFAULT_MACHINE_SETTINGS } from '../types/machine'

describe('isToolDiameterValid', () => {
  it('is valid when tool is smaller than the hole', () => {
    expect(
      isToolDiameterValid({ ...DEFAULT_WIZARD_PARAMS.geometry, toolDiameter: 3, holeDiameter: 8 }),
    ).toBe(true)
  })

  it('is valid when tool exactly equals the hole', () => {
    expect(
      isToolDiameterValid({ ...DEFAULT_WIZARD_PARAMS.geometry, toolDiameter: 8, holeDiameter: 8 }),
    ).toBe(true)
  })

  it('is invalid when tool is larger than the hole', () => {
    expect(
      isToolDiameterValid({ ...DEFAULT_WIZARD_PARAMS.geometry, toolDiameter: 9, holeDiameter: 8 }),
    ).toBe(false)
  })
})

describe('isStepdownValid', () => {
  it('is valid for a positive stepdown', () => {
    expect(isStepdownValid({ ...DEFAULT_WIZARD_PARAMS.feeds, stepdown: 1 })).toBe(true)
  })

  it('is invalid for zero', () => {
    expect(isStepdownValid({ ...DEFAULT_WIZARD_PARAMS.feeds, stepdown: 0 })).toBe(false)
  })

  it('is invalid for a negative stepdown', () => {
    expect(isStepdownValid({ ...DEFAULT_WIZARD_PARAMS.feeds, stepdown: -1 })).toBe(false)
  })
})

describe('isStartZValid', () => {
  it('is valid when startZ is below safeZ', () => {
    expect(isStartZValid({ ...DEFAULT_WIZARD_PARAMS.feeds, safeZ: 5, startZ: 0.5 })).toBe(true)
  })

  it('is valid when startZ exactly equals safeZ', () => {
    expect(isStartZValid({ ...DEFAULT_WIZARD_PARAMS.feeds, safeZ: 5, startZ: 5 })).toBe(true)
  })

  it('is valid at the default of zero', () => {
    expect(isStartZValid({ ...DEFAULT_WIZARD_PARAMS.feeds, safeZ: 5, startZ: 0 })).toBe(true)
  })

  it('is invalid when startZ exceeds safeZ', () => {
    expect(isStartZValid({ ...DEFAULT_WIZARD_PARAMS.feeds, safeZ: 5, startZ: 6 })).toBe(false)
  })
})

describe('isCircleHoleCountValid', () => {
  it('is valid at exactly the limit', () => {
    const geometry = { ...DEFAULT_WIZARD_PARAMS.geometry, positioning: 'circle' as const, circleHoleCount: 100 }
    expect(isCircleHoleCountValid(geometry)).toBe(true)
  })

  it('is invalid above the limit', () => {
    const geometry = { ...DEFAULT_WIZARD_PARAMS.geometry, positioning: 'circle' as const, circleHoleCount: 101 }
    expect(isCircleHoleCountValid(geometry)).toBe(false)
  })

  it('ignores the count outside circle positioning', () => {
    const geometry = { ...DEFAULT_WIZARD_PARAMS.geometry, positioning: 'grid' as const, circleHoleCount: 5000 }
    expect(isCircleHoleCountValid(geometry)).toBe(true)
  })
})

describe('patternSpan', () => {
  it('is just the hole footprint for a single point', () => {
    // single positioning resolves to one point at (0,0); span is the hole
    // diameter itself (radius on each side), not zero.
    const geometry = { ...DEFAULT_WIZARD_PARAMS.geometry, positioning: 'single' as const, holeDiameter: 8 }
    expect(patternSpan(geometry)).toEqual({ x: 8, y: 8 })
  })

  it('adds the hole footprint on top of the grid extent', () => {
    const geometry = {
      ...DEFAULT_WIZARD_PARAMS.geometry,
      positioning: 'grid' as const,
      gridX: 50,
      gridY: 30,
      holeDiameter: 8,
    }
    expect(patternSpan(geometry)).toEqual({ x: 58, y: 38 })
  })

  it('is zero-by-zero for an empty custom point list', () => {
    const geometry = { ...DEFAULT_WIZARD_PARAMS.geometry, positioning: 'custom' as const, customPoints: [] }
    expect(patternSpan(geometry)).toEqual({ x: 0, y: 0 })
  })
})

describe('zSpan', () => {
  it('sums safeZ and totalDepth', () => {
    const geometry = { ...DEFAULT_WIZARD_PARAMS.geometry, totalDepth: 4 }
    const feeds = { ...DEFAULT_WIZARD_PARAMS.feeds, safeZ: 5 }
    expect(zSpan(geometry, feeds)).toBe(9)
  })
})

describe('machineFitWarnings', () => {
  it('is empty when the pattern fits within the machine travel', () => {
    expect(machineFitWarnings(DEFAULT_WIZARD_PARAMS, DEFAULT_MACHINE_SETTINGS)).toEqual([])
  })

  it('flags only the axes that actually exceed travel', () => {
    const params = {
      ...DEFAULT_WIZARD_PARAMS,
      geometry: { ...DEFAULT_WIZARD_PARAMS.geometry, positioning: 'grid' as const, gridX: 500, gridY: 10 },
    }
    const machine = { ...DEFAULT_MACHINE_SETTINGS, travelX: 100, travelY: 1000, travelZ: 1000 }
    const warnings = machineFitWarnings(params, machine)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('X span')
  })

  it('flags the Z axis when safeZ + totalDepth exceeds Z travel', () => {
    const params = {
      ...DEFAULT_WIZARD_PARAMS,
      geometry: { ...DEFAULT_WIZARD_PARAMS.geometry, totalDepth: 50 },
      feeds: { ...DEFAULT_WIZARD_PARAMS.feeds, safeZ: 60 },
    }
    const machine = { ...DEFAULT_MACHINE_SETTINGS, travelZ: 100 }
    const warnings = machineFitWarnings(params, machine)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('Z span')
  })
})
