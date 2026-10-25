// The buttons laid over a Preview Viewport — shared by the 2D and the 3D
// preview. With a mouse: small buttons in the corners. On a touch device
// (BL-8): two full-width bars, top and bottom, with buttons the size of
// the Preset Bar's slots, sharing the width evenly — on a phone in
// portrait shorter, so the viewport between the bars keeps its room.

const BAR_TOUCH =
  'pointer-coarse:inset-x-0 pointer-coarse:grid pointer-coarse:grid-flow-col pointer-coarse:auto-cols-fr pointer-coarse:gap-2 pointer-coarse:border-border pointer-coarse:bg-code-bg/90 pointer-coarse:px-4 pointer-coarse:py-2.5 phone:gap-1.5 phone:py-1.5'

export const previewTopBarClass = `absolute top-3 left-3 flex flex-wrap items-center gap-1.5 pointer-coarse:top-0 pointer-coarse:border-b ${BAR_TOUCH}`

export const previewBottomBarClass = `absolute right-3 bottom-3 flex flex-wrap items-center justify-end gap-1.5 pointer-coarse:bottom-0 pointer-coarse:border-t ${BAR_TOUCH}`

export const previewButtonClass =
  'rounded-md border border-field-border bg-field-bg/90 px-2.5 py-1 text-xs font-medium text-value shadow-sm hover:bg-field-bg pointer-coarse:h-12 pointer-coarse:rounded-lg pointer-coarse:bg-field-bg pointer-coarse:px-1 pointer-coarse:text-sm pointer-coarse:font-semibold phone:h-9 phone:rounded-md phone:text-xs phone:leading-tight'
