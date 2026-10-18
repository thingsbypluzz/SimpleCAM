import { describe, expect, it } from 'vitest'
import { gridCounts, MAX_GRID_COUNT, resolvePoints } from './positioning'
import { isGridCountValid, patternSpan } from './validation'
import { patternLabel, positioningLines } from '../config/positioningMeta'
import type { GeometryParams } from '../types/wizard'

const base: GeometryParams = {
  toolDiameter: 3.175,
  holeDiameter: 8,
  totalDepth: 4,
  holeBottom: 'open',
  positioning: 'single',
  gridX: 50,
  gridY: 30,
  gridCountX: 2,
  gridCountY: 2,
  circleHoleCount: 5,
  circleDiameter: 45,
  circleStartAngle: 0,
  customPointsText: '',
  customPoints: [],
  offsetX: 0,
  offsetY: 0,
  tabsEnabled: false,
  tabHeight: 1,
  tabWidth: 3,
  tabCount: 4,
  rampAngleDeg: 2,
  drillRetractMode: 'full',
  drillRetract: 0.5,
}

// cos/sin at non-trivial angles (e.g. 90°) leave floating-point epsilon
// residue in JS (Math.cos(Math.PI/2) !== 0 exactly), so circle points are
// checked with tolerance rather than exact equality.
function expectPointClose(actual: { x: number; y: number }, x: number, y: number) {
  expect(actual.x).toBeCloseTo(x, 9)
  expect(actual.y).toBeCloseTo(y, 9)
}

describe('resolvePoints', () => {
  it('single returns exactly (0,0)', () => {
    expect(resolvePoints({ ...base, positioning: 'single' })).toEqual([{ x: 0, y: 0 }])
  })

  it('grid returns the 4 corners in order', () => {
    expect(resolvePoints({ ...base, positioning: 'grid' })).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 30 },
      { x: 0, y: 30 },
    ])
  })

  it('gridCentered returns the 4 corners centered on (0,0), same order as grid', () => {
    expect(resolvePoints({ ...base, positioning: 'gridCentered' })).toEqual([
      { x: -25, y: -15 },
      { x: 25, y: -15 },
      { x: 25, y: 15 },
      { x: -25, y: 15 },
    ])
  })

  it('circle places the first point exactly at start angle 0 (radius, 0)', () => {
    const points = resolvePoints({
      ...base,
      positioning: 'circle',
      circleHoleCount: 4,
      circleDiameter: 20,
      circleStartAngle: 0,
    })
    expect(points).toHaveLength(4)
    expectPointClose(points[0], 10, 0)
  })

  it('circle distributes points evenly, counter-clockwise from +X', () => {
    const points = resolvePoints({
      ...base,
      positioning: 'circle',
      circleHoleCount: 4,
      circleDiameter: 20,
      circleStartAngle: 0,
    })
    // 90° apart, going counter-clockwise: (10,0) -> (0,10) -> (-10,0) -> (0,-10)
    expectPointClose(points[1], 0, 10)
    expectPointClose(points[2], -10, 0)
    expectPointClose(points[3], 0, -10)
  })

  it('circle honors a non-zero start angle', () => {
    const points = resolvePoints({
      ...base,
      positioning: 'circle',
      circleHoleCount: 1,
      circleDiameter: 20,
      circleStartAngle: 90,
    })
    expectPointClose(points[0], 0, 10)
  })

  it('circle with 0 holes returns an empty pattern', () => {
    expect(resolvePoints({ ...base, positioning: 'circle', circleHoleCount: 0 })).toEqual([])
  })

  it('offset shifts every circle point uniformly', () => {
    const points = resolvePoints({
      ...base,
      positioning: 'circle',
      circleHoleCount: 1,
      circleDiameter: 20,
      circleStartAngle: 0,
      offsetX: 5,
      offsetY: -3,
    })
    expectPointClose(points[0], 15, -3)
  })

  it('custom returns the provided points as-is', () => {
    const customPoints = [
      { x: 10, y: 10 },
      { x: -5, y: 20 },
    ]
    expect(resolvePoints({ ...base, positioning: 'custom', customPoints })).toEqual(customPoints)
  })

  it('offset shifts single', () => {
    expect(resolvePoints({ ...base, positioning: 'single', offsetX: 2, offsetY: -1.5 })).toEqual([
      { x: 2, y: -1.5 },
    ])
  })

  it('grid collapses to 2 holes when gridX is 0', () => {
    expect(resolvePoints({ ...base, positioning: 'grid', gridX: 0, gridY: 30 })).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 30 },
    ])
  })

  it('grid collapses to 2 holes when gridY is 0', () => {
    expect(resolvePoints({ ...base, positioning: 'grid', gridX: 50, gridY: 0 })).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
    ])
  })

  it('grid collapses to 1 hole when gridX and gridY are both 0', () => {
    expect(resolvePoints({ ...base, positioning: 'grid', gridX: 0, gridY: 0 })).toEqual([
      { x: 0, y: 0 },
    ])
  })

  it('gridCentered collapses to 2 symmetric holes when gridX is 0', () => {
    expect(resolvePoints({ ...base, positioning: 'gridCentered', gridX: 0, gridY: 30 })).toEqual([
      { x: 0, y: -15 },
      { x: 0, y: 15 },
    ])
  })

  it('gridCentered collapses to 2 symmetric holes when gridY is 0', () => {
    expect(resolvePoints({ ...base, positioning: 'gridCentered', gridX: 50, gridY: 0 })).toEqual([
      { x: -25, y: 0 },
      { x: 25, y: 0 },
    ])
  })

  it('gridCentered collapses to 1 hole when gridX and gridY are both 0', () => {
    expect(
      resolvePoints({ ...base, positioning: 'gridCentered', gridX: 0, gridY: 0 }),
    ).toEqual([{ x: 0, y: 0 }])
  })

  it('offset shifts every grid corner uniformly', () => {
    expect(resolvePoints({ ...base, positioning: 'grid', offsetX: 5, offsetY: 10 })).toEqual([
      { x: 5, y: 10 },
      { x: 55, y: 10 },
      { x: 55, y: 40 },
      { x: 5, y: 40 },
    ])
  })

  it('offset shifts every gridCentered corner uniformly', () => {
    expect(
      resolvePoints({ ...base, positioning: 'gridCentered', offsetX: 5, offsetY: 10 }),
    ).toEqual([
      { x: -20, y: -5 },
      { x: 30, y: -5 },
      { x: 30, y: 25 },
      { x: -20, y: 25 },
    ])
  })

  it('offset shifts every custom point uniformly', () => {
    const customPoints = [
      { x: 10, y: 10 },
      { x: -5, y: 20 },
    ]
    expect(
      resolvePoints({ ...base, positioning: 'custom', customPoints, offsetX: 1, offsetY: 1 }),
    ).toEqual([
      { x: 11, y: 11 },
      { x: -4, y: 21 },
    ])
  })
})

describe('grid with columns and rows (BL-117)', () => {
  const grid = (patch: Partial<GeometryParams>): GeometryParams => ({ ...base, positioning: 'grid', gridX: 10, gridY: 5, ...patch })

  it('2 × 2 is the lap around the rectangle it has always been', () => {
    expect(resolvePoints(grid({}))).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 0, y: 5 },
    ])
  })

  it('drills row by row, every other row backwards', () => {
    expect(resolvePoints(grid({ gridCountX: 3, gridCountY: 3 }))).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 5 },
      { x: 10, y: 5 },
      { x: 0, y: 5 },
      { x: 0, y: 10 },
      { x: 10, y: 10 },
      { x: 20, y: 10 },
    ])
  })

  it('centers the whole grid on the origin', () => {
    const points = resolvePoints(grid({ positioning: 'gridCentered', gridCountX: 4, gridCountY: 3 }))
    expect(points).toHaveLength(12)
    expect(Math.min(...points.map((p) => p.x))).toBe(-15)
    expect(Math.max(...points.map((p) => p.x))).toBe(15)
    expect(Math.min(...points.map((p) => p.y))).toBe(-5)
    expect(Math.max(...points.map((p) => p.y))).toBe(5)
  })

  it('a single column or row is a line of holes', () => {
    expect(resolvePoints(grid({ gridCountX: 4, gridCountY: 1 }))).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 30, y: 0 },
    ])
  })

  it('a spacing of 0 folds that axis, whatever its count', () => {
    expect(resolvePoints(grid({ gridX: 0, gridCountX: 5, gridCountY: 3 }))).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 5 },
      { x: 0, y: 10 },
    ])
    expect(gridCounts(grid({ gridX: 0, gridY: 0, gridCountX: 5, gridCountY: 3 }))).toEqual({ columns: 1, rows: 1 })
  })

  it('caps the counts and rounds them, so a typo cannot build thousands of holes', () => {
    expect(gridCounts(grid({ gridCountX: 1000, gridCountY: 2.4 }))).toEqual({ columns: MAX_GRID_COUNT, rows: 2 })
    expect(gridCounts(grid({ gridCountX: 0, gridCountY: -3 }))).toEqual({ columns: 1, rows: 1 })
  })

  it('applies the offset to every hole', () => {
    expect(resolvePoints(grid({ gridCountX: 3, gridCountY: 1, offsetX: 2, offsetY: -1 }))).toEqual([
      { x: 2, y: -1 },
      { x: 12, y: -1 },
      { x: 22, y: -1 },
    ])
  })
})

describe('grid validation and labels (BL-117)', () => {
  const geometry = (patch: Partial<GeometryParams>): GeometryParams => ({ ...base, positioning: 'grid', gridX: 10, gridY: 5, ...patch })

  it('accepts whole counts within the limits', () => {
    expect(isGridCountValid(geometry({ gridCountX: 10, gridCountY: 10 }))).toBe(true)
    expect(isGridCountValid(geometry({ gridCountX: 1, gridCountY: 1 }))).toBe(true)
    expect(isGridCountValid(geometry({ gridCountX: 20, gridCountY: 5 }))).toBe(true)
  })

  it('rejects fractions, zero, too many in a row and too many in all', () => {
    expect(isGridCountValid(geometry({ gridCountX: 2.5 }))).toBe(false)
    expect(isGridCountValid(geometry({ gridCountY: 0 }))).toBe(false)
    expect(isGridCountValid(geometry({ gridCountX: 21 }))).toBe(false)
    expect(isGridCountValid(geometry({ gridCountX: 20, gridCountY: 6 }))).toBe(false)
    // Other patterns ignore the counts.
    expect(isGridCountValid(geometry({ positioning: 'circle', gridCountX: 99 }))).toBe(true)
  })

  it('counts the folded axis as one when checking the total', () => {
    expect(isGridCountValid(geometry({ gridX: 0, gridCountX: 20, gridCountY: 20 }))).toBe(true)
  })

  it('names a grid by its counts and spacing, 2 × 2 as a rectangle, two holes as two holes', () => {
    expect(patternLabel(geometry({}))).toBe('Rectangle 10×5')
    expect(patternLabel(geometry({ gridCountX: 4, gridCountY: 3 }))).toBe('Grid 4×3 (10×5)')
    expect(patternLabel(geometry({ positioning: 'gridCentered', gridCountX: 4, gridCountY: 3 }))).toBe('Grid Centered 4×3 (10×5)')
    expect(patternLabel(geometry({ gridCountX: 2, gridCountY: 1 }))).toBe('2 Holes (10mm apart)')
    expect(patternLabel(geometry({ gridX: 0 }))).toBe('2 Holes (5mm apart)')
    expect(patternLabel(geometry({ gridCountX: 5, gridCountY: 1 }))).toBe('Grid 5×1 (10×5)')
    expect(positioningLines(geometry({ gridCountX: 4, gridCountY: 3 }))).toEqual(['GRID 4×3', '(10×5)'])
    expect(positioningLines(geometry({ positioning: 'gridCentered', gridCountX: 4, gridCountY: 3 }))).toEqual(['GRID 4×3', 'CENTERED', '(10×5)'])
  })

  it('spans the whole grid for the machine-fit check', () => {
    expect(patternSpan(geometry({ gridCountX: 4, gridCountY: 3, holeDiameter: 6 }))).toEqual({ x: 36, y: 16 })
  })
})
