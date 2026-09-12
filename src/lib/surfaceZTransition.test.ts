import { describe, expect, it } from 'vitest'
import { buildLevelDescents, zTransitionMoves } from './surfaceZTransition'

const baseOpts = {
  stepdown: 1,
  feedrateXY: 800,
  plungeRate: 300,
  helixRadius: 2,
  cornerX: 5,
  cornerY: 5,
}

describe('zTransitionMoves — plunge', () => {
  it('is a single straight vertical G1 line for the whole descend distance', () => {
    const lines = zTransitionMoves({ ...baseOpts, fromZ: 0, toZ: -2, mode: 'plunge', interpolation: 'linear' })
    expect(lines).toEqual(['G1 Z-2 F300'])
  })
})

describe('zTransitionMoves — helix', () => {
  it('one arc turn per stepdown increment, centered so the arc starts/ends exactly on the corner', () => {
    const lines = zTransitionMoves({ ...baseOpts, fromZ: 0, toZ: -2, mode: 'helix', interpolation: 'arc' })
    // computeDepthPasses(2, 1) -> [1, 1] -> 2 turns. Center is offset -helixRadius
    // from the corner on X, so I/J = (centerX-startX, centerY-startY) = (-2, 0).
    expect(lines).toEqual(['G3 X5 Y5 Z-1 I-2 J0 F800', 'G3 X5 Y5 Z-2 I-2 J0 F800'])
  })

  it('linear interpolation approximates each turn with the shared 72-segment polygon', () => {
    const lines = zTransitionMoves({ ...baseOpts, fromZ: 0, toZ: -2, mode: 'helix', interpolation: 'linear' })
    // 2 turns * 72 segments per turn.
    expect(lines).toHaveLength(144)
    expect(lines.every((l) => l.startsWith('G1 X'))).toBe(true)
  })

  it('a single stepdown-sized transition (the common between-level case) is exactly one turn', () => {
    const lines = zTransitionMoves({ ...baseOpts, fromZ: 0, toZ: -1, mode: 'helix', interpolation: 'arc' })
    expect(lines).toEqual(['G3 X5 Y5 Z-1 I-2 J0 F800'])
  })
})

describe('buildLevelDescents', () => {
  it('level 0 starts at startZ with no retract; later levels retract by stepdown before descending', () => {
    expect(buildLevelDescents(0, 3, 1)).toEqual([
      { fromZ: 0, toZ: -1 },
      { fromZ: 0, toZ: -2 },
      { fromZ: -1, toZ: -3 },
    ])
  })

  it('a single level (totalDepth === stepdown) needs no retract at all', () => {
    expect(buildLevelDescents(0, 1, 1)).toEqual([{ fromZ: 0, toZ: -1 }])
  })

  it('a non-zero startZ extends the total travel distance (startZ + totalDepth), same convention as the engine', () => {
    // Total descent from +2 down to -2 is 4mm -> 4 stepdown-1 levels.
    expect(buildLevelDescents(2, 2, 1)).toEqual([
      { fromZ: 2, toZ: 1 },
      { fromZ: 2, toZ: 0 },
      { fromZ: 1, toZ: -1 },
      { fromZ: 0, toZ: -2 },
    ])
  })

  it('the last (possibly shorter) level uses whatever remainder computeDepthPasses leaves', () => {
    expect(buildLevelDescents(0, 2.5, 1)).toEqual([
      { fromZ: 0, toZ: -1 },
      { fromZ: 0, toZ: -2 },
      { fromZ: -1, toZ: -2.5 },
    ])
  })
})
