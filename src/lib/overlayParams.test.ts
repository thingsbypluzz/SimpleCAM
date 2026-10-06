import { describe, expect, it } from 'vitest'
import { deriveOverlayParams, overlayFitKey, sameOverlayParams } from './overlayParams'
import { DEFAULT_WIZARD_PARAMS } from '../types/wizard'
import type { PresetSlotId } from './storage'

describe('deriveOverlayParams', () => {
  it('returns an empty array when nothing is selected', () => {
    expect(deriveOverlayParams(new Set(), {})).toEqual([])
  })

  it('returns the same reference with nothing selected, even when presetSlots change (BL-52)', () => {
    const before = deriveOverlayParams(new Set(), { '1': DEFAULT_WIZARD_PARAMS })
    const after = deriveOverlayParams(new Set(), { '1': { ...DEFAULT_WIZARD_PARAMS, method: 'standard' } })
    expect(after).toBe(before)
  })

  it('returns selected presets in stable [1]-[7] order regardless of Set insertion order', () => {
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

describe('preset edited inside the overlay (BL-107)', () => {
  const preset1 = { ...DEFAULT_WIZARD_PARAMS, method: 'standard' as const }
  const preset2 = { ...DEFAULT_WIZARD_PARAMS, method: 'helix' as const }
  const presetSlots = { '1': preset1, '2': preset2 }
  const overlaySlots = new Set<PresetSlotId>(['1', '2'])

  it('leaves the edited preset out — the previews draw it from the live params', () => {
    expect(deriveOverlayParams(overlaySlots, presetSlots, '2')).toEqual([preset1])
  })

  it('returns the shared empty array when the edited preset is the only one shown', () => {
    expect(deriveOverlayParams(new Set<PresetSlotId>(['2']), presetSlots, '2')).toBe(deriveOverlayParams(new Set(), {}))
  })

  it('a live save of the edited preset leaves the other presets the same list', () => {
    const before = deriveOverlayParams(overlaySlots, presetSlots, '2')
    const after = deriveOverlayParams(overlaySlots, { ...presetSlots, '2': { ...preset2, method: 'standard' } }, '2')
    expect(sameOverlayParams(before, after)).toBe(true)
    expect(sameOverlayParams(before, deriveOverlayParams(overlaySlots, presetSlots, '1'))).toBe(false)
  })

  it('the fit key names the shown presets, edited one included, in slot order', () => {
    expect(overlayFitKey(new Set<PresetSlotId>(['2', '1']), presetSlots)).toBe('1,2')
    expect(overlayFitKey(new Set<PresetSlotId>(['2', '5']), presetSlots)).toBe('2')
    expect(overlayFitKey(new Set(), presetSlots)).toBe('')
    expect(overlayFitKey(new Set<PresetSlotId>(['1']), presetSlots, '2')).toBe('1,2')
    expect(overlayFitKey(new Set(), presetSlots, '2')).toBe('')
  })
})
