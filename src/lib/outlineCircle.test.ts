import { describe, expect, it } from 'vitest'
import { generateCircleOutlineHelix, generateCircleOutlineStandard } from './outlineCircle'
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
  it('inside: radius = (diameter - toolDiameter)/2, direction ccw (G3)', () => {
    const params = buildParams({
      outline: { offsetMode: 'inside', diameter: 40, toolDiameter: 4, totalDepth: 1 },
      feeds: { stepdown: 1 },
      output: { interpolation: 'arc' },
    })
    const lines = generateCircleOutlineStandard(params, DEFAULT_MACHINE_SETTINGS)
    const arc = lines.find((l) => l.startsWith('G3 ') || l.startsWith('G2 '))
    expect(arc).toBe('G3 X18 Y0 Z-1 I-18 J0 F800')
  })

  it('outside: radius = (diameter + toolDiameter)/2, direction cw (G2)', () => {
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
  it('rapids to the shape offset exactly once, regardless of geometry.positioning', () => {
    const params = buildParams({ outline: { offsetX: 5, offsetY: -3 } })
    // geometry (Hole(s) pattern) is untouched at its default 'single', but even a
    // multi-point pattern here must be ignored entirely by Outline generation.
    const lines = generateCircleOutlineStandard(params, DEFAULT_MACHINE_SETTINGS)
    const centerRapids = lines.filter((l) => l === 'G0 X5 Y-3')
    expect(centerRapids).toHaveLength(1)
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
