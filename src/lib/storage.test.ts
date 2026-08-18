import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUTO_SAVE_SLOT,
  STORAGE_KEY,
  deleteSlot,
  loadPresetSlots,
  loadSlot,
  saveSlot,
} from './storage'
import { DEFAULT_WIZARD_PARAMS } from '../types/wizard'

// Minimal in-memory Storage implementation — the project has no jsdom
// dependency, so tests provide their own fake `localStorage` global instead
// of pulling one in.
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

describe('saveSlot / loadSlot', () => {
  it('round-trips a full snapshot through the auto-save slot', () => {
    const params = { ...DEFAULT_WIZARD_PARAMS, operation: 'standard' as const }
    saveSlot(AUTO_SAVE_SLOT, params)
    expect(loadSlot(AUTO_SAVE_SLOT)).toEqual(params)
  })

  it('round-trips a named preset slot independently of the auto-save slot', () => {
    const autoSave = { ...DEFAULT_WIZARD_PARAMS, operation: 'helix' as const }
    const preset = { ...DEFAULT_WIZARD_PARAMS, operation: 'standard' as const }
    saveSlot(AUTO_SAVE_SLOT, autoSave)
    saveSlot('1', preset)
    expect(loadSlot(AUTO_SAVE_SLOT)).toEqual(autoSave)
    expect(loadSlot('1')).toEqual(preset)
  })

  it('returns null for a slot that was never saved', () => {
    expect(loadSlot('3')).toBeNull()
  })
})

describe('deleteSlot', () => {
  it('removes a saved slot without touching others', () => {
    saveSlot('1', DEFAULT_WIZARD_PARAMS)
    saveSlot('2', DEFAULT_WIZARD_PARAMS)
    deleteSlot('1')
    expect(loadSlot('1')).toBeNull()
    expect(loadSlot('2')).toEqual(DEFAULT_WIZARD_PARAMS)
  })
})

describe('loadPresetSlots', () => {
  it('only returns occupied preset slots, excluding the auto-save slot', () => {
    saveSlot(AUTO_SAVE_SLOT, DEFAULT_WIZARD_PARAMS)
    saveSlot('2', { ...DEFAULT_WIZARD_PARAMS, operation: 'standard' as const })
    const slots = loadPresetSlots()
    expect(Object.keys(slots)).toEqual(['2'])
    expect(slots['2']?.operation).toBe('standard')
  })

  it('returns an empty object when nothing is saved', () => {
    expect(loadPresetSlots()).toEqual({})
  })
})

describe('schema migration', () => {
  it('fills in fields missing from an older-schema snapshot with current defaults', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        slots: {
          [AUTO_SAVE_SLOT]: {
            version: 1,
            params: {
              operation: 'helix',
              geometry: { toolDiameter: 2, holeDiameter: 6 },
              // feeds/output omitted entirely, as an older schema would.
            },
          },
        },
      }),
    )

    const restored = loadSlot(AUTO_SAVE_SLOT)
    expect(restored?.geometry.toolDiameter).toBe(2)
    expect(restored?.geometry.holeDiameter).toBe(6)
    expect(restored?.geometry.totalDepth).toBe(DEFAULT_WIZARD_PARAMS.geometry.totalDepth)
    expect(restored?.feeds).toEqual(DEFAULT_WIZARD_PARAMS.feeds)
    expect(restored?.output).toEqual(DEFAULT_WIZARD_PARAMS.output)
  })
})

describe('error handling', () => {
  it('falls back to null/empty and warns when the stored JSON is corrupted', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem(STORAGE_KEY, '{not valid json')
    expect(loadSlot(AUTO_SAVE_SLOT)).toBeNull()
    expect(loadPresetSlots()).toEqual({})
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('does not throw when localStorage.setItem fails (e.g. quota exceeded)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => saveSlot(AUTO_SAVE_SLOT, DEFAULT_WIZARD_PARAMS)).not.toThrow()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
