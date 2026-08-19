import { OPERATION_META } from '../config/operationMeta'
import { patternLabel } from '../config/positioningMeta'
import type { WizardParams } from '../types/wizard'

// Short auto-generated label shown on a saved preset slot's tooltip — no
// user-entered name, derived straight from the params. Pattern is the
// primary identity of a preset (two presets using the same method but a
// different pattern must look distinct — see CLAUDE.md "Reorganizacja
// taksonomii"), method and hole diameter are secondary.
export function presetLabel(params: WizardParams): string {
  const { shortLabel } = OPERATION_META[params.operation]
  return `${patternLabel(params.geometry)} • ${shortLabel} • ⌀${params.geometry.holeDiameter}mm`
}
