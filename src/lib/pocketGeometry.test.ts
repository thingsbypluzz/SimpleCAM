import { describe, expect, it } from 'vitest'
import {
  spiralRampEngagementDeg,
  pocketCenter,
  pocketCircleWallRadius,
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

describe('spiralRampEngagementDeg (BL-41)', () => {
  it('ring engagement from Stepover, plus atan(1/Ramp Length) while ramping out', () => {
    const { ring, ramp } = spiralRampEngagementDeg({ stepoverPercent: 40, rampLengthFactor: 3 })
    expect(ring).toBeCloseTo((Math.acos(0.2) * 180) / Math.PI, 9) // ≈ 78.46°
    expect(ramp - ring).toBeCloseTo((Math.atan(1 / 3) * 180) / Math.PI, 9) // ≈ 18.43°
    const steep = spiralRampEngagementDeg({ stepoverPercent: 40, rampLengthFactor: 1 })
    expect(steep.ramp - steep.ring).toBeCloseTo(45, 9)
  })

  it('never reports more than a full slot (180°)', () => {
    expect(spiralRampEngagementDeg({ stepoverPercent: 100, rampLengthFactor: 1 }).ramp).toBe(180)
  })
})
