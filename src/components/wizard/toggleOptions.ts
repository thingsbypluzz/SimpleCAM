import type { CutDirection, InterpolationMode, RasterDirection, ZTransitionMode } from '../../types/wizard'
import type { TextToggleOption } from './TextToggle'

// Option lists for TextToggle, shared where the same choice appears in more
// than one operation's Step 2 (Surface and Pocket both have Raster
// Direction and Z-Transition Mode).

export const RASTER_DIRECTION_OPTIONS: readonly TextToggleOption<RasterDirection>[] = [
  { value: 'x', label: 'X' },
  { value: 'y', label: 'Y' },
]

export const Z_TRANSITION_MODE_OPTIONS: readonly TextToggleOption<ZTransitionMode>[] = [
  { value: 'plunge', label: 'Plunge' },
  { value: 'helix', label: 'Helix' },
]

// "Conv." keeps Method + Direction on one line next to Pocket's three
// method buttons; the full word is in the tooltip.
export const CUT_DIRECTION_OPTIONS: readonly TextToggleOption<CutDirection>[] = [
  { value: 'conventional', label: 'Conv.', title: 'Conventional milling (clockwise inside the pocket under M3)' },
  { value: 'climb', label: 'Climb', title: 'Climb milling (counter-clockwise inside the pocket under M3)' },
]

export const INTERPOLATION_OPTIONS: readonly TextToggleOption<InterpolationMode>[] = [
  { value: 'arc', label: 'G2/G3 (arcs)' },
  { value: 'linear', label: 'G1 (segments)' },
]
