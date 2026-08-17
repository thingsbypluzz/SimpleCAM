import { describe, expect, it } from 'vitest'
import { isStepdownValid, isToolDiameterValid } from './validation'
import { DEFAULT_WIZARD_PARAMS } from '../types/wizard'

describe('isToolDiameterValid', () => {
  it('is valid when tool is smaller than the hole', () => {
    expect(
      isToolDiameterValid({ ...DEFAULT_WIZARD_PARAMS.geometry, toolDiameter: 3, holeDiameter: 8 }),
    ).toBe(true)
  })

  it('is valid when tool exactly equals the hole', () => {
    expect(
      isToolDiameterValid({ ...DEFAULT_WIZARD_PARAMS.geometry, toolDiameter: 8, holeDiameter: 8 }),
    ).toBe(true)
  })

  it('is invalid when tool is larger than the hole', () => {
    expect(
      isToolDiameterValid({ ...DEFAULT_WIZARD_PARAMS.geometry, toolDiameter: 9, holeDiameter: 8 }),
    ).toBe(false)
  })
})

describe('isStepdownValid', () => {
  it('is valid for a positive stepdown', () => {
    expect(isStepdownValid({ ...DEFAULT_WIZARD_PARAMS.feeds, stepdown: 1 })).toBe(true)
  })

  it('is invalid for zero', () => {
    expect(isStepdownValid({ ...DEFAULT_WIZARD_PARAMS.feeds, stepdown: 0 })).toBe(false)
  })

  it('is invalid for a negative stepdown', () => {
    expect(isStepdownValid({ ...DEFAULT_WIZARD_PARAMS.feeds, stepdown: -1 })).toBe(false)
  })
})
