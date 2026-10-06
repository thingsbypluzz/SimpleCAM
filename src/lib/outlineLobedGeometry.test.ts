import { describe, expect, it } from 'vitest'
import { DEFAULT_WIZARD_PARAMS, type OutlineParams } from '../types/wizard'
import {
  arcPoint,
  distanceToLoop,
  insetLoop,
  lobedInsideLoop,
  lobedOutsideGapTooNarrow,
  lobedUnionLoop,
  lobesAttached,
  loopBounds,
  loopLength,
  loopOutermostOnRay,
  loopPointAtLength,
  loopPolygon,
  loopStartingAt,
  reverseLoop,
  type Loop,
} from './outlineLobedGeometry'

const lobed = (patch: Partial<OutlineParams> = {}): OutlineParams => ({
  ...DEFAULT_WIZARD_PARAMS.outline,
  shape: 'lobedCircle',
  lobeMainDiameter: 60,
  lobeCount: 5,
  lobePitchDiameter: 70,
  lobeDiameter: 16,
  lobeStartAngle: 90,
  ...patch,
})

// Every arc ends where the next one starts.
function isClosed(loop: Loop): boolean {
  return loop.every((arc, i) => {
    const end = arcPoint(arc, 1)
    const next = arcPoint(loop[(i + 1) % loop.length], 0)
    return Math.hypot(end.x - next.x, end.y - next.y) < 1e-6
  })
}

function polygonArea(points: { x: number; y: number }[]): number {
  let area = 0
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length]
    area += (p.x * q.y - q.x * p.y) / 2
  })
  return area
}

describe('lobedUnionLoop', () => {
  it('one lobe: two arcs meeting at the two circle intersections', () => {
    const loop = lobedUnionLoop(lobed({ lobeCount: 1, lobeStartAngle: 0 }))
    expect(loop).toHaveLength(2)
    expect(isClosed(loop)).toBe(true)
    // Both vertices lie on both circles: 30 from the origin, 8 from (35, 0).
    for (const arc of loop) {
      const v = arcPoint(arc, 0)
      expect(Math.hypot(v.x, v.y)).toBeCloseTo(30, 9)
      expect(Math.hypot(v.x - 35, v.y)).toBeCloseTo(8, 9)
    }
  })

  it('five lobes: ten arcs alternating main circle / lobe, counter-clockwise', () => {
    const loop = lobedUnionLoop(lobed())
    expect(loop).toHaveLength(10)
    expect(isClosed(loop)).toBe(true)
    expect(loop.filter((arc) => arc.circle === 0)).toHaveLength(5)
    expect(new Set(loop.filter((arc) => arc.circle > 0).map((arc) => arc.circle)).size).toBe(5)
    expect(polygonArea(loopPolygon(loop))).toBeGreaterThan(Math.PI * 30 * 30)
    // Tip of the first lobe at 90°: 35 + 8 from the origin.
    expect(loopBounds(loop)!.maxY).toBeCloseTo(43, 9)
  })

  it('grown by a tool radius it is the same shape with bigger circles', () => {
    const loop = lobedUnionLoop(lobed(), 3)
    expect(loop).toHaveLength(10)
    expect(loop.every((arc) => Math.abs(arc.radius - (arc.circle === 0 ? 33 : 11)) < 1e-9)).toBe(true)
  })

  it('lobes that overlap each other leave no main-circle arcs, and still one closed loop', () => {
    const loop = lobedUnionLoop(lobed({ lobeCount: 12, lobeDiameter: 30 }))
    expect(isClosed(loop)).toBe(true)
    expect(loop).toHaveLength(12)
    expect(loop.every((arc) => arc.circle > 0)).toBe(true)
  })

  it('a lobe hidden inside the main circle adds nothing', () => {
    const loop = lobedUnionLoop(lobed({ lobePitchDiameter: 20, lobeDiameter: 10 }))
    expect(loop).toHaveLength(1)
    expect(loop[0].sweep).toBeCloseTo(2 * Math.PI)
  })

  it('survives degenerate input', () => {
    expect(lobedUnionLoop(lobed({ lobeMainDiameter: 0, lobeDiameter: 0 }))).toEqual([])
    expect(isClosed(lobedUnionLoop(lobed({ lobePitchDiameter: 0 })))).toBe(true)
    expect(isClosed(lobedUnionLoop(lobed({ lobeCount: 0 })))).toBe(true)
  })
})

describe('lobesAttached', () => {
  it('needs every lobe to cross the main circle', () => {
    expect(lobesAttached(lobed())).toBe(true)
    expect(lobesAttached(lobed({ lobePitchDiameter: 80, lobeDiameter: 16 }))).toBe(false) // apart: 40 > 30 + 8
    expect(lobesAttached(lobed({ lobePitchDiameter: 20, lobeDiameter: 10 }))).toBe(false) // hidden inside
    expect(lobesAttached(lobed({ lobePitchDiameter: 10, lobeDiameter: 100 }))).toBe(false) // swallows the main circle
  })
})

describe('insetLoop / lobedInsideLoop', () => {
  it('shrinks every arc and rounds each vertex with a fillet of the inset distance', () => {
    const nominal = lobedUnionLoop(lobed())
    const inset = insetLoop(nominal, 3)!
    expect(inset).toHaveLength(20)
    expect(isClosed(inset)).toBe(true)
    const fillets = inset.filter((arc) => arc.circle === -1)
    expect(fillets).toHaveLength(10)
    expect(fillets.every((arc) => !arc.ccw && Math.abs(arc.radius - 3) < 1e-9)).toBe(true)
    // Every point of the inset path is exactly the inset distance from the outline.
    for (const p of loopPolygon(inset)) expect(distanceToLoop(nominal, p)).toBeGreaterThan(3 - 1e-6)
  })

  it('insetting the Outside tool path gives back the outline with rounded notches', () => {
    const cut = insetLoop(lobedUnionLoop(lobed(), 3), 3)!
    const nominal = lobedUnionLoop(lobed())
    // The cut shape contains the nominal one; the difference is the ten fillets.
    const extra = polygonArea(loopPolygon(cut)) - polygonArea(loopPolygon(nominal))
    expect(extra).toBeGreaterThan(0)
    expect(extra).toBeLessThan(60)
  })

  it('Inside: the tool has to fit the lobes and their necks', () => {
    expect(lobedInsideLoop(lobed(), 3)).not.toBeNull()
    // A lobe no wider than the tool.
    expect(lobedInsideLoop(lobed(), 8)).toBeNull()
    // Neck narrower than the tool: a lobe barely touching the main circle.
    expect(lobedInsideLoop(lobed({ lobePitchDiameter: 75, lobeDiameter: 16 }), 3)).toBeNull()
  })
})

describe('Outside gaps', () => {
  it('reports a gap between lobes narrower than the tool', () => {
    const tight = lobed({ lobeCount: 12, lobeDiameter: 17 }) // gap ≈ 1.1 mm at the pitch circle
    expect(lobedOutsideGapTooNarrow(tight, 0.4)).toBe(false)
    expect(lobedOutsideGapTooNarrow(tight, 3)).toBe(true)
    expect(lobedOutsideGapTooNarrow(lobed(), 3)).toBe(false)
  })
})

describe('loop helpers', () => {
  const loop = lobedUnionLoop(lobed())
  const length = loopLength(loop)

  it('walks the loop by length and wraps around', () => {
    const start = arcPoint(loop[0], 0)
    const again = loopPointAtLength(loop, length)
    expect(Math.hypot(start.x - again.x, start.y - again.y)).toBeLessThan(1e-6)
  })

  it('finds the outermost crossing of a ray: the tip of the first lobe', () => {
    const tip = loopPointAtLength(loop, loopOutermostOnRay(loop, Math.PI / 2))
    expect(tip.x).toBeCloseTo(0, 6)
    expect(tip.y).toBeCloseTo(43, 6)
  })

  it('restarts the loop anywhere without changing it', () => {
    const s = loopOutermostOnRay(loop, Math.PI / 2)
    const rotated = loopStartingAt(loop, s)
    expect(isClosed(rotated)).toBe(true)
    expect(loopLength(rotated)).toBeCloseTo(length, 9)
    expect(arcPoint(rotated[0], 0).y).toBeCloseTo(43, 6)
  })

  it('reverses to a clockwise loop of the same length', () => {
    const reversed = reverseLoop(loop)
    expect(isClosed(reversed)).toBe(true)
    expect(reversed.every((arc) => !arc.ccw)).toBe(true)
    expect(polygonArea(loopPolygon(reversed))).toBeCloseTo(-polygonArea(loopPolygon(loop)), 6)
  })
})
