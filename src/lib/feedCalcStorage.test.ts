import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_FEED_CALC_SETTINGS, loadFeedCalcSettings, saveFeedCalcSettings } from './feedCalcStorage'

// Same fake localStorage approach as storage.test.ts — no jsdom dependency.
class FakeStorage implements Storage {
  private store = new Map<string, string>()
  get length() {
    return this.store.size
  }
  clear = () => this.store.clear()
  getItem = (key: string) => this.store.get(key) ?? null
  key = (index: number) => [...this.store.keys()][index] ?? null
  removeItem = (key: string) => {
    this.store.delete(key)
  }
  setItem = (key: string, value: string) => {
    this.store.set(key, value)
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new FakeStorage())
})

describe('loadFeedCalcSettings / saveFeedCalcSettings', () => {
  it('returns defaults when nothing is saved', () => {
    expect(loadFeedCalcSettings()).toEqual(DEFAULT_FEED_CALC_SETTINGS)
  })

  it('round-trips saved settings', () => {
    const settings = { material: 'aluminium' as const, flutes: 1, toolMaterial: 'hss' as const }
    saveFeedCalcSettings(settings)
    expect(loadFeedCalcSettings()).toEqual(settings)
  })

  it('falls back per field on unknown or invalid values', () => {
    localStorage.setItem('simplecam.feedCalc', JSON.stringify({ material: 'steel', flutes: 2.5, toolMaterial: 'hss' }))
    expect(loadFeedCalcSettings()).toEqual({ ...DEFAULT_FEED_CALC_SETTINGS, toolMaterial: 'hss' })
  })

  it('falls back to defaults on corrupted JSON', () => {
    localStorage.setItem('simplecam.feedCalc', '{')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(loadFeedCalcSettings()).toEqual(DEFAULT_FEED_CALC_SETTINGS)
  })
})
