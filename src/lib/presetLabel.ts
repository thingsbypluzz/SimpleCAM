import { OPERATION_META } from '../config/operationMeta'
import type { WizardParams } from '../types/wizard'

// Short auto-generated label shown on a saved preset slot's tooltip — no
// user-entered name, derived straight from the params. Pattern/shape is
// the primary identity of a preset (two presets using the same method but
// a different pattern must look distinct — see CLAUDE.md "Reorganizacja
// taksonomii"), method is secondary. Outline's shape label already folds
// in dimensions and offset mode (see outlineShapeLabel), so unlike
// Hole(s) there's no separate trailing "⌀...mm" segment.
export function presetLabel(params: WizardParams): string {
  return OPERATION_META[params.operation].presetLabel(params)
}
