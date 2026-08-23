import { describe, expect, it } from 'vitest'
import { generateHelix } from './helix'
import { DEFAULT_MACHINE_SETTINGS } from '../types/machine'
import { DEFAULT_WIZARD_PARAMS, type WizardParams } from '../types/wizard'

// Machine settings don't vary across these tests — see program.test.ts for
// dialect-specific coverage (G4 P conversion, end-of-program code).
function generate(params: WizardParams): string[] {
  return generateHelix(params, DEFAULT_MACHINE_SETTINGS)
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

describe('generateHelix', () => {
  it('starts with the standard preamble', () => {
    const lines = generate(buildParams())
    expect(lines[0]).toBe('G21 G90 G17')
  })

  it('includes spindle start + dwell when enabled', () => {
    const lines = generate(
      buildParams({ output: { spindleStart: true, spindleSpeed: 12000, dwellSeconds: 3 } }),
    )
    expect(lines).toContain('M3 S12000')
    expect(lines).toContain('G4 P3')
  })

  it('omits spindle lines when spindleStart is disabled', () => {
    const lines = generate(buildParams({ output: { spindleStart: false } }))
    // 'M3 ' (with the trailing space), not just 'M3' — the trailing M30
    // end-of-program line also starts with 'M3' but isn't a spindle line.
    expect(lines.some((l) => l.startsWith('M3 '))).toBe(false)
    expect(lines.some((l) => l.startsWith('G4'))).toBe(false)
  })

  it('produces one full circle per stepdown turn plus a flat finishing pass', () => {
    // totalDepth 4, stepdown 1 -> 4 spiral turns + 1 flat pass = 5 turns
    const lines = generate(
      buildParams({ geometry: { totalDepth: 4 }, feeds: { stepdown: 1 }, output: { interpolation: 'arc' } }),
    )
    const arcLines = lines.filter((l) => l.startsWith('G3'))
    expect(arcLines).toHaveLength(5)
  })

  it('reaches exactly the target depth on the last spiral turn', () => {
    const lines = generate(
      buildParams({ geometry: { totalDepth: 4 }, feeds: { stepdown: 1 }, output: { interpolation: 'arc' } }),
    )
    const arcLines = lines.filter((l) => l.startsWith('G3'))
    // last spiral turn and the flat finishing pass both sit at -4
    expect(arcLines[3]).toContain('Z-4')
    expect(arcLines[4]).toContain('Z-4')
  })

  it('handles a non-integer stepdown remainder on the last turn', () => {
    // totalDepth 4.5, stepdown 1 -> 4 full turns (-1..-4) + 1 partial turn (-4.5) + flat pass
    const lines = generate(
      buildParams({ geometry: { totalDepth: 4.5 }, feeds: { stepdown: 1 }, output: { interpolation: 'arc' } }),
    )
    const arcLines = lines.filter((l) => l.startsWith('G3'))
    expect(arcLines).toHaveLength(6)
    expect(arcLines[4]).toContain('Z-4.5')
    expect(arcLines[5]).toContain('Z-4.5')
  })

  it('uses linear (G1) segments instead of arcs when interpolation is "linear"', () => {
    const lines = generate(
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
    const lines = generate(
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

  it('rapids straight to Z0 when startZ is 0 (default) — identical to before the feature existed', () => {
    const lines = generate(buildParams({ feeds: { startZ: 0 } }))
    expect(lines).toContain('G0 Z0')
  })

  it('treats startZ as raising the top of the cut: spiral starts at +startZ, still ends at -totalDepth', () => {
    const lines = generate(
      buildParams({
        geometry: { totalDepth: 4 },
        feeds: { startZ: 0.5, stepdown: 1 },
        output: { interpolation: 'arc' },
      }),
    )
    // rapid straight to the raised top — nothing but air above it
    expect(lines).toContain('G0 Z0.5')
    // spiral now spans startZ+totalDepth = 4.5 at stepdown 1 -> 4 full turns
    // + 1 partial (0.5) turn + 1 flat finishing pass = 6
    const arcLines = lines.filter((l) => l.startsWith('G3'))
    expect(arcLines).toHaveLength(6)
    expect(arcLines[4]).toContain('Z-4')
    expect(arcLines[5]).toContain('Z-4')
  })

  it('appends M5 and origin return only when enabled, before the trailing M30', () => {
    const withFooter = generate(
      buildParams({ output: { spindleStopEnd: true, returnOriginEnd: true } }),
    )
    expect(withFooter[withFooter.length - 3]).toBe('M5')
    expect(withFooter[withFooter.length - 2]).toBe('G0 X0 Y0')
    expect(withFooter[withFooter.length - 1]).toBe('M30')

    const withoutFooter = generate(
      buildParams({ output: { spindleStopEnd: false, returnOriginEnd: false } }),
    )
    expect(withoutFooter.some((l) => l === 'M5')).toBe(false)
    expect(withoutFooter[withoutFooter.length - 2]).not.toBe('G0 X0 Y0')
    expect(withoutFooter[withoutFooter.length - 1]).toBe('M30')
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

    it('shortens the spiral to the tab-band top, then lifts over each tab down to exactly -totalDepth', () => {
      const lines = generate(
        buildParams({
          geometry: { totalDepth: 4, tabsEnabled: true, tabHeight: 1, tabCount: 3, tabWidth: 1 },
          feeds: { stepdown: 1 },
        }),
      )
      // Tab-band top = -(4-1) = -3, reused as the lift height.
      expect(lines.some((l) => l.includes('Z-3 '))).toBe(true)
      // The tab-band loop still reaches exactly -totalDepth on its last pass.
      expect(lines.some((l) => l.startsWith('G1 X') && l.includes('Z-4 '))).toBe(true)
    })

    it('does not run the old flat finishing pass on top of the tabbed band (would erase every tab)', () => {
      const lines = generate(
        buildParams({
          geometry: { totalDepth: 4, tabsEnabled: true, tabHeight: 1, tabCount: 3, tabWidth: 1 },
          feeds: { stepdown: 1 },
        }),
      )
      // Each tab-band pass is preceded by its own explicit bare `G1 Z<depth>
      // F<plungeRate>` plunge line (mirroring standardHoleToolpath) — a
      // stray old finishing pass would add a second one reaching -4, since
      // that's the only kind of line this shape can come from (the spiral
      // itself never emits a bare Z-only line).
      const plungeToFullDepth = lines.filter((l) => l === 'G1 Z-4 F300')
      expect(plungeToFullDepth).toHaveLength(1)
    })

    it('squares off the spiral ledge at the tab-band top before descending into tabbed passes', () => {
      // The user's own bug report numbers: depth 5, tab height 1, pitch 0.5.
      // Without the squaring pass, the first tab-band pass (to -4.5) bites
      // unevenly around the ledge the spiral's last turn leaves at the
      // tab-band top (-4) — up to 1mm in one bite instead of the intended
      // 0.5mm stepdown, depending on angle.
      const lines = generate(
        buildParams({
          geometry: { totalDepth: 5, tabsEnabled: true, tabHeight: 1, tabCount: 3, tabWidth: 1 },
          feeds: { stepdown: 0.5 },
        }),
      )
      const firstBandPlungeIdx = lines.indexOf('G1 Z-4.5 F300')
      expect(firstBandPlungeIdx).toBeGreaterThan(0)

      // Everything before that plunge is either spiral motion or the new
      // squaring pass — a full untabbed circle sitting exactly at -4 (the
      // tab-band top), 72 segments, plus the spiral's own last (snapped)
      // point which also lands exactly on -4.
      const beforeBand = lines.slice(0, firstBandPlungeIdx)
      const linesAtBandTop = beforeBand.filter((l) => l.startsWith('G1 X') && l.includes('Z-4 '))
      expect(linesAtBandTop).toHaveLength(73)
    })
  })
})
