import { describe, expect, it } from 'vitest'
import { generateHelix } from './helix'
import { DEFAULT_WIZARD_PARAMS, type WizardParams } from '../types/wizard'

function buildParams(overrides: {
  geometry?: Partial<WizardParams['geometry']>
  feeds?: Partial<WizardParams['feeds']>
  output?: Partial<WizardParams['output']>
} = {}): WizardParams {
  return {
    ...DEFAULT_WIZARD_PARAMS,
    geometry: { ...DEFAULT_WIZARD_PARAMS.geometry, ...overrides.geometry },
    feeds: { ...DEFAULT_WIZARD_PARAMS.feeds, ...overrides.feeds },
    output: { ...DEFAULT_WIZARD_PARAMS.output, ...overrides.output },
  }
}

describe('generateHelix', () => {
  it('starts with the standard preamble', () => {
    const lines = generateHelix(buildParams())
    expect(lines[0]).toBe('G21 G90 G17')
  })

  it('includes spindle start + dwell when enabled', () => {
    const lines = generateHelix(
      buildParams({ output: { spindleStart: true, spindleSpeed: 12000, dwellSeconds: 3 } }),
    )
    expect(lines).toContain('M3 S12000')
    expect(lines).toContain('G4 P3')
  })

  it('omits spindle lines when spindleStart is disabled', () => {
    const lines = generateHelix(buildParams({ output: { spindleStart: false } }))
    expect(lines.some((l) => l.startsWith('M3'))).toBe(false)
    expect(lines.some((l) => l.startsWith('G4'))).toBe(false)
  })

  it('produces one full circle per stepdown turn plus a flat finishing pass', () => {
    // totalDepth 4, stepdown 1 -> 4 spiral turns + 1 flat pass = 5 turns
    const lines = generateHelix(
      buildParams({ geometry: { totalDepth: 4 }, feeds: { stepdown: 1 }, output: { interpolation: 'arc' } }),
    )
    const arcLines = lines.filter((l) => l.startsWith('G3'))
    expect(arcLines).toHaveLength(5)
  })

  it('reaches exactly the target depth on the last spiral turn', () => {
    const lines = generateHelix(
      buildParams({ geometry: { totalDepth: 4 }, feeds: { stepdown: 1 }, output: { interpolation: 'arc' } }),
    )
    const arcLines = lines.filter((l) => l.startsWith('G3'))
    // last spiral turn and the flat finishing pass both sit at -4
    expect(arcLines[3]).toContain('Z-4')
    expect(arcLines[4]).toContain('Z-4')
  })

  it('handles a non-integer stepdown remainder on the last turn', () => {
    // totalDepth 4.5, stepdown 1 -> 4 full turns (-1..-4) + 1 partial turn (-4.5) + flat pass
    const lines = generateHelix(
      buildParams({ geometry: { totalDepth: 4.5 }, feeds: { stepdown: 1 }, output: { interpolation: 'arc' } }),
    )
    const arcLines = lines.filter((l) => l.startsWith('G3'))
    expect(arcLines).toHaveLength(6)
    expect(arcLines[4]).toContain('Z-4.5')
    expect(arcLines[5]).toContain('Z-4.5')
  })

  it('uses linear (G1) segments instead of arcs when interpolation is "linear"', () => {
    const lines = generateHelix(
      buildParams({
        geometry: { totalDepth: 4 },
        feeds: { stepdown: 1 },
        output: { interpolation: 'linear' },
      }),
    )
    expect(lines.some((l) => l.startsWith('G3'))).toBe(false)
    // 5 turns * 72 segments
    const segmentLines = lines.filter((l) => l.startsWith('G1 X'))
    expect(segmentLines).toHaveLength(360)
  })

  it('repeats the toolpath once per grid corner', () => {
    const lines = generateHelix(
      buildParams({
        geometry: { positioning: 'grid', gridX: 50, gridY: 30, totalDepth: 1 },
        feeds: { stepdown: 1 },
        output: { interpolation: 'arc' },
      }),
    )
    expect(lines).toContain('G0 X0 Y0')
    expect(lines).toContain('G0 X50 Y0')
    expect(lines).toContain('G0 X50 Y30')
    expect(lines).toContain('G0 X0 Y30')
    // 1 spiral turn + 1 flat pass per hole, 4 holes
    expect(lines.filter((l) => l.startsWith('G3'))).toHaveLength(8)
  })

  it('feeds the whole way down to the surface at Plunge Rate when startZ is 0 (default)', () => {
    const lines = generateHelix(buildParams({ feeds: { startZ: 0, plungeRate: 300 } }))
    expect(lines).toContain('G1 Z0 F300')
    expect(lines).not.toContain('G0 Z0')
  })

  it('rapids down to startZ then feeds the final approach when startZ > 0', () => {
    const lines = generateHelix(buildParams({ feeds: { startZ: 0.5, plungeRate: 300 } }))
    const startZIndex = lines.indexOf('G0 Z0.5')
    const descendIndex = lines.indexOf('G1 Z0 F300')
    expect(startZIndex).toBeGreaterThan(-1)
    expect(descendIndex).toBeGreaterThan(startZIndex)
  })

  it('appends Safe Z retract + M5 and origin return only when enabled', () => {
    const withFooter = generateHelix(
      buildParams({ output: { returnSafeZEnd: true, returnOriginEnd: true } }),
    )
    expect(withFooter[withFooter.length - 2]).toBe('M5')
    expect(withFooter[withFooter.length - 1]).toBe('G0 X0 Y0')

    const withoutFooter = generateHelix(
      buildParams({ output: { returnSafeZEnd: false, returnOriginEnd: false } }),
    )
    expect(withoutFooter.some((l) => l === 'M5')).toBe(false)
    expect(withoutFooter[withoutFooter.length - 1]).not.toBe('G0 X0 Y0')
  })
})
