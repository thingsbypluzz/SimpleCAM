import { describe, expect, it } from 'vitest'
import { presetLabel } from './presetLabel'
import { DEFAULT_WIZARD_PARAMS } from '../types/wizard'

describe('presetLabel', () => {
  it('leads with the pattern, then method, then hole diameter', () => {
    const params = {
      ...DEFAULT_WIZARD_PARAMS,
      method: 'helix' as const,
      geometry: { ...DEFAULT_WIZARD_PARAMS.geometry, positioning: 'single' as const, holeDiameter: 8 },
    }
    expect(presetLabel(params)).toBe('Single Hole • Helix • ⌀8mm')
  })

  it('reflects the standard hole method', () => {
    const params = {
      ...DEFAULT_WIZARD_PARAMS,
      method: 'standard' as const,
      geometry: { ...DEFAULT_WIZARD_PARAMS.geometry, positioning: 'single' as const, holeDiameter: 12 },
    }
    expect(presetLabel(params)).toBe('Single Hole • Standard • ⌀12mm')
  })

  it('distinguishes two presets that share a method but differ in pattern', () => {
    const single = {
      ...DEFAULT_WIZARD_PARAMS,
      method: 'helix' as const,
      geometry: { ...DEFAULT_WIZARD_PARAMS.geometry, positioning: 'single' as const, holeDiameter: 8 },
    }
    const circle = {
      ...DEFAULT_WIZARD_PARAMS,
      method: 'helix' as const,
      geometry: {
        ...DEFAULT_WIZARD_PARAMS.geometry,
        positioning: 'circle' as const,
        circleHoleCount: 5,
        holeDiameter: 8,
      },
    }
    expect(presetLabel(single)).not.toBe(presetLabel(circle))
    expect(presetLabel(circle)).toBe('5-Holes Circle • Helix • ⌀8mm')
  })
})
