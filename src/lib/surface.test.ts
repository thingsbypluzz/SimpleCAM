import { describe, expect, it } from 'vitest'
import { generateSurfaceUnidirectional, generateSurfaceZigzag } from './surface'
import { DEFAULT_MACHINE_SETTINGS } from '../types/machine'
import { DEFAULT_WIZARD_PARAMS, type WizardParams } from '../types/wizard'

function buildParams(overrides: {
  surface?: Partial<WizardParams['surface']>
  feeds?: Partial<WizardParams['feeds']>
  output?: Partial<WizardParams['output']>
} = {}): WizardParams {
  return {
    ...DEFAULT_WIZARD_PARAMS,
    operation: 'surface',
    surface: { ...DEFAULT_WIZARD_PARAMS.surface, toolDiameter: 0, ...overrides.surface },
    feeds: { ...DEFAULT_WIZARD_PARAMS.feeds, ...overrides.feeds },
    output: { ...DEFAULT_WIZARD_PARAMS.output, ...overrides.output },
  }
}

// toolDiameter: 0 throughout — zero overtravel keeps the tool-center bounds
// identical to the nominal rectangle, so the expected coordinates below are
// exactly width/height, matching the same simplification convention as
// outlineRectangle.test.ts's toolDiameter: 0 cases.

describe('generateSurfaceZigzag', () => {
  it('single level: one continuous G1 chain per level, no G0 between raster lines', () => {
    const params = buildParams({
      surface: { shape: 'rectCornered', width: 10, height: 5, rasterDirection: 'x', stepoverPercent: 100, totalDepth: 1 },
      feeds: { stepdown: 1 },
      output: { returnOriginEnd: false }, // otherwise buildFooter's own 'G0 X0 Y0' also matches the filter below
    })
    const lines = generateSurfaceZigzag(params, DEFAULT_MACHINE_SETTINGS)

    // toolDiameter 0 -> stepoverMm 0 -> computeLinePositions falls back to
    // just [minY, maxY] = [0, 5] -> 2 raster lines, boustrophedon: (0,0)-(10,0)
    // then (10,5)-(0,5).
    const cutLines = lines.filter((l) => l.startsWith('G1 X'))
    expect(cutLines).toEqual(['G1 X10 Y0 Z-1 F800', 'G1 X10 Y5 Z-1 F800', 'G1 X0 Y5 Z-1 F800'])

    // Exactly one plunge (the single Z-transition into the only level) — no
    // straight Z line hides among the raster (those are all "G1 X..").
    expect(lines.filter((l) => l === 'G1 Z-1 F300')).toHaveLength(1)

    // Exactly one leading rapid to (cx, cy) — emitted by the toolpath
    // function itself; assembleProgram no longer rapids to the raw point
    // first (see program.ts), so there's no longer a duplicate here.
    expect(lines.filter((l) => l === 'G0 X0 Y0')).toHaveLength(1)
  })

  it('multi-level: retracts all the way to Safe Z and repositions to the start corner between levels', () => {
    const params = buildParams({
      surface: { shape: 'rectCornered', width: 10, height: 5, rasterDirection: 'x', stepoverPercent: 100, totalDepth: 3 },
      feeds: { stepdown: 1 },
    })
    const lines = generateSurfaceZigzag(params, DEFAULT_MACHINE_SETTINGS)
    // buildLevelDescents(0, 3, 1) -> target depths -1, -2, -3 (see
    // surfaceZTransition.test.ts) — the 2nd and 3rd level transitions both
    // retract all the way to Safe Z (default 5), reposition to (0,0), THEN
    // rapid back down to Start Z (0) before the Plunge/Helix — every
    // level's transition always starts from Start Z, never from Safe Z
    // directly (that's what made the Helix overshoot before this fix).
    // 'G0 Z0' appears 3 times: the initial rapidToTop(startZ), plus one
    // rapid-to-Start-Z per level-2/3 transition. 'G0 Z5' appears 4 times:
    // buildHeader's own initial rapid, the 2 mid-level Safe-Z retracts, and
    // assembleProgram's trailing retract.
    expect(lines.filter((l) => l === 'G0 Z0')).toHaveLength(3)
    expect(lines.filter((l) => l === 'G0 Z5')).toHaveLength(4)
    expect(lines.filter((l) => l === 'G1 Z-1 F300')).toHaveLength(1)
    expect(lines.filter((l) => l === 'G1 Z-2 F300')).toHaveLength(1)
    expect(lines.filter((l) => l === 'G1 Z-3 F300')).toHaveLength(1)
  })

  it('rectCentered straddles the offset origin, same as Outline', () => {
    const params = buildParams({
      surface: { shape: 'rectCentered', width: 10, height: 10, offsetX: 0, offsetY: 0 },
    })
    const lines = generateSurfaceZigzag(params, DEFAULT_MACHINE_SETTINGS)
    expect(lines).toContain('G0 X-5 Y-5')
  })
})

describe('generateSurfaceUnidirectional', () => {
  it('retracts to Safe Z and repositions between lines, plunging back with plungeRate (not the Helix toggle)', () => {
    const params = buildParams({
      surface: {
        shape: 'rectCornered',
        width: 10,
        height: 5,
        rasterDirection: 'x',
        stepoverPercent: 100,
        totalDepth: 1,
        zTransitionMode: 'helix', // proves the between-line re-entry ignores this
      },
      feeds: { stepdown: 1, safeZ: 5 },
      output: { interpolation: 'arc' },
    })
    const lines = generateSurfaceUnidirectional(params, DEFAULT_MACHINE_SETTINGS)

    const cutLines = lines.filter((l) => l.startsWith('G1 X'))
    expect(cutLines).toEqual(['G1 X10 Y0 Z-1 F800', 'G1 X10 Y5 Z-1 F800'])

    // 'G0 Z5' appears 3 times: buildHeader's own initial rapid to Safe Z,
    // the one retract-to-Safe-Z between the 2 raster lines, and
    // assembleProgram's trailing retract after the (single synthetic) point
    // — never a 4th, which would mean a retract after the last line too.
    expect(lines.filter((l) => l === 'G0 Z5')).toHaveLength(3)
    // BL-35: the re-entry rapids down to one stepdown above the target
    // level (toZ=-1, stepdown=1 -> Z0) before the final plunge, instead of
    // plunging at Plunge Rate through the whole empty Safe-Z-to-toZ gap.
    // 'G0 Z0' appears twice: the toolpath's own initial rapidToTop(startZ)
    // (startZ=0) at the very start, plus this one re-entry.
    expect(lines.filter((l) => l === 'G0 Z0')).toHaveLength(2)
    // The re-entry plunge after that retract, plus the initial Helix-mode
    // Z-transition into the first level (single stepdown-sized turn ->
    // G2/G3, not this straight line) are the only vertical moves besides it.
    expect(lines.filter((l) => l === 'G1 Z-1 F300')).toHaveLength(1)
    expect(lines.some((l) => l.startsWith('G3 X') || l.startsWith('G2 X'))).toBe(true)
  })

  it('no Safe-Z retract after the very last line — assembleProgram handles the final retract', () => {
    const params = buildParams({
      surface: { shape: 'rectCornered', width: 10, height: 5, rasterDirection: 'x', stepoverPercent: 100, totalDepth: 1 },
      feeds: { stepdown: 1, safeZ: 5 },
    })
    const lines = generateSurfaceUnidirectional(params, DEFAULT_MACHINE_SETTINGS)
    // Header's initial rapid + the one mid-sequence retract (between the 2
    // lines) + assembleProgram's single trailing retract = 3, never a 4th
    // stacked directly after the last cut line.
    expect(lines.filter((l) => l === 'G0 Z5')).toHaveLength(3)
    expect(lines[lines.length - 1]).not.toBe('G0 Z5') // footer/end-of-program code still follows it
  })
})
