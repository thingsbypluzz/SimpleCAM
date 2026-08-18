import { OPERATION_META } from '../config/operationMeta'
import type { WizardParams } from '../types/wizard'

// Short auto-generated label shown on a saved preset slot's tooltip — no
// user-entered name, derived straight from the params (operation + the two
// dimensions that identify a hole fastest: diameter and depth).
export function presetLabel(params: WizardParams): string {
  const { shortLabel } = OPERATION_META[params.operation]
  const { holeDiameter, totalDepth } = params.geometry
  return `${shortLabel} • ⌀${holeDiameter}mm, ${totalDepth}mm deep`
}
