import { describe, expect, it } from 'vitest'
import { generateStandardHole } from './standardHole'
import { DEFAULT_MACHINE_SETTINGS } from '../types/machine'
import { DEFAULT_WIZARD_PARAMS, type WizardParams } from '../types/wizard'

// Machine settings don't vary across these tests — see program.test.ts for
// dialect-specific coverage (G4 P conversion, end-of-program code).
function generate(params: WizardParams): string[] {
  return generateStandardHole(params, DEFAULT_MACHINE_SETTINGS)
}

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

describe('generateStandardHole', () => {
  it('starts with the standard preamble', () => {
    const lines = generate(buildParams())
    expect(lines[0]).toBe('G21 G90 G17')
  })

  it('plunges once per pass, then sweeps one flat full circle per pass', () => {
    // totalDepth 3, stepdown 1 -> 3 passes
    const lines = generate(
      buildParams({ geometry: { totalDepth: 3 }, feeds: { stepdown: 1 }, output: { interpolation: 'arc' } }),
    )
    const plungeLines = lines.filter((l) => l.startsWith('G1 Z-'))
    const arcLines = lines.filter((l) => l.startsWith('G3'))
    expect(plungeLines).toHaveLength(3)
    expect(arcLines).toHaveLength(3)
  })

  it('reaches exactly the target depth on the last pass', () => {
    const lines = generate(
      buildParams({ geometry: { totalDepth: 3 }, feeds: { stepdown: 1 }, output: { interpolation: 'arc' } }),
    )
    const plungeLines = lines.filter((l) => l.startsWith('G1 Z-'))
    expect(plungeLines[plungeLines.length - 1]).toContain('Z-3')
    const arcLines = lines.filter((l) => l.startsWith('G3'))
    expect(arcLines[arcLines.length - 1]).toContain('Z-3')
  })

  it('handles a non-integer stepdown remainder on the last pass', () => {
    // totalDepth 3.5, stepdown 1 -> passes at -1, -2, -3, -3.5
    const lines = generate(buildParams({ geometry: { totalDepth: 3.5 }, feeds: { stepdown: 1 } }))
    const plungeLines = lines.filter((l) => l.startsWith('G1 Z-'))
    expect(plungeLines).toHaveLength(4)
    expect(plungeLines[3]).toContain('Z-3.5')
  })

  it('uses linear (G1) circle segments instead of arcs when interpolation is "linear"', () => {
    const lines = generate(
      buildParams({
        geometry: { totalDepth: 3 },
        feeds: { stepdown: 1 },
        output: { interpolation: 'linear' },
      }),
    )
    expect(lines.some((l) => l.startsWith('G3'))).toBe(false)
    // 3 passes * 72 segments
    expect(lines.filter((l) => l.startsWith('G1 X'))).toHaveLength(216)
    // plunge lines are still distinct straight Z moves
    expect(lines.filter((l) => l.startsWith('G1 Z-'))).toHaveLength(3)
  })

  it('repeats the toolpath once per custom point', () => {
    const lines = generate(
      buildParams({
        geometry: {
          positioning: 'custom',
          customPoints: [
            { x: 10, y: 10 },
            { x: -5, y: 20 },
          ],
          totalDepth: 1,
        },
        feeds: { stepdown: 1 },
      }),
    )
    expect(lines).toContain('G0 X10 Y10')
    expect(lines).toContain('G0 X-5 Y20')
    expect(lines.filter((l) => l.startsWith('G1 Z-'))).toHaveLength(2)
  })

  it('rapids straight to Z0 when startZ is 0 (default) — identical to before the feature existed', () => {
    const lines = generate(buildParams({ feeds: { startZ: 0 } }))
    expect(lines).toContain('G0 Z0')
  })

  it('treats startZ as raising the top of the cut: passes start at +startZ, still end at -totalDepth', () => {
    const lines = generate(
      buildParams({ geometry: { totalDepth: 3 }, feeds: { startZ: 0.5, stepdown: 1 } }),
    )
    // rapid straight to the raised top — nothing but air above it
    expect(lines).toContain('G0 Z0.5')
    // passes now span startZ+totalDepth = 3.5 at stepdown 1 -> 3 full + 1 partial (0.5) = 4
    const plungeLines = lines.filter((l) => l.startsWith('G1 Z-'))
    expect(plungeLines).toHaveLength(4)
    expect(plungeLines[3]).toContain('Z-3')
  })

  it('omits M5 and origin return when disabled, still ends with M30', () => {
    const lines = generate(
      buildParams({ output: { spindleStopEnd: false, returnOriginEnd: false } }),
    )
    expect(lines.some((l) => l === 'M5')).toBe(false)
    expect(lines[lines.length - 2]).not.toBe('G0 X0 Y0')
    expect(lines[lines.length - 1]).toBe('M30')
  })

  describe('tabs (BL-14)', () => {
    it('forces G1 even when arc interpolation is selected', () => {
      const lines = generate(
        buildParams({
          geometry: { totalDepth: 4, tabsEnabled: true, tabHeight: 1, tabCount: 4, tabWidth: 1 },
          feeds: { stepdown: 1 },
          output: { interpolation: 'arc' },
        }),
      )
      expect(lines.some((l) => l.startsWith('G3'))).toBe(false)
      expect(lines.some((l) => l.startsWith('G1 X'))).toBe(true)
    })

    it('skips tab arcs on every pass at or below the tab-band top, cutting normally above it', () => {
      const lines = generate(
        buildParams({
          geometry: { totalDepth: 4, tabsEnabled: true, tabHeight: 1, tabCount: 3, tabWidth: 1 },
          feeds: { stepdown: 1 },
        }),
      )
      // Tab-band top = -(4-1) = -3 — passes at -1/-2 are above it (plain
      // full circles), passes at -3/-4 are within it (tabbed).
      expect(lines).toContain('G1 Z-1 F300')
      expect(lines).toContain('G1 Z-2 F300')
      expect(lines).toContain('G1 Z-3 F300')
      expect(lines).toContain('G1 Z-4 F300')
      // Lift-height lines (liftZ = tab-band top = -3) only appear from the
      // tabbed passes onward.
      expect(lines.some((l) => l.startsWith('G1 X') && l.includes('Z-3 '))).toBe(true)
    })

    it('still reaches exactly -totalDepth on the last pass', () => {
      const lines = generate(
        buildParams({
          geometry: { totalDepth: 4, tabsEnabled: true, tabHeight: 1.5, tabCount: 2, tabWidth: 1 },
          feeds: { stepdown: 1 },
        }),
      )
      expect(lines.some((l) => l.startsWith('G1 X') && l.includes('Z-4 '))).toBe(true)
    })
  })
})
