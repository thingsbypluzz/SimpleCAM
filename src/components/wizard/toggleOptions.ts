import type {
  CutDirection,
  FacingOriginAcross,
  FacingOriginAlong,
  InterpolationMode,
  RasterDirection,
  ZTransitionMode,
} from '../../types/wizard'
import type { TextToggleOption } from './TextToggle'

// Option lists for TextToggle, shared where the same choice appears in more
// than one operation's Step 2 (Surface and Pocket both have Z-Transition
// Mode).

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

// Facing: the same choice, but on the outside of the part — under M3 climb
// keeps the material on the right of the tool's travel.
export const FACING_CUT_DIRECTION_OPTIONS: readonly TextToggleOption<CutDirection>[] = [
  { value: 'conventional', label: 'Conventional', title: 'Conventional milling — the material on the left of the tool\'s travel under M3' },
  { value: 'climb', label: 'Climb', title: 'Climb milling — the material on the right of the tool\'s travel under M3' },
]

export const FACING_ORIGIN_ALONG_OPTIONS: readonly TextToggleOption<FacingOriginAlong>[] = [
  { value: 'start', label: 'Start', title: 'Origin at the low-coordinate end of the side (left, or bottom for Left/Right Side)' },
  { value: 'center', label: 'Center', title: 'Origin at the middle of the side' },
  { value: 'end', label: 'End', title: 'Origin at the high-coordinate end of the side (right, or top for Left/Right Side)' },
]

export const FACING_ORIGIN_ACROSS_OPTIONS: readonly TextToggleOption<FacingOriginAcross>[] = [
  { value: 'raw', label: 'Raw Edge', title: 'Origin on the edge as it is now — the finished edge ends up inside the material' },
  { value: 'finished', label: 'Finished', title: 'Origin on the edge the cut leaves — the raw edge sticks out past it' },
]

export const INTERPOLATION_OPTIONS: readonly TextToggleOption<InterpolationMode>[] = [
  { value: 'arc', label: 'G2/G3 (arcs)' },
  { value: 'linear', label: 'G1 (segments)' },
]
