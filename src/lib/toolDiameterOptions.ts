import { fmt } from './format'
import type { ToolDiameterOption } from '../types/toolDiameters'

// User-added entries never get a free-text label (see CLAUDE.md's BL-19
// notes) — always "<value> mm", reusing the same rounding/trailing-zero
// stripping the G-code engine uses for coordinates.
export function formatToolDiameterLabel(value: number): string {
  return `${fmt(value)} mm`
}

// The three Step2Geometry*.tsx <select> dropdowns bind directly to a plain
// number (geometry/outline/surface.toolDiameter) that was never validated
// against this list — so if the user edits the list in Settings and removes
// the entry a saved preset (or the live job) currently has selected, the
// list alone would silently desync the visible dropdown from the actual
// bound value. Synthesizing one extra option for that value keeps the
// dropdown honest without touching the underlying number or blocking the
// removal in Settings.
export function resolveToolDiameterSelectOptions(
  options: ToolDiameterOption[],
  currentValue: number,
): ToolDiameterOption[] {
  const sorted = [...options].sort((a, b) => a.value - b.value)
  if (sorted.some((opt) => opt.value === currentValue)) return sorted
  const fallback: ToolDiameterOption = { value: currentValue, label: formatToolDiameterLabel(currentValue) }
  return [...sorted, fallback].sort((a, b) => a.value - b.value)
}
