import { DEFAULT_TOOL_DIAMETER_OPTIONS, type ToolDiameterOption } from '../types/toolDiameters'

// Separate localStorage key from simplecam.machine/simplecam.appearance —
// this is a growable list the user curates, not a fixed set of fields, so it
// gets its own key rather than being folded into either existing object.
const TOOL_DIAMETER_STORAGE_KEY = 'simplecam.toolDiameters'

function isValidOptionList(value: unknown): value is ToolDiameterOption[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        Number.isFinite((item as ToolDiameterOption).value) &&
        (item as ToolDiameterOption).value > 0 &&
        typeof (item as ToolDiameterOption).label === 'string',
    )
  )
}

export function loadToolDiameterOptions(): ToolDiameterOption[] {
  try {
    const raw = localStorage.getItem(TOOL_DIAMETER_STORAGE_KEY)
    if (!raw) return DEFAULT_TOOL_DIAMETER_OPTIONS
    const parsed = JSON.parse(raw)
    // Array-shaped data doesn't fit a field-by-field merge (there's no fixed
    // set of keys to merge) — an invalid or corrupted list falls back to the
    // full default wholesale, same as machineStorage.ts's whole-object
    // try/catch fallback.
    return isValidOptionList(parsed) ? parsed : DEFAULT_TOOL_DIAMETER_OPTIONS
  } catch (err) {
    console.warn('OnlyPaths: could not read tool diameters from localStorage', err)
    return DEFAULT_TOOL_DIAMETER_OPTIONS
  }
}

export function saveToolDiameterOptions(options: ToolDiameterOption[]): void {
  try {
    localStorage.setItem(TOOL_DIAMETER_STORAGE_KEY, JSON.stringify(options))
  } catch (err) {
    console.warn('OnlyPaths: could not save tool diameters to localStorage', err)
  }
}
