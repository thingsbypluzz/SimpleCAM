import { describe, expect, it } from 'vitest'
import { DEFAULT_MACHINE_SETTINGS } from '../types/machine'
import { DEFAULT_WIZARD_PARAMS, type FacingParams, type WizardParams } from '../types/wizard'
import { buildFacingToolpath, generateFacing } from './facing'

const params = (facing: Partial<FacingParams> = {}, feeds: Partial<WizardParams['feeds']> = {}): WizardParams => ({
  ...DEFAULT_WIZARD_PARAMS,
  operation: 'facing',
  facing: {
    ...DEFAULT_WIZARD_PARAMS.facing,
    side: 'bottom',
    toolDiameter: 6,
    length: 22,
    removal: 1,
    stepover: 0.5,
    lead: 0,
    clearance: 2,
    totalDepth: 4,
    cutDirection: 'conventional',
    linkingFeed: 2000,
    ...facing,
  },
  feeds: { ...DEFAULT_WIZARD_PARAMS.feeds, stepdown: 4, feedrateXY: 1500, plungeRate: 300, safeZ: 5, startZ: 0, ...feeds },
})

describe('buildFacingToolpath', () => {
  it('cuts a 22 mm bottom side with a ⌀6 tool from X-3 to X25, 0.5 mm per pass', () => {
    const lines = generateFacing(params(), DEFAULT_MACHINE_SETTINGS)
    const body = lines.slice(lines.indexOf('G0 X-3 Y-5'))
    expect(body.slice(0, 11)).toEqual([
      'G0 X-3 Y-5',
      'G0 Z0',
      'G1 Z-4 F300',
      'G1 X-3 Y-2.5 Z-4 F1500',
      'G1 X25 Y-2.5 Z-4 F1500',
      'G1 X25 Y-5 Z-4 F2000',
      'G1 X-3 Y-5 Z-4 F2000',
      'G1 X-3 Y-2 Z-4 F1500',
      'G1 X25 Y-2 Z-4 F1500',
      'G1 X25 Y-5 Z-4 F2000',
      'G0 Z5',
    ])
  })

  it('climb reverses the travel', () => {
    const { start } = buildFacingToolpath(params({ cutDirection: 'climb' }))
    expect(start).toEqual({ x: 25, y: -5, z: 5 })
  })

  it('repeats every sideways pass on each Z level, returning beside the material', () => {
    const { moves } = buildFacingToolpath(params({}, { stepdown: 2 }))
    const plunges = moves.filter((m) => m.kind === 'plunge').map((m) => m.to.z)
    expect(plunges).toEqual([-2, -4])
    // 2 levels × 2 passes, each one a feed-in and a cut along the side.
    expect(moves.filter((m) => m.kind === 'cut')).toHaveLength(8)
    // The second level's plunge happens back at the start, clear of the edge.
    const secondPlunge = moves.filter((m) => m.kind === 'plunge')[1]
    expect(secondPlunge.to).toMatchObject({ x: -3, y: -5 })
  })

  it('never rapids below Safe Z', () => {
    const { moves } = buildFacingToolpath(params({}, { stepdown: 1 }))
    const rapids = moves.filter((m) => m.kind === 'rapid')
    expect(rapids).toHaveLength(1)
    expect(rapids[0].to.z).toBe(0)
  })

  it('works the right side along Y, material toward -X', () => {
    const { start, moves } = buildFacingToolpath(params({ side: 'right', cutDirection: 'climb' }))
    // Climb on the right side travels toward -Y: start beyond the top end.
    expect(start).toEqual({ x: 5, y: 25, z: 5 })
    const lastCut = moves.filter((m) => m.kind === 'cut').at(-1)!
    expect(lastCut.to).toMatchObject({ x: 2, y: -3 })
  })
})
