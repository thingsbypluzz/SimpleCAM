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
    const params = { ...DEFAULT_WIZARD_PARAMS, method: 'standard' as const }
    saveSlot(AUTO_SAVE_SLOT, params)
    expect(loadSlot(AUTO_SAVE_SLOT)).toEqual(params)
  })

  it('round-trips a named preset slot independently of the auto-save slot', () => {
    const autoSave = { ...DEFAULT_WIZARD_PARAMS, method: 'helix' as const }
    const preset = { ...DEFAULT_WIZARD_PARAMS, method: 'standard' as const }
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
    saveSlot('2', { ...DEFAULT_WIZARD_PARAMS, method: 'standard' as const })
    const slots = loadPresetSlots()
    expect(Object.keys(slots)).toEqual(['2'])
    expect(slots['2']?.method).toBe('standard')
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

  it('ignores a pre-rename operation key and falls back to the default method (no migration, by design)', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        slots: {
          [AUTO_SAVE_SLOT]: {
            version: 1,
            params: {
              // Pre-0.8.12 snapshots used `operation` instead of `method` —
              // deliberately not migrated (see CLAUDE.md), so this foreign
              // key is silently ignored and `method` falls back to default.
              operation: 'standard',
            },
          },
        },
      }),
    )

    const restored = loadSlot(AUTO_SAVE_SLOT)
    expect(restored?.method).toBe(DEFAULT_WIZARD_PARAMS.method)
  })

  it('rebuilds customPointsText from customPoints for a snapshot saved before it existed (BL-48)', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        slots: {
          [AUTO_SAVE_SLOT]: {
            version: 1,
            params: {
              geometry: {
                positioning: 'custom',
                customPoints: [
                  { x: 5, y: 7 },
                  { x: 20, y: -3 },
                ],
              },
            },
          },
        },
      }),
    )

    const restored = loadSlot(AUTO_SAVE_SLOT)
    expect(restored?.geometry.customPointsText).toBe('5,7\n20,-3')
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

describe('field validation on load (BL-57)', () => {
  function storeAutoSave(params: unknown) {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, slots: { [AUTO_SAVE_SLOT]: { version: 1, params } } }),
    )
  }

  it('replaces unknown enum values with defaults, keeping valid neighbours', () => {
    storeAutoSave({
      geometry: { positioning: 'spiralGrid', holeDiameter: 12 },
      outline: { shape: 'hexagon', offsetMode: 'inside' },
      pocket: { method: 'trochoidal', cutDirection: 'sideways', shape: 'circle' },
      output: { interpolation: 'nurbs' },
    })
    const restored = loadSlot(AUTO_SAVE_SLOT)!
    expect(restored.geometry.positioning).toBe(DEFAULT_WIZARD_PARAMS.geometry.positioning)
    expect(restored.geometry.holeDiameter).toBe(12)
    expect(restored.outline.shape).toBe(DEFAULT_WIZARD_PARAMS.outline.shape)
    expect(restored.outline.offsetMode).toBe('inside')
    expect(restored.pocket.method).toBe(DEFAULT_WIZARD_PARAMS.pocket.method)
    expect(restored.pocket.cutDirection).toBe(DEFAULT_WIZARD_PARAMS.pocket.cutDirection)
    expect(restored.output.interpolation).toBe(DEFAULT_WIZARD_PARAMS.output.interpolation)
  })

  it('replaces wrong-typed fields and malformed point lists with defaults', () => {
    storeAutoSave({
      geometry: { totalDepth: '4', customPoints: [{ x: 1 }], tabsEnabled: 'yes' },
      feeds: { safeZ: null, feedrateXY: 1200 },
    })
    const restored = loadSlot(AUTO_SAVE_SLOT)!
    expect(restored.geometry.totalDepth).toBe(DEFAULT_WIZARD_PARAMS.geometry.totalDepth)
    expect(restored.geometry.customPoints).toEqual(DEFAULT_WIZARD_PARAMS.geometry.customPoints)
    expect(restored.geometry.tabsEnabled).toBe(DEFAULT_WIZARD_PARAMS.geometry.tabsEnabled)
    expect(restored.feeds.safeZ).toBe(DEFAULT_WIZARD_PARAMS.feeds.safeZ)
    expect(restored.feeds.feedrateXY).toBe(1200)
  })

  it('drops keys the current schema no longer has', () => {
    storeAutoSave({ output: { spindleSpeed: 18000 } })
    expect(loadSlot(AUTO_SAVE_SLOT)!.output).toEqual(DEFAULT_WIZARD_PARAMS.output)
  })

  it('moves a stored Raster Pocket to Spiral (Raster removed, BL-73)', () => {
    storeAutoSave({ pocket: { shape: 'circle', method: 'raster' } })
    expect(loadSlot(AUTO_SAVE_SLOT)!.pocket.method).toBe('spiral')
    storeAutoSave({ pocket: { shape: 'rectCornered', method: 'raster' } })
    expect(loadSlot(AUTO_SAVE_SLOT)!.pocket.method).toBe('spiral')
    storeAutoSave({ pocket: { shape: 'rectCornered', method: 'adaptive' } })
    expect(loadSlot(AUTO_SAVE_SLOT)!.pocket.method).toBe('adaptive')
  })

  it('loads a Pocket saved before the finishing pass with it off (BL-42)', () => {
    storeAutoSave({ pocket: { shape: 'circle', method: 'spiral', diameter: 30 } })
    const { pocket } = loadSlot(AUTO_SAVE_SLOT)!
    expect(pocket.finishingEnabled).toBe(false)
    expect(pocket.stockToLeave).toBe(DEFAULT_WIZARD_PARAMS.pocket.stockToLeave)
    expect(pocket.finishFeed).toBe(DEFAULT_WIZARD_PARAMS.pocket.finishFeed)
  })

  it('gives Hole(s)/Outline saved before the Ramp Angle the default 2° (BL-80)', () => {
    storeAutoSave({ geometry: { holeDiameter: 8 }, outline: { shape: 'circle', method: 'helix' } })
    const { geometry, outline } = loadSlot(AUTO_SAVE_SLOT)!
    expect(geometry.rampAngleDeg).toBe(2)
    expect(outline.rampAngleDeg).toBe(2)
  })

  it('gives a Pocket saved before Ramp Length the default 3× (BL-41)', () => {
    storeAutoSave({ pocket: { shape: 'circle', method: 'spiral', diameter: 30 } })
    expect(loadSlot(AUTO_SAVE_SLOT)!.pocket.rampLengthFactor).toBe(3)
  })

  it('loads Lightened shapes with either method (OP-6)', () => {
    storeAutoSave({ pocket: { shape: 'circleLightened', method: 'adaptive' } })
    expect(loadSlot(AUTO_SAVE_SLOT)!.pocket.method).toBe('adaptive')
    storeAutoSave({ pocket: { shape: 'rectLightened', method: 'adaptive', lightLayout: 'bogus' } })
    const { pocket } = loadSlot(AUTO_SAVE_SLOT)!
    expect(pocket.shape).toBe('rectLightened')
    expect(pocket.method).toBe('adaptive')
    expect(pocket.lightLayout).toBe(DEFAULT_WIZARD_PARAMS.pocket.lightLayout)
    expect(pocket.ribWidth).toBe(DEFAULT_WIZARD_PARAMS.pocket.ribWidth)
  })

  it('keeps chipThinningBaseFeed null or numeric', () => {
    storeAutoSave({ pocket: { chipThinningBaseFeed: 700 } })
    expect(loadSlot(AUTO_SAVE_SLOT)!.pocket.chipThinningBaseFeed).toBe(700)
    storeAutoSave({ pocket: { chipThinningBaseFeed: 'x' } })
    expect(loadSlot(AUTO_SAVE_SLOT)!.pocket.chipThinningBaseFeed).toBeNull()
  })

  it('survives a snapshot whose params or slots are not objects', () => {
    storeAutoSave('garbage')
    expect(loadSlot(AUTO_SAVE_SLOT)).toEqual(DEFAULT_WIZARD_PARAMS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, slots: 42 }))
    expect(loadSlot(AUTO_SAVE_SLOT)).toBeNull()
  })

  it('loads Facing, and gives a snapshot saved before it the defaults (OP-7)', () => {
    storeAutoSave({ operation: 'facing', facing: { side: 'right', originAlong: 'end', originAcross: 'bogus', removal: 2.5 } })
    const loaded = loadSlot(AUTO_SAVE_SLOT)!
    expect(loaded.operation).toBe('facing')
    expect(loaded.facing).toMatchObject({ side: 'right', originAlong: 'end', originAcross: 'raw', removal: 2.5 })
    storeAutoSave({ operation: 'pocket' })
    expect(loadSlot(AUTO_SAVE_SLOT)!.facing).toEqual(DEFAULT_WIZARD_PARAMS.facing)
  })

  it('loads a Lobed Circle outline; older snapshots get the lobe defaults (OP-8)', () => {
    storeAutoSave({ operation: 'outline', outline: { shape: 'lobedCircle', lobeCount: 3, lobeMainDiameter: 40 } })
    const { outline } = loadSlot(AUTO_SAVE_SLOT)!
    expect(outline).toMatchObject({ shape: 'lobedCircle', lobeCount: 3, lobeMainDiameter: 40, lobeDiameter: 16, tabStartAngle: 90 })
    storeAutoSave({ operation: 'outline', outline: { shape: 'circle', diameter: 30 } })
    expect(loadSlot(AUTO_SAVE_SLOT)!.outline.lobePitchDiameter).toBe(70)
  })

  it('loads the Lobed Circle mode; a snapshot saved before it is Add (BL-106)', () => {
    storeAutoSave({ operation: 'outline', outline: { shape: 'lobedCircle', lobeMode: 'subtract' } })
    expect(loadSlot(AUTO_SAVE_SLOT)!.outline.lobeMode).toBe('subtract')
    storeAutoSave({ operation: 'outline', outline: { shape: 'lobedCircle', lobeMode: 'bogus' } })
    expect(loadSlot(AUTO_SAVE_SLOT)!.outline.lobeMode).toBe('add')
    storeAutoSave({ operation: 'outline', outline: { shape: 'lobedCircle' } })
    expect(loadSlot(AUTO_SAVE_SLOT)!.outline.lobeMode).toBe('add')
  })

  it('loads a Pocket Donut; older snapshots get the default island (BL-108)', () => {
    storeAutoSave({ operation: 'pocket', pocket: { shape: 'donut', diameter: 60, islandDiameter: 25 } })
    expect(loadSlot(AUTO_SAVE_SLOT)!.pocket).toMatchObject({ shape: 'donut', diameter: 60, islandDiameter: 25 })
    storeAutoSave({ operation: 'pocket', pocket: { shape: 'circle', diameter: 30 } })
    expect(loadSlot(AUTO_SAVE_SLOT)!.pocket.islandDiameter).toBe(20)
  })
})
