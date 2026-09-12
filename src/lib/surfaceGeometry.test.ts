import { describe, expect, it } from 'vitest'
import { surfaceNominalBounds, surfaceStartCorner, surfaceStepoverMm, surfaceToolBounds } from './surfaceGeometry'

describe('surfaceNominalBounds', () => {
  it('rectCornered: origin at the bottom-left corner', () => {
    expect(surfaceNominalBounds({ shape: 'rectCornered', width: 40, height: 20, offsetX: 0, offsetY: 0 })).toEqual({
      minX: 0,
      maxX: 40,
      minY: 0,
      maxY: 20,
    })
  })

  it('rectCentered: origin at the center', () => {
    expect(surfaceNominalBounds({ shape: 'rectCentered', width: 40, height: 20, offsetX: 0, offsetY: 0 })).toEqual({
      minX: -20,
      maxX: 20,
      minY: -10,
      maxY: 10,
    })
  })

  it('offset translates the bounds without changing their size', () => {
    expect(surfaceNominalBounds({ shape: 'rectCornered', width: 40, height: 20, offsetX: 5, offsetY: -3 })).toEqual({
      minX: 5,
      maxX: 45,
      minY: -3,
      maxY: 17,
    })
  })
})

describe('surfaceToolBounds', () => {
  it('expands the nominal bounds outward by the tool radius on every side', () => {
    const bounds = surfaceToolBounds({
      shape: 'rectCornered',
      width: 40,
      height: 20,
      offsetX: 0,
      offsetY: 0,
      toolDiameter: 4,
    })
    expect(bounds).toEqual({ minX: -2, maxX: 42, minY: -2, maxY: 22 })
  })

  it('grows symmetrically for rectCentered too', () => {
    const bounds = surfaceToolBounds({
      shape: 'rectCentered',
      width: 40,
      height: 20,
      offsetX: 0,
      offsetY: 0,
      toolDiameter: 4,
    })
    expect(bounds).toEqual({ minX: -22, maxX: 22, minY: -12, maxY: 12 })
  })
})

describe('surfaceStepoverMm', () => {
  it('is a straight percentage of tool diameter', () => {
    expect(surfaceStepoverMm({ toolDiameter: 6, stepoverPercent: 50 })).toBe(3)
  })

  it('is zero at 0%', () => {
    expect(surfaceStepoverMm({ toolDiameter: 6, stepoverPercent: 0 })).toBe(0)
  })
})

describe('surfaceStartCorner', () => {
  it('is always the min-X/min-Y corner of the tool-center bounds, Cornered', () => {
    expect(
      surfaceStartCorner({ shape: 'rectCornered', width: 40, height: 20, offsetX: 0, offsetY: 0, toolDiameter: 4 }),
    ).toEqual({ x: -2, y: -2 })
  })

  it('is always the min-X/min-Y corner of the tool-center bounds, Centered', () => {
    expect(
      surfaceStartCorner({ shape: 'rectCentered', width: 40, height: 20, offsetX: 0, offsetY: 0, toolDiameter: 4 }),
    ).toEqual({ x: -22, y: -12 })
  })
})
