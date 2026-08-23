import { describe, expect, it } from 'vitest'
import { resolvePoints } from './positioning'
import type { GeometryParams } from '../types/wizard'

const base: GeometryParams = {
  toolDiameter: 3.175,
  holeDiameter: 8,
  totalDepth: 4,
  positioning: 'single',
  gridX: 50,
  gridY: 30,
  circleHoleCount: 5,
  circleDiameter: 45,
  circleStartAngle: 0,
  customPoints: [],
  offsetX: 0,
  offsetY: 0,
  tabsEnabled: false,
  tabHeight: 1,
  tabWidth: 3,
  tabCount: 4,
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
