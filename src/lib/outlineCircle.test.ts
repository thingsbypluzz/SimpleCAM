import { describe, expect, it } from 'vitest'
import { generateCircleOutlineHelix, generateCircleOutlineStandard, onLineCircleEdges } from './outlineCircle'
import { DEFAULT_MACHINE_SETTINGS } from '../types/machine'
import { DEFAULT_WIZARD_PARAMS, type WizardParams } from '../types/wizard'

function buildParams(overrides: {
  outline?: Partial<WizardParams['outline']>
  feeds?: Partial<WizardParams['feeds']>
  output?: Partial<WizardParams['output']>
} = {}): WizardParams {
  return {
    ...DEFAULT_WIZARD_PARAMS,
    operation: 'outline',
    outline: { ...DEFAULT_WIZARD_PARAMS.outline, shape: 'circle', ...overrides.outline },
    feeds: { ...DEFAULT_WIZARD_PARAMS.feeds, ...overrides.feeds },
    output: { ...DEFAULT_WIZARD_PARAMS.output, ...overrides.output },
  }
}

describe('generateCircleOutlineStandard — offset modes', () => {
  it('inside: radius = (diameter - toolDiameter)/2, direction ccw (G3) — climb under M3', () => {
    const params = buildParams({
      outline: { offsetMode: 'inside', diameter: 40, toolDiameter: 4, totalDepth: 1 },
      feeds: { stepdown: 1 },
      output: { interpolation: 'arc' },
    })
    const lines = generateCircleOutlineStandard(params, DEFAULT_MACHINE_SETTINGS)
    const arc = lines.find((l) => l.startsWith('G3 ') || l.startsWith('G2 '))
    expect(arc).toBe('G3 X18 Y0 Z-1 I-18 J0 F800')
  })

  it('outside: radius = (diameter + toolDiameter)/2, direction cw (G2) — climb under M3', () => {
    const params = buildParams({
      outline: { offsetMode: 'outside', diameter: 40, toolDiameter: 4, totalDepth: 1 },
      feeds: { stepdown: 1 },
      output: { interpolation: 'arc' },
    })
    const lines = generateCircleOutlineStandard(params, DEFAULT_MACHINE_SETTINGS)
    const arc = lines.find((l) => l.startsWith('G3 ') || l.startsWith('G2 '))
    expect(arc).toBe('G2 X22 Y0 Z-1 I-22 J0 F800')
  })

  it('onLine: radius = diameter/2, no tool correction, direction cw (G2)', () => {
    const params = buildParams({
      outline: { offsetMode: 'onLine', diameter: 40, toolDiameter: 4, totalDepth: 1 },
      feeds: { stepdown: 1 },
      output: { interpolation: 'arc' },
    })
    const lines = generateCircleOutlineStandard(params, DEFAULT_MACHINE_SETTINGS)
    const arc = lines.find((l) => l.startsWith('G3 ') || l.startsWith('G2 '))
    expect(arc).toBe('G2 X20 Y0 Z-1 I-20 J0 F800')
  })
})

describe('generateCircleOutlineStandard / Helix — single-shape cut, not a repeated pattern', () => {
  it('rapids to the actual cut start exactly once, regardless of geometry.positioning', () => {
    const params = buildParams({
      outline: { offsetX: 5, offsetY: -3 },
      output: { returnOriginEnd: false }, // otherwise buildFooter's own 'G0 X0 Y0' also matches the filter below
    })
    // geometry (Hole(s) pattern) is untouched at its default 'single', but even a
    // multi-point pattern here must be ignored entirely by Outline generation.
    // The rapid lands on the actual cut start (shape offset + tool radius),
    // not the raw shape center — assembleProgram no longer rapids to the
    // raw point first (see program.ts) — so this just confirms exactly one
    // XY rapid is emitted, not the literal offset coordinate.
    const lines = generateCircleOutlineStandard(params, DEFAULT_MACHINE_SETTINGS)
    const xyRapids = lines.filter((l) => l.startsWith('G0 X'))
    expect(xyRapids).toHaveLength(1)
  })

  it('helix variant produces one spiral turn per stepdown plus a flat finishing pass', () => {
    const params = buildParams({
      outline: { diameter: 20, offsetMode: 'inside', toolDiameter: 4, totalDepth: 4 },
      feeds: { stepdown: 1 },
      output: { interpolation: 'arc' },
    })
    const lines = generateCircleOutlineHelix(params, DEFAULT_MACHINE_SETTINGS)
    expect(lines.filter((l) => l.startsWith('G3'))).toHaveLength(5)
  })
})

describe('onLineCircleEdges — BL-28 3D preview boundaries', () => {
  it('splits the nominal diameter into an inner and outer radius, one toolRadius apart each side', () => {
    const { innerRadius, outerRadius } = onLineCircleEdges({
      ...DEFAULT_WIZARD_PARAMS.outline,
      diameter: 40,
      toolDiameter: 4,
    })
    expect(innerRadius).toBe(18)
    expect(outerRadius).toBe(22)
  })

  it('clamps the inner radius to 0 instead of going negative when the tool is wider than the shape', () => {
    const { innerRadius, outerRadius } = onLineCircleEdges({
      ...DEFAULT_WIZARD_PARAMS.outline,
      diameter: 4,
      toolDiameter: 10,
    })
    expect(innerRadius).toBe(0)
    expect(outerRadius).toBe(7)
  })
})

describe('generateCircleOutlineHelix / Standard — tabs', () => {
  it('forces G1 and lifts across tabs even when arc interpolation is selected', () => {
    const params = buildParams({
      outline: {
        diameter: 30,
        offsetMode: 'inside',
        toolDiameter: 4,
        totalDepth: 4,
        tabsEnabled: true,
        tabHeight: 1,
        tabCount: 3,
        tabWidth: 1,
      },
      feeds: { stepdown: 1 },
      output: { interpolation: 'arc' },
    })
    const lines = generateCircleOutlineStandard(params, DEFAULT_MACHINE_SETTINGS)
    expect(lines.some((l) => l.startsWith('G3 ') || l.startsWith('G2 '))).toBe(false)
    expect(lines.some((l) => l.startsWith('G1 X'))).toBe(true)
  })
})

describe('Tab Start (OP-8)', () => {
  const tabbed = (offsetMode: 'inside' | 'outside', tabStartAngle: number): WizardParams => ({
    ...DEFAULT_WIZARD_PARAMS,
    operation: 'outline',
    outline: {
      ...DEFAULT_WIZARD_PARAMS.outline,
      shape: 'circle',
      offsetMode,
      method: 'standard',
      diameter: 40,
      toolDiameter: 4,
      totalDepth: 2,
      tabsEnabled: true,
      tabHeight: 1,
      tabWidth: 3,
      tabCount: 4,
      tabStartAngle,
    },
    feeds: { ...DEFAULT_WIZARD_PARAMS.feeds, stepdown: 1, startZ: 0 },
  })
  const xy = (line: string) => ({ x: Number(/X(-?[\d.]+)/.exec(line)![1]), y: Number(/Y(-?[\d.]+)/.exec(line)![1]) })
  const z = (line: string) => Number(/Z(-?[\d.]+)/.exec(line)![1])
  // Angles of the points crossed at the tab band top (Z-1) while cutting the bottom pass.
  const tabAngles = (lines: string[]) => {
    const cuts = lines.filter((l) => /^G1 X/.test(l))
    const bottomStart = cuts.findIndex((l) => z(l) === -2)
    return cuts
      .slice(bottomStart)
      .filter((l, i, all) => z(l) === -1 && i > 0 && z(all[i - 1]) === -1)
      .map((l) => (Math.atan2(xy(l).y, xy(l).x) * 180) / Math.PI)
  }

  it('centers the first tab on Tab Start and starts the pass half a spacing before it', () => {
    // Inside travels counter-clockwise: 4 tabs from 90° → start at 45°, radius 18.
    const inside = generateCircleOutlineStandard(tabbed('inside', 90), DEFAULT_MACHINE_SETTINGS)
    const start = xy(inside.find((l) => /^G0 X/.test(l))!)
    expect(start.x).toBeCloseTo(18 * Math.cos(Math.PI / 4), 3)
    expect(start.y).toBeCloseTo(18 * Math.sin(Math.PI / 4), 3)
    const angles = tabAngles(inside)
    expect(angles.length).toBeGreaterThan(0)
    // Every lifted point lies within half a tab (3 mm on r = 18 → ±4.8°) of 90°, 180°, -90° or 0°.
    for (const a of angles) {
      const nearest = Math.round(a / 90) * 90
      expect(Math.abs(a - nearest)).toBeLessThan(4.9)
    }
    expect(angles.some((a) => Math.abs(a - 90) < 4.9)).toBe(true)

    // Outside travels clockwise: start half a spacing "before" the tab is at 135°, radius 22.
    const outside = generateCircleOutlineStandard(tabbed('outside', 90), DEFAULT_MACHINE_SETTINGS)
    const outStart = xy(outside.find((l) => /^G0 X/.test(l))!)
    expect(outStart.x).toBeCloseTo(22 * Math.cos((3 * Math.PI) / 4), 3)
    expect(outStart.y).toBeCloseTo(22 * Math.sin((3 * Math.PI) / 4), 3)
    expect(tabAngles(outside).some((a) => Math.abs(a - 90) < 4.2)).toBe(true)
  })

  it('moves the tabs with the angle', () => {
    const angles = tabAngles(generateCircleOutlineStandard(tabbed('inside', 30), DEFAULT_MACHINE_SETTINGS))
    for (const a of angles) {
      const offset = ((((a - 30) % 90) + 135) % 90) - 45
      expect(Math.abs(offset)).toBeLessThan(4.9)
    }
  })
})
