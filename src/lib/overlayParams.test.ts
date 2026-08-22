import { describe, expect, it } from 'vitest'
import { deriveOverlayParams } from './overlayParams'
import { DEFAULT_WIZARD_PARAMS } from '../types/wizard'
import type { PresetSlotId } from './storage'

describe('deriveOverlayParams', () => {
  it('returns an empty array when nothing is selected', () => {
    expect(deriveOverlayParams(new Set(), {})).toEqual([])
  })

  it('returns selected presets in stable [1]-[5] order regardless of Set insertion order', () => {
    const preset1 = { ...DEFAULT_WIZARD_PARAMS, method: 'standard' as const }
    const preset3 = { ...DEFAULT_WIZARD_PARAMS, method: 'helix' as const }
    const overlaySlots = new Set<PresetSlotId>(['3', '1'])
    const presetSlots = { '1': preset1, '3': preset3 }
    expect(deriveOverlayParams(overlaySlots, presetSlots)).toEqual([preset1, preset3])
  })

  it('silently drops a selected slot that no longer exists in presetSlots', () => {
    const preset2 = DEFAULT_WIZARD_PARAMS
    const overlaySlots = new Set<PresetSlotId>(['2', '4'])
    const presetSlots = { '2': preset2 }
    expect(deriveOverlayParams(overlaySlots, presetSlots)).toEqual([preset2])
  })
})
