import { PRESET_SLOT_IDS, type PresetSlotId } from './storage'
import type { WizardParams } from '../types/wizard'

// Iterates PRESET_SLOT_IDS (not the Set) so the result always comes back in
// stable [1]-[5] order regardless of click order — draw order matters for
// the 2D overlay (painter's algorithm), so a predictable order is worth
// pinning even though relative order within the overlay group itself isn't
// currently visually significant.
export function deriveOverlayParams(
  overlaySlots: ReadonlySet<PresetSlotId>,
  presetSlots: Partial<Record<PresetSlotId, WizardParams>>,
): WizardParams[] {
  return PRESET_SLOT_IDS.filter((id) => overlaySlots.has(id))
    .map((id) => presetSlots[id])
    .filter((params): params is WizardParams => params !== undefined)
}
