import { describe, expect, it } from 'vitest'
import { buildPocketToolpath, generatePocketAdaptive } from './pocket'
import { phaseCRadii } from './pocketAdaptive'
import { engagementAngleFor } from './pocketAdaptiveMath'
import { simulateEngagement } from './pocketAdaptiveSim'
import { cornerPeelRadii } from './pocketCellAdaptive'
import { cellInscribed, cellLoop, cellWallDistance, lightenedCells, type LightCell } from './pocketLightened'
import { arcRadiusMismatches } from './gcodeTestUtils'
import { isWizardParamsValid } from './validation'
import { movePoints, type Move, type Point3D, type Toolpath } from './toolpath'
import { DEFAULT_MACHINE_SETTINGS } from '../types/machine'
import { DEFAULT_WIZARD_PARAMS, type PocketParams, type Point2D, type WizardParams } from '../types/wizard'

function params(pocket: Partial<PocketParams>, output: Partial<WizardParams['output']> = {}): WizardParams {
  return {
    ...DEFAULT_WIZARD_PARAMS,
    operation: 'pocket',
    pocket: {
      ...DEFAULT_WIZARD_PARAMS.pocket,
      shape: 'rectLightened',
      method: 'adaptive',
      toolDiameter: 4,
      totalDepth: 1,
      helixRadius: 1,
      offsetX: 0,
      offsetY: 0,
      ribWidth: 3,
      ...pocket,
    },
    feeds: { ...DEFAULT_WIZARD_PARAMS.feeds, startZ: 0, stepdown: 1 },
    output: { ...DEFAULT_WIZARD_PARAMS.output, ...output },
  }
}

describe('cornerPeelRadii (BL-83)', () => {
  it('matches the Rectangle phase C at 90°', () => {
    for (const [pct, hv] of [
      [10, 5],
      [5, 8],
      [20, 3],
    ]) {
      const theta = engagementAngleFor(pct)
      const rect = phaseCRadii(3, theta, hv)
      const general = cornerPeelRadii(3, theta, hv, Math.PI / 2)
      expect(general).toHaveLength(rect.length)
      general.forEach((r, i) => expect(r).toBeCloseTo(rect[i], 6))
    }
  })

  it('takes smaller steps into a sharper corner, still ending in it', () => {
    const theta = engagementAngleFor(10)
    const right = cornerPeelRadii(3, theta, 5, Math.PI / 2)
    const acute = cornerPeelRadii(3, theta, 5, Math.PI / 6)
    expect(acute.length).toBeGreaterThan(right.length)
    expect(acute[acute.length - 1]).toBe(0)
  })
})

// Sizes kept small (tool 4, rib 3) so the grid simulation stays fast; the
// corner angles are what matters, not the scale.
const SCENARIOS: [string, Partial<PocketParams>][] = [
  ['X-grid 1×1 (34° / 113° corners), climb', { lightLayout: 'xgrid', lightCountX: 1, lightCountY: 1, width: 36, height: 24 }],
  ['Triangles 4×1 (Warren), climb', { lightLayout: 'triangles', lightCountX: 4, lightCountY: 1, width: 72, height: 24 }],
  ['Triangles 4×1, conventional', { lightLayout: 'triangles', lightCountX: 4, lightCountY: 1, width: 72, height: 24, cutDirection: 'conventional' }],
  ['Triangles 1×1 (two right triangles), 20%', { lightLayout: 'triangles', lightCountX: 1, lightCountY: 1, width: 30, height: 24, optimalLoadPercent: 20 }],
  ['Triangles 6×1 (sharp ~20° corners), 5%', { lightLayout: 'triangles', lightCountX: 6, lightCountY: 1, width: 54, height: 36, optimalLoadPercent: 5 }],
]

// The toolpath split at its rapids: one run of moves per cell (rapids hop
// between cells above the stock, which the XY-only simulator can't tell).
function cellRuns(tp: Toolpath): Toolpath[] {
  const runs: Toolpath[] = []
  let current: Point3D = tp.start
  let run: Toolpath | null = null
  for (const move of tp.moves) {
    if (move.kind === 'rapid') {
      run = null
    } else {
      if (!run) {
        run = { start: current, moves: [] }
        runs.push(run)
      }
      run.moves.push(move)
    }
    current = move.to
  }
  return runs
}

function distanceToTriangle(p: Point2D, v: Point2D[]): number {
  let best = Infinity
  for (let i = 0; i < v.length; i++) {
    const a = v[i]
    const b = v[(i + 1) % v.length]
    const ex = b.x - a.x
    const ey = b.y - a.y
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / (ex * ex + ey * ey)))
    best = Math.min(best, Math.hypot(p.x - a.x - ex * t, p.y - a.y - ey * t))
  }
  return best
}

// Area (mm²) of cell material a run's LINK moves remove that no cutting
// move had removed before them — links must only travel through cleared
// area. (The simulator's link reading counts edge contact with the uncut
// boundary; returning along a peel arc's chord touches it at sharp corners
// without removing anything, so the removed area is the honest measure.)
function linkRemovedArea(run: Toolpath, cell: LightCell, R: number, grid: number, onlyLink?: (i: number) => boolean): number {
  const tc = cellLoop(cell, R)
  const minX = Math.min(...tc.map((q) => q.x)) - R - 1
  const minY = Math.min(...tc.map((q) => q.y)) - R - 1
  const nx = Math.ceil((Math.max(...tc.map((q) => q.x)) + R + 1 - minX) / grid)
  const ny = Math.ceil((Math.max(...tc.map((q) => q.y)) + R + 1 - minY) / grid)
  const material = new Uint8Array(nx * ny)
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) material[j * nx + i] = cellWallDistance(cell, { x: minX + i * grid, y: minY + j * grid }) >= 0 ? 1 : 0
  const cleared = new Uint8Array(nx * ny)
  let byLinks = 0
  // Row spans of the tool disk: cuts just fill them, links count what they
  // newly clear.
  const stamp = (x: number, y: number, count: boolean) => {
    const j0 = Math.max(0, Math.ceil((y - R - minY) / grid))
    const j1 = Math.min(ny - 1, Math.floor((y + R - minY) / grid))
    for (let j = j0; j <= j1; j++) {
      const dy = minY + j * grid - y
      const half = Math.sqrt(Math.max(0, R * R - dy * dy))
      const i0 = Math.max(0, Math.ceil((x - half - minX) / grid))
      const i1 = Math.min(nx - 1, Math.floor((x + half - minX) / grid))
      if (i1 < i0) continue
      if (count) for (let k = j * nx + i0; k <= j * nx + i1; k++) if (material[k] && !cleared[k]) byLinks++
      cleared.fill(1, j * nx + i0, j * nx + i1 + 1)
    }
  }
  let cur: Point3D = run.start
  run.moves.forEach((m, idx) => {
    const count = m.kind === 'link' && (onlyLink ? onlyLink(idx) : true)
    let prev = cur
    for (const q of movePoints(cur, m)) {
      const n = Math.max(1, Math.ceil(Math.hypot(q.x - prev.x, q.y - prev.y) / (grid / 2)))
      for (let t = 1; t <= n; t++) stamp(prev.x + ((q.x - prev.x) * t) / n, prev.y + ((q.y - prev.y) * t) / n, count)
      prev = q
    }
    cur = m.to
  })
  return byLinks * grid * grid
}

function cellOf(cells: LightCell[], p: Point2D): LightCell {
  return cells.reduce((best, c) => (cellWallDistance(c, p) > cellWallDistance(best, p) ? c : best))
}

describe('Rectangle Lightened Adaptive — simulated coverage and walls, per cell', () => {
  it.each(SCENARIOS)('%s', (_label, over) => {
    const p = params(over)
    expect(isWizardParamsValid(p)).toBe(true)
    const R = p.pocket.toolDiameter / 2
    const cells = lightenedCells(p.pocket)
    const runs = cellRuns(buildPocketToolpath(p))
    expect(runs).toHaveLength(cells.length)
    // The first and the last cell — in both layouts they differ in shape
    // (end triangles vs inner ones); simulating every cell takes minutes.
    for (const run of [runs[0], runs[runs.length - 1]]) {
      const cell = cellOf(cells, run.moves[0].to)
      const tc = cellLoop(cell, R) // tool-center region
      // The cell as a round tool can reach it: within R of the tool-center triangle.
      const reach = (x: number, y: number) => (cellWallDistance(cell, { x, y }) >= R ? 0 : distanceToTriangle({ x, y }, tc))
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
      // Links only travel through cleared area: at most grid noise at the walls.
      expect(linkRemovedArea(run, cell, R, 0.05)).toBeLessThan(0.1)
    }
  }, 60_000)
})

describe('Rectangle Lightened Adaptive — moves and G-code', () => {
  it('every corner arc starts and ends on the tool-center wall (touches both sides)', () => {
    const p = params(SCENARIOS[1][1])
    const R = p.pocket.toolDiameter / 2
    const cells = lightenedCells(p.pocket)
    const tp = buildPocketToolpath(p)
    let cur: Point3D = tp.start
    let checked = 0
    for (const m of tp.moves) {
      if (m.type === 'arc' && m.sweep < Math.PI && m.kind === 'cut') {
        const cell = cellOf(cells, m.to)
        expect(cellWallDistance(cell, cur)).toBeCloseTo(R, 6)
        expect(cellWallDistance(cell, m.to)).toBeCloseTo(R, 6)
        checked++
      }
      cur = m.to
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('climb cuts only G3, conventional only G2; arcs start on their own circle', () => {
    const climb = generatePocketAdaptive(params(SCENARIOS[1][1], { interpolation: 'arc' }), DEFAULT_MACHINE_SETTINGS)
    const conv = generatePocketAdaptive(params(SCENARIOS[2][1], { interpolation: 'arc' }), DEFAULT_MACHINE_SETTINGS)
    expect(climb.some((l) => l.startsWith('G3 '))).toBe(true)
    expect(climb.some((l) => l.startsWith('G2 '))).toBe(false)
    expect(conv.some((l) => l.startsWith('G2 '))).toBe(true)
    expect(conv.some((l) => l.startsWith('G3 '))).toBe(false)
    expect(arcRadiusMismatches(climb)).toEqual([])
    expect(arcRadiusMismatches(conv)).toEqual([])
  })

  it('finishing laps follow the cut direction', () => {
    const tp = buildPocketToolpath(params({ ...SCENARIOS[2][1], finishingEnabled: true, stockToLeave: 0.3 }))
    const finishArcs = tp.moves.filter((m) => m.kind === 'finish' && m.type === 'arc')
    expect(finishArcs.length).toBeGreaterThan(0)
    expect(finishArcs.every((m) => m.type === 'arc' && m.direction === 'cw')).toBe(true)
  })
})
