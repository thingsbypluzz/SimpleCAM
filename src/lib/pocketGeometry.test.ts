import { describe, expect, it } from 'vitest'
import {
  pocketCenter,
  pocketCircleWallRadius,
  pocketRectRasterBounds,
  pocketRectWallHalfDims,
  pocketStepoverMm,
} from './pocketGeometry'
import { DEFAULT_WIZARD_PARAMS, type WizardParams } from '../types/wizard'

function pocket(overrides: Partial<WizardParams['pocket']> = {}): WizardParams['pocket'] {
  return { ...DEFAULT_WIZARD_PARAMS.pocket, ...overrides }
}

describe('pocketCenter', () => {
  it('rectCornered: center is offset by half the nominal dimensions', () => {
    expect(pocketCenter(pocket({ shape: 'rectCornered', width: 50, height: 30, offsetX: 10, offsetY: 20 }))).toEqual({
      x: 35,
      y: 35,
    })
  })

  it('rectCentered: center is exactly offsetX/offsetY', () => {
    expect(pocketCenter(pocket({ shape: 'rectCentered', width: 50, height: 30, offsetX: 10, offsetY: 20 }))).toEqual({
      x: 10,
      y: 20,
    })
  })

  it('circle: center is exactly offsetX/offsetY', () => {
    expect(pocketCenter(pocket({ shape: 'circle', offsetX: 5, offsetY: -5 }))).toEqual({ x: 5, y: -5 })
  })
})

describe('pocketRectWallHalfDims', () => {
  it('insets by the tool radius on each side (opposite sign from Surface overtravel)', () => {
    expect(pocketRectWallHalfDims(pocket({ width: 50, height: 30, toolDiameter: 4 }))).toEqual({
      halfWidth: 23, // 25 - 2
      halfHeight: 13, // 15 - 2
    })
  })
})

describe('pocketCircleWallRadius', () => {
  it('insets by the tool radius', () => {
    expect(pocketCircleWallRadius(pocket({ diameter: 40, toolDiameter: 4 }))).toBe(18)
  })
})

describe('pocketStepoverMm', () => {
  it('converts stepover % of tool diameter to mm', () => {
    expect(pocketStepoverMm(pocket({ toolDiameter: 10, stepoverPercent: 40 }))).toBe(4)
  })
})

describe('pocketRectRasterBounds', () => {
  it('is centered on the pocket center, inset by the wall half-dims', () => {
    const bounds = pocketRectRasterBounds(
      pocket({ shape: 'rectCornered', width: 50, height: 30, toolDiameter: 4, offsetX: 0, offsetY: 0 }),
    )
    // center = (25, 15), wall half-dims = (23, 13)
    expect(bounds).toEqual({ minX: 2, maxX: 48, minY: 2, maxY: 28 })
  })
})
