import { describe, expect, it } from 'vitest'
import { generatePocketRaster, generatePocketSpiral } from './pocket'
import { rampSweepDegFor } from './pocketSpiral'
import { DEFAULT_MACHINE_SETTINGS } from '../types/machine'
import { DEFAULT_WIZARD_PARAMS, type WizardParams } from '../types/wizard'

function buildParams(overrides: {
  pocket?: Partial<WizardParams['pocket']>
  feeds?: Partial<WizardParams['feeds']>
  output?: Partial<WizardParams['output']>
} = {}): WizardParams {
  return {
    ...DEFAULT_WIZARD_PARAMS,
    operation: 'pocket',
    pocket: { ...DEFAULT_WIZARD_PARAMS.pocket, ...overrides.pocket },
    feeds: { ...DEFAULT_WIZARD_PARAMS.feeds, ...overrides.feeds },
    output: { ...DEFAULT_WIZARD_PARAMS.output, ...overrides.output },
  }
}

describe('generatePocketRaster', () => {
  it('enters at the pocket center, then rasters the tool-center wall (inset, not overtravel)', () => {
    const params = buildParams({
      pocket: { shape: 'rectCornered', width: 12, height: 7, toolDiameter: 2, stepoverPercent: 100, rasterDirection: 'x', totalDepth: 1 },
      feeds: { stepdown: 1 },
    })
    const lines = generatePocketRaster(params, DEFAULT_MACHINE_SETTINGS)

    // center = (6, 3.5), wall half-dims = (5, 2.5) -> bounds x:[1,11] y:[1,6].
    // stepoverMm = 2 -> raster lines at y = 1, 3, 5, 6 (last snapped to the
    // wall). Direction 'x' -> zigzag: (1,1)-(11,1), (11,3)-(1,3),
    // (1,5)-(11,5), (11,6)-(1,6).
    expect(lines).toContain('G0 X6 Y3.5') // entry rapid, always the pocket's own center
    const cutLines = lines.filter((l) => l.startsWith('G1 X'))
    expect(cutLines).toEqual([
      'G1 X1 Y1 Z-1 F800',
      'G1 X11 Y1 Z-1 F800',
      'G1 X11 Y3 Z-1 F800',
      'G1 X1 Y3 Z-1 F800',
      'G1 X1 Y5 Z-1 F800',
      'G1 X11 Y5 Z-1 F800',
      'G1 X11 Y6 Z-1 F800',
      'G1 X1 Y6 Z-1 F800',
    ])
    // Exactly one Plunge Z-transition (into the single level), no XY on it.
    expect(lines.filter((l) => l === 'G1 Z-1 F300')).toHaveLength(1)
  })
})

describe('generatePocketSpiral — Rectangle', () => {
  it('grows rings from the center outward, each a ramp line + closed CCW 4-edge lap', () => {
    const params = buildParams({
      pocket: { shape: 'rectCornered', width: 10, height: 10, toolDiameter: 2, stepoverPercent: 100, totalDepth: 1 },
      feeds: { stepdown: 1 },
    })
    const lines = generatePocketSpiral(params, DEFAULT_MACHINE_SETTINGS)

    // center = (5,5), wall half-dims = (4,4) -> rings at half=2 then half=4.
    const cutLines = lines.filter((l) => l.startsWith('G1 X'))
    expect(cutLines).toHaveLength(10) // 2 rings x (1 ramp + 4 edges)
    expect(cutLines.slice(0, 5)).toEqual([
      'G1 X3 Y3 Z-1 F800',
      'G1 X7 Y3 Z-1 F800',
      'G1 X7 Y7 Z-1 F800',
      'G1 X3 Y7 Z-1 F800',
      'G1 X3 Y3 Z-1 F800',
    ])
    expect(cutLines.slice(5)).toEqual([
      'G1 X1 Y1 Z-1 F800',
      'G1 X9 Y1 Z-1 F800',
      'G1 X9 Y9 Z-1 F800',
      'G1 X1 Y9 Z-1 F800',
      'G1 X1 Y1 Z-1 F800',
    ])
  })
})

describe('generatePocketSpiral — Circle', () => {
  it('one ring transition: a G1 ramp then exactly one full flat pass (G2/G3 in arc mode)', () => {
    const params = buildParams({
      pocket: { shape: 'circle', method: 'spiral', diameter: 6, toolDiameter: 2, stepoverPercent: 100, totalDepth: 1 },
      feeds: { stepdown: 1 },
      output: { interpolation: 'arc' },
    })
    const lines = generatePocketSpiral(params, DEFAULT_MACHINE_SETTINGS)

    // wallRadius = 6/2 - 1 = 2, stepoverMm = 2 -> pocketCircleRingRadii(0, 2, 2) = [0, 2] -> 1 transition.
    // Ramp: rampSweepDegFor(0, 2) at 5°/segment density, always G1; flat pass: 1 G3 (CCW).
    const expectedRampSegments = Math.max(1, Math.round(72 * (rampSweepDegFor(0, 2) / 360)))
    expect(lines.filter((l) => l.startsWith('G1 X'))).toHaveLength(expectedRampSegments)
    expect(lines.filter((l) => l.startsWith('G3 '))).toHaveLength(1)
    expect(lines.some((l) => l.startsWith('G2 '))).toBe(false)
  })

  it('Helix entry starts the first ring ramp from helixRadius, not 0', () => {
    const params = buildParams({
      pocket: {
        shape: 'circle',
        method: 'spiral',
        diameter: 10,
        toolDiameter: 2,
        stepoverPercent: 100,
        totalDepth: 1,
        zTransitionMode: 'helix',
        helixRadius: 1,
      },
      feeds: { stepdown: 1 },
      output: { interpolation: 'arc' },
    })
    const lines = generatePocketSpiral(params, DEFAULT_MACHINE_SETTINGS)
    // wallRadius = 10/2 - 1 = 4, stepoverMm = 2 -> pocketCircleRingRadii(1, 4, 2) = [1, 3, 4] -> 2 transitions,
    // plus the Helix entry's own spiral turn AND its flat finishing pass
    // (pocketZTransitionMoves() squares off the helical ledge the spiral
    // leaves behind, same as helix.ts's Hole(s) Helix) — 4 full turns total.
    expect(lines.filter((l) => l.startsWith('G3 '))).toHaveLength(4) // helix entry + its finishing pass + 2 ring flat passes
    // The helix entry's own G3 starts exactly at (centerX + helixRadius, centerY) = (1, 0)
    // (default offsetX/offsetY = 0,0).
    expect(lines.some((l) => l.startsWith('G3 X1 Y0 '))).toBe(true)
  })

  it('Helix entry: the flat finishing pass actually cuts a full circle at helixRadius, at true target depth', () => {
    const params = buildParams({
      pocket: {
        shape: 'circle',
        method: 'spiral',
        diameter: 10,
        toolDiameter: 2,
        stepoverPercent: 100,
        totalDepth: 1,
        zTransitionMode: 'helix',
        helixRadius: 1,
      },
      feeds: { stepdown: 1 },
    })
    const lines = generatePocketSpiral(params, DEFAULT_MACHINE_SETTINGS)
    // G1 interpolation (default): fullCircleMove() always snaps its last
    // segment onto the exact (startX, startY, zEnd) point — both the
    // spiral's own single turn (fromZ=0 to toZ=-1) and the new flat
    // finishing pass (zStart=zEnd=-1) end at the identical point
    // (centerX + helixRadius, centerY) = (1, 0), so this exact line
    // appears twice once the finishing pass exists (only once before the
    // fix — nothing squared off the spiral's own helical ledge).
    expect(lines.filter((l) => l === 'G1 X1 Y0 Z-1 F800')).toHaveLength(2)
  })
})

describe('generatePocketSpiral — multi-level retract', () => {
  it('retracts to Safe Z and repositions to the center between levels', () => {
    const params = buildParams({
      pocket: { shape: 'rectCornered', width: 10, height: 10, toolDiameter: 2, stepoverPercent: 100, totalDepth: 2 },
      feeds: { stepdown: 1, safeZ: 5, startZ: 0 },
    })
    const lines = generatePocketSpiral(params, DEFAULT_MACHINE_SETTINGS)
    // buildLevelDescents(0, 2, 1) -> [-1, -2]. Level 2's transition retracts
    // to Safe Z, repositions to center (5,5), then rapids back to Start Z.
    expect(lines.filter((l) => l === 'G0 Z0')).toHaveLength(2) // initial rapidToTop + 1 mid-level
    expect(lines.filter((l) => l === 'G0 X5 Y5')).toHaveLength(2) // initial entry + 1 mid-level reposition
    expect(lines.filter((l) => l === 'G1 Z-1 F300')).toHaveLength(1)
    expect(lines.filter((l) => l === 'G1 Z-2 F300')).toHaveLength(1)
  })
})
