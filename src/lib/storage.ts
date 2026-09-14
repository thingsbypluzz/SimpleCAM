import { DEFAULT_WIZARD_PARAMS, type MethodType, type OperationType, type WizardParams } from '../types/wizard'

// `operation` and `method` are the two top-level scalar fields
// mergeWithDefaults() below can't fix with a plain `??` fallback: a preset
// saved back when `operation` meant "Helix vs Standard" (pre-0.8.12, before
// it was repurposed to mean "Hole(s) vs Outline" — see CLAUDE.md) has a
// *present* value like `'helix'`, not `undefined`, so `saved?.operation ??
// DEFAULT_WIZARD_PARAMS.operation` let it straight through. Every render
// site that compares `params.operation` against an exact literal
// ('holes'/'outline') then silently matched neither — Step 2's collapsed
// summary (App.tsx) renders nothing for either branch, with no thrown
// error, because it's a false `&&`, not an exception. Guarding both here
// the same way appearanceStorage.ts already guards PaletteId/ThemeId closes
// the whole class of bug, not just this one instance.
function isOperationType(value: unknown): value is OperationType {
  return value === 'holes' || value === 'outline' || value === 'surface'
}

function isMethodType(value: unknown): value is MethodType {
  return value === 'helix' || value === 'standard'
}

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
    console.warn('OnlyPaths: could not read saved state from localStorage', err)
    return { version: SCHEMA_VERSION, slots: {} }
  }
}

function writeStorage(storage: StorageShape): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage))
  } catch (err) {
    console.warn('OnlyPaths: could not save state to localStorage', err)
  }
}

// Shallow, per-section merge with defaults — a snapshot saved by an older
// version of the app that's missing newly-added fields still loads cleanly,
// picking up defaults for whatever it doesn't have.
function mergeWithDefaults(saved: Partial<WizardParams> | undefined): WizardParams {
  return {
    operation: isOperationType(saved?.operation) ? saved.operation : DEFAULT_WIZARD_PARAMS.operation,
    method: isMethodType(saved?.method) ? saved.method : DEFAULT_WIZARD_PARAMS.method,
    geometry: { ...DEFAULT_WIZARD_PARAMS.geometry, ...saved?.geometry },
    outline: { ...DEFAULT_WIZARD_PARAMS.outline, ...saved?.outline },
    surface: { ...DEFAULT_WIZARD_PARAMS.surface, ...saved?.surface },
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
