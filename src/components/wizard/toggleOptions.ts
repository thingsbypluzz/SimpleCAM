import type {
  CutDirection,
  FacingOriginAcross,
  FacingOriginAlong,
  InterpolationMode,
  LobeMode,
  RasterDirection,
  ZTransitionMode,
  HoleBottom,
  TextAlign,
  TextCircleSide,
  TextOriginX,
  TextOriginY,
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

// Text (OP-4).
export const TEXT_ALIGN_OPTIONS: readonly TextToggleOption<TextAlign>[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
]

export const TEXT_ORIGIN_X_OPTIONS: readonly TextToggleOption<TextOriginX>[] = [
  { value: 'left', label: 'Left', title: 'The origin is at the left end of the text' },
  { value: 'center', label: 'Center', title: 'The origin is in the middle of the text' },
  { value: 'right', label: 'Right', title: 'The origin is at the right end of the text' },
]

export const TEXT_ORIGIN_Y_OPTIONS: readonly TextToggleOption<TextOriginY>[] = [
  { value: 'baseline', label: 'Baseline', title: 'The origin is on the line the first row of letters stands on' },
  { value: 'middle', label: 'Middle', title: "The origin is halfway up the text's height" },
]

export const TEXT_CIRCLE_SIDE_OPTIONS: readonly TextToggleOption<TextCircleSide>[] = [
  { value: 'outside', label: 'Heads Out', title: 'Letters stand on the circle with their heads away from its center — read clockwise, e.g. along the top' },
  { value: 'inside', label: 'Heads In', title: 'Letters stand with their heads toward the center — read counter-clockwise, e.g. along the bottom' },
]

// The three common V-bit angles. The value is stored as a number
// (text.vbitAngleDeg); a stored angle that is none of them shows no
// option selected.
export type VbitAngleOption = '30' | '60' | '90'
export const VBIT_ANGLE_OPTIONS: readonly TextToggleOption<VbitAngleOption>[] = [
  { value: '30', label: '30°' },
  { value: '60', label: '60°' },
  { value: '90', label: '90°' },
]

// Hole(s) (BL-111) — previews only.
export const HOLE_BOTTOM_OPTIONS: readonly TextToggleOption<HoleBottom>[] = [
  { value: 'open', label: 'Open', title: 'Drawn cut through the stock' },
  { value: 'closed', label: 'Closed', title: 'Drawn with a floor at its Depth' },
]

// Lobed Circle (BL-106).
export const LOBE_MODE_OPTIONS: readonly TextToggleOption<LobeMode>[] = [
  { value: 'add', label: 'Add', title: 'The lobe circles are added to the main circle' },
  { value: 'subtract', label: 'Subtract', title: 'The lobe circles are cut out of the main circle — notches on its rim' },
]

export const INTERPOLATION_OPTIONS: readonly TextToggleOption<InterpolationMode>[] = [
  { value: 'arc', label: 'G2/G3 (arcs)' },
  { value: 'linear', label: 'G1 (segments)' },
]
