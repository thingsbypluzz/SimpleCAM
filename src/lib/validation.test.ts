import { describe, expect, it } from 'vitest'
import {
  isCircleHoleCountValid,
  isOutlineTabHeightValid,
  isOutlineTabWidthValid,
  isOutlineToolDiameterValid,
  isStartZValid,
  isStepdownValid,
  isTabHeightValid,
  isTabWidthValid,
  isToolDiameterValid,
  machineFitWarnings,
  outlineFootprint,
  outlineZSpan,
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

describe('isTabHeightValid', () => {
  it('is vacuously valid when tabs are disabled, regardless of value', () => {
    expect(
      isTabHeightValid({ ...DEFAULT_WIZARD_PARAMS.geometry, tabsEnabled: false, tabHeight: 0 }),
    ).toBe(true)
  })

  it('is valid when 0 < tabHeight < totalDepth', () => {
    expect(
      isTabHeightValid({
        ...DEFAULT_WIZARD_PARAMS.geometry,
        tabsEnabled: true,
        totalDepth: 4,
        tabHeight: 1,
      }),
    ).toBe(true)
  })

  it('is invalid at or above totalDepth', () => {
    expect(
      isTabHeightValid({
        ...DEFAULT_WIZARD_PARAMS.geometry,
        tabsEnabled: true,
        totalDepth: 4,
        tabHeight: 4,
      }),
    ).toBe(false)
  })

  it('is invalid at zero or below', () => {
    expect(
      isTabHeightValid({
        ...DEFAULT_WIZARD_PARAMS.geometry,
        tabsEnabled: true,
        totalDepth: 4,
        tabHeight: 0,
      }),
    ).toBe(false)
  })
})

describe('isTabWidthValid', () => {
  // toolDiameter 3.175, holeDiameter 8 (defaults) -> toolPathRadius
  // 2.4125mm -> circumference ~15.16mm.
  it('is vacuously valid when tabs are disabled', () => {
    expect(
      isTabWidthValid({ ...DEFAULT_WIZARD_PARAMS.geometry, tabsEnabled: false, tabCount: 10, tabWidth: 10 }),
    ).toBe(true)
  })

  it('is valid when tabCount * tabWidth stays under the circumference', () => {
    expect(
      isTabWidthValid({ ...DEFAULT_WIZARD_PARAMS.geometry, tabsEnabled: true, tabCount: 4, tabWidth: 3 }),
    ).toBe(true)
  })

  it('is invalid once tabCount * tabWidth reaches or exceeds the circumference', () => {
    expect(
      isTabWidthValid({ ...DEFAULT_WIZARD_PARAMS.geometry, tabsEnabled: true, tabCount: 4, tabWidth: 4 }),
    ).toBe(false)
  })
})

describe('isOutlineToolDiameterValid', () => {
  const outline = DEFAULT_WIZARD_PARAMS.outline

  it('rectangle inside: valid when tool is smaller than the shorter side', () => {
    expect(
      isOutlineToolDiameterValid({ ...outline, shape: 'rectCornered', offsetMode: 'inside', width: 50, height: 30, toolDiameter: 4 }),
    ).toBe(true)
  })

  it('rectangle inside: invalid when tool reaches or exceeds the shorter side', () => {
    expect(
      isOutlineToolDiameterValid({ ...outline, shape: 'rectCornered', offsetMode: 'inside', width: 50, height: 30, toolDiameter: 30 }),
    ).toBe(false)
  })

  it('circle inside: valid when tool exactly equals the diameter', () => {
    expect(
      isOutlineToolDiameterValid({ ...outline, shape: 'circle', offsetMode: 'inside', diameter: 8, toolDiameter: 8 }),
    ).toBe(true)
  })

  it('circle inside: invalid when tool exceeds the diameter', () => {
    expect(
      isOutlineToolDiameterValid({ ...outline, shape: 'circle', offsetMode: 'inside', diameter: 8, toolDiameter: 9 }),
    ).toBe(false)
  })

  it('outside and onLine are always valid, regardless of tool size', () => {
    expect(
      isOutlineToolDiameterValid({ ...outline, shape: 'rectCornered', offsetMode: 'outside', width: 5, height: 5, toolDiameter: 50 }),
    ).toBe(true)
    expect(
      isOutlineToolDiameterValid({ ...outline, shape: 'circle', offsetMode: 'onLine', diameter: 5, toolDiameter: 50 }),
    ).toBe(true)
  })
})

describe('isOutlineTabHeightValid', () => {
  const outline = DEFAULT_WIZARD_PARAMS.outline

  it('is vacuously valid when tabs are disabled', () => {
    expect(isOutlineTabHeightValid({ ...outline, tabsEnabled: false, tabHeight: 0 })).toBe(true)
  })

  it('is valid when 0 < tabHeight < totalDepth', () => {
    expect(isOutlineTabHeightValid({ ...outline, tabsEnabled: true, totalDepth: 4, tabHeight: 1 })).toBe(true)
  })

  it('is invalid at or above totalDepth', () => {
    expect(isOutlineTabHeightValid({ ...outline, tabsEnabled: true, totalDepth: 4, tabHeight: 4 })).toBe(false)
  })
})

describe('isOutlineTabWidthValid', () => {
  const outline = DEFAULT_WIZARD_PARAMS.outline

  it('is vacuously valid when tabs are disabled', () => {
    expect(isOutlineTabWidthValid({ ...outline, tabsEnabled: false, tabCount: 10, tabWidth: 10 })).toBe(true)
  })

  it('circle: valid when tabCount * tabWidth stays under the circumference', () => {
    expect(
      isOutlineTabWidthValid({ ...outline, shape: 'circle', offsetMode: 'onLine', diameter: 40, tabsEnabled: true, tabCount: 4, tabWidth: 3 }),
    ).toBe(true)
  })

  it('circle: invalid once tabCount * tabWidth reaches the circumference', () => {
    // circumference = pi*40 ~ 125.7
    expect(
      isOutlineTabWidthValid({ ...outline, shape: 'circle', offsetMode: 'onLine', diameter: 40, tabsEnabled: true, tabCount: 4, tabWidth: 32 }),
    ).toBe(false)
  })

  it('rectangle: checked against the shortest tool-corrected side, per side (not total perimeter)', () => {
    // onLine 50x20 -> toolWidth 50, toolHeight 20 (shortest = 20).
    // 3 tabs * 6mm = 18 < 20 -> valid; 3 * 7 = 21 >= 20 -> invalid.
    const base = { ...outline, shape: 'rectCornered' as const, offsetMode: 'onLine' as const, width: 50, height: 20, tabsEnabled: true, tabCount: 3 }
    expect(isOutlineTabWidthValid({ ...base, tabWidth: 6 })).toBe(true)
    expect(isOutlineTabWidthValid({ ...base, tabWidth: 7 })).toBe(false)
  })
})

describe('outlineFootprint', () => {
  it('rectangle: tool-corrected width/height, offset-independent', () => {
    const outline = { ...DEFAULT_WIZARD_PARAMS.outline, shape: 'rectCornered' as const, offsetMode: 'inside' as const, width: 50, height: 30, toolDiameter: 4, offsetX: 100, offsetY: -50 }
    expect(outlineFootprint(outline)).toEqual({ x: 46, y: 26 })
  })

  it('circle: tool-corrected diameter on both axes', () => {
    const outline = { ...DEFAULT_WIZARD_PARAMS.outline, shape: 'circle' as const, offsetMode: 'outside' as const, diameter: 40, toolDiameter: 4 }
    expect(outlineFootprint(outline)).toEqual({ x: 44, y: 44 })
  })
})

describe('outlineZSpan', () => {
  it('sums safeZ and totalDepth', () => {
    const outline = { ...DEFAULT_WIZARD_PARAMS.outline, totalDepth: 4 }
    const feeds = { ...DEFAULT_WIZARD_PARAMS.feeds, safeZ: 5 }
    expect(outlineZSpan(outline, feeds)).toBe(9)
  })
})

describe('machineFitWarnings — Outline', () => {
  it('uses outlineFootprint/outlineZSpan when operation is outline', () => {
    const params = {
      ...DEFAULT_WIZARD_PARAMS,
      operation: 'outline' as const,
      outline: { ...DEFAULT_WIZARD_PARAMS.outline, shape: 'rectCornered' as const, offsetMode: 'onLine' as const, width: 500, height: 10 },
    }
    const machine = { ...DEFAULT_MACHINE_SETTINGS, travelX: 100, travelY: 1000, travelZ: 1000 }
    const warnings = machineFitWarnings(params, machine)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('X span')
  })
})
