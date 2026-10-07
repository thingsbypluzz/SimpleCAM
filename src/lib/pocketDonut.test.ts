import { describe, expect, it } from 'vitest'
import { DEFAULT_WIZARD_PARAMS, type WizardParams } from '../types/wizard'
import { DEFAULT_MACHINE_SETTINGS } from '../types/machine'
import { buildPocketToolpath, generatePocketAdaptive, generatePocketSpiral } from './pocket'
import { pocketDonutWalls, pocketRoughDonutWalls } from './pocketGeometry'
import { simulateEngagement } from './pocketAdaptiveSim'
import { engagementAngleFor } from './pocketAdaptiveMath'
import { planDonutAdaptive, sectorAdaptiveExceedsLimits } from './pocketSectorAdaptive'
import { arcRadiusMismatches } from './gcodeTestUtils'
import { movePoints, type Move, type Point3D } from './toolpath'
import { isPocketIslandValid, isPocketSizeValid, isPocketStockToLeaveValid, isPocketToolDiameterValid, isWizardParamsValid, OPERATION_RULES } from './validation'
import { stockModel } from './stockModel'
import { presetLabel } from './presetLabel'

// ⌀45 with a ⌀20 island and a 3.175 mm tool: tool-center walls at 11.5875
// and 20.9125 mm.
function donut(patch: Partial<WizardParams['pocket']> = {}, feeds: Partial<WizardParams['feeds']> = {}): WizardParams {
  return {
    ...DEFAULT_WIZARD_PARAMS,
    operation: 'pocket',
    pocket: { ...DEFAULT_WIZARD_PARAMS.pocket, shape: 'donut', ...patch },
    feeds: { ...DEFAULT_WIZARD_PARAMS.feeds, ...feeds },
  }
}

interface Sample {
  move: Move
  p: Point3D
}

function samples(params: WizardParams): Sample[] {
  const toolpath = buildPocketToolpath(params)
  const out: Sample[] = []
  let current = toolpath.start
  for (const move of toolpath.moves) {
    for (const p of movePoints(current, move)) out.push({ move, p })
    current = move.to
  }
  return out
}

const rho = (p: Point3D) => Math.hypot(p.x, p.y)

describe('Pocket Donut geometry', () => {
  it('puts the tool-center walls a tool radius inside the ring', () => {
    const { inner, outer } = pocketDonutWalls(donut().pocket)
    expect(inner).toBeCloseTo(10 + 1.5875, 6)
    expect(outer).toBeCloseTo(22.5 - 1.5875, 6)
  })

  it('moves both walls in by Stock to Leave for roughing', () => {
    const rough = pocketRoughDonutWalls(donut({ finishingEnabled: true, stockToLeave: 0.3 }).pocket)
    expect(rough.inner).toBeCloseTo(11.8875, 6)
    expect(rough.outer).toBeCloseTo(20.6125, 6)
  })

})

describe('Pocket Donut Spiral', () => {
  it('starts over the first lap, next to the island', () => {
    const { inner } = pocketDonutWalls(donut().pocket)
    const toolpath = buildPocketToolpath(donut())
    expect(toolpath.start.x).toBeCloseTo(inner, 6)
    expect(toolpath.start.y).toBeCloseTo(0, 6)
  })

  it('keeps every cutting point between the two walls', () => {
    for (const zTransitionMode of ['plunge', 'helix'] as const) {
      const params = donut({ zTransitionMode })
      const { inner, outer } = pocketDonutWalls(params.pocket)
      for (const { move, p } of samples(params)) {
        if (move.kind === 'rapid') continue
        expect(rho(p)).toBeGreaterThanOrEqual(inner - 1e-6)
        expect(rho(p)).toBeLessThanOrEqual(outer + 1e-6)
      }
    }
  })

  it('Plunge goes straight down, then cuts a full lap on the island wall', () => {
    const params = donut({ zTransitionMode: 'plunge' }, { stepdown: 4 })
    const { inner } = pocketDonutWalls(params.pocket)
    const moves = buildPocketToolpath(params).moves
    const plunge = moves.findIndex((m) => m.kind === 'plunge')
    expect(moves[plunge].to.z).toBeCloseTo(-4, 6)
    const lap = moves[plunge + 1]
    expect(lap.kind).toBe('cut')
    expect(lap.to.x).toBeCloseTo(inner, 6)
    expect(lap.to.y).toBeCloseTo(0, 6)
    expect(lap.to.z).toBeCloseTo(-4, 6)
  })

  it('Helix ramps down along the first lap and ends with a flat lap', () => {
    const params = donut({ zTransitionMode: 'helix', rampAngleDeg: 2 }, { stepdown: 4 })
    const { inner } = pocketDonutWalls(params.pocket)
    const cut = samples(params).filter((s) => s.move.kind === 'cut')
    // No plunge at all — the descent is the helix.
    expect(buildPocketToolpath(params).moves.some((m) => m.kind === 'plunge')).toBe(false)
    const descending = cut.filter((s) => s.p.z > -4 + 1e-6)
    expect(descending.length).toBeGreaterThan(0)
    for (const s of descending) expect(rho(s.p)).toBeCloseTo(inner, 4)
    // 2° on a lap of 2π·11.5875 mm is about 2.54 mm per turn: 4 mm takes two turns.
    const pitch = 2 * Math.PI * inner * Math.tan((2 * Math.PI) / 180)
    expect(pitch).toBeGreaterThan(2)
    expect(pitch).toBeLessThan(4)
  })

  it('reaches the outer wall and never steps out more than Stepover', () => {
    const params = donut({ stepoverPercent: 40 })
    const { inner, outer } = pocketDonutWalls(params.pocket)
    const cut = samples(params).filter((s) => s.move.kind === 'cut' && s.p.z < -1e-6)
    const radii = cut.map((s) => rho(s.p))
    expect(Math.max(...radii)).toBeCloseTo(outer, 5)
    expect(Math.min(...radii)).toBeCloseTo(inner, 5)
    // Full laps sit on rings at most a stepover apart.
    const laps = [...new Set(buildPocketToolpath(params).moves.filter((m) => m.kind === 'cut' && 'center' in m).map((m) => rho(m.to).toFixed(4)))]
      .map(Number)
      .sort((a, b) => a - b)
    for (let i = 1; i < laps.length; i++) expect(laps[i] - laps[i - 1]).toBeLessThanOrEqual(3.175 * 0.4 + 1e-6)
  })

  it('a ring as wide as the tool is a single slot lap', () => {
    const params = donut({ diameter: 30, islandDiameter: 30 - 2 * 3.175, zTransitionMode: 'plunge' })
    expect(isPocketToolDiameterValid(params.pocket)).toBe(true)
    const cut = samples(params).filter((s) => s.move.kind === 'cut')
    for (const s of cut) expect(rho(s.p)).toBeCloseTo(15 - 1.5875, 5)
  })

  it('retracts to Safe Z between levels and returns over the entry point', () => {
    const params = donut({ zTransitionMode: 'plunge' }, { stepdown: 2 })
    const { inner } = pocketDonutWalls(params.pocket)
    const moves = buildPocketToolpath(params).moves
    // A rapid at Safe Z that follows the retract to Safe Z is the XY traverse.
    const rapidsXY = moves.filter(
      (m, i) => i > 0 && m.kind === 'rapid' && m.to.z === params.feeds.safeZ && moves[i - 1].to.z === params.feeds.safeZ,
    )
    expect(rapidsXY).toHaveLength(1)
    for (const m of rapidsXY) expect(rho(m.to)).toBeCloseTo(inner, 5)
  })
})

describe('Pocket Donut finishing pass', () => {
  const params = donut({ finishingEnabled: true, stockToLeave: 0.3, zTransitionMode: 'plunge' }, { stepdown: 2 })
  const walls = pocketDonutWalls(params.pocket)
  const rough = pocketRoughDonutWalls(params.pocket)

  it('roughs only inside the band and finishes on both walls', () => {
    let onOuter = 0
    let onIsland = 0
    for (const { move, p } of samples(params)) {
      if (move.kind === 'rapid') continue
      if (move.kind === 'finish') {
        expect(rho(p)).toBeGreaterThanOrEqual(walls.inner - 1e-6)
        expect(rho(p)).toBeLessThanOrEqual(walls.outer + 1e-6)
        if (Math.abs(rho(p) - walls.outer) < 1e-6) onOuter++
        if (Math.abs(rho(p) - walls.inner) < 1e-6) onIsland++
      } else if (p.z < -1e-6) {
        expect(rho(p)).toBeGreaterThanOrEqual(rough.inner - 1e-6)
        expect(rho(p)).toBeLessThanOrEqual(rough.outer + 1e-6)
      }
    }
    expect(onOuter).toBeGreaterThan(10)
    expect(onIsland).toBeGreaterThan(10)
  })

  it('laps the outer wall CCW and the island CW — climb on both', () => {
    const laps = buildPocketToolpath(params).moves.filter(
      (m) => m.kind === 'finish' && 'center' in m && Math.abs(m.sweep - 2 * Math.PI) < 1e-9,
    )
    // Two levels, two walls each.
    expect(laps).toHaveLength(4)
    const dirs = laps.map((m) => ('direction' in m ? m.direction : null))
    expect(dirs).toEqual(['ccw', 'cw', 'ccw', 'cw'])
    expect(rho(laps[0].to)).toBeCloseTo(walls.outer, 6)
    expect(rho(laps[1].to)).toBeCloseTo(walls.inner, 6)
  })

  it('a ring with no room for a lead arc is entered straight across the stock', () => {
    // Ring width = tool + both stocks: the roughed band is a single lap.
    const tight = donut({ diameter: 30, islandDiameter: 30 - 2 * 3.175 - 4 * 0.3, finishingEnabled: true, stockToLeave: 0.3 })
    expect(isPocketStockToLeaveValid(tight.pocket)).toBe(true)
    const w = pocketDonutWalls(tight.pocket)
    const finish = samples(tight).filter((s) => s.move.kind === 'finish')
    expect(finish.some((s) => Math.abs(rho(s.p) - w.outer) < 1e-6)).toBe(true)
    expect(finish.some((s) => Math.abs(rho(s.p) - w.inner) < 1e-6)).toBe(true)
    for (const s of finish) {
      expect(rho(s.p)).toBeGreaterThanOrEqual(w.inner - 1e-6)
      expect(rho(s.p)).toBeLessThanOrEqual(w.outer + 1e-6)
    }
  })
})

describe('Pocket Donut validation', () => {
  it('accepts the default Donut', () => {
    expect(isWizardParamsValid(donut())).toBe(true)
    expect(isWizardParamsValid(donut({ zTransitionMode: 'helix', helixRadius: 99 }))).toBe(true)
  })

  it('rejects an island that is missing or as large as the circle', () => {
    expect(isPocketIslandValid(donut({ islandDiameter: 0 }).pocket)).toBe(false)
    expect(isPocketIslandValid(donut({ islandDiameter: 45 }).pocket)).toBe(false)
    expect(isPocketSizeValid(donut({ islandDiameter: 45 }).pocket)).toBe(false)
    // Other shapes ignore the field.
    expect(isPocketIslandValid({ ...donut({ islandDiameter: 0 }).pocket, shape: 'circle' })).toBe(true)
  })

  it('rejects a tool wider than the ring', () => {
    expect(isPocketToolDiameterValid(donut({ diameter: 30, islandDiameter: 25 }).pocket)).toBe(false)
    expect(isWizardParamsValid(donut({ diameter: 30, islandDiameter: 25 }))).toBe(false)
  })

  it('rejects stock that leaves the roughing no lap of its own', () => {
    const p = donut({ diameter: 30, islandDiameter: 30 - 2 * 3.175 - 0.4, finishingEnabled: true, stockToLeave: 0.3 }).pocket
    expect(isPocketToolDiameterValid(p)).toBe(true)
    expect(isPocketStockToLeaveValid(p)).toBe(false)
  })

  it('feeds the calculator the first lap as the ramp path', () => {
    const helix = donut({ zTransitionMode: 'helix' })
    expect(OPERATION_RULES.pocket.rampPathLength(helix)).toBeCloseTo(2 * Math.PI * 11.5875, 4)
    expect(OPERATION_RULES.pocket.rampPathLength(donut({ zTransitionMode: 'plunge' }))).toBeNull()
  })

  it('reports the outer tool-center wall as its footprint', () => {
    expect(OPERATION_RULES.pocket.footprint(donut()).x).toBeCloseTo(45 - 3.175, 6)
  })
})

describe('Pocket Donut stock and labels', () => {
  const sheet = { minX: -40, minY: -40, maxX: 40, maxY: 40 }
  const area = (ring: [number, number][]) => {
    let a = 0
    for (let i = 0; i < ring.length; i++) {
      const [x0, y0] = ring[i]
      const [x1, y1] = ring[(i + 1) % ring.length]
      a += x0 * y1 - x1 * y0
    }
    return Math.abs(a / 2)
  }

  it('cuts a ring with a floor and leaves the island standing', () => {
    const model = stockModel([donut()], sheet, true)
    expect(model).not.toBeNull()
    expect(model!.floors).toHaveLength(1)
    expect(model!.floors[0].z).toBeCloseTo(-4, 6)
    const floor = model!.floors[0].region
    expect(floor).toHaveLength(1)
    // One polygon with a hole: the outer circle and the island.
    expect(floor[0]).toHaveLength(2)
    const ringArea = area(floor[0][0] as [number, number][]) - area(floor[0][1] as [number, number][])
    expect(ringArea).toBeGreaterThan(Math.PI * (22.5 ** 2 - 10 ** 2) * 0.98)
    expect(ringArea).toBeLessThan(Math.PI * (22.5 ** 2 - 10 ** 2))
    // The top keeps the island: sheet minus the ring.
    const top = model!.top.reduce((sum, poly) => sum + area(poly[0] as [number, number][]) - poly.slice(1).reduce((s, h) => s + area(h as [number, number][]), 0), 0)
    expect(top).toBeCloseTo(80 * 80 - ringArea, 0)
  })

  it('names itself in the preset label', () => {
    expect(presetLabel(donut())).toBe('Pocket Donut ⌀45/⌀20 • Spiral')
    expect(presetLabel(donut({ method: 'adaptive' }))).toBe('Pocket Donut ⌀45/⌀20 • Adaptive')
  })
})

// ⌀45 / island ⌀20 / 3.175 mm tool: the tool-center band is 11.5875…20.9125,
// so the circle touching both walls has radius 4.6625 on the mid circle
// 16.25.
describe('Pocket Donut Adaptive (BL-110)', () => {
  const adaptive = (patch: Partial<WizardParams['pocket']> = {}, feeds: Partial<WizardParams['feeds']> = {}) =>
    donut({ method: 'adaptive', helixRadius: 1, optimalLoadPercent: 15, ...patch }, feeds)

  it('plans one wing all the way around the ring', () => {
    const plan = planDonutAdaptive({ x: 0, y: 0 }, { rIn: 11.5875, rOut: 20.9125, toolRadius: 1.5875, theta: engagementAngleFor(15), helixRadius: 1, sign: 1 })!
    expect(plan.root.r).toBeCloseTo(4.6625, 6)
    expect(plan.center.x).toBeCloseTo(16.25, 6)
    expect(plan.branches).toHaveLength(1)
    const wing = plan.branches[0]
    expect(wing.complete).toBe(true)
    expect(sectorAdaptiveExceedsLimits(plan)).toBe(false)
    // Many small steps, every circle on the mid circle, the last one back on the first.
    expect(wing.circles.length).toBeGreaterThan(20)
    for (const c of wing.circles) expect(Math.hypot(c.c.x, c.c.y)).toBeCloseTo(16.25, 6)
    const last = wing.circles[wing.circles.length - 1]
    expect(last.c.x).toBeCloseTo(16.25, 6)
    expect(last.c.y).toBeCloseTo(0, 6)
    // Angles only ever advance, each step well under the cap.
    let prev = 0
    for (const c of wing.circles.slice(1, -1)) {
      const a = (Math.atan2(c.c.y, c.c.x) + 2 * Math.PI) % (2 * Math.PI)
      expect(a).toBeGreaterThan(prev)
      expect(a - prev).toBeLessThan(Math.PI / 2)
      prev = a
    }
  })

  it('has no room without a ring wider than the tool', () => {
    expect(planDonutAdaptive({ x: 0, y: 0 }, { rIn: 10, rOut: 10, toolRadius: 1.5, theta: 1, helixRadius: 0.5, sign: 1 })).toBeNull()
  })

  it('enters with a helix in the middle of the ring width', () => {
    const params = adaptive()
    const toolpath = buildPocketToolpath(params)
    expect(toolpath.start.x).toBeCloseTo(16.25 + 1, 6)
    expect(toolpath.start.y).toBeCloseTo(0, 6)
    expect(toolpath.moves.some((m) => m.kind === 'plunge')).toBe(false)
    const firstCut = toolpath.moves.find((m) => m.kind === 'cut')!
    expect('center' in firstCut && firstCut.center.x).toBeCloseTo(16.25, 6)
  })

  it('differs from Spiral and keeps every cutting point between the walls', () => {
    const params = adaptive()
    expect(generatePocketAdaptive(params, DEFAULT_MACHINE_SETTINGS)).not.toEqual(generatePocketSpiral(params, DEFAULT_MACHINE_SETTINGS))
    const { inner, outer } = pocketDonutWalls(params.pocket)
    for (const { move, p } of samples(params)) {
      if (move.kind === 'rapid') continue
      expect(rho(p)).toBeGreaterThanOrEqual(inner - 1e-6)
      expect(rho(p)).toBeLessThanOrEqual(outer + 1e-6)
    }
  })

  it('stays down between levels', () => {
    const params = adaptive({}, { stepdown: 2 })
    const moves = buildPocketToolpath(params).moves
    // One rapid down to Start Z, nothing else above the stock.
    expect(moves.filter((m) => m.kind === 'rapid')).toHaveLength(1)
    expect(Math.min(...moves.map((m) => m.to.z))).toBeCloseTo(-4, 6)
  })

  it('emits arcs whose ends sit on their own circles, in both directions', () => {
    for (const cutDirection of ['climb', 'conventional'] as const) {
      const params = adaptive({ cutDirection })
      const arcParams = { ...params, output: { ...params.output, interpolation: 'arc' as const } }
      expect(arcRadiusMismatches(generatePocketAdaptive(arcParams, DEFAULT_MACHINE_SETTINGS))).toEqual([])
    }
  })

  it.each(['climb', 'conventional'] as const)('clears the whole ring within the walls (%s)', (cutDirection) => {
    const params = adaptive({ cutDirection }, { stepdown: 4 })
    const R = params.pocket.toolDiameter / 2
    const { inner, outer } = pocketDonutWalls(params.pocket)
    const run = buildPocketToolpath(params)
    const helix = new Set<number>()
    let cur: Point3D = run.start
    run.moves.forEach((m, i) => {
      if (m.type === 'arc' && Math.abs(m.center.x - 16.25) < 1e-9 && Math.abs(Math.hypot(cur.x - 16.25, cur.y) - 1) < 1e-6) helix.add(i)
      cur = m.to
    })
    const r = simulateEngagement(run, {
      toolRadius: R,
      cell: 0.05,
      minChip: 0.1,
      trueArcs: true,
      bounds: { minX: -24, maxX: 24, minY: -24, maxY: 24 },
      isMaterial: (x, y) => Math.hypot(x, y) <= outer + R && Math.hypot(x, y) >= inner - R,
      isInterior: (x, y) => Math.hypot(x, y) <= outer + R - 0.1 && Math.hypot(x, y) >= inner - R + 0.1,
      toolCenterOvershoot: (x, y) => Math.max(Math.hypot(x, y) - outer, inner - Math.hypot(x, y)),
      isUnmeasured: (i) => helix.has(i),
    })
    expect(r.uncutInteriorCells, JSON.stringify(r.uncutAt)).toBe(0)
    expect(r.maxWallViolation).toBeLessThan(1e-6)
    // Linking moves run through already-cleared area — only wall slivers.
    expect(r.maxLinkEngagementDeg).toBeLessThan(15)
  }, 60_000)

  it('finishes the outer wall and the island the way the roughing cuts', () => {
    const laps = (cutDirection: 'climb' | 'conventional') =>
      buildPocketToolpath(adaptive({ cutDirection, finishingEnabled: true, stockToLeave: 0.3 }, { stepdown: 4 }))
        .moves.filter((m) => m.kind === 'finish' && 'center' in m && Math.abs(m.sweep - 2 * Math.PI) < 1e-9)
        .map((m) => ('direction' in m ? m.direction : null))
    expect(laps('climb')).toEqual(['ccw', 'cw'])
    expect(laps('conventional')).toEqual(['cw', 'ccw'])
    // Conventional leads stay inside the ring too.
    const params = adaptive({ cutDirection: 'conventional', finishingEnabled: true, stockToLeave: 0.3 })
    const w = pocketDonutWalls(params.pocket)
    for (const { move, p } of samples(params)) {
      if (move.kind !== 'finish') continue
      expect(rho(p)).toBeGreaterThanOrEqual(w.inner - 1e-6)
      expect(rho(p)).toBeLessThanOrEqual(w.outer + 1e-6)
    }
  })

  it('needs a helix that fits in half the ring width', () => {
    expect(isWizardParamsValid(adaptive())).toBe(true)
    // Half the band is 4.66 mm, but the tool radius (1.5875) is the lower ceiling.
    expect(isWizardParamsValid(adaptive({ helixRadius: 1.6 }))).toBe(false)
    // A ring barely wider than the tool: half the band is 0.5 mm.
    const narrow = { diameter: 30, islandDiameter: 30 - 2 * 3.175 - 2 }
    expect(isWizardParamsValid(adaptive({ ...narrow, helixRadius: 0.4 }))).toBe(true)
    expect(isWizardParamsValid(adaptive({ ...narrow, helixRadius: 0.6 }))).toBe(false)
    // A ring exactly as wide as the tool has no room for Adaptive at all.
    expect(isWizardParamsValid(adaptive({ diameter: 30, islandDiameter: 30 - 2 * 3.175, helixRadius: 0.4 }))).toBe(false)
  })

  it('feeds the calculator its own helix as the ramp path and Optimal Load as the width', () => {
    expect(OPERATION_RULES.pocket.rampPathLength(adaptive())).toBeCloseTo(2 * Math.PI * 1, 6)
    expect(OPERATION_RULES.pocket.engagement(adaptive())).toEqual({ kind: 'optimalLoad', percent: 15 })
  })
})
