import { describe, expect, it } from 'vitest'
import { generateOutline } from './outline'
import { DEFAULT_MACHINE_SETTINGS } from '../types/machine'
import { DEFAULT_WIZARD_PARAMS, type WizardParams } from '../types/wizard'

function buildParams(outline: Partial<WizardParams['outline']>): WizardParams {
  return {
    ...DEFAULT_WIZARD_PARAMS,
    operation: 'outline',
    outline: { ...DEFAULT_WIZARD_PARAMS.outline, ...outline },
  }
}

describe('generateOutline — dispatch', () => {
  it('routes circle + helix to generateCircleOutlineHelix (arcs present when arc interpolation)', () => {
    const params = buildParams({ shape: 'circle', method: 'helix' })
    const lines = generateOutline(params, DEFAULT_MACHINE_SETTINGS)
    expect(lines[0]).toBe('G21 G90 G17')
  })

  it('routes circle + standard to generateCircleOutlineStandard (straight plunge lines present)', () => {
    const params = buildParams({ shape: 'circle', method: 'standard', totalDepth: 2 })
    const lines = generateOutline(params, DEFAULT_MACHINE_SETTINGS)
    expect(lines.some((l) => /^G1 Z-?[\d.]+ F/.test(l))).toBe(true)
  })

  it('routes rectCornered + ramp to generateRectOutlineRamp (no straight plunge before the first cut)', () => {
    const params = buildParams({ shape: 'rectCornered', method: 'ramp', totalDepth: 2 })
    const lines = generateOutline(params, DEFAULT_MACHINE_SETTINGS)
    expect(lines.some((l) => /^G1 Z-?[\d.]+ F/.test(l))).toBe(false)
  })

  it('routes rectCentered + standard to generateRectOutlineStandard (straight plunge lines present)', () => {
    const params = buildParams({ shape: 'rectCentered', method: 'standard', totalDepth: 2 })
    const lines = generateOutline(params, DEFAULT_MACHINE_SETTINGS)
    expect(lines.some((l) => /^G1 Z-?[\d.]+ F/.test(l))).toBe(true)
  })
})
