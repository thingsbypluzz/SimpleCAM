import {
  DEFAULT_WIZARD_PARAMS,
  type CutDirection,
  type GeometryParams,
  type InterpolationMode,
  type MethodType,
  type OffsetMode,
  type OperationType,
  type OutlineMethod,
  type OutlineParams,
  type OutlineShape,
  type OutputOptions,
  type PocketMethodType,
  type PocketParams,
  type PocketShape,
  type LightLayout,
  type PositioningMode,
  type RasterDirection,
  type SurfaceMethodType,
  type SurfaceParams,
  type SurfaceShape,
  type WizardParams,
  type ZTransitionMode,
} from '../types/wizard'
import { formatCustomPoints } from './customPoints'

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
  return value === 'holes' || value === 'outline' || value === 'surface' || value === 'pocket'
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
    const parsed = JSON.parse(raw) as Partial<StorageShape> | null
    const slots = parsed?.slots
    return { version: SCHEMA_VERSION, slots: typeof slots === 'object' && slots !== null ? slots : {} }
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

// BL-57: every field of a stored snapshot is checked, not just
// `operation`/`method` — a renamed enum value or a hand-edited/corrupted
// save used to flow straight into the engine and render code (e.g.
// resolvePoints() returning undefined for an unknown positioning mode), and
// since slot "0" is restored on every startup, one bad value meant a blank
// screen on every reload. A field whose stored value has the wrong type or
// isn't a known enum value falls back to its default; unknown extra keys
// are dropped.
type FieldGuard = (value: unknown) => boolean

const oneOf =
  <T extends string>(values: readonly T[]): FieldGuard =>
  (value) =>
    typeof value === 'string' && (values as readonly string[]).includes(value)

const isFiniteNumber: FieldGuard = (value) => typeof value === 'number' && Number.isFinite(value)

function isPointList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((p) => typeof p === 'object' && p !== null && isFiniteNumber(p.x) && isFiniteNumber(p.y))
  )
}

// Fields without an explicit guard must match their default's kind:
// finite number, boolean or string.
function defaultGuard(defaultValue: unknown): FieldGuard {
  if (typeof defaultValue === 'number') return isFiniteNumber
  return (value) => typeof value === typeof defaultValue
}

function mergeSection<T extends object>(
  defaults: T,
  saved: unknown,
  guards: Partial<Record<keyof T, FieldGuard>> = {},
): T {
  const merged = { ...defaults }
  if (typeof saved !== 'object' || saved === null) return merged
  const source = saved as Record<string, unknown>
  for (const key of Object.keys(defaults) as (keyof T & string)[]) {
    if (!(key in source)) continue
    const guard = guards[key] ?? defaultGuard(defaults[key])
    if (guard(source[key])) merged[key] = source[key] as T[typeof key]
  }
  return merged
}

const GEOMETRY_GUARDS: Partial<Record<keyof GeometryParams, FieldGuard>> = {
  positioning: oneOf<PositioningMode>(['single', 'grid', 'gridCentered', 'circle', 'custom']),
  customPoints: isPointList,
}

const OUTLINE_GUARDS: Partial<Record<keyof OutlineParams, FieldGuard>> = {
  shape: oneOf<OutlineShape>(['rectCornered', 'rectCentered', 'circle']),
  offsetMode: oneOf<OffsetMode>(['inside', 'outside', 'onLine']),
  // Shape/method mismatches (e.g. ramp on a circle) are already handled by
  // the Standard fallback in activeOutlineMethodMeta()/generateOutline().
  method: oneOf<OutlineMethod>(['ramp', 'standard', 'helix']),
}

const RASTER_DIRECTIONS = oneOf<RasterDirection>(['x', 'y'])
const Z_TRANSITION_MODES = oneOf<ZTransitionMode>(['plunge', 'helix'])

const SURFACE_GUARDS: Partial<Record<keyof SurfaceParams, FieldGuard>> = {
  shape: oneOf<SurfaceShape>(['rectCornered', 'rectCentered']),
  method: oneOf<SurfaceMethodType>(['zigzag', 'unidirectional']),
  rasterDirection: RASTER_DIRECTIONS,
  zTransitionMode: Z_TRANSITION_MODES,
}

const POCKET_GUARDS: Partial<Record<keyof PocketParams, FieldGuard>> = {
  shape: oneOf<PocketShape>(['rectCornered', 'rectCentered', 'circle', 'rectLightened', 'circleLightened']),
  lightLayout: oneOf<LightLayout>(['xgrid', 'triangles']),
  // A stored 'raster' (method removed, BL-73) fails the guard and falls back
  // to the default, Spiral.
  method: oneOf<PocketMethodType>(['spiral', 'adaptive']),
  zTransitionMode: Z_TRANSITION_MODES,
  cutDirection: oneOf<CutDirection>(['conventional', 'climb']),
  chipThinningBaseFeed: (value) => value === null || isFiniteNumber(value),
}

const OUTPUT_GUARDS: Partial<Record<keyof OutputOptions, FieldGuard>> = {
  interpolation: oneOf<InterpolationMode>(['arc', 'linear']),
}

// Snapshots saved before customPointsText existed (BL-48) carry only the
// parsed points — rebuild their text from those instead of letting the
// default '10,10' shadow the preset's real list.
function mergeGeometry(saved: unknown): GeometryParams {
  const merged = mergeSection(DEFAULT_WIZARD_PARAMS.geometry, saved, GEOMETRY_GUARDS)
  const source = (typeof saved === 'object' && saved !== null ? saved : {}) as Partial<GeometryParams>
  if (source.customPointsText === undefined && isPointList(source.customPoints)) {
    merged.customPointsText = formatCustomPoints(merged.customPoints)
  }
  return merged
}

// Per-section, per-field merge with defaults — a snapshot saved by an older
// version of the app that's missing newly-added fields still loads cleanly,
// picking up defaults for whatever it doesn't have (or has in a shape this
// version doesn't recognise).
function mergeWithDefaults(saved: unknown): WizardParams {
  const source = (typeof saved === 'object' && saved !== null ? saved : {}) as Record<string, unknown>
  return {
    operation: isOperationType(source.operation) ? source.operation : DEFAULT_WIZARD_PARAMS.operation,
    method: isMethodType(source.method) ? source.method : DEFAULT_WIZARD_PARAMS.method,
    geometry: mergeGeometry(source.geometry),
    outline: mergeSection(DEFAULT_WIZARD_PARAMS.outline, source.outline, OUTLINE_GUARDS),
    surface: mergeSection(DEFAULT_WIZARD_PARAMS.surface, source.surface, SURFACE_GUARDS),
    pocket: mergeSection(DEFAULT_WIZARD_PARAMS.pocket, source.pocket, POCKET_GUARDS),
    feeds: mergeSection(DEFAULT_WIZARD_PARAMS.feeds, source.feeds),
    output: mergeSection(DEFAULT_WIZARD_PARAMS.output, source.output, OUTPUT_GUARDS),
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

// BL-40: "Reset All Settings" — clears every slot at once, including the
// hidden auto-save slot "0", not just the named presets deleteSlot()
// removes one at a time.
export function clearAllSlots(): void {
  writeStorage({ version: SCHEMA_VERSION, slots: {} })
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
