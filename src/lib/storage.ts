import { DEFAULT_WIZARD_PARAMS, type WizardParams } from '../types/wizard'

// Single localStorage key holding every slot — one JSON blob, one read/write
// at a time, easy to inspect/clear as a whole. See CLAUDE.md, Etap 5.
export const STORAGE_KEY = 'simplecam.storage'
const SCHEMA_VERSION = 1

// Slot "0" is the hidden auto-save snapshot (written on every Generate,
// restored silently on startup). Slots "1"-"5" are the named presets a user
// saves explicitly from Step 4 and switches between via the header.
export const AUTO_SAVE_SLOT = '0' as const
export const PRESET_SLOT_IDS = ['1', '2', '3', '4', '5'] as const
export type PresetSlotId = (typeof PRESET_SLOT_IDS)[number]
export type SlotId = typeof AUTO_SAVE_SLOT | PresetSlotId

interface StoredSlot {
  version: number
  params: Partial<WizardParams>
}

interface StorageShape {
  version: number
  slots: Partial<Record<SlotId, StoredSlot>>
}

function readStorage(): StorageShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { version: SCHEMA_VERSION, slots: {} }
    const parsed = JSON.parse(raw) as Partial<StorageShape>
    return { version: SCHEMA_VERSION, slots: parsed.slots ?? {} }
  } catch (err) {
    console.warn('SimpleCAM: could not read saved state from localStorage', err)
    return { version: SCHEMA_VERSION, slots: {} }
  }
}

function writeStorage(storage: StorageShape): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage))
  } catch (err) {
    console.warn('SimpleCAM: could not save state to localStorage', err)
  }
}

// Shallow, per-section merge with defaults — a snapshot saved by an older
// version of the app that's missing newly-added fields still loads cleanly,
// picking up defaults for whatever it doesn't have.
function mergeWithDefaults(saved: Partial<WizardParams> | undefined): WizardParams {
  return {
    operation: saved?.operation ?? DEFAULT_WIZARD_PARAMS.operation,
    geometry: { ...DEFAULT_WIZARD_PARAMS.geometry, ...saved?.geometry },
    feeds: { ...DEFAULT_WIZARD_PARAMS.feeds, ...saved?.feeds },
    output: { ...DEFAULT_WIZARD_PARAMS.output, ...saved?.output },
  }
}

export function saveSlot(id: SlotId, params: WizardParams): void {
  const storage = readStorage()
  storage.slots[id] = { version: SCHEMA_VERSION, params }
  writeStorage(storage)
}

export function loadSlot(id: SlotId): WizardParams | null {
  const slot = readStorage().slots[id]
  return slot ? mergeWithDefaults(slot.params) : null
}

export function deleteSlot(id: SlotId): void {
  const storage = readStorage()
  delete storage.slots[id]
  writeStorage(storage)
}

// All occupied preset slots (1-5), read once at startup for the header —
// excludes the hidden auto-save slot (0).
export function loadPresetSlots(): Partial<Record<PresetSlotId, WizardParams>> {
  const storage = readStorage()
  const result: Partial<Record<PresetSlotId, WizardParams>> = {}
  for (const id of PRESET_SLOT_IDS) {
    const slot = storage.slots[id]
    if (slot) result[id] = mergeWithDefaults(slot.params)
  }
  return result
}
