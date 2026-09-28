import { describe, expect, it } from 'vitest'
import { buildPocketToolpath, generatePocketAdaptive, generatePocketSpiral } from './pocket'
import { arcRadiusMismatches } from './gcodeTestUtils'
import { pocketRoughCircleWallRadius, pocketRoughRectWallHalfDims } from './pocketGeometry'
import { isPocketFinishFeedValid, isPocketStockToLeaveValid, isWizardParamsValid } from './validation'
import { DEFAULT_MACHINE_SETTINGS } from '../types/machine'
import { DEFAULT_WIZARD_PARAMS, type WizardParams } from '../types/wizard'
import type { Move } from './toolpath'

function buildParams(pocket: Partial<WizardParams['pocket']>, feeds: Partial<WizardParams['feeds']> = {}): WizardParams {
  return {
    ...DEFAULT_WIZARD_PARAMS,
    operation: 'pocket',
    pocket: { ...DEFAULT_WIZARD_PARAMS.pocket, finishingEnabled: true, stockToLeave: 0.5, finishFeed: 450, ...pocket },
    feeds: { ...DEFAULT_WIZARD_PARAMS.feeds, stepdown: 1, ...feeds },
    output: { ...DEFAULT_WIZARD_PARAMS.output, interpolation: 'arc' },
  }
}

const finishMoves = (moves: Move[]) => moves.filter((m) => m.kind === 'finish')

describe('Pocket roughing wall (BL-42)', () => {
  it('insets the wall by Stock to Leave only when finishing is on', () => {
    const on = buildParams({ shape: 'rectCentered', width: 20, height: 10, toolDiameter: 2 }).pocket
    expect(pocketRoughRectWallHalfDims(on)).toEqual({ halfWidth: 8.5, halfHeight: 3.5 })
    expect(pocketRoughRectWallHalfDims({ ...on, finishingEnabled: false })).toEqual({ halfWidth: 9, halfHeight: 4 })
    const circle = buildParams({ shape: 'circle', diameter: 20, toolDiameter: 2 }).pocket
    expect(pocketRoughCircleWallRadius(circle)).toBe(8.5)
  })
})

describe('Pocket finishing pass — Rectangle', () => {
  // Center (0,0), final wall half-dims (9,4), roughing (8.5,3.5). Entry on
  // the longer (bottom) side at (0,-4); lead radius = tool radius 1.
  const params = buildParams({ shape: 'rectCentered', width: 20, height: 10, toolDiameter: 2, totalDepth: 2 })
  const moves = buildPocketToolpath(params).moves
  const finish = finishMoves(moves)

  it('runs one lap per Stepdown level after the whole roughing', () => {
    const firstFinish = moves.findIndex((m) => m.kind === 'finish')
    expect(moves.slice(firstFinish).some((m) => m.kind === 'cut')).toBe(false)
    // Per level: lead-in arc, 4 corners + back to entry, lead-out arc, chord
    // back — except after the last lap, which retracts from the lead-out end.
    expect(finish).toHaveLength(2 * 8 - 1)
    const last = finish[finish.length - 1]
    expect(last.type === 'arc' && last.to.x).toBeCloseTo(1)
    expect(last.to.y).toBeCloseTo(-3)
    expect(finish.filter((m) => m.type === 'arc')).toHaveLength(4)
  })

  it('enters along a CCW quarter arc ending tangent on the wall, from inside the roughed area', () => {
    const leadIn = finish[0]
    expect(leadIn.type).toBe('arc')
    if (leadIn.type !== 'arc') return
    expect(leadIn.direction).toBe('ccw')
    expect(leadIn.center.x).toBeCloseTo(0)
    expect(leadIn.center.y).toBeCloseTo(-3)
    expect(leadIn.to.x).toBeCloseTo(0)
    expect(leadIn.to.y).toBeCloseTo(-4)
    // Lap goes +X first (climb), through every corner.
    expect(finish.slice(1, 5).map((m) => [m.to.x, m.to.y])).toEqual([
      [9, -4],
      [9, 4],
      [-9, 4],
      [-9, -4],
    ])
  })

  it('descends only at the lead-in start, inside the roughing wall, and never retracts between laps', () => {
    const firstFinish = moves.findIndex((m) => m.kind === 'finish')
    const plunges = moves.slice(firstFinish - 1).filter((m) => m.kind === 'plunge')
    expect(plunges.map((m) => m.to.z)).toEqual([-1, -2])
    for (const p of plunges) {
      expect(p.to.x).toBeCloseTo(-1)
      expect(p.to.y).toBeCloseTo(-3)
    }
    const rapidsAfter = moves.slice(firstFinish).filter((m) => m.kind === 'rapid')
    expect(rapidsAfter).toHaveLength(0)
  })

  it('cuts the laps at Finish Feed, consistent G2/G3', () => {
    const lines = generatePocketSpiral(params, DEFAULT_MACHINE_SETTINGS)
    expect(lines.some((l) => /^G1 X9 Y-4 Z-1 F450$/.test(l))).toBe(true)
    expect(arcRadiusMismatches(lines)).toEqual([])
  })

  it('Adaptive Conventional finishes CW, entering on the longer side of a tall pocket', () => {
    const tall = buildParams({
      shape: 'rectCentered',
      method: 'adaptive',
      cutDirection: 'conventional',
      width: 10,
      height: 20,
      toolDiameter: 2,
      helixRadius: 0.8,
    })
    const leadIn = finishMoves(buildPocketToolpath(tall).moves)[0]
    expect(leadIn.type === 'arc' && leadIn.direction).toBe('cw')
    expect(leadIn.to.x).toBeCloseTo(4)
    expect(leadIn.to.y).toBeCloseTo(0)
    expect(arcRadiusMismatches(generatePocketAdaptive(tall, DEFAULT_MACHINE_SETTINGS))).toEqual([])
  })
})

describe('Pocket finishing pass — Circle', () => {
  it('laps the final wall once per level with tangent quarter-arc leads', () => {
    const params = buildParams({ shape: 'circle', diameter: 20, toolDiameter: 2, totalDepth: 3 })
    const finish = finishMoves(buildPocketToolpath(params).moves)
    const laps = finish.filter((m) => m.type === 'arc' && m.sweep === 2 * Math.PI)
    expect(laps).toHaveLength(3)
    for (const lap of laps) expect(lap.type === 'arc' && lap.radius).toBe(9)
    const leads = finish.filter((m) => m.type === 'arc' && Math.abs(m.sweep - Math.PI / 2) < 1e-9)
    expect(leads).toHaveLength(6)
    expect(arcRadiusMismatches(generatePocketSpiral(params, DEFAULT_MACHINE_SETTINGS))).toEqual([])
  })

  it('falls back to a half-arc lead from the center when no quarter arc fits inside the roughing', () => {
    // Wall radius 1.5, roughing 0.5: 2·0.5² < 1.5², no quarter arc lands in
    // the roughed area.
    const params = buildParams({ shape: 'circle', diameter: 6, toolDiameter: 3, stockToLeave: 1, totalDepth: 1, helixRadius: 0.5 })
    expect(isWizardParamsValid(params)).toBe(true)
    const finish = finishMoves(buildPocketToolpath(params).moves)
    const leadIn = finish[0]
    expect(leadIn.type === 'arc' && leadIn.sweep).toBe(Math.PI)
    const leadOut = finish[finish.length - 1]
    expect(leadOut.to.x).toBeCloseTo(0)
    expect(leadOut.to.y).toBeCloseTo(0)
  })
})

describe('Pocket finishing validation', () => {
  it('is vacuously valid when off', () => {
    const off = buildParams({ finishingEnabled: false, stockToLeave: -1, finishFeed: 0 }).pocket
    expect(isPocketStockToLeaveValid(off)).toBe(true)
    expect(isPocketFinishFeedValid(off)).toBe(true)
  })

  it('needs 0 < stock ≤ tool radius, a roughing wall, and a positive Finish Feed', () => {
    const base = buildParams({ shape: 'rectCentered', width: 20, height: 10, toolDiameter: 2 }).pocket
    expect(isPocketStockToLeaveValid(base)).toBe(true)
    expect(isPocketStockToLeaveValid({ ...base, stockToLeave: 0 })).toBe(false)
    expect(isPocketStockToLeaveValid({ ...base, stockToLeave: 1 })).toBe(true)
    expect(isPocketStockToLeaveValid({ ...base, stockToLeave: 1.01 })).toBe(false)
    // Shorter side 3 with a 2 mm tool: wall half 0.5, no room for 0.5 stock.
    expect(isPocketStockToLeaveValid({ ...base, height: 3, stockToLeave: 0.5 })).toBe(false)
    expect(isPocketFinishFeedValid({ ...base, finishFeed: 0 })).toBe(false)
  })
})
