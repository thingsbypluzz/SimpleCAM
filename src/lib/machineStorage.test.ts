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
})
