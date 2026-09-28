import type { PocketParams, Point2D } from '../types/wizard'

// Center of the pocket in program coordinates — mirrors rectCorners()'s
// origin convention (outlineRectangleGeometry.ts): 'rectCornered' has its
// origin at the bottom-left corner (center is offset by half the nominal
// dimensions), 'rectCentered' and 'circle' are already centered on
// offsetX/offsetY. Every ring/entry computation in the Pocket
// engine works from this single center point.
export function pocketCenter(pocket: Pick<PocketParams, 'shape' | 'width' | 'height' | 'offsetX' | 'offsetY'>): Point2D {
  if (pocket.shape === 'rectCornered') {
    return { x: pocket.offsetX + pocket.width / 2, y: pocket.offsetY + pocket.height / 2 }
  }
  return { x: pocket.offsetX, y: pocket.offsetY }
}

// Tool-center wall half-dimensions for Rectangle — the nominal rectangle
// INSET by the tool radius on all sides (opposite sign from Surface's
// surfaceToolBounds, which grows outward for overtravel: Pocket's wall is
// a hard limit, not an overtravel margin). This is the FINAL wall — the
// finishing pass runs on it (BL-42); roughing stops at
// pocketRoughRectWallHalfDims() below, which is the same wall unless a
// finishing pass is enabled.
export function pocketRectWallHalfDims(
  pocket: Pick<PocketParams, 'width' | 'height' | 'toolDiameter'>,
): { halfWidth: number; halfHeight: number } {
  const r = pocket.toolDiameter / 2
  return { halfWidth: pocket.width / 2 - r, halfHeight: pocket.height / 2 - r }
}

// Tool-center wall radius for Circle — same inside-inset reasoning as
// pocketRectWallHalfDims, just for the round shape.
export function pocketCircleWallRadius(pocket: Pick<PocketParams, 'diameter' | 'toolDiameter'>): number {
  return pocket.diameter / 2 - pocket.toolDiameter / 2
}

// Radial stock the roughing leaves on the walls for the finishing pass
// (BL-42) — 0 when finishing is off, so roughing runs to the final wall.
// Walls only: the floor is always roughed to full depth.
export function pocketStockToLeave(pocket: Pick<PocketParams, 'finishingEnabled' | 'stockToLeave'>): number {
  return pocket.finishingEnabled ? pocket.stockToLeave : 0
}

type RoughWallFields = 'finishingEnabled' | 'stockToLeave' | 'toolDiameter'

// Tool-center wall the ROUGHING (Spiral, Adaptive) clears to — the final
// wall inset by pocketStockToLeave().
export function pocketRoughRectWallHalfDims(
  pocket: Pick<PocketParams, 'width' | 'height' | RoughWallFields>,
): { halfWidth: number; halfHeight: number } {
  const { halfWidth, halfHeight } = pocketRectWallHalfDims(pocket)
  const stock = pocketStockToLeave(pocket)
  return { halfWidth: halfWidth - stock, halfHeight: halfHeight - stock }
}

export function pocketRoughCircleWallRadius(pocket: Pick<PocketParams, 'diameter' | RoughWallFields>): number {
  return pocketCircleWallRadius(pocket) - pocketStockToLeave(pocket)
}

// Single source-of-truth stepover-% -> mm conversion — same mechanism as
// surfaceStepoverMm (surfaceGeometry.ts), shared by the engine, the
// read-only mm preview field, and Helix Radius ceiling validation.
export function pocketStepoverMm(pocket: Pick<PocketParams, 'toolDiameter' | 'stepoverPercent'>): number {
  return pocket.toolDiameter * (pocket.stepoverPercent / 100)
}
