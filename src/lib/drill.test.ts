import { describe, expect, it } from 'vitest'
import { buildDrillToolpath, drillOptions, drillToolpathGcode, generateDrill, holeGeometry } from './drill'
import { isWizardParamsValid, patternSpan } from './validation'
import { DEFAULT_MACHINE_SETTINGS } from '../types/machine'
import { DEFAULT_WIZARD_PARAMS, type WizardParams } from '../types/wizard'

function buildParams(overrides: {
  geometry?: Partial<WizardParams['geometry']>
  feeds?: Partial<WizardParams['feeds']>
} = {}): WizardParams {
  return {
    ...DEFAULT_WIZARD_PARAMS,
    method: 'drill',
    geometry: { ...DEFAULT_WIZARD_PARAMS.geometry, ...overrides.geometry },
    feeds: { ...DEFAULT_WIZARD_PARAMS.feeds, ...overrides.feeds },
  }
}

// The cycle at one hole, without the program around it.
function holeCode(params: WizardParams): string[] {
  const opts = drillOptions(params)
  return drillToolpathGcode(buildDrillToolpath(0, 0, opts), opts)
}

const FEEDS = { startZ: 1, safeZ: 5, stepdown: 2, plungeRate: 100 }

describe('Drill (BL-120)', () => {
  it('Full Retract: backs out to Start Z after each peck and rapids back to Retract above the last bottom', () => {
    const params = buildParams({ geometry: { totalDepth: 5, drillRetractMode: 'full', drillRetract: 0.5 }, feeds: FEEDS })
    // 6 mm from Start Z 1 to -5 in pecks of 2: bottoms -1, -3, -5.
    expect(holeCode(params)).toEqual([
      'G0 X0 Y0',
      'G0 Z1',
      'G1 Z-1 F100',
      'G0 Z1',
      'G0 Z-0.5',
      'G1 Z-3 F100',
      'G0 Z1',
      'G0 Z-2.5',
      'G1 Z-5 F100',
    ])
  })

  it('Chip Break: backs off by Retract after each peck and drills on', () => {
    const params = buildParams({ geometry: { totalDepth: 5, drillRetractMode: 'chipBreak', drillRetract: 0.5 }, feeds: FEEDS })
    expect(holeCode(params)).toEqual([
      'G0 X0 Y0',
      'G0 Z1',
      'G1 Z-1 F100',
      'G0 Z-0.5',
      'G1 Z-3 F100',
      'G0 Z-2.5',
      'G1 Z-5 F100',
    ])
  })

  it('a Peck Depth at least as deep as the hole drills in one plunge', () => {
    const params = buildParams({ geometry: { totalDepth: 5 }, feeds: { ...FEEDS, stepdown: 10 } })
    expect(holeCode(params)).toEqual(['G0 X0 Y0', 'G0 Z1', 'G1 Z-5 F100'])
  })

  it('never backs off above Start Z', () => {
    const params = buildParams({ geometry: { totalDepth: 5, drillRetractMode: 'chipBreak', drillRetract: 4 }, feeds: FEEDS })
    const backOffs = holeCode(params).filter((l) => l.startsWith('G0 Z')).slice(1)
    expect(backOffs.every((l) => Number(l.slice(4)) <= 1)).toBe(true)
  })

  it('drills every hole of the pattern and retracts to Safe Z between them', () => {
    const params = buildParams({
      geometry: { positioning: 'grid', gridX: 20, gridY: 10, gridCountX: 2, gridCountY: 2, totalDepth: 3 },
      feeds: FEEDS,
    })
    const lines = generateDrill(params, DEFAULT_MACHINE_SETTINGS)
    // One full-depth peck per hole; Safe Z once in the header, then after each hole.
    expect(lines.filter((l) => l === 'G1 Z-3 F100')).toHaveLength(4)
    expect(lines.filter((l) => l === 'G0 Z5')).toHaveLength(5)
    expect(lines.some((l) => /^G[23] /.test(l))).toBe(false)
  })

  it('the hole is as wide as the drill and has no tabs', () => {
    const params = buildParams({ geometry: { toolDiameter: 5, holeDiameter: 12, tabsEnabled: true } })
    expect(holeGeometry(params)).toMatchObject({ holeDiameter: 5, tabsEnabled: false })
    expect(patternSpan(holeGeometry(params))).toEqual({ x: 5, y: 5 })
    // Other methods keep the stored hole.
    expect(holeGeometry({ ...params, method: 'standard' }).holeDiameter).toBe(12)
  })

  it('validates without the tool-vs-hole and Feedrate XY checks, but needs a Retract', () => {
    // The tool as wide as the stored hole would block Helix / Standard.
    const params = buildParams({ geometry: { toolDiameter: 8, holeDiameter: 8 }, feeds: { feedrateXY: 0 } })
    expect(isWizardParamsValid(params)).toBe(true)
    expect(isWizardParamsValid({ ...params, method: 'standard', feeds: { ...params.feeds, feedrateXY: 800 } })).toBe(false)
    expect(isWizardParamsValid(buildParams({ geometry: { drillRetract: 0 } }))).toBe(false)
  })
})
