import { DEFAULT_MACHINE_SETTINGS, type MachineSettings } from '../types/machine'

// Separate localStorage key from simplecam.storage (the WizardParams preset
// slots) — machine settings are a single global object describing the
// user's physical CNC, not one of several interchangeable presets, and
// keeping the key separate leaves room to gate this independently later
// without touching the preset system at all.
const MACHINE_STORAGE_KEY = 'simplecam.machine'

export function loadMachineSettings(): MachineSettings {
  try {
    const raw = localStorage.getItem(MACHINE_STORAGE_KEY)
    if (!raw) return DEFAULT_MACHINE_SETTINGS
    const parsed = JSON.parse(raw) as Partial<MachineSettings>
    return { ...DEFAULT_MACHINE_SETTINGS, ...parsed }
  } catch (err) {
    console.warn('SimpleCAM: could not read machine settings from localStorage', err)
    return DEFAULT_MACHINE_SETTINGS
  }
}

export function saveMachineSettings(settings: MachineSettings): void {
  try {
    localStorage.setItem(MACHINE_STORAGE_KEY, JSON.stringify(settings))
  } catch (err) {
    console.warn('SimpleCAM: could not save machine settings to localStorage', err)
  }
}
