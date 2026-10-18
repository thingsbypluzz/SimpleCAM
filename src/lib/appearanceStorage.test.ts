import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadAppearanceSettings, saveAppearanceSettings } from './appearanceStorage'
import { DEFAULT_APPEARANCE_SETTINGS } from '../types/appearance'

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

describe('loadAppearanceSettings — Simple / Advanced Mode (BL-103)', () => {
  it('starts a new user in Simple', () => {
    expect(loadAppearanceSettings().uiMode).toBe('simple')
  })

  it('starts someone with saved presets in Advanced', () => {
    localStorage.setItem('simplecam.storage', JSON.stringify({ version: 1, slots: {} }))
    expect(loadAppearanceSettings().uiMode).toBe('advanced')
  })

  it('reads appearance saved before the mode existed as Advanced', () => {
    localStorage.setItem('simplecam.appearance', JSON.stringify({ theme: 'sloppy-indigo' }))
    expect(loadAppearanceSettings().uiMode).toBe('advanced')
  })

  it('keeps the saved mode', () => {
    saveAppearanceSettings({ ...DEFAULT_APPEARANCE_SETTINGS, uiMode: 'simple' })
    localStorage.setItem('simplecam.storage', JSON.stringify({ version: 1, slots: {} }))
    expect(loadAppearanceSettings().uiMode).toBe('simple')
  })
})
