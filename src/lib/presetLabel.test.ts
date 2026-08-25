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

  it('labels an outline preset with shape/dimensions/offset mode, then method — no trailing diameter', () => {
    const params = {
      ...DEFAULT_WIZARD_PARAMS,
      operation: 'outline' as const,
      outline: {
        ...DEFAULT_WIZARD_PARAMS.outline,
        shape: 'rectCornered' as const,
        offsetMode: 'inside' as const,
        method: 'ramp' as const,
        width: 50,
        height: 30,
      },
    }
    expect(presetLabel(params)).toBe('Rectangle 50×30 (Inside) • Ramp')
  })

  it('labels a circle outline preset reusing the Helix/Standard shortLabel', () => {
    const params = {
      ...DEFAULT_WIZARD_PARAMS,
      operation: 'outline' as const,
      outline: {
        ...DEFAULT_WIZARD_PARAMS.outline,
        shape: 'circle' as const,
        offsetMode: 'outside' as const,
        method: 'helix' as const,
        diameter: 45,
      },
    }
    expect(presetLabel(params)).toBe('Circle ⌀45 (Outside) • Helix')
  })
})
