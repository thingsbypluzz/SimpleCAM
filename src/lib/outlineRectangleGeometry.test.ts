import { describe, expect, it } from 'vitest'
import { longerEdgeIndex, rectCorners, rectPerimeter, rectToolDimensions } from './outlineRectangleGeometry'

describe('rectToolDimensions', () => {
  it('inside insets both dimensions by toolDiameter', () => {
    expect(rectToolDimensions(50, 30, 4, 'inside')).toEqual({ toolWidth: 46, toolHeight: 26 })
  })

  it('outside offsets both dimensions out by toolDiameter', () => {
    expect(rectToolDimensions(50, 30, 4, 'outside')).toEqual({ toolWidth: 54, toolHeight: 34 })
  })

  it('onLine leaves nominal dimensions untouched', () => {
    expect(rectToolDimensions(50, 30, 4, 'onLine')).toEqual({ toolWidth: 50, toolHeight: 30 })
  })
})

describe('rectCorners', () => {
  it('rectCornered ccw: bottom-left origin, corners in mathematical-positive order', () => {
    const corners = rectCorners('rectCornered', 40, 20, 0, 0, 'ccw')
    expect(corners).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 20 },
      { x: 0, y: 20 },
    ])
  })

  it('rectCentered ccw: corners straddle the origin', () => {
    const corners = rectCorners('rectCentered', 40, 20, 0, 0, 'ccw')
    expect(corners).toEqual([
      { x: -20, y: -10 },
      { x: 20, y: -10 },
      { x: 20, y: 10 },
      { x: -20, y: 10 },
    ])
  })

  it('cw keeps the same starting corner but walks the other 3 in reverse', () => {
    const ccw = rectCorners('rectCornered', 40, 20, 0, 0, 'ccw')
    const cw = rectCorners('rectCornered', 40, 20, 0, 0, 'cw')
    expect(cw[0]).toEqual(ccw[0])
    expect(cw).toEqual([ccw[0], ccw[3], ccw[2], ccw[1]])
  })

  it('applies offsetX/offsetY uniformly to every corner', () => {
    const corners = rectCorners('rectCornered', 10, 10, 5, -3, 'ccw')
    expect(corners).toEqual([
      { x: 5, y: -3 },
      { x: 15, y: -3 },
      { x: 15, y: 7 },
      { x: 5, y: 7 },
    ])
  })
})

describe('rectPerimeter', () => {
  it('is 2*(width+height)', () => {
    expect(rectPerimeter(40, 20)).toBe(120)
  })
})

describe('longerEdgeIndex', () => {
  it('ccw: edge 0 (a width-length edge) when width is the longer dimension', () => {
    expect(longerEdgeIndex(40, 20, 'ccw')).toBe(0)
  })

  it('ccw: edge 1 (a height-length edge) when height is the longer dimension', () => {
    expect(longerEdgeIndex(20, 40, 'ccw')).toBe(1)
  })

  it('cw: mapping is flipped, since cw reverses which physical edge is "edge 0"', () => {
    expect(longerEdgeIndex(40, 20, 'cw')).toBe(1)
    expect(longerEdgeIndex(20, 40, 'cw')).toBe(0)
  })

  it('a tie (square) is a deterministic, arbitrary choice', () => {
    expect(longerEdgeIndex(30, 30, 'ccw')).toBe(0)
    expect(longerEdgeIndex(30, 30, 'cw')).toBe(1)
  })
})
