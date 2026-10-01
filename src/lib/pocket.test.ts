import { describe, expect, it } from 'vitest'
import { buildPocketToolpath, generatePocketSpiral } from './pocket'
import { cellInscribed, cellWallDistance, lightenedCells } from './pocketLightened'
import { rampSweepDegFor } from './pocketSpiral'
import { arcRadiusMismatches } from './gcodeTestUtils'
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

describe('Pocket Helix entry in G2/G3 mode', () => {
  it('Spiral: every arc starts on its own circle (tool positioned at the helix start, not the center)', () => {
    const params = buildParams({
      pocket: { shape: 'rectCentered', method: 'spiral', width: 20, height: 20, toolDiameter: 2, totalDepth: 2, zTransitionMode: 'helix', helixRadius: 1 },
      feeds: { stepdown: 1 },
      output: { interpolation: 'arc' },
    })
    const lines = generatePocketSpiral(params, DEFAULT_MACHINE_SETTINGS)
    expect(lines.some((l) => /^G3 /.test(l))).toBe(true)
    expect(arcRadiusMismatches(lines)).toEqual([])
  })
})

describe('generatePocketSpiral — Rectangle', () => {
  it('grows rings from the center outward, each ring a gradual multi-segment ramp + a CCW lap closing back onto the ramp', () => {
    const params = buildParams({
      pocket: { shape: 'rectCornered', width: 10, height: 10, toolDiameter: 2, stepoverPercent: 100, totalDepth: 1 },
      feeds: { stepdown: 1 },
    })
    const lines = generatePocketSpiral(params, DEFAULT_MACHINE_SETTINGS)

    // center = (5,5), wall half-dims = (4,4) -> rings at half=2 then half=4.
    // Unlike the old corner-to-corner ramp (a fixed 1-segment-per-ring
    // count), the gradual ramp's segment count follows rectRampSweepFor()
    // — see pocketSpiral.test.ts for the exact math (this 106 follows from
    // ring 1's from-zero square growth hitting the 1-full-loop cap, plus
    // ring 2's uncapped ~0.3536 sweep).
    const cutLines = lines.filter((l) => l.startsWith('G1 X'))
    expect(cutLines).toHaveLength(106)
    expect(cutLines.every((l) => l.startsWith('G1 '))).toBe(true) // rectangles never use G2/G3

    // The whole point of the fix: ring 1's ramp does NOT jump straight
    // from the center to its full corner (3,3) in one move.
    expect(cutLines[0]).not.toBe('G1 X3 Y3 Z-1 F800')

    // Every cutting move stays within the outer wall (halfWidth=halfHeight
    // =4 around center (5,5)) — no ramp point overshoots past the pocket.
    for (const line of cutLines) {
      const match = line.match(/^G1 X(-?[\d.]+) Y(-?[\d.]+)/)
      expect(match).not.toBeNull()
      expect(Number(match![1])).toBeGreaterThanOrEqual(1 - 1e-9)
      expect(Number(match![1])).toBeLessThanOrEqual(9 + 1e-9)
      expect(Number(match![2])).toBeGreaterThanOrEqual(1 - 1e-9)
      expect(Number(match![2])).toBeLessThanOrEqual(9 + 1e-9)
    }
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
        // 2π·1·tan 10° ≈ 1.11 mm per turn — the 1 mm entry is one turn.
        rampAngleDeg: 10,
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
    // G1 interpolation (default): a full turn always snaps its last
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
    // to Safe Z, repositions to center (5,5), then rapids down to 0.5 mm
    // above level 1's floor (levelEntryZ) and plunges only from there.
    expect(lines.filter((l) => l === 'G0 Z0')).toHaveLength(1) // initial rapid to Start Z
    expect(lines.filter((l) => l === 'G0 Z-0.5')).toHaveLength(1) // level 2 re-entry
    expect(lines.filter((l) => l === 'G0 X5 Y5')).toHaveLength(2) // initial entry + 1 mid-level reposition
    expect(lines.filter((l) => l === 'G1 Z-1 F300')).toHaveLength(1)
    expect(lines.filter((l) => l === 'G1 Z-2 F300')).toHaveLength(1)
  })
})

describe('Spiral Ramp Length (BL-41)', () => {
  it('a longer ramp emits more ramp segments; the default matches the old fixed factor', () => {
    const count = (rampLengthFactor: number) =>
      generatePocketSpiral(
        buildParams({
          pocket: { shape: 'rectCornered', width: 40, height: 30, toolDiameter: 2, stepoverPercent: 40, totalDepth: 1, rampLengthFactor },
          feeds: { stepdown: 1 },
        }),
        DEFAULT_MACHINE_SETTINGS,
      ).filter((l) => l.startsWith('G1 X')).length
    expect(DEFAULT_WIZARD_PARAMS.pocket.rampLengthFactor).toBe(3)
    expect(count(6)).toBeGreaterThan(count(3))
    expect(count(3)).toBeGreaterThan(count(1))
  })
})

describe('Lightened shapes (OP-6)', () => {
  const lightened = (pocket: Partial<WizardParams['pocket']>) =>
    buildParams({
      pocket: { shape: 'rectLightened', lightLayout: 'triangles', lightCountX: 4, lightCountY: 1, width: 120, height: 40, ribWidth: 4, toolDiameter: 3.175, totalDepth: 2, ...pocket },
      feeds: { stepdown: 1, safeZ: 5 },
    })

  it('cuts every cell to full depth, one after another, retracting to Safe Z in between', () => {
    const params = lightened({})
    const toolpath = buildPocketToolpath(params)
    const cells = lightenedCells(params.pocket)
    expect(cells).toHaveLength(5)
    // Every cell's center is visited by an XY rapid (cell 1 is the start point).
    const rapids = toolpath.moves.filter((m) => m.kind === 'rapid' && m.type === 'line' && m.axes === 'xy').map((m) => m.to)
    for (const cell of cells.slice(1)) {
      const c = cellInscribed(cell).center
      expect(rapids.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < 1e-9)).toBe(true)
    }
    expect(Math.min(...toolpath.moves.map((m) => m.to.z))).toBeCloseTo(-2, 9)
  })

  it('Adaptive works for both Lightened shapes (links at Linking Feed), Spiral has none', () => {
    const circle = { shape: 'circleLightened' as const, diameter: 80, spokeCount: 5, hubDiameter: 16, ribWidth: 4, toolDiameter: 3.175, totalDepth: 1, helixRadius: 1 }
    const adaptive = buildPocketToolpath(buildParams({ pocket: { ...circle, method: 'adaptive' }, feeds: { stepdown: 1 } }))
    const spiral = buildPocketToolpath(buildParams({ pocket: { ...circle, method: 'spiral' }, feeds: { stepdown: 1 } }))
    expect(adaptive.moves.some((m) => m.kind === 'link')).toBe(true)
    expect(spiral.moves.some((m) => m.kind === 'link')).toBe(false)
  })

  it('adds finishing laps on every cell when Finishing Pass is on', () => {
    const params = lightened({ finishingEnabled: true, stockToLeave: 0.3 })
    const toolpath = buildPocketToolpath(params)
    const cells = lightenedCells(params.pocket)
    for (const cell of cells) {
      const onWall = toolpath.moves.some((m) => m.kind === 'finish' && Math.abs(cellWallDistance(cell, m.to) - 3.175 / 2) < 1e-6)
      expect(onWall).toBe(true)
    }
  })

  it('Circle Lightened: one pocket per spoke gap, G-code ends at full depth', () => {
    const params = buildParams({
      pocket: { shape: 'circleLightened', diameter: 80, spokeCount: 5, hubDiameter: 16, ribWidth: 4, toolDiameter: 3.175, totalDepth: 1 },
      feeds: { stepdown: 1 },
    })
    const lines = generatePocketSpiral(params, DEFAULT_MACHINE_SETTINGS)
    expect(lines.some((l) => l.includes('Z-1 '))).toBe(true)
    expect(lightenedCells(params.pocket)).toHaveLength(5)
  })
})
