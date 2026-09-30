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
  it('inside insets each side by toolRadius from the nominal footprint, ccw winding, starts at the inset near corner', () => {
    const params = buildParams('rectCornered', {
      outline: { offsetMode: 'inside', width: 40, height: 20, toolDiameter: 4, totalDepth: 1 },
      feeds: { stepdown: 1 },
    })
    const lines = generateRectOutlineStandard(params, DEFAULT_MACHINE_SETTINGS)
    // toolWidth=36, toolHeight=16, nominal center (20,10) -> near corner
    // shifts in by toolRadius=2 to (2,2): corners (2,2),(38,2),(38,18),(2,18).
    expect(lines).toContain('G0 X2 Y2')
    const flatPass = lines.filter((l) => l.startsWith('G1 X'))
    expect(flatPass).toEqual([
      'G1 X38 Y2 Z-1 F800',
      'G1 X38 Y18 Z-1 F800',
      'G1 X2 Y18 Z-1 F800',
      'G1 X2 Y2 Z-1 F800',
    ])
  })

  it('outside offsets each side out by toolRadius from the nominal footprint, cw winding (corner order reversed after the start)', () => {
    const params = buildParams('rectCornered', {
      outline: { offsetMode: 'outside', width: 40, height: 20, toolDiameter: 4, totalDepth: 1 },
      feeds: { stepdown: 1 },
    })
    const lines = generateRectOutlineStandard(params, DEFAULT_MACHINE_SETTINGS)
    // toolWidth=44, toolHeight=24, nominal center (20,10) -> near corner
    // shifts out by toolRadius=2 to (-2,-2): ccw corners would be
    // (-2,-2),(42,-2),(42,22),(-2,22); cw walks (-2,-2),(-2,22),(42,22),(42,-2).
    const flatPass = lines.filter((l) => l.startsWith('G1 X'))
    expect(flatPass).toEqual([
      'G1 X-2 Y22 Z-1 F800',
      'G1 X42 Y22 Z-1 F800',
      'G1 X42 Y-2 Z-1 F800',
      'G1 X-2 Y-2 Z-1 F800',
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
      outline: { offsetX: 5, offsetY: -3, toolDiameter: 0 }, // toolDiameter 0 keeps corners[0] at the nominal corner, isolating this test's actual invariant from offset-mode math
      output: { returnOriginEnd: false }, // otherwise buildFooter's own 'G0 X0 Y0' also matches the filter below
    })
    const lines = generateRectOutlineStandard(params, DEFAULT_MACHINE_SETTINGS)
    // rectCornered's reference point IS corners[0], so the toolpath's own
    // single leading rapid (assembleProgram no longer emits one of its own
    // — see program.ts) already lands exactly on the outline's reference
    // point — unlike Circle Outline, where the toolpath's actual start (on
    // the circle) differs from the shape's center/offset reference. Either
    // way, no OTHER XY rapid should ever appear for a single shape.
    const xyRapids = lines.filter((l) => l.startsWith('G0 X'))
    expect(xyRapids.length).toBeGreaterThan(0)
    expect(xyRapids.every((l) => l === 'G0 X5 Y-3')).toBe(true)
  })
})

describe('generateRectOutlineRamp — untabbed', () => {
  // BL-80: each lap is a "rectangular helix" — the Z drop is spread over all
  // 4 edges in proportion to their length, so every edge has the same slope.
  it('descends one pitch per lap spread over all 4 edges, plus a flat cleanup lap', () => {
    const params = buildParams('rectCornered', {
      outline: { offsetMode: 'inside', width: 40, height: 20, toolDiameter: 0, totalDepth: 3, rampAngleDeg: 30 },
      feeds: { stepdown: 1 },
    })
    const lines = generateRectOutlineRamp(params, DEFAULT_MACHINE_SETTINGS)
    // 30° over a 120 mm perimeter allows ~69 mm per lap, so the pitch is
    // Stepdown: 3 laps + 1 flat cleanup lap = 4 laps * 4 edges.
    const cutLines = lines.filter((l) => l.startsWith('G1 X'))
    expect(cutLines).toHaveLength(16)
    // Lap 1 from Z0: 40/120, 60/120, 100/120 and 120/120 of the pitch.
    expect(cutLines.slice(0, 4)).toEqual([
      'G1 X40 Y0 Z-0.3333 F800',
      'G1 X40 Y20 Z-0.5 F800',
      'G1 X0 Y20 Z-0.8333 F800',
      'G1 X0 Y0 Z-1 F800',
    ])
    // Final (cleanup) lap: flat at the final depth all the way round.
    expect(cutLines.slice(12).every((l) => l.includes('Z-3 '))).toBe(true)
    // No separate straight plunge before the very first lap — the ramp is
    // the initial descent.
    expect(lines.filter((l) => /^G1 Z-?[\d.]+ F/.test(l))).toHaveLength(0)
  })

  it('caps the pitch at perimeter·tan(Ramp Angle), never steeper on any edge', () => {
    const params = buildParams('rectCornered', {
      outline: { offsetMode: 'inside', width: 40, height: 20, toolDiameter: 0, totalDepth: 3, rampAngleDeg: 0.5 },
      feeds: { stepdown: 3 },
    })
    const lines = generateRectOutlineRamp(params, DEFAULT_MACHINE_SETTINGS)
    const pitch = 120 * Math.tan((0.5 * Math.PI) / 180)
    const cutLines = lines.filter((l) => l.startsWith('G1 X'))
    expect(cutLines).toHaveLength((Math.ceil(3 / pitch) + 1) * 4)
    const tan = Math.tan((0.5 * Math.PI) / 180)
    let prev = { x: 0, y: 0, z: 0 }
    for (const line of cutLines) {
      const [x, y, z] = ['X', 'Y', 'Z'].map((axis) => Number(line.match(new RegExp(`${axis}(-?[\\d.]+)`))![1]))
      const xy = Math.hypot(x - prev.x, y - prev.y)
      expect((prev.z - z) / xy).toBeLessThanOrEqual(tan + 1e-3) // 4-decimal G-code rounding
      prev = { x, y, z }
    }
    expect(cutLines[cutLines.length - 1]).toContain('Z-3 ')
  })

  it('starts each lap at the corner that begins the longer edge', () => {
    const params = buildParams('rectCornered', {
      outline: { offsetMode: 'inside', width: 20, height: 40, toolDiameter: 0, totalDepth: 1, rampAngleDeg: 30 },
      feeds: { stepdown: 1 },
    })
    const lines = generateRectOutlineRamp(params, DEFAULT_MACHINE_SETTINGS)
    // Height (40) is now longer. rectCorners' ccw order is
    // (0,0),(20,0),(20,40),(0,40) — the height edge is corners[1]->corners[2]
    // (index 1), so longerEdgeIndex rotates the walk to start there: G0
    // rapids to corners[1]=(20,0), then the first cut runs up the height
    // edge to corners[2]=(20,40), 40/120 of the way down the first lap.
    expect(lines).toContain('G0 X20 Y0')
    const firstCut = lines.find((l) => l.startsWith('G1 X'))
    expect(firstCut).toBe('G1 X20 Y40 Z-0.3333 F800')
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

describe('generateRectOutlineStandard — fractional tab count (BL-45)', () => {
  it('never leaves the tool-center rectangle, even with an unvalidated 2.5 tabs per side', () => {
    // Review scenario: 50x30 Inside, tool 3.175 -> tool-center range
    // X 1.5875..48.4125, Y 1.5875..28.4125. Before the fix a fractional
    // count extrapolated the last tab past each corner at full depth.
    const params = buildParams('rectCornered', {
      outline: {
        offsetMode: 'inside',
        width: 50,
        height: 30,
        toolDiameter: 3.175,
        totalDepth: 4,
        tabsEnabled: true,
        tabCount: 2.5,
        tabWidth: 3,
        tabHeight: 1,
      },
    })
    const eps = 1e-6
    for (const line of generateRectOutlineStandard(params, DEFAULT_MACHINE_SETTINGS)) {
      if (!line.startsWith('G1')) continue
      const x = /X(-?[\d.]+)/.exec(line)
      const y = /Y(-?[\d.]+)/.exec(line)
      if (x) {
        expect(Number(x[1])).toBeGreaterThanOrEqual(1.5875 - eps)
        expect(Number(x[1])).toBeLessThanOrEqual(48.4125 + eps)
      }
      if (y) {
        expect(Number(y[1])).toBeGreaterThanOrEqual(1.5875 - eps)
        expect(Number(y[1])).toBeLessThanOrEqual(28.4125 + eps)
      }
    }
  })
})
