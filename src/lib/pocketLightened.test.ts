import { describe, expect, it } from 'vitest'
import {
  cellInscribed,
  cellLoop,
  cellWallDistance,
  lightenedCells,
  lightenedCellsOrNull,
  loopLength,
  loopNearestFraction,
  loopPointAt,
  type LightCell,
} from './pocketLightened'
import { DEFAULT_WIZARD_PARAMS, type PocketParams } from '../types/wizard'
import type { Point2D } from '../types/wizard'

const pocket = (patch: Partial<PocketParams>): PocketParams => ({
  ...DEFAULT_WIZARD_PARAMS.pocket,
  offsetX: 0,
  offsetY: 0,
  ...patch,
})

function polygonArea(v: Point2D[]): number {
  let a = 0
  for (let i = 0; i < v.length; i++) a += v[i].x * v[(i + 1) % v.length].y - v[(i + 1) % v.length].x * v[i].y
  return a / 2
}

const triangleArea = (c: LightCell) => (c.kind === 'triangle' ? polygonArea(c.vertices) : 0)

describe('Rectangle Lightened — Triangles N×M', () => {
  it('N diagonals give N+1 cells per row, tiling the area when there are no ribs', () => {
    const cells = lightenedCells(pocket({ shape: 'rectLightened', lightLayout: 'triangles', lightCountX: 4, lightCountY: 1, width: 120, height: 40, ribWidth: 0 }))
    expect(cells).toHaveLength(5)
    expect(cells.every((c) => c.kind === 'triangle' && triangleArea(c) > 0)).toBe(true) // CCW
    expect(cells.reduce((s, c) => s + triangleArea(c), 0)).toBeCloseTo(120 * 40, 6)
  })

  it('M rows tile the area too (isogrid), N = 1 splits each row in two', () => {
    const cells = lightenedCells(pocket({ shape: 'rectLightened', lightLayout: 'triangles', lightCountX: 1, lightCountY: 3, width: 60, height: 30, ribWidth: 0 }))
    expect(cells).toHaveLength(6)
    expect(cells.reduce((s, c) => s + triangleArea(c), 0)).toBeCloseTo(60 * 30, 6)
  })

  it('cells fill the given area up to its edge and keep a rib apart from each other', () => {
    const p = pocket({ shape: 'rectLightened', lightLayout: 'triangles', lightCountX: 4, lightCountY: 2, width: 120, height: 60, ribWidth: 4 })
    const cells = lightenedCells(p)
    expect(cells).toHaveLength(10)
    for (const c of cells) {
      if (c.kind !== 'triangle') continue
      for (const v of c.vertices) {
        expect(Math.abs(v.x)).toBeLessThanOrEqual(60 + 1e-9)
        expect(Math.abs(v.y)).toBeLessThanOrEqual(30 + 1e-9)
        // No vertex of one cell lies inside (or within a rib of) another.
        for (const other of cells) {
          if (other === c) continue
          expect(cellWallDistance(other, v)).toBeLessThanOrEqual(-4 + 1e-6)
        }
      }
    }
  })
})

describe('Rectangle Lightened — X-grid N×M', () => {
  it('4 triangles per sub-rectangle, tiling the area without ribs', () => {
    const cells = lightenedCells(pocket({ shape: 'rectLightened', lightLayout: 'xgrid', lightCountX: 3, lightCountY: 2, width: 90, height: 40, ribWidth: 0 }))
    expect(cells).toHaveLength(24)
    expect(cells.reduce((s, c) => s + triangleArea(c), 0)).toBeCloseTo(90 * 40, 6)
  })

  it('drops cells a very wide rib swallows', () => {
    const cells = lightenedCellsOrNull(pocket({ shape: 'rectLightened', lightLayout: 'xgrid', lightCountX: 1, lightCountY: 1, width: 20, height: 20, ribWidth: 30 }))
    expect(cells.every((c) => c === null)).toBe(true)
  })
})

describe('Circle Lightened', () => {
  const p = pocket({ shape: 'circleLightened', diameter: 80, spokeCount: 5, hubDiameter: 16, spokeStartAngle: 90, ribWidth: 4 })

  it('one annular-sector cell per spoke gap, CCW loops inside the ring', () => {
    const cells = lightenedCells(p)
    expect(cells).toHaveLength(5)
    for (const c of cells) {
      const loop = cellLoop(c, 0)
      expect(polygonArea(loop)).toBeGreaterThan(0)
      for (const q of loop) {
        const r = Math.hypot(q.x, q.y)
        expect(r).toBeLessThanOrEqual(40 + 1e-9)
        expect(r).toBeGreaterThanOrEqual(8 - 1e-9)
      }
    }
  })

  it('hub 0 lets the spokes meet: the loop ends in an apex', () => {
    const [c] = lightenedCells({ ...p, hubDiameter: 0 })
    expect(cellLoop(c, 0).length).toBeGreaterThan(3)
    expect(cellInscribed(c).radius).toBeGreaterThan(0)
  })
})

describe('cell loops and distances', () => {
  const tri: LightCell = { kind: 'triangle', vertices: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }] }

  it('incircle of a 3-4-5 triangle', () => {
    const { center, radius } = cellInscribed(tri)
    expect(radius).toBeCloseTo(1, 9)
    expect(center.x).toBeCloseTo(1, 9)
    expect(center.y).toBeCloseTo(1, 9)
  })

  it('loop(d) keeps exactly d from the wall (triangle: scaled about the incenter)', () => {
    for (const q of cellLoop(tri, 0.4)) expect(cellWallDistance(tri, q)).toBeCloseTo(0.4, 9)
    expect(cellLoop(tri, 1)).toHaveLength(1)
  })

  it('sector loop(d) keeps d from the wall', () => {
    const [c] = lightenedCells(pocket({ shape: 'circleLightened', diameter: 80, spokeCount: 4, hubDiameter: 10, spokeStartAngle: 0, ribWidth: 4 }))
    // Never closer than d; hub-arc vertices sit on the circumscribed radius
    // (so the chords between them clear the hub), a hair farther.
    const gaps = cellLoop(c, 2).map((q) => cellWallDistance(c, q))
    expect(Math.min(...gaps)).toBeCloseTo(2, 6)
    expect(Math.max(...gaps)).toBeLessThan(2.05)
    const { center, radius } = cellInscribed(c)
    expect(cellWallDistance(c, center)).toBeCloseTo(radius, 6)
  })

  it('loopPointAt walks the perimeter by length and wraps', () => {
    const square = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
    expect(loopLength(square)).toBe(4)
    expect(loopPointAt(square, 0.375)).toEqual({ x: 1, y: 0.5 })
    expect(loopPointAt(square, 1.25)).toEqual({ x: 1, y: 0 })
    expect(loopNearestFraction(square, { x: 2, y: 0.5 })).toBeCloseTo(0.375, 9)
  })
})
