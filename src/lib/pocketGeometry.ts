import type { PocketParams, Point2D } from '../types/wizard'
import type { SurfaceBounds } from './surfaceGeometry'

// Center of the pocket in program coordinates — mirrors rectCorners()'s
// origin convention (outlineRectangleGeometry.ts): 'rectCornered' has its
// origin at the bottom-left corner (center is offset by half the nominal
// dimensions), 'rectCentered' and 'circle' are already centered on
// offsetX/offsetY. Every ring/raster/entry computation in the Pocket
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
// a hard limit, not an overtravel margin). Roughing-only in v1 (see
// CLAUDE.md) — this IS the final wall, not a rough-then-finish boundary.
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

// Raster method's clip boundary (Rectangle only — see CLAUDE.md) — the
// tool-center wall, expressed as a bounding box around the pocket's own
// center. computeRasterLines()/zigzagWaypoints() (surfaceRaster.ts) are
// reused unchanged from Surface; only the bounds math differs (inset here
// vs Surface's outset overtravel — see pocketRectWallHalfDims above).
export function pocketRectRasterBounds(
  pocket: Pick<PocketParams, 'shape' | 'width' | 'height' | 'offsetX' | 'offsetY' | 'toolDiameter'>,
): SurfaceBounds {
  const center = pocketCenter(pocket)
  const { halfWidth, halfHeight } = pocketRectWallHalfDims(pocket)
  return { minX: center.x - halfWidth, maxX: center.x + halfWidth, minY: center.y - halfHeight, maxY: center.y + halfHeight }
}

// Single source-of-truth stepover-% -> mm conversion — same mechanism as
// surfaceStepoverMm (surfaceGeometry.ts), shared by the engine, the
// read-only mm preview field, and Helix Radius ceiling validation.
export function pocketStepoverMm(pocket: Pick<PocketParams, 'toolDiameter' | 'stepoverPercent'>): number {
  return pocket.toolDiameter * (pocket.stepoverPercent / 100)
}
