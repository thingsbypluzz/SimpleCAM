import { PRESET_SLOT_IDS, type PresetSlotId } from './storage'
import type { WizardParams } from '../types/wizard'

// Iterates PRESET_SLOT_IDS (not the Set) so the result always comes back in
// stable [1]-[7] order regardless of click order — draw order matters for
// the 2D overlay (painter's algorithm), so a predictable order is worth
// pinning even though relative order within the overlay group itself isn't
// currently visually significant.
//
// With nothing selected it always returns the same frozen empty array
// (BL-52): both previews treat a new overlayParams reference as "the overlay
// selection changed" and re-frame the camera, and in Edit Mode every live
// save replaces presetSlots — so a fresh [] per edit used to reset the 2D/3D
// view (and rebuild the 3D scene a second time) on every keystroke.
const NO_OVERLAY: readonly WizardParams[] = Object.freeze([])

export function deriveOverlayParams(
  overlaySlots: ReadonlySet<PresetSlotId>,
  presetSlots: Partial<Record<PresetSlotId, WizardParams>>,
): readonly WizardParams[] {
  if (overlaySlots.size === 0) return NO_OVERLAY
  return PRESET_SLOT_IDS.filter((id) => overlaySlots.has(id))
    .map((id) => presetSlots[id])
    .filter((params): params is WizardParams => params !== undefined)
}
