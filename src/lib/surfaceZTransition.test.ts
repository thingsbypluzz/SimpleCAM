import { describe, expect, it } from 'vitest'
import { buildLevelDescents, helixCenterFor, zTransitionMoves } from './surfaceZTransition'

// rasterDirection: 'y' matches the historical (pre-direction-aware) center
// offset exactly — kept as the default here so most expected G-code below
// reads the same as before that fix; a dedicated describe block below
// covers 'x' specifically.
const baseOpts = {
  stepdown: 1,
  feedrateXY: 800,
  plungeRate: 300,
  helixRadius: 2,
  cornerX: 5,
  cornerY: 5,
  rasterDirection: 'y' as const,
}

describe('helixCenterFor', () => {
  it("direction 'y': center offset -X of the corner (first raster line runs +Y — exit tangent must be +Y)", () => {
    expect(helixCenterFor(5, 5, 2, 'y')).toEqual({ x: 3, y: 5 })
  })

  it("direction 'x': center offset +Y of the corner (first raster line runs +X — exit tangent must be +X)", () => {
    expect(helixCenterFor(5, 5, 2, 'x')).toEqual({ x: 5, y: 7 })
  })
})

describe('zTransitionMoves — plunge', () => {
  it('is a single straight vertical G1 line for the whole descend distance', () => {
    const lines = zTransitionMoves({ ...baseOpts, fromZ: 0, toZ: -2, mode: 'plunge', interpolation: 'linear' })
    expect(lines).toEqual(['G1 Z-2 F300'])
  })
})

describe('zTransitionMoves — helix', () => {
  it('one arc turn per stepdown increment, centered so the arc starts/ends exactly on the corner', () => {
    const lines = zTransitionMoves({ ...baseOpts, fromZ: 0, toZ: -2, mode: 'helix', interpolation: 'arc' })
    // computeDepthPasses(2, 1) -> [1, 1] -> 2 turns. Direction 'y' centers
    // -helixRadius on X, so I/J = (centerX-startX, centerY-startY) = (-2, 0).
    expect(lines).toEqual(['G3 X5 Y5 Z-1 I-2 J0 F800', 'G3 X5 Y5 Z-2 I-2 J0 F800'])
  })

  it("direction 'x' centers the arc on the Y axis instead, so the exit tangent matches an X-running raster", () => {
    const lines = zTransitionMoves({ ...baseOpts, rasterDirection: 'x', fromZ: 0, toZ: -1, mode: 'helix', interpolation: 'arc' })
    // center = (5, 7) -> I/J = (5-5, 7-5) = (0, 2).
    expect(lines).toEqual(['G3 X5 Y5 Z-1 I0 J2 F800'])
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
  it('level 0 starts at startZ with no retract; later levels retract all the way to Safe Z before descending', () => {
    expect(buildLevelDescents(0, 3, 1, 5)).toEqual([
      { fromZ: 0, toZ: -1 },
      { fromZ: 5, toZ: -2 },
      { fromZ: 5, toZ: -3 },
    ])
  })

  it('a single level (totalDepth === stepdown) needs no retract at all', () => {
    expect(buildLevelDescents(0, 1, 1, 5)).toEqual([{ fromZ: 0, toZ: -1 }])
  })

  it('a non-zero startZ extends the total travel distance (startZ + totalDepth), same convention as the engine', () => {
    // Total descent from +2 down to -2 is 4mm -> 4 stepdown-1 levels; every
    // level after the first retracts to the same Safe Z regardless of depth.
    expect(buildLevelDescents(2, 2, 1, 5)).toEqual([
      { fromZ: 2, toZ: 1 },
      { fromZ: 5, toZ: 0 },
      { fromZ: 5, toZ: -1 },
      { fromZ: 5, toZ: -2 },
    ])
  })

  it('the last (possibly shorter) level uses whatever remainder computeDepthPasses leaves', () => {
    expect(buildLevelDescents(0, 2.5, 1, 5)).toEqual([
      { fromZ: 0, toZ: -1 },
      { fromZ: 5, toZ: -2 },
      { fromZ: 5, toZ: -2.5 },
    ])
  })
})
