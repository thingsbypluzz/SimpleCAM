import { describe, expect, it } from 'vitest'
import { buildPocketToolpath, generatePocketAdaptive } from './pocket'
import { simulateEngagement } from './pocketAdaptiveSim'
import { cellInscribed, cellLoop, cellWallDistance, lightenedCells } from './pocketLightened'
import { cellOf, cellRuns, distanceToPolygon, linkRemovedArea } from './lightenedTestUtils'
import { arcRadiusMismatches } from './gcodeTestUtils'
import type { Move, Point3D } from './toolpath'
import { DEFAULT_MACHINE_SETTINGS } from '../types/machine'
import { DEFAULT_WIZARD_PARAMS, type PocketParams, type WizardParams } from '../types/wizard'

function params(pocket: Partial<PocketParams>, output: Partial<WizardParams['output']> = {}): WizardParams {
  return {
    ...DEFAULT_WIZARD_PARAMS,
    operation: 'pocket',
    pocket: {
      ...DEFAULT_WIZARD_PARAMS.pocket,
      shape: 'circleLightened',
      method: 'adaptive',
      toolDiameter: 4,
      totalDepth: 1,
      helixRadius: 1,
      offsetX: 0,
      offsetY: 0,
      ribWidth: 3,
      spokeStartAngle: 20,
      ...pocket,
    },
    feeds: { ...DEFAULT_WIZARD_PARAMS.feeds, startZ: 0, stepdown: 1 },
    output: { ...DEFAULT_WIZARD_PARAMS.output, ...output },
  }
}

// Narrow sectors (the inscribed circle touches both sides), with and
// without a hub, and wide ones (it touches the hub and the outer arc).
const SCENARIOS: [string, Partial<PocketParams>][] = [
  ['narrow, hub — 6 spokes, climb', { diameter: 70, spokeCount: 6, hubDiameter: 14 }],
  ['narrow, no hub — 5 spokes', { diameter: 60, spokeCount: 5, hubDiameter: 0 }],
  ['wide — 3 spokes, big hub', { diameter: 50, spokeCount: 3, hubDiameter: 22 }],
  ['wide, conventional, 20%', { diameter: 50, spokeCount: 3, hubDiameter: 22, cutDirection: 'conventional', optimalLoadPercent: 20 }],
  ['narrow, hub, 5%', { diameter: 60, spokeCount: 8, hubDiameter: 20, optimalLoadPercent: 5 }],
  // A tool nearly as wide as the cell: the tool-center region is tiny, the
  // cell must still come out to its nominal shape without a Finishing Pass.
  ['tool nearly fills the cell — Ø45, 5 spokes, tool 8', { diameter: 45, spokeCount: 5, hubDiameter: 16, toolDiameter: 8, ribWidth: 4, helixRadius: 0.5, spokeStartAngle: 90, optimalLoadPercent: 30, cutDirection: 'conventional' }],
]

describe('Circle Lightened Adaptive — simulated coverage and walls (BL-85)', () => {
  it.each(SCENARIOS)('%s', (_label, over) => {
    const p = params(over)
    const R = p.pocket.toolDiameter / 2
    const cells = lightenedCells(p.pocket)
    const runs = cellRuns(buildPocketToolpath(p))
    expect(runs).toHaveLength(cells.length)
    // All sectors are one shape rotated — one cell is enough.
    const run = runs[0]
    const cell = cellOf(cells, run.moves[0].to)
    const tc = cellLoop(cell, R)
    const reach = (x: number, y: number) => (cellWallDistance(cell, { x, y }) >= R ? 0 : distanceToPolygon({ x, y }, tc))
    const xs = tc.map((q) => q.x)
    const ys = tc.map((q) => q.y)
    const c = cellInscribed(cell).center
    const helix = new Set<number>()
    let cur: Point3D = run.start
    run.moves.forEach((m: Move, i) => {
      if (m.type === 'arc' && Math.hypot(m.center.x - c.x, m.center.y - c.y) < 1e-9 && Math.abs(Math.hypot(cur.x - c.x, cur.y - c.y) - p.pocket.helixRadius) < 1e-6)
        helix.add(i)
      cur = m.to
    })
    const r = simulateEngagement(run, {
      toolRadius: R,
      cell: 0.05,
      minChip: 0.1,
      trueArcs: true,
      bounds: { minX: Math.min(...xs) - R - 1, maxX: Math.max(...xs) + R + 1, minY: Math.min(...ys) - R - 1, maxY: Math.max(...ys) + R + 1 },
      isMaterial: (x, y) => reach(x, y) <= R,
      isInterior: (x, y) => reach(x, y) <= R - 0.1,
      toolCenterOvershoot: (x, y) => R - cellWallDistance(cell, { x, y }),
      isUnmeasured: (i) => helix.has(i),
    })
    expect(r.uncutInteriorCells, JSON.stringify(r.uncutAt)).toBe(0)
    expect(r.maxWallViolation).toBeLessThan(1e-6)
    expect(linkRemovedArea(run, cell, R, 0.05)).toBeLessThan(0.1)
  }, 60_000)
})

describe('Circle Lightened Adaptive — G-code', () => {
  it('climb cuts the peel arcs CCW, conventional CW; arcs start on their own circle', () => {
    const climb = generatePocketAdaptive(params(SCENARIOS[0][1], { interpolation: 'arc' }), DEFAULT_MACHINE_SETTINGS)
    const conv = generatePocketAdaptive(params({ ...SCENARIOS[0][1], cutDirection: 'conventional' }, { interpolation: 'arc' }), DEFAULT_MACHINE_SETTINGS)
    expect(climb.some((l) => l.startsWith('G3 '))).toBe(true)
    expect(conv.some((l) => l.startsWith('G2 '))).toBe(true)
    expect(arcRadiusMismatches(climb)).toEqual([])
    expect(arcRadiusMismatches(conv)).toEqual([])
  })
})
