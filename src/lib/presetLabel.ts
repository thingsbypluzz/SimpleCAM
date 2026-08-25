import { METHOD_META } from '../config/methodMeta'
import { patternLabel } from '../config/positioningMeta'
import { activeOutlineMethodMeta, outlineShapeLabel } from '../config/outlineMeta'
import type { WizardParams } from '../types/wizard'

// Short auto-generated label shown on a saved preset slot's tooltip — no
// user-entered name, derived straight from the params. Pattern/shape is
// the primary identity of a preset (two presets using the same method but
// a different pattern must look distinct — see CLAUDE.md "Reorganizacja
// taksonomii"), method is secondary. Outline's shape label already folds
// in dimensions and offset mode (see outlineShapeLabel), so unlike
// Hole(s) there's no separate trailing "⌀...mm" segment.
export function presetLabel(params: WizardParams): string {
  if (params.operation === 'outline') {
    return `${outlineShapeLabel(params.outline)} • ${activeOutlineMethodMeta(params.outline).shortLabel}`
  }
  const { shortLabel } = METHOD_META[params.method]
  return `${patternLabel(params.geometry)} • ${shortLabel} • ⌀${params.geometry.holeDiameter}mm`
}
