import { describe, expect, it } from 'vitest'
import { DEFAULT_WIZARD_PARAMS, type FacingParams } from '../types/wizard'
import { facingBlockCorners, facingPassEdges, facingPoint, facingToolBounds, facingTravel } from './facingGeometry'

const facing = (patch: Partial<FacingParams> = {}): FacingParams => ({
  ...DEFAULT_WIZARD_PARAMS.facing,
  toolDiameter: 6,
  length: 22,
  removal: 1,
  stepover: 0.5,
  lead: 0,
  ...patch,
})

describe('facingPassEdges', () => {
  it('steps by the stepover and trims the last pass to the removal', () => {
    expect(facingPassEdges({ removal: 1, stepover: 0.5 })).toEqual([0.5, 1])
    const edges = facingPassEdges({ removal: 1.2, stepover: 0.5 })
    expect(edges).toHaveLength(3)
    expect(edges[2]).toBeCloseTo(1.2)
  })

  it('takes a single pass when the stepover exceeds the removal', () => {
    expect(facingPassEdges({ removal: 0.3, stepover: 0.5 })).toEqual([0.3])
  })
})

describe('facingPoint', () => {
  it('maps the four sides: u along the side, v into the material', () => {
    expect(facingPoint(facing({ side: 'bottom' }), 5, 2)).toEqual({ x: 5, y: 2 })
    expect(facingPoint(facing({ side: 'top' }), 5, 2)).toEqual({ x: 5, y: -2 })
    expect(facingPoint(facing({ side: 'left' }), 5, 2)).toEqual({ x: 2, y: 5 })
    expect(facingPoint(facing({ side: 'right' }), 5, 2)).toEqual({ x: -2, y: 5 })
  })

  it('places the origin along the side', () => {
    expect(facingPoint(facing({ originAlong: 'start' }), 0, 0)).toEqual({ x: 0, y: 0 })
    expect(facingPoint(facing({ originAlong: 'center' }), 0, 0)).toEqual({ x: -11, y: 0 })
    expect(facingPoint(facing({ originAlong: 'end' }), 0, 0)).toEqual({ x: -22, y: 0 })
  })

  it('places the origin on the raw or the finished edge, then applies the offset', () => {
    // Raw edge at 0: the finished edge is 1 mm into the material.
    expect(facingPoint(facing({ originAcross: 'raw' }), 0, 1)).toEqual({ x: 0, y: 1 })
    // Finished edge at 0: the raw edge sticks out 1 mm.
    expect(facingPoint(facing({ originAcross: 'finished' }), 0, 0)).toEqual({ x: 0, y: -1 })
    expect(facingPoint(facing({ originAcross: 'finished', side: 'right' }), 0, 0)).toEqual({ x: 1, y: 0 })
    expect(facingPoint(facing({ offsetX: 10, offsetY: -4 }), 0, 0)).toEqual({ x: 10, y: -4 })
  })
})

describe('facingTravel', () => {
  it('overruns both ends by the tool radius plus Lead', () => {
    expect(facingTravel(facing({ side: 'top' }))).toEqual({ from: -3, to: 25 })
    expect(facingTravel(facing({ side: 'top', lead: 2 }))).toEqual({ from: -5, to: 27 })
  })

  it('climb keeps the material on the right of travel under M3', () => {
    // Material on the right of travel direction t is at (t.y, -t.x).
    for (const side of ['bottom', 'top', 'left', 'right'] as const) {
      for (const cutDirection of ['climb', 'conventional'] as const) {
        const f = facing({ side, cutDirection })
        const { from, to } = facingTravel(f)
        const a = facingPoint(f, from, 0)
        const b = facingPoint(f, to, 0)
        const len = Math.hypot(b.x - a.x, b.y - a.y)
        const right = { x: (b.y - a.y) / len, y: -(b.x - a.x) / len }
        const inward = facingPoint(f, 0, 1)
        const origin = facingPoint(f, 0, 0)
        const dot = right.x * (inward.x - origin.x) + right.y * (inward.y - origin.y)
        expect(dot).toBeCloseTo(cutDirection === 'climb' ? 1 : -1)
      }
    }
  })
})

describe('facingToolBounds / facingBlockCorners', () => {
  it('spans the travel and from the return line to the last pass', () => {
    // Bottom side, ⌀6, clearance 2, removal 1: v from -5 to -2.
    expect(facingToolBounds(facing({ clearance: 2 }))).toEqual({ minX: -3, maxX: 25, minY: -5, maxY: -2 })
  })

  it('extends the block from the finished edge to the sheet edge', () => {
    const corners = facingBlockCorners(facing(), { minX: -20, maxX: 40, minY: -20, maxY: 40 })
    expect(corners).toEqual([
      { x: 0, y: 1 },
      { x: 22, y: 1 },
      { x: 22, y: 40 },
      { x: 0, y: 40 },
    ])
  })
})
