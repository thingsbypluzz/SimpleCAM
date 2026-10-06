import { describe, expect, it } from 'vitest'
import {
  isOutlineNotchesSeparate,
  isOutlineLobeGapTooNarrow,
  isOutlineLobesAttached,
  OPERATION_RULES,
  facingFootprint,
  isFacingPassCountWithinLimit,
  isFacingStepoverValid,
  descentAngleDeg,
  isPocketLightCellsValid,
  isPocketLightParamsValid,
  pocketMaxHelixRadius,
  isPocketRampLengthValid,
  isRampAngleValid,
  isRampTurnCountWithinLimit,
  isWizardParamsValid,
  rampDescent,
  rampTurnsPerStepdown,
  isStartZAboveCut,
  minStartZ,
  descentWarnings,
  feedsWarnings,
  isCircleHoleCountValid,
  isPassCountWithinLimit,
  isPocketToolpathWithinLimits,
  isSurfaceLineCountWithinLimit,
  isCustomPointsValid,
  isFeedrateXYValid,
  isHolesSizeValid,
  isOutlineSizeValid,
  isPlungeRateValid,
  isPocketSizeValid,
  isSafeZValid,
  isSurfaceSizeValid,
  isOutlineTabCountValid,
  isOutlineTabHeightValid,
  isOutlineTabWidthValid,
  isOutlineToolDiameterValid,
  isStartZValid,
  isStepdownValid,
  isAdaptiveStepdownShallow,
  isPocketHelixRadiusSmall,
  isPocketHelixRadiusValid,
  isPocketLinkingFeedValid,
  isPocketOptimalLoadValid,
  isPocketRampAngleValid,
  isPocketStepoverValid,
  suggestedAdaptiveStepdown,
  isPocketToolDiameterValid,
  isSurfaceHelixRadiusValid,
  isSurfaceStepoverValid,
  isSurfaceToolDiameterValid,
  isTabHeightValid,
  isTabWidthValid,
  isTabCountValid,
  isToolDiameterValid,
  isValidTabCount,
  MAX_TAB_COUNT,
  machineFitWarnings,
  outlineFootprint,
  outlineZSpan,
  patternSpan,
  pocketFootprint,
  pocketZSpan,
  surfaceFootprint,
  surfaceZSpan,
  zSpan,
} from './validation'
import { DEFAULT_WIZARD_PARAMS, type WizardParams } from '../types/wizard'
import { DEFAULT_MACHINE_SETTINGS } from '../types/machine'

describe('isToolDiameterValid', () => {
  it('is valid when tool is smaller than the hole', () => {
    expect(
      isToolDiameterValid({ ...DEFAULT_WIZARD_PARAMS.geometry, toolDiameter: 3, holeDiameter: 8 }),
    ).toBe(true)
  })

  it('is invalid when tool exactly equals the hole (zero-radius toolpath, BL-49)', () => {
    expect(
      isToolDiameterValid({ ...DEFAULT_WIZARD_PARAMS.geometry, toolDiameter: 8, holeDiameter: 8 }),
    ).toBe(false)
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

  it('circle inside: invalid when tool exactly equals the diameter (zero-radius toolpath, BL-49)', () => {
    expect(
      isOutlineToolDiameterValid({ ...outline, shape: 'circle', offsetMode: 'inside', diameter: 8, toolDiameter: 8 }),
    ).toBe(false)
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

describe('isSurfaceToolDiameterValid', () => {
  it('is valid for any positive tool diameter — Surface has no "must fit inside the shape" constraint', () => {
    expect(isSurfaceToolDiameterValid({ ...DEFAULT_WIZARD_PARAMS.surface, toolDiameter: 50, width: 5, height: 5 })).toBe(true)
  })

  it('is invalid at zero or below', () => {
    expect(isSurfaceToolDiameterValid({ ...DEFAULT_WIZARD_PARAMS.surface, toolDiameter: 0 })).toBe(false)
  })
})

describe('isSurfaceStepoverValid', () => {
  it('is valid at the boundaries (1% and 100%)', () => {
    expect(isSurfaceStepoverValid({ ...DEFAULT_WIZARD_PARAMS.surface, stepoverPercent: 1 })).toBe(true)
    expect(isSurfaceStepoverValid({ ...DEFAULT_WIZARD_PARAMS.surface, stepoverPercent: 100 })).toBe(true)
  })

  it('is invalid outside 1-100%', () => {
    expect(isSurfaceStepoverValid({ ...DEFAULT_WIZARD_PARAMS.surface, stepoverPercent: 0 })).toBe(false)
    expect(isSurfaceStepoverValid({ ...DEFAULT_WIZARD_PARAMS.surface, stepoverPercent: 101 })).toBe(false)
  })
})

describe('isSurfaceHelixRadiusValid', () => {
  it('is vacuously valid in Plunge mode, regardless of value', () => {
    expect(
      isSurfaceHelixRadiusValid({ ...DEFAULT_WIZARD_PARAMS.surface, zTransitionMode: 'plunge', helixRadius: -5 }),
    ).toBe(true)
  })

  it('in Helix mode: valid above 0 and up to the stepover (mm)', () => {
    // toolDiameter 3.175 * stepoverPercent 40% = 1.27mm ceiling.
    const surface = { ...DEFAULT_WIZARD_PARAMS.surface, zTransitionMode: 'helix' as const, toolDiameter: 3.175, stepoverPercent: 40 }
    expect(isSurfaceHelixRadiusValid({ ...surface, helixRadius: 1.27 })).toBe(true)
    expect(isSurfaceHelixRadiusValid({ ...surface, helixRadius: 0.5 })).toBe(true)
  })

  it('in Helix mode: invalid at or below 0, or above the stepover ceiling', () => {
    const surface = { ...DEFAULT_WIZARD_PARAMS.surface, zTransitionMode: 'helix' as const, toolDiameter: 3.175, stepoverPercent: 40 }
    expect(isSurfaceHelixRadiusValid({ ...surface, helixRadius: 0 })).toBe(false)
    expect(isSurfaceHelixRadiusValid({ ...surface, helixRadius: 1.28 })).toBe(false)
  })
})

describe('surfaceFootprint', () => {
  it('is the nominal rectangle expanded outward by the tool radius on every side', () => {
    const surface = { ...DEFAULT_WIZARD_PARAMS.surface, width: 50, height: 30, toolDiameter: 4, offsetX: 100, offsetY: -50 }
    expect(surfaceFootprint(surface)).toEqual({ x: 54, y: 34 })
  })
})

describe('surfaceZSpan', () => {
  it('sums safeZ and totalDepth', () => {
    const surface = { ...DEFAULT_WIZARD_PARAMS.surface, totalDepth: 4 }
    const feeds = { ...DEFAULT_WIZARD_PARAMS.feeds, safeZ: 5 }
    expect(surfaceZSpan(surface, feeds)).toBe(9)
  })
})

describe('machineFitWarnings — Surface', () => {
  it('uses surfaceFootprint/surfaceZSpan when operation is surface', () => {
    const params = {
      ...DEFAULT_WIZARD_PARAMS,
      operation: 'surface' as const,
      surface: { ...DEFAULT_WIZARD_PARAMS.surface, width: 500, height: 10, toolDiameter: 0 },
    }
    const machine = { ...DEFAULT_MACHINE_SETTINGS, travelX: 100, travelY: 1000, travelZ: 1000 }
    const warnings = machineFitWarnings(params, machine)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('X span')
  })
})

describe('isPocketToolDiameterValid', () => {
  it('rect: valid when the tool is smaller than the shorter side', () => {
    expect(isPocketToolDiameterValid({ ...DEFAULT_WIZARD_PARAMS.pocket, width: 50, height: 30, toolDiameter: 4 })).toBe(true)
  })

  it('rect: invalid at or above the shorter side', () => {
    expect(isPocketToolDiameterValid({ ...DEFAULT_WIZARD_PARAMS.pocket, width: 50, height: 30, toolDiameter: 30 })).toBe(false)
  })

  it('circle: invalid at or above the diameter', () => {
    expect(isPocketToolDiameterValid({ ...DEFAULT_WIZARD_PARAMS.pocket, shape: 'circle', diameter: 20, toolDiameter: 20 })).toBe(
      false,
    )
    expect(isPocketToolDiameterValid({ ...DEFAULT_WIZARD_PARAMS.pocket, shape: 'circle', diameter: 20, toolDiameter: 19 })).toBe(
      true,
    )
  })
})

describe('isPocketStepoverValid', () => {
  it('valid within 1-100%, invalid outside', () => {
    expect(isPocketStepoverValid({ ...DEFAULT_WIZARD_PARAMS.pocket, stepoverPercent: 1 })).toBe(true)
    expect(isPocketStepoverValid({ ...DEFAULT_WIZARD_PARAMS.pocket, stepoverPercent: 100 })).toBe(true)
    expect(isPocketStepoverValid({ ...DEFAULT_WIZARD_PARAMS.pocket, stepoverPercent: 0 })).toBe(false)
    expect(isPocketStepoverValid({ ...DEFAULT_WIZARD_PARAMS.pocket, stepoverPercent: 101 })).toBe(false)
  })
})

describe('isPocketHelixRadiusValid', () => {
  it('vacuously valid outside Helix mode', () => {
    expect(isPocketHelixRadiusValid({ ...DEFAULT_WIZARD_PARAMS.pocket, zTransitionMode: 'plunge', helixRadius: -5 })).toBe(true)
  })

  it("in Helix mode, the ceiling is the pocket's own smallest wall extent when that's tighter than the tool radius", () => {
    // rect wall half-dims: (12-4)/2=4, (8-4)/2=2 -> wall ceiling 2 < tool radius 2.5
    const pocket = { ...DEFAULT_WIZARD_PARAMS.pocket, zTransitionMode: 'helix' as const, width: 12, height: 9, toolDiameter: 5 }
    expect(isPocketHelixRadiusValid({ ...pocket, helixRadius: 2 })).toBe(true)
    expect(isPocketHelixRadiusValid({ ...pocket, helixRadius: 2.1 })).toBe(false)
    expect(isPocketHelixRadiusValid({ ...pocket, helixRadius: 0 })).toBe(false)
  })

  it('never wider than the tool radius — a wider helix leaves an uncut post in the center', () => {
    const pocket = { ...DEFAULT_WIZARD_PARAMS.pocket, zTransitionMode: 'helix' as const, width: 50, height: 30, toolDiameter: 6 }
    expect(isPocketHelixRadiusValid({ ...pocket, helixRadius: 3 })).toBe(true)
    expect(isPocketHelixRadiusValid({ ...pocket, helixRadius: 3.1 })).toBe(false)
  })
})

describe('Pocket Adaptive validators', () => {
  const adaptive = { ...DEFAULT_WIZARD_PARAMS.pocket, method: 'adaptive' as const }

  it('Helix radius is enforced for Adaptive even with Plunge stored — Adaptive always enters by Helix', () => {
    expect(isPocketHelixRadiusValid({ ...adaptive, zTransitionMode: 'plunge', helixRadius: 0 })).toBe(false)
    expect(isPocketHelixRadiusValid({ ...adaptive, zTransitionMode: 'plunge', helixRadius: 1 })).toBe(true)
  })

  it('Optimal Load 1–30%, ramp angle 0.5–30°, linking feed > 0 — only for Adaptive', () => {
    expect(isPocketOptimalLoadValid({ ...adaptive, optimalLoadPercent: 1 })).toBe(true)
    expect(isPocketOptimalLoadValid({ ...adaptive, optimalLoadPercent: 30 })).toBe(true)
    expect(isPocketOptimalLoadValid({ ...adaptive, optimalLoadPercent: 30.5 })).toBe(false)
    expect(isPocketOptimalLoadValid({ ...adaptive, optimalLoadPercent: 0 })).toBe(false)
    expect(isPocketRampAngleValid({ ...adaptive, rampAngleDeg: 0.4 })).toBe(false)
    expect(isPocketRampAngleValid({ ...adaptive, rampAngleDeg: 2 })).toBe(true)
    expect(isPocketLinkingFeedValid({ ...adaptive, linkingFeed: 0 })).toBe(false)
    const spiral = { ...DEFAULT_WIZARD_PARAMS.pocket, method: 'spiral' as const, optimalLoadPercent: 0, rampAngleDeg: 0, linkingFeed: 0 }
    expect(isPocketOptimalLoadValid(spiral) && isPocketRampAngleValid(spiral) && isPocketLinkingFeedValid(spiral)).toBe(true)
  })

  it("stepover isn't used by Adaptive, so it never blocks Generate there", () => {
    expect(isPocketStepoverValid({ ...adaptive, stepoverPercent: 0 })).toBe(true)
  })

  it('hints: small helix below 25% of the tool diameter, stepdown below one diameter', () => {
    expect(isPocketHelixRadiusSmall({ ...adaptive, toolDiameter: 6, helixRadius: 1 })).toBe(true)
    expect(isPocketHelixRadiusSmall({ ...adaptive, toolDiameter: 6, helixRadius: 1.5 })).toBe(false)
    expect(isAdaptiveStepdownShallow({ ...adaptive, toolDiameter: 6 }, 3)).toBe(true)
    expect(isAdaptiveStepdownShallow({ ...adaptive, toolDiameter: 6 }, 6)).toBe(false)
  })

  it("the stepdown hint's Apply suggests 1.5× the tool diameter, which clears the hint", () => {
    const pocket = { ...adaptive, toolDiameter: 3.175 }
    expect(suggestedAdaptiveStepdown(pocket)).toBe(4.76)
    expect(isAdaptiveStepdownShallow(pocket, suggestedAdaptiveStepdown(pocket))).toBe(false)
  })
})

describe('pocketFootprint', () => {
  it('rect: the tool-center wall (inset, not overtravel like Surface), doubled', () => {
    const pocket = { ...DEFAULT_WIZARD_PARAMS.pocket, width: 50, height: 30, toolDiameter: 4 }
    expect(pocketFootprint(pocket)).toEqual({ x: 46, y: 26 })
  })

  it('circle: the tool-center wall diameter', () => {
    const pocket = { ...DEFAULT_WIZARD_PARAMS.pocket, shape: 'circle' as const, diameter: 20, toolDiameter: 4 }
    expect(pocketFootprint(pocket)).toEqual({ x: 16, y: 16 })
  })
})

describe('pocketZSpan', () => {
  it('sums safeZ and totalDepth', () => {
    const pocket = { ...DEFAULT_WIZARD_PARAMS.pocket, totalDepth: 4 }
    const feeds = { ...DEFAULT_WIZARD_PARAMS.feeds, safeZ: 5 }
    expect(pocketZSpan(pocket, feeds)).toBe(9)
  })
})

describe('machineFitWarnings — Pocket', () => {
  it('uses pocketFootprint/pocketZSpan when operation is pocket', () => {
    const params = {
      ...DEFAULT_WIZARD_PARAMS,
      operation: 'pocket' as const,
      pocket: { ...DEFAULT_WIZARD_PARAMS.pocket, width: 500, height: 10, toolDiameter: 0 },
    }
    const machine = { ...DEFAULT_MACHINE_SETTINGS, travelX: 100, travelY: 1000, travelZ: 1000 }
    const warnings = machineFitWarnings(params, machine)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('X span')
  })
})

describe('isValidTabCount / isTabCountValid / isOutlineTabCountValid (BL-45)', () => {
  it('accepts whole numbers from 1 to MAX_TAB_COUNT', () => {
    expect(isValidTabCount(1)).toBe(true)
    expect(isValidTabCount(MAX_TAB_COUNT)).toBe(true)
  })

  it('rejects zero, fractions, values above the ceiling and NaN', () => {
    for (const n of [0, 0.4, 2.5, MAX_TAB_COUNT + 1, -3, Number.NaN]) {
      expect(isValidTabCount(n)).toBe(false)
    }
  })

  it('is vacuously valid with tabs disabled, enforced with tabs enabled', () => {
    const geometry = { ...DEFAULT_WIZARD_PARAMS.geometry, tabCount: 2.5 }
    expect(isTabCountValid({ ...geometry, tabsEnabled: false })).toBe(true)
    expect(isTabCountValid({ ...geometry, tabsEnabled: true })).toBe(false)
    const outline = { ...DEFAULT_WIZARD_PARAMS.outline, tabCount: 0 }
    expect(isOutlineTabCountValid({ ...outline, tabsEnabled: false })).toBe(true)
    expect(isOutlineTabCountValid({ ...outline, tabsEnabled: true })).toBe(false)
    expect(isOutlineTabCountValid({ ...outline, tabsEnabled: true, tabCount: 3 })).toBe(true)
  })
})

describe('isCustomPointsValid (BL-48)', () => {
  const custom = { ...DEFAULT_WIZARD_PARAMS.geometry, positioning: 'custom' as const }

  it('is valid when every non-blank line parses', () => {
    expect(isCustomPointsValid({ ...custom, customPointsText: '10,10\n\n20;30' })).toBe(true)
  })

  it('is invalid when any line fails to parse', () => {
    expect(isCustomPointsValid({ ...custom, customPointsText: '10,10\nabc' })).toBe(false)
  })

  it('is invalid for an empty list', () => {
    expect(isCustomPointsValid({ ...custom, customPointsText: '  \n' })).toBe(false)
  })

  it('is vacuously valid outside custom positioning', () => {
    expect(
      isCustomPointsValid({ ...DEFAULT_WIZARD_PARAMS.geometry, positioning: 'single', customPointsText: 'abc' }),
    ).toBe(true)
  })
})

describe('feeds validators (BL-46)', () => {
  const feeds = DEFAULT_WIZARD_PARAMS.feeds

  it('requires positive Feedrate XY, Plunge Rate and Safe Z', () => {
    expect(isFeedrateXYValid(feeds) && isPlungeRateValid(feeds) && isSafeZValid(feeds)).toBe(true)
    expect(isFeedrateXYValid({ ...feeds, feedrateXY: 0 })).toBe(false)
    expect(isPlungeRateValid({ ...feeds, plungeRate: -300 })).toBe(false)
    expect(isSafeZValid({ ...feeds, safeZ: 0 })).toBe(false)
  })

  it('warns (without blocking) about a negative Start Z', () => {
    expect(feedsWarnings(feeds)).toEqual([])
    expect(feedsWarnings({ ...feeds, startZ: -3 })).toHaveLength(1)
  })
})

describe('size validators (BL-46)', () => {
  it('require positive depth and shape dimensions', () => {
    expect(isHolesSizeValid(DEFAULT_WIZARD_PARAMS.geometry)).toBe(true)
    expect(isHolesSizeValid({ ...DEFAULT_WIZARD_PARAMS.geometry, totalDepth: 0 })).toBe(false)
    expect(isOutlineSizeValid(DEFAULT_WIZARD_PARAMS.outline)).toBe(true)
    expect(isOutlineSizeValid({ ...DEFAULT_WIZARD_PARAMS.outline, height: 0 })).toBe(false)
    expect(isOutlineSizeValid({ ...DEFAULT_WIZARD_PARAMS.outline, shape: 'circle', height: 0 })).toBe(true)
    expect(isSurfaceSizeValid({ ...DEFAULT_WIZARD_PARAMS.surface, width: -5 })).toBe(false)
    expect(isPocketSizeValid({ ...DEFAULT_WIZARD_PARAMS.pocket, shape: 'circle', diameter: 0 })).toBe(false)
  })
})

describe('safety-limit validators (BL-55)', () => {
  it('flags a stepdown so small the depth needs more than MAX_PASSES passes', () => {
    const params = { ...DEFAULT_WIZARD_PARAMS, feeds: { ...DEFAULT_WIZARD_PARAMS.feeds, stepdown: 0.0005 } }
    expect(isPassCountWithinLimit(DEFAULT_WIZARD_PARAMS)).toBe(true)
    expect(isPassCountWithinLimit(params)).toBe(false)
  })

  it('flags a Surface raster that would need more than MAX_LINES lines (review repro)', () => {
    const surface = { ...DEFAULT_WIZARD_PARAMS.surface, width: 1000, height: 1000, toolDiameter: 1, stepoverPercent: 10 }
    expect(isSurfaceLineCountWithinLimit(DEFAULT_WIZARD_PARAMS.surface)).toBe(true)
    expect(isSurfaceLineCountWithinLimit(surface)).toBe(false)
  })

  it('flags an Adaptive helix needing more than MAX_PASSES turns per level (review repro)', () => {
    const params = {
      ...DEFAULT_WIZARD_PARAMS,
      operation: 'pocket' as const,
      pocket: { ...DEFAULT_WIZARD_PARAMS.pocket, method: 'adaptive' as const, toolDiameter: 6, helixRadius: 0.05, rampAngleDeg: 0.5, totalDepth: 20 },
      feeds: { ...DEFAULT_WIZARD_PARAMS.feeds, stepdown: 20 },
    }
    expect(isPocketToolpathWithinLimits({ ...params, pocket: { ...params.pocket, helixRadius: 1.5, rampAngleDeg: 2 } })).toBe(true)
    expect(isPocketToolpathWithinLimits(params)).toBe(false)
  })

  it('accepts the defaults of every operation and Pocket method', () => {
    for (const operation of ['holes', 'outline', 'surface', 'pocket'] as const) {
      expect(isPassCountWithinLimit({ ...DEFAULT_WIZARD_PARAMS, operation })).toBe(true)
    }
    for (const method of ['spiral', 'adaptive'] as const) {
      const pocket = { ...DEFAULT_WIZARD_PARAMS.pocket, method }
      expect(isPocketToolpathWithinLimits({ ...DEFAULT_WIZARD_PARAMS, operation: 'pocket', pocket })).toBe(true)
    }
  })
})

describe('descent-angle warning (BL-50)', () => {
  it('computes the Hole(s) helix angle from the effective pitch (review repro: hole 3.5, tool 3.175, stepdown 1)', () => {
    const params = {
      ...DEFAULT_WIZARD_PARAMS,
      method: 'helix' as const,
      geometry: { ...DEFAULT_WIZARD_PARAMS.geometry, holeDiameter: 3.5, toolDiameter: 3.175, rampAngleDeg: 30 },
    }
    // Stepdown alone would give ~44°; the 30° Ramp Angle caps it (BL-80).
    expect(descentAngleDeg(params)).toBeCloseTo(30, 5)
    expect(descentWarnings(params).some((w) => w.includes('30°'))).toBe(true)
    // The default 2° keeps it gentle.
    const gentle = { ...params, geometry: { ...params.geometry, rampAngleDeg: 2 } }
    expect(descentAngleDeg(gentle)).toBeCloseTo(2, 5)
  })

  it('stays quiet for the defaults, including a switched-on Helix entry', () => {
    expect(descentWarnings(DEFAULT_WIZARD_PARAMS)).toEqual([])
    const surfaceHelix = {
      ...DEFAULT_WIZARD_PARAMS,
      operation: 'surface' as const,
      surface: { ...DEFAULT_WIZARD_PARAMS.surface, zTransitionMode: 'helix' as const },
    }
    expect(descentWarnings(surfaceHelix)).toEqual([])
  })

  it('is null for methods without a helix/ramp', () => {
    expect(descentAngleDeg({ ...DEFAULT_WIZARD_PARAMS, method: 'standard' })).toBeNull()
    expect(descentAngleDeg({ ...DEFAULT_WIZARD_PARAMS, operation: 'pocket' })).toBeNull()
  })

  it('spreads an Outline Rectangle ramp over the whole tool-path perimeter', () => {
    const params = {
      ...DEFAULT_WIZARD_PARAMS,
      operation: 'outline' as const,
      outline: { ...DEFAULT_WIZARD_PARAMS.outline, method: 'ramp' as const, width: 6, height: 4, toolDiameter: 3, offsetMode: 'inside' as const, rampAngleDeg: 30 },
      feeds: { ...DEFAULT_WIZARD_PARAMS.feeds, stepdown: 3 },
    }
    // Inside: tool-path 3 x 1, perimeter 8 -> atan(3/8) ≈ 20.6° (under 30°).
    expect(descentAngleDeg(params)).toBeCloseTo((Math.atan(3 / 8) * 180) / Math.PI, 5)
  })
})

describe('Ramp Angle for Hole(s)/Outline (BL-80)', () => {
  const holes = (geometry: Partial<WizardParams['geometry']>, stepdown: number) => ({
    ...DEFAULT_WIZARD_PARAMS,
    method: 'helix' as const,
    geometry: { ...DEFAULT_WIZARD_PARAMS.geometry, ...geometry },
    feeds: { ...DEFAULT_WIZARD_PARAMS.feeds, stepdown },
  })

  it('warns when a small helix radius needs many turns per Stepdown (Delrin repro: hole 8, tool 6, stepdown 4.5)', () => {
    const params = holes({ holeDiameter: 8, toolDiameter: 6, totalDepth: 10 }, 4.5)
    // Pitch 2π·1·tan 2° ≈ 0.22 mm -> ~20 turns per Stepdown.
    expect(rampTurnsPerStepdown(params)).toBeCloseTo(4.5 / (2 * Math.PI * Math.tan((2 * Math.PI) / 180)), 5)
    expect(descentWarnings(params).some((w) => w.includes('Standard method'))).toBe(true)
    expect(isWizardParamsValid(params)).toBe(true)
  })

  it('stays quiet about turns for the defaults and for Standard', () => {
    expect(descentWarnings(holes({}, 1))).toEqual([])
    expect(rampTurnsPerStepdown({ ...holes({ holeDiameter: 8, toolDiameter: 6 }, 4.5), method: 'standard' })).toBeNull()
  })

  it('rejects a Ramp Angle outside 0.5–30° only for Helix', () => {
    expect(isRampAngleValid(holes({ rampAngleDeg: 0.4 }, 1))).toBe(false)
    expect(isRampAngleValid(holes({ rampAngleDeg: 31 }, 1))).toBe(false)
    expect(isRampAngleValid(holes({ rampAngleDeg: 30 }, 1))).toBe(true)
    expect(isRampAngleValid({ ...holes({ rampAngleDeg: 0 }, 1), method: 'standard' })).toBe(true)
  })

  it('blocks a helix that would need more than MAX_PASSES turns', () => {
    const params = holes({ holeDiameter: 3.2, toolDiameter: 3.175, totalDepth: 15, rampAngleDeg: 0.5 }, 1)
    expect(isRampTurnCountWithinLimit(params)).toBe(false)
    expect(isWizardParamsValid(params)).toBe(false)
  })

  it('reports the rectangle ramp per lap', () => {
    const params = {
      ...DEFAULT_WIZARD_PARAMS,
      operation: 'outline' as const,
      outline: { ...DEFAULT_WIZARD_PARAMS.outline, method: 'ramp' as const, width: 50, height: 30, toolDiameter: 3.175 },
    }
    const descent = rampDescent(params)
    expect(descent?.unit).toBe('lap')
    expect(descent?.pathLength).toBeCloseTo(2 * (50 - 3.175 + 30 - 3.175), 9)
    expect(rampDescent({ ...params, outline: { ...params.outline, method: 'standard' } })).toBeNull()
  })
})

describe('Start Z floor (found by the BL-62 invariant test)', () => {
  const holes = (startZ: number, tabs: boolean) => ({
    ...DEFAULT_WIZARD_PARAMS,
    method: 'helix' as const,
    geometry: { ...DEFAULT_WIZARD_PARAMS.geometry, totalDepth: 0.6, tabsEnabled: tabs, tabHeight: 0.3 },
    feeds: { ...DEFAULT_WIZARD_PARAMS.feeds, startZ },
  })

  it('is the cut floor without tabs, the tab band top with them', () => {
    expect(minStartZ(holes(0, false))).toBeCloseTo(-0.6)
    expect(minStartZ(holes(0, true))).toBeCloseTo(-0.3)
  })

  it('allows a negative Start Z above it, blocks one at or below it', () => {
    expect(isStartZAboveCut(holes(-0.2, true))).toBe(true)
    expect(isStartZAboveCut(holes(-0.4, true))).toBe(false) // inside the tab band: used to overshoot the floor
    expect(isStartZAboveCut(holes(-0.4, false))).toBe(true)
    expect(isStartZAboveCut(holes(-0.6, false))).toBe(false)
  })

  it('applies to operations without tabs too', () => {
    const surface = {
      ...DEFAULT_WIZARD_PARAMS,
      operation: 'surface' as const,
      surface: { ...DEFAULT_WIZARD_PARAMS.surface, totalDepth: 0.2 },
      feeds: { ...DEFAULT_WIZARD_PARAMS.feeds, startZ: -0.3 },
    }
    expect(isStartZAboveCut(surface)).toBe(false)
  })
})

describe('Pocket Spiral Ramp Length (BL-41)', () => {
  const pocket = (patch: Partial<WizardParams['pocket']>) => ({ ...DEFAULT_WIZARD_PARAMS.pocket, ...patch })

  it('accepts 1–10 for Spiral and blocks Generate outside it', () => {
    expect(isPocketRampLengthValid(pocket({ rampLengthFactor: 1 }))).toBe(true)
    expect(isPocketRampLengthValid(pocket({ rampLengthFactor: 10 }))).toBe(true)
    expect(isPocketRampLengthValid(pocket({ rampLengthFactor: 0.5 }))).toBe(false)
    expect(isPocketRampLengthValid(pocket({ rampLengthFactor: 11 }))).toBe(false)
    expect(isWizardParamsValid({ ...DEFAULT_WIZARD_PARAMS, operation: 'pocket', pocket: pocket({ rampLengthFactor: 11 }) })).toBe(false)
  })

  it('ignores it for Adaptive', () => {
    expect(isPocketRampLengthValid(pocket({ method: 'adaptive', rampLengthFactor: 0 }))).toBe(true)
  })
})

describe('Lightened Pocket (OP-6)', () => {
  const rect = (patch: Partial<WizardParams['pocket']>) => ({
    ...DEFAULT_WIZARD_PARAMS.pocket,
    shape: 'rectLightened' as const,
    width: 120,
    height: 40,
    ...patch,
  })
  const asParams = (pocket: WizardParams['pocket']) => ({ ...DEFAULT_WIZARD_PARAMS, operation: 'pocket' as const, pocket })

  it('the defaults are valid for both shapes', () => {
    expect(isWizardParamsValid(asParams(rect({})))).toBe(true)
    expect(isWizardParamsValid(asParams({ ...DEFAULT_WIZARD_PARAMS.pocket, shape: 'circleLightened', diameter: 80 }))).toBe(true)
  })

  it('checks the pattern ranges', () => {
    expect(isPocketLightParamsValid(rect({ lightCountX: 0 }))).toBe(false)
    expect(isPocketLightParamsValid(rect({ lightCountX: 2.5 }))).toBe(false)
    expect(isPocketLightParamsValid(rect({ lightCountY: 21 }))).toBe(false)
    expect(isPocketLightParamsValid(rect({ ribWidth: 0 }))).toBe(false)
    const circle = { ...DEFAULT_WIZARD_PARAMS.pocket, shape: 'circleLightened' as const, diameter: 80 }
    expect(isPocketLightParamsValid({ ...circle, spokeCount: 2 })).toBe(false)
    expect(isPocketLightParamsValid({ ...circle, hubDiameter: 80 })).toBe(false)
  })

  it('blocks Generate when a cell is too small for the tool (plus Stock to Leave)', () => {
    expect(isPocketLightCellsValid(rect({ lightCountX: 20, lightCountY: 5 }))).toBe(false)
    expect(isPocketLightCellsValid(rect({ toolDiameter: 25 }))).toBe(false)
    expect(isWizardParamsValid(asParams(rect({ toolDiameter: 25 })))).toBe(false)
  })

  it('allows Adaptive for both Lightened shapes (BL-83, BL-85)', () => {
    expect(isWizardParamsValid(asParams(rect({ method: 'adaptive', helixRadius: 1 })))).toBe(true)
    const circle = { ...DEFAULT_WIZARD_PARAMS.pocket, shape: 'circleLightened' as const, diameter: 80, method: 'adaptive' as const, helixRadius: 1 }
    expect(isWizardParamsValid(asParams(circle))).toBe(true)
  })

  it('bounds the helix by the smallest cell and caps its turns over all cells', () => {
    const pocket = rect({ zTransitionMode: 'helix' })
    expect(pocketMaxHelixRadius(pocket)).toBeLessThanOrEqual(pocket.toolDiameter / 2)
    const tiny = { ...pocket, helixRadius: 0.01, rampAngleDeg: 0.5 }
    expect(isPocketToolpathWithinLimits(asParams(tiny))).toBe(false)
  })
})

describe('Facing validators (OP-7)', () => {
  const facing = (patch: Partial<WizardParams['facing']> = {}): WizardParams => ({
    ...DEFAULT_WIZARD_PARAMS,
    operation: 'facing',
    facing: { ...DEFAULT_WIZARD_PARAMS.facing, toolDiameter: 6, ...patch },
  })

  it('accepts the defaults', () => {
    expect(isWizardParamsValid(facing())).toBe(true)
  })

  it('needs a stepover above 0 and no wider than the tool', () => {
    expect(isFacingStepoverValid(facing({ stepover: 0 }).facing)).toBe(false)
    expect(isFacingStepoverValid(facing({ stepover: 6 }).facing)).toBe(true)
    expect(isFacingStepoverValid(facing({ stepover: 6.1 }).facing)).toBe(false)
    // More than there is to remove is fine — one pass, trimmed.
    expect(isWizardParamsValid(facing({ removal: 0.2, stepover: 0.5 }))).toBe(true)
  })

  it('rejects zero sizes, a negative Lead, no Clearance and no Linking Feed', () => {
    expect(isWizardParamsValid(facing({ length: 0 }))).toBe(false)
    expect(isWizardParamsValid(facing({ removal: 0 }))).toBe(false)
    expect(isWizardParamsValid(facing({ lead: -1 }))).toBe(false)
    expect(isWizardParamsValid(facing({ lead: 0 }))).toBe(true)
    expect(isWizardParamsValid(facing({ clearance: 0 }))).toBe(false)
    expect(isWizardParamsValid(facing({ linkingFeed: 0 }))).toBe(false)
  })

  it('caps sideways passes × Z levels', () => {
    const many = facing({ removal: 50, stepover: 0.05, totalDepth: 20 })
    expect(isFacingPassCountWithinLimit({ ...many, feeds: { ...many.feeds, stepdown: 1 } })).toBe(false)
    expect(isFacingPassCountWithinLimit({ ...many, feeds: { ...many.feeds, stepdown: 20 } })).toBe(true)
  })

  it('reports the radial engagement and the tool travel footprint', () => {
    expect(OPERATION_RULES.facing.engagement(facing({ stepover: 1.5, removal: 3 }))).toEqual({ kind: 'stepover', percent: 25 })
    expect(OPERATION_RULES.facing.engagement(facing({ stepover: 1.5, removal: 0.6 }))).toEqual({ kind: 'stepover', percent: 10 })
    // Length 50 + 2 × (radius 3 + Lead 1); return line to last pass: 2 + 1.
    expect(facingFootprint(facing({ lead: 1, clearance: 2, removal: 1 }).facing)).toEqual({ x: 58, y: 3 })
  })
})

describe('OPERATION_RULES.rampPathLength (BL-81)', () => {
  const p = DEFAULT_WIZARD_PARAMS
  const length = (params: WizardParams) => OPERATION_RULES[params.operation].rampPathLength(params)

  it('Hole(s): the helix circle, none for Standard', () => {
    // ⌀8 hole, ⌀3.175 tool → radius 2.4125.
    expect(length({ ...p, operation: 'holes', method: 'helix' })).toBeCloseTo(2 * Math.PI * 2.4125)
    expect(length({ ...p, operation: 'holes', method: 'standard' })).toBeNull()
  })

  it('Outline: Circle Helix and Rectangle Ramp only', () => {
    const outline = (patch: Partial<WizardParams['outline']>): WizardParams => ({ ...p, operation: 'outline', outline: { ...p.outline, ...patch } })
    expect(length(outline({ shape: 'circle', method: 'helix' }))).toBeGreaterThan(0)
    expect(length(outline({ shape: 'rectCornered', method: 'ramp' }))).toBeGreaterThan(0)
    expect(length(outline({ shape: 'rectCornered', method: 'standard' }))).toBeNull()
    expect(length(outline({ shape: 'circle', method: 'standard' }))).toBeNull()
  })

  it('Surface and Pocket: the entry helix, none for Plunge; Adaptive always', () => {
    const surface = (zTransitionMode: 'plunge' | 'helix'): WizardParams => ({ ...p, operation: 'surface', surface: { ...p.surface, zTransitionMode, helixRadius: 1 } })
    expect(length(surface('helix'))).toBeCloseTo(2 * Math.PI)
    expect(length(surface('plunge'))).toBeNull()
    const pocket = (patch: Partial<WizardParams['pocket']>): WizardParams => ({ ...p, operation: 'pocket', pocket: { ...p.pocket, helixRadius: 1.5, ...patch } })
    expect(length(pocket({ zTransitionMode: 'helix' }))).toBeCloseTo(3 * Math.PI)
    expect(length(pocket({ zTransitionMode: 'plunge' }))).toBeNull()
    expect(length(pocket({ zTransitionMode: 'plunge', method: 'adaptive' }))).toBeCloseTo(3 * Math.PI)
  })

  it('Facing has no ramp', () => {
    expect(length({ ...p, operation: 'facing' })).toBeNull()
  })
})

describe('Lobed Circle validators (OP-8)', () => {
  const lobed = (patch: Partial<WizardParams['outline']> = {}): WizardParams => ({
    ...DEFAULT_WIZARD_PARAMS,
    operation: 'outline',
    outline: { ...DEFAULT_WIZARD_PARAMS.outline, shape: 'lobedCircle', offsetMode: 'outside', method: 'standard', toolDiameter: 6, ...patch },
  })

  it('accepts the default cap in every offset mode and with either method', () => {
    for (const offsetMode of ['inside', 'outside', 'onLine'] as const) {
      for (const method of ['ramp', 'standard'] as const) expect(isWizardParamsValid(lobed({ offsetMode, method }))).toBe(true)
    }
  })

  it('needs a whole lobe count from 1 to 100', () => {
    expect(isWizardParamsValid(lobed({ lobeCount: 1 }))).toBe(true)
    expect(isWizardParamsValid(lobed({ lobeCount: 0 }))).toBe(false)
    expect(isWizardParamsValid(lobed({ lobeCount: 2.5 }))).toBe(false)
    expect(isWizardParamsValid(lobed({ lobeCount: 101 }))).toBe(false)
  })

  it('blocks lobes that are apart from the main circle or hidden inside it, but not overlapping lobes', () => {
    expect(isOutlineLobesAttached(lobed({ lobePitchDiameter: 80 }).outline)).toBe(false)
    expect(isWizardParamsValid(lobed({ lobePitchDiameter: 80 }))).toBe(false)
    expect(isWizardParamsValid(lobed({ lobePitchDiameter: 20, lobeDiameter: 10 }))).toBe(false)
    expect(isWizardParamsValid(lobed({ lobeCount: 12, lobeDiameter: 30 }))).toBe(true)
  })

  it('Inside: the tool has to fit the lobes and their necks; Outside never blocks on the tool', () => {
    expect(isOutlineToolDiameterValid(lobed({ offsetMode: 'inside', toolDiameter: 16 }).outline)).toBe(false)
    expect(isOutlineToolDiameterValid(lobed({ offsetMode: 'inside', lobePitchDiameter: 75 }).outline)).toBe(false)
    expect(isOutlineToolDiameterValid(lobed({ offsetMode: 'outside', toolDiameter: 16 }).outline)).toBe(true)
  })

  it('notes an Outside gap narrower than the tool without blocking', () => {
    const tight = lobed({ lobeCount: 12, lobeDiameter: 17 })
    expect(isOutlineLobeGapTooNarrow(tight.outline)).toBe(true)
    expect(isWizardParamsValid(tight)).toBe(true)
    expect(isOutlineLobeGapTooNarrow(lobed().outline)).toBe(false)
    expect(isOutlineLobeGapTooNarrow({ ...tight.outline, offsetMode: 'inside' })).toBe(false)
  })

  it('limits tabs by the tool path length and reports the footprint and the ramp lap', () => {
    const tabs = { tabsEnabled: true, tabHeight: 1, tabWidth: 4, tabCount: 5 }
    expect(isOutlineTabWidthValid(lobed(tabs).outline)).toBe(true)
    expect(isOutlineTabWidthValid(lobed({ ...tabs, tabWidth: 80 }).outline)).toBe(false)
    // Outside, ⌀6 tool, five lobes from 90°: the top lobe's tip is at 35 + 8 + 3.
    const footprint = outlineFootprint(lobed().outline)
    expect(footprint.y).toBeGreaterThan(46 + 30)
    expect(footprint.y).toBeLessThan(2 * 46)
    expect(OPERATION_RULES.outline.rampPathLength(lobed({ method: 'ramp' }))).toBeGreaterThan(Math.PI * 66)
    expect(OPERATION_RULES.outline.rampPathLength(lobed({ method: 'standard' }))).toBeNull()
  })
})

describe('Lobed Circle — Subtract validators (BL-106)', () => {
  const notched = (patch: Partial<WizardParams['outline']> = {}): WizardParams => ({
    ...DEFAULT_WIZARD_PARAMS,
    operation: 'outline',
    outline: {
      ...DEFAULT_WIZARD_PARAMS.outline,
      shape: 'lobedCircle',
      lobeMode: 'subtract',
      lobePitchDiameter: 60,
      offsetMode: 'outside',
      method: 'standard',
      toolDiameter: 6,
      ...patch,
    },
  })

  it('accepts notches on the rim in every offset mode', () => {
    for (const offsetMode of ['inside', 'outside', 'onLine'] as const) expect(isWizardParamsValid(notched({ offsetMode }))).toBe(true)
  })

  it('blocks notches that touch or overlap — the same values are fine in Add', () => {
    const dense = { lobeCount: 12 }
    expect(isOutlineNotchesSeparate(notched(dense).outline)).toBe(false)
    expect(isWizardParamsValid(notched(dense))).toBe(false)
    expect(isWizardParamsValid(notched({ ...dense, lobeMode: 'add' }))).toBe(true)
  })

  it('blocks a tool that does not fit: Outside into a notch, Inside between two', () => {
    expect(isOutlineToolDiameterValid(notched({ toolDiameter: 16 }).outline)).toBe(false)
    expect(isWizardParamsValid(notched({ toolDiameter: 16 }))).toBe(false)
    expect(isOutlineToolDiameterValid(notched({ offsetMode: 'inside', lobeCount: 9 }).outline)).toBe(false)
    expect(isOutlineToolDiameterValid(notched({ offsetMode: 'onLine', toolDiameter: 16 }).outline)).toBe(true)
  })

  it('never shows the Add-only gap note, and its footprint is the main circle plus the tool', () => {
    expect(isOutlineLobeGapTooNarrow(notched({ lobeCount: 9 }).outline)).toBe(false)
    const footprint = outlineFootprint(notched().outline)
    expect(footprint.x).toBeCloseTo(66, 6)
    expect(footprint.y).toBeLessThanOrEqual(66 + 1e-9)
  })
})
