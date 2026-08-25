import type { MachineSettings } from '../types/machine'
import type { WizardParams } from '../types/wizard'
import { generateCircleOutlineHelix, generateCircleOutlineStandard } from './outlineCircle'
import { generateRectOutlineRamp, generateRectOutlineStandard } from './outlineRectangle'

// Single dispatch point for Outline generation — the operation-level
// counterpart to METHOD_META[params.method].generate() for Hole(s). A
// plain function rather than a metadata-record lookup: shape × method
// isn't an independent grid (rect never has 'helix', circle never has
// 'ramp'), so a Record<OutlineShape, Record<OutlineMethod, generate>>
// would carry impossible combinations. Any method value other than the
// one real alternative per shape family falls back to Standard — the UI
// (OutlineMethodPicker) only ever offers the two valid values per family,
// so this never actually happens, but it means an unreachable state still
// produces a sensible G-code file instead of nothing.
export function generateOutline(params: WizardParams, machine: MachineSettings): string[] {
  const { outline } = params
  switch (outline.shape) {
    case 'circle':
      return outline.method === 'helix'
        ? generateCircleOutlineHelix(params, machine)
        : generateCircleOutlineStandard(params, machine)
    case 'rectCornered':
    case 'rectCentered':
      return outline.method === 'ramp'
        ? generateRectOutlineRamp(params, machine)
        : generateRectOutlineStandard(params, machine)
  }
}
