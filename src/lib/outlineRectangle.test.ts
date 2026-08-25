import { describe, expect, it } from 'vitest'
import { generateRectOutlineRamp, generateRectOutlineStandard } from './outlineRectangle'
import { DEFAULT_MACHINE_SETTINGS } from '../types/machine'
import { DEFAULT_WIZARD_PARAMS, type WizardParams } from '../types/wizard'

function buildParams(
  shape: 'rectCornered' | 'rectCentered',
  overrides: {
    outline?: Partial<WizardParams['outline']>
    feeds?: Partial<WizardParams['feeds']>
    output?: Partial<WizardParams['output']>
  } = {},
): WizardParams {
  return {
    ...DEFAULT_WIZARD_PARAMS,
    operation: 'outline',
    outline: { ...DEFAULT_WIZARD_PARAMS.outline, shape, ...overrides.outline },
    feeds: { ...DEFAULT_WIZARD_PARAMS.feeds, ...overrides.feeds },
    output: { ...DEFAULT_WIZARD_PARAMS.output, ...overrides.output },
  }
}

describe('generateRectOutlineStandard — offset modes and corners', () => {
  it('inside insets each side by toolDiameter, ccw winding, starts at bottom-left corner', () => {
    const params = buildParams('rectCornered', {
      outline: { offsetMode: 'inside', width: 40, height: 20, toolDiameter: 4, totalDepth: 1 },
      feeds: { stepdown: 1 },
    })
    const lines = generateRectOutlineStandard(params, DEFAULT_MACHINE_SETTINGS)
    // toolWidth=36, toolHeight=16 -> corners (0,0),(36,0),(36,16),(0,16), ccw order.
    expect(lines).toContain('G0 X0 Y0')
    const flatPass = lines.filter((l) => l.startsWith('G1 X'))
    expect(flatPass).toEqual([
      'G1 X36 Y0 Z-1 F800',
      'G1 X36 Y16 Z-1 F800',
      'G1 X0 Y16 Z-1 F800',
      'G1 X0 Y0 Z-1 F800',
    ])
  })

  it('outside offsets each side out by toolDiameter, cw winding (corner order reversed after the start)', () => {
    const params = buildParams('rectCornered', {
      outline: { offsetMode: 'outside', width: 40, height: 20, toolDiameter: 4, totalDepth: 1 },
      feeds: { stepdown: 1 },
    })
    const lines = generateRectOutlineStandard(params, DEFAULT_MACHINE_SETTINGS)
    // toolWidth=44, toolHeight=24 -> ccw corners would be (0,0),(44,0),(44,24),(0,24);
    // cw walks (0,0),(0,24),(44,24),(44,0).
    const flatPass = lines.filter((l) => l.startsWith('G1 X'))
    expect(flatPass).toEqual([
      'G1 X0 Y24 Z-1 F800',
      'G1 X44 Y24 Z-1 F800',
      'G1 X44 Y0 Z-1 F800',
      'G1 X0 Y0 Z-1 F800',
    ])
  })

  it('onLine leaves nominal dimensions untouched', () => {
    const params = buildParams('rectCornered', {
      outline: { offsetMode: 'onLine', width: 40, height: 20, toolDiameter: 4, totalDepth: 1 },
      feeds: { stepdown: 1 },
    })
    const lines = generateRectOutlineStandard(params, DEFAULT_MACHINE_SETTINGS)
    expect(lines).toContain('G1 X40 Y0 Z-1 F800')
  })

  it('rectCentered straddles the offset origin', () => {
    const params = buildParams('rectCentered', {
      outline: { offsetMode: 'onLine', width: 40, height: 20, offsetX: 0, offsetY: 0 },
      feeds: { stepdown: 1 },
    })
    const lines = generateRectOutlineStandard(params, DEFAULT_MACHINE_SETTINGS)
    expect(lines).toContain('G0 X-20 Y-10')
  })
})

describe('generateRectOutlineStandard — depth passes', () => {
  it('one straight plunge + one flat 4-edge pass per stepdown level', () => {
    const params = buildParams('rectCornered', {
      outline: { width: 40, height: 20, totalDepth: 3 },
      feeds: { stepdown: 1 },
    })
    const lines = generateRectOutlineStandard(params, DEFAULT_MACHINE_SETTINGS)
    const plunges = lines.filter((l) => /^G1 Z-?[\d.]+ F/.test(l))
    expect(plunges).toEqual(['G1 Z-1 F300', 'G1 Z-2 F300', 'G1 Z-3 F300'])
    expect(lines.filter((l) => l.startsWith('G1 X'))).toHaveLength(12) // 3 passes * 4 edges
  })
})

describe('generateRectOutlineStandard / Ramp — single-shape cut, not a repeated pattern', () => {
  it('every XY rapid lands on the same single shape location, regardless of geometry.positioning', () => {
    const params = buildParams('rectCornered', {
      outline: { offsetX: 5, offsetY: -3 },
      output: { returnOriginEnd: false }, // otherwise buildFooter's own 'G0 X0 Y0' also matches the filter below
    })
    const lines = generateRectOutlineStandard(params, DEFAULT_MACHINE_SETTINGS)
    // rectCornered's reference point IS corners[0], so assembleProgram's own
    // pattern-point rapid and the toolpath's start rapid coincide exactly —
    // unlike Circle Outline, where the pattern point (center) and the
    // toolpath's own start (on the circle) are two different locations.
    // Either way, no OTHER XY rapid should ever appear for a single shape.
    const xyRapids = lines.filter((l) => l.startsWith('G0 X'))
    expect(xyRapids.length).toBeGreaterThan(0)
    expect(xyRapids.every((l) => l === 'G0 X5 Y-3')).toBe(true)
  })
})

describe('generateRectOutlineRamp — untabbed', () => {
  it('ramps along the longer edge, flat on the other 3, one stepdown per lap, plus a flat cleanup lap', () => {
    const params = buildParams('rectCornered', {
      outline: { offsetMode: 'inside', width: 40, height: 20, toolDiameter: 0, totalDepth: 3 },
      feeds: { stepdown: 1 },
    })
    const lines = generateRectOutlineRamp(params, DEFAULT_MACHINE_SETTINGS)
    // 3 stepdown laps + 1 flat cleanup lap = 4 laps * 4 edges = 16 G1 X lines.
    const cutLines = lines.filter((l) => l.startsWith('G1 X'))
    expect(cutLines).toHaveLength(16)
    // The ramp edge (width = 40, the longer dimension) is the first line of
    // every lap, and it alone carries the Z drop: lap 1 goes from the
    // (implicit) start Z=0 down to -1 while moving along the width edge.
    expect(cutLines[0]).toBe('G1 X40 Y0 Z-1 F800')
    // Final (cleanup) lap: ramp edge re-cut flat at the final depth.
    expect(cutLines[12]).toBe('G1 X40 Y0 Z-3 F800')
    // No separate straight plunge before the very first lap — the ramp
    // edge's own G1 line is the initial descent (no bare `G1 Z..` line
    // appears before the first cut line).
    expect(lines.filter((l) => /^G1 Z-?[\d.]+ F/.test(l))).toHaveLength(0)
  })

  it('picks the height edge as the ramp edge when height is the longer dimension', () => {
    const params = buildParams('rectCornered', {
      outline: { offsetMode: 'inside', width: 20, height: 40, toolDiameter: 0, totalDepth: 1 },
      feeds: { stepdown: 1 },
    })
    const lines = generateRectOutlineRamp(params, DEFAULT_MACHINE_SETTINGS)
    // Height (40) is now longer. rectCorners' ccw order is
    // (0,0),(20,0),(20,40),(0,40) — the height edge is corners[1]->corners[2]
    // (index 1), so longerEdgeIndex rotates the walk to start there: G0
    // rapids to corners[1]=(20,0), then the first cut ramps along the
    // height edge to corners[2]=(20,40).
    expect(lines).toContain('G0 X20 Y0')
    const firstCut = lines.find((l) => l.startsWith('G1 X'))
    expect(firstCut).toBe('G1 X20 Y40 Z-1 F800')
  })
})

describe('generateRectOutlineRamp — tabs', () => {
  it('forces the tab-band passes to reach exactly -totalDepth, with lift/plunge lines present', () => {
    const params = buildParams('rectCornered', {
      outline: {
        offsetMode: 'inside',
        width: 40,
        height: 20,
        toolDiameter: 0,
        totalDepth: 4,
        tabsEnabled: true,
        tabHeight: 1,
        tabCount: 2,
        tabWidth: 2,
      },
      feeds: { stepdown: 1 },
    })
    const lines = generateRectOutlineRamp(params, DEFAULT_MACHINE_SETTINGS)
    // Tab band starts at -(4-1) = -3, reused as the lift height.
    expect(lines.some((l) => l.includes('Z-3 '))).toBe(true)
    // The tab-band loop still reaches exactly -totalDepth on its last pass.
    expect(lines.some((l) => l.startsWith('G1 X') && l.includes('Z-4 '))).toBe(true)
    // Exactly one bare plunge line reaches the true bottom — a stray
    // untabbed finishing lap would add a second one (same regression
    // guard as helix.test.ts's equivalent check).
    expect(lines.filter((l) => l === 'G1 Z-4 F300')).toHaveLength(1)
  })

  it('standard method: tabs force lift/plunge only within the tab band', () => {
    const params = buildParams('rectCornered', {
      outline: {
        offsetMode: 'inside',
        width: 40,
        height: 20,
        toolDiameter: 0,
        totalDepth: 3,
        tabsEnabled: true,
        tabHeight: 1,
        tabCount: 1,
        tabWidth: 2,
      },
      feeds: { stepdown: 1 },
    })
    const lines = generateRectOutlineStandard(params, DEFAULT_MACHINE_SETTINGS)
    expect(lines.some((l) => l.includes('Z-2 ') && l.includes('F800'))).toBe(true) // lift height reused as a cut Z above the band
    const liftLines = lines.filter((l) => l.includes('Z-2 F800'))
    expect(liftLines.length).toBeGreaterThan(0)
  })
})
