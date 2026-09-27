import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadMachineSettings, saveMachineSettings } from './machineStorage'
import { DEFAULT_MACHINE_SETTINGS } from '../types/machine'

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

describe('loadMachineSettings / saveMachineSettings', () => {
  it('returns defaults when nothing is saved', () => {
    expect(loadMachineSettings()).toEqual(DEFAULT_MACHINE_SETTINGS)
  })

  it('round-trips a saved settings object', () => {
    const settings = { ...DEFAULT_MACHINE_SETTINGS, travelX: 300, travelY: 200, travelZ: 80 }
    saveMachineSettings(settings)
    expect(loadMachineSettings()).toEqual(settings)
  })

  it('merges a partial/older saved object with defaults', () => {
    localStorage.setItem('simplecam.machine', JSON.stringify({ travelX: 300 }))
    expect(loadMachineSettings()).toEqual({
      ...DEFAULT_MACHINE_SETTINGS,
      travelX: 300,
    })
  })

  it('falls back to defaults on corrupt JSON', () => {
    localStorage.setItem('simplecam.machine', '{not json')
    expect(loadMachineSettings()).toEqual(DEFAULT_MACHINE_SETTINGS)
  })

  it('round-trips dialect and header/footer text', () => {
    const settings = {
      ...DEFAULT_MACHINE_SETTINGS,
      dialect: 'marlin' as const,
      headerText: 'G28',
      footerText: 'M9',
    }
    saveMachineSettings(settings)
    expect(loadMachineSettings()).toEqual(settings)
  })

  it('falls back to the default dialect when the saved value is unknown/corrupt', () => {
    localStorage.setItem(
      'simplecam.machine',
      JSON.stringify({ ...DEFAULT_MACHINE_SETTINGS, dialect: 'reprap' }),
    )
    expect(loadMachineSettings().dialect).toBe(DEFAULT_MACHINE_SETTINGS.dialect)
  })

  it('round-trips default tab sizes, and fills them in for an older saved object missing them', () => {
    const settings = {
      ...DEFAULT_MACHINE_SETTINGS,
      defaultTabHeight: 2,
      defaultTabWidth: 5,
      defaultTabCount: 6,
    }
    saveMachineSettings(settings)
    expect(loadMachineSettings()).toEqual(settings)

    localStorage.setItem('simplecam.machine', JSON.stringify({ travelX: 300 }))
    expect(loadMachineSettings()).toEqual({ ...DEFAULT_MACHINE_SETTINGS, travelX: 300 })
  })

  it('round-trips spindle speed/dwell and falls back on invalid saved values (BL-53)', () => {
    saveMachineSettings({ ...DEFAULT_MACHINE_SETTINGS, spindleSpeed: 18000, dwellSeconds: 0 })
    expect(loadMachineSettings()).toMatchObject({ spindleSpeed: 18000, dwellSeconds: 0 })
    localStorage.setItem('simplecam.machine', JSON.stringify({ spindleSpeed: 0, dwellSeconds: -1 }))
    expect(loadMachineSettings()).toMatchObject({
      spindleSpeed: DEFAULT_MACHINE_SETTINGS.spindleSpeed,
      dwellSeconds: DEFAULT_MACHINE_SETTINGS.dwellSeconds,
    })
  })

  it('falls back per field on wrong types instead of passing them through (BL-57)', () => {
    localStorage.setItem(
      'simplecam.machine',
      JSON.stringify({ headerText: 42, footerText: 'M9', travelX: '400', travelY: 300, defaultTabCount: 2.5 }),
    )
    expect(loadMachineSettings()).toMatchObject({
      headerText: DEFAULT_MACHINE_SETTINGS.headerText,
      footerText: 'M9',
      travelX: DEFAULT_MACHINE_SETTINGS.travelX,
      travelY: 300,
      defaultTabCount: DEFAULT_MACHINE_SETTINGS.defaultTabCount,
    })
  })

  it('keeps the calculator limits and rigidity, falling back on invalid values (BL-68)', () => {
    localStorage.setItem(
      'simplecam.machine',
      JSON.stringify({ spindleMinRpm: 10000, spindleMaxRpm: 30000, maxFeed: 4000, rigidity: 'medium' }),
    )
    expect(loadMachineSettings()).toMatchObject({ spindleMinRpm: 10000, spindleMaxRpm: 30000, maxFeed: 4000, rigidity: 'medium' })

    localStorage.setItem(
      'simplecam.machine',
      JSON.stringify({ spindleMinRpm: -5, spindleMaxRpm: 0, maxFeed: 'fast', rigidity: 'granite' }),
    )
    expect(loadMachineSettings()).toMatchObject({
      spindleMinRpm: DEFAULT_MACHINE_SETTINGS.spindleMinRpm,
      spindleMaxRpm: DEFAULT_MACHINE_SETTINGS.spindleMaxRpm,
      maxFeed: DEFAULT_MACHINE_SETTINGS.maxFeed,
      rigidity: DEFAULT_MACHINE_SETTINGS.rigidity,
    })
  })

  it('drops the minimum RPM of an inverted range', () => {
    localStorage.setItem('simplecam.machine', JSON.stringify({ spindleMinRpm: 30000, spindleMaxRpm: 20000 }))
    expect(loadMachineSettings()).toMatchObject({ spindleMinRpm: 0, spindleMaxRpm: 20000 })
  })

  it('keeps a known router and drops an unknown one (BL-69)', () => {
    localStorage.setItem('simplecam.machine', JSON.stringify({ router: 'makitaRt0700c' }))
    expect(loadMachineSettings().router).toBe('makitaRt0700c')
    localStorage.setItem('simplecam.machine', JSON.stringify({ router: 'festool' }))
    expect(loadMachineSettings().router).toBeNull()
  })
})
