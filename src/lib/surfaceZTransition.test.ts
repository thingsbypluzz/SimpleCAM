import { describe, expect, it } from 'vitest'
import { fmt } from './format'
import {
  buildLevelDescents,
  entryHelixExceedsTurnLimit,
  helixCenterFor,
  helixDirectionFor,
  helixPitchForRampAngle,
  levelEntryZ,
  zTransitionMoves,
} from './surfaceZTransition'

// rasterDirection: 'y' matches the historical (pre-direction-aware) center
// offset exactly — kept as the default here so most expected G-code below
// reads the same as before that fix; a dedicated describe block below
// covers 'x' specifically.
const baseOpts = {
  rampAngleDeg: 2,
  feedrateXY: 800,
  plungeRate: 300,
  helixRadius: 2,
  cornerX: 5,
  cornerY: 5,
  rasterDirection: 'y' as const,
}

describe('helixDirectionFor', () => {
  it("direction 'y' turns CCW (its outside-of-material center offset is already reachable under CCW)", () => {
    expect(helixDirectionFor('y')).toBe('ccw')
  })

  it("direction 'x' turns CW instead — CCW would force the center inside the material", () => {
    expect(helixDirectionFor('x')).toBe('cw')
  })
})

describe('helixCenterFor', () => {
  it("direction 'y': center offset -X of the corner (first raster line runs +Y — exit tangent must be +Y, and -X is outside the material)", () => {
    expect(helixCenterFor(5, 5, 2, 'y')).toEqual({ x: 3, y: 5 })
  })

  it("direction 'x': center offset -Y of the corner (CW exit tangent +X, and -Y is outside the material — +Y, the CCW answer, would sweep over it)", () => {
    expect(helixCenterFor(5, 5, 2, 'x')).toEqual({ x: 5, y: 3 })
  })
})

describe('zTransitionMoves — plunge', () => {
  it('is a single straight vertical G1 line for the whole descend distance', () => {
    const lines = zTransitionMoves({ ...baseOpts, fromZ: 0, toZ: -2, mode: 'plunge', interpolation: 'linear' })
    expect(lines).toEqual(['G1 Z-2 F300'])
  })
})

describe('zTransitionMoves — helix', () => {
  // r = 2, 2° -> 2π·2·tan 2° ≈ 0.4388 mm per turn.
  const pitch = helixPitchForRampAngle(2, 2)

  it('descends at the ramp angle — turns of one pitch each, the last one shorter, ending exactly on toZ at the corner', () => {
    const lines = zTransitionMoves({ ...baseOpts, fromZ: 0, toZ: -1, mode: 'helix', interpolation: 'arc' })
    // Direction 'y' centers -helixRadius on X -> I/J = (-2, 0).
    expect(lines).toEqual([
      `G3 X5 Y5 Z-${fmt(pitch)} I-2 J0 F800`,
      `G3 X5 Y5 Z-${fmt(2 * pitch)} I-2 J0 F800`,
      'G3 X5 Y5 Z-1 I-2 J0 F800',
    ])
  })

  it('does not depend on Stepdown — a steeper angle means fewer turns', () => {
    const lines = zTransitionMoves({ ...baseOpts, rampAngleDeg: 10, fromZ: 0, toZ: -1, mode: 'helix', interpolation: 'arc' })
    // 2π·2·tan 10° ≈ 2.216 mm per turn -> one turn covers the whole 1 mm.
    expect(lines).toEqual(['G3 X5 Y5 Z-1 I-2 J0 F800'])
  })

  it("direction 'x' centers the arc on the Y axis instead and turns CW, so the exit tangent matches an X-running raster while the loop stays outside the material", () => {
    const lines = zTransitionMoves({ ...baseOpts, rampAngleDeg: 10, rasterDirection: 'x', fromZ: 0, toZ: -1, mode: 'helix', interpolation: 'arc' })
    // center = (5, 3) -> I/J = (5-5, 3-5) = (0, -2). CW -> G2, not G3.
    expect(lines).toEqual(['G2 X5 Y5 Z-1 I0 J-2 F800'])
  })

  it('linear interpolation approximates each turn with the shared 72-segment polygon', () => {
    const lines = zTransitionMoves({ ...baseOpts, fromZ: 0, toZ: -1, mode: 'helix', interpolation: 'linear' })
    // 3 turns * 72 segments per turn.
    expect(lines).toHaveLength(216)
    expect(lines.every((l) => l.startsWith('G1 X'))).toBe(true)
  })
})

describe('helixPitchForRampAngle', () => {
  it('is the turn length times tan(angle)', () => {
    expect(helixPitchForRampAngle(1.5, 2)).toBeCloseTo(2 * Math.PI * 1.5 * Math.tan((2 * Math.PI) / 180))
    expect(helixPitchForRampAngle(1.5, 2)).toBeCloseTo(0.3291, 4)
  })
})

describe('levelEntryZ', () => {
  it('starts level 0 at Start Z and every later level 0.5 mm above the previous floor', () => {
    expect(levelEntryZ(0, 0, 0)).toBe(0)
    expect(levelEntryZ(1, -6, 0)).toBe(-5.5)
    expect(levelEntryZ(3, -18, 2)).toBe(-17.5)
  })

  it('never starts above Start Z', () => {
    expect(levelEntryZ(1, -0.2, 0)).toBe(0)
  })
})

describe('entryHelixExceedsTurnLimit', () => {
  it('counts turns from each level entry, not from Start Z', () => {
    expect(entryHelixExceedsTurnLimit(0, 30, 6, 1.5, 2)).toBe(false)
    // A 0.01 mm helix at 0.5° drops ~0.00055 mm per turn — far over 5000 turns for a 6 mm level.
    expect(entryHelixExceedsTurnLimit(0, 30, 6, 0.01, 0.5)).toBe(true)
  })
})

describe('buildLevelDescents', () => {
  it('splits totalDepth+startZ into stepdown-sized target depths', () => {
    expect(buildLevelDescents(0, 3, 1)).toEqual([{ toZ: -1 }, { toZ: -2 }, { toZ: -3 }])
  })

  it('a single level (totalDepth === stepdown)', () => {
    expect(buildLevelDescents(0, 1, 1)).toEqual([{ toZ: -1 }])
  })

  it('a non-zero startZ extends the total travel distance (startZ + totalDepth), same convention as the engine', () => {
    // Total descent from +2 down to -2 is 4mm -> 4 stepdown-1 levels.
    expect(buildLevelDescents(2, 2, 1)).toEqual([{ toZ: 1 }, { toZ: 0 }, { toZ: -1 }, { toZ: -2 }])
  })

  it('the last (possibly shorter) level uses whatever remainder computeDepthPasses leaves', () => {
    expect(buildLevelDescents(0, 2.5, 1)).toEqual([{ toZ: -1 }, { toZ: -2 }, { toZ: -2.5 }])
  })
})
