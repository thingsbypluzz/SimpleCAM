import { describe, expect, it } from 'vitest'
import { presetLabel } from './presetLabel'
import { DEFAULT_WIZARD_PARAMS } from '../types/wizard'

describe('presetLabel', () => {
  it('combines the operation short label with hole diameter and depth', () => {
    const params = {
      ...DEFAULT_WIZARD_PARAMS,
      operation: 'helix' as const,
      geometry: { ...DEFAULT_WIZARD_PARAMS.geometry, holeDiameter: 8, totalDepth: 4 },
    }
    expect(presetLabel(params)).toBe('Helix • ⌀8mm, 4mm deep')
  })

  it('reflects the standard hole operation', () => {
    const params = {
      ...DEFAULT_WIZARD_PARAMS,
      operation: 'standard' as const,
      geometry: { ...DEFAULT_WIZARD_PARAMS.geometry, holeDiameter: 12, totalDepth: 6 },
    }
    expect(presetLabel(params)).toBe('Standard • ⌀12mm, 6mm deep')
  })
})
