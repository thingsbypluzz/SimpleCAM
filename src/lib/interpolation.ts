import type { WizardParams } from '../types/wizard'
import { OPERATION_RULES } from './validation'

// Why Step 4's G2/G3 vs G1 toggle is locked on G1 for the active operation,
// or null when the user's choice (output.interpolation) applies. Rectangle
// Outline is always straight-edge G1, independent of tabs — no arc geometry
// at all. Tabs force G1 for the whole program (Hole(s), Circle Outline).
// Facing (OP-7) is straight lines only, like the rectangle. Surface and
// Pocket have no tabs (BL-51: they used to read Hole(s)' tab
// flag, locking the toggle on "G1" while the file still had arcs). Pure so
// the invariant test can check the engines agree with what the UI shows.
export function forcedLinearReason(params: WizardParams): 'rectOutline' | 'facing' | 'text' | 'tabs' | null {
  if (params.operation === 'outline' && (params.outline.shape === 'rectCornered' || params.outline.shape === 'rectCentered')) return 'rectOutline'
  if (params.operation === 'facing') return 'facing'
  // Text (OP-4): letters are sampled curves — straight moves only.
  if (params.operation === 'text') return 'text'
  return OPERATION_RULES[params.operation].tabs(params)?.tabsEnabled ? 'tabs' : null
}
