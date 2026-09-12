import type { SurfaceParams } from '../types/wizard'

export interface SurfaceBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

// Nominal rectangle before overtravel — same origin convention as
// outlineRectangleGeometry.ts's rectCorners (Cornered: origin at
// offsetX/offsetY; Centered: centered on offsetX/offsetY), but returned as
// a bounding box instead of 4 ordered corners — Surface has no winding
// direction, it fills an area rather than tracing a perimeter.
export function surfaceNominalBounds(
  surface: Pick<SurfaceParams, 'shape' | 'width' | 'height' | 'offsetX' | 'offsetY'>,
): SurfaceBounds {
  if (surface.shape === 'rectCentered') {
    return {
      minX: surface.offsetX - surface.width / 2,
      maxX: surface.offsetX + surface.width / 2,
      minY: surface.offsetY - surface.height / 2,
      maxY: surface.offsetY + surface.height / 2,
    }
  }
  return {
    minX: surface.offsetX,
    maxX: surface.offsetX + surface.width,
    minY: surface.offsetY,
    maxY: surface.offsetY + surface.height,
  }
}

// Tool-center bounding box: the nominal rectangle expanded OUTWARD by the
// tool radius on all four sides, unconditionally — overtravel is always on
// for Surface (no Inside/Outside/On-line offset-mode concept like Outline;
// the tool must clear every edge/corner to actually face the full nominal
// area). Grows symmetrically on every side, unlike Outline's
// rectToolDimensions (which for 'outside' grows asymmetrically toward the
// opposite corner depending on offset mode) — genuinely different math, not
// reused from outlineRectangleGeometry.ts.
export function surfaceToolBounds(
  surface: Pick<SurfaceParams, 'shape' | 'width' | 'height' | 'offsetX' | 'offsetY' | 'toolDiameter'>,
): SurfaceBounds {
  const nominal = surfaceNominalBounds(surface)
  const r = surface.toolDiameter / 2
  return { minX: nominal.minX - r, maxX: nominal.maxX + r, minY: nominal.minY - r, maxY: nominal.maxY + r }
}

// Single source-of-truth stepover-% -> mm conversion — shared by the
// engine, the read-only mm preview field in Step2GeometrySurface.tsx, and
// validation.ts's Helix Radius ceiling check.
export function surfaceStepoverMm(surface: Pick<SurfaceParams, 'toolDiameter' | 'stepoverPercent'>): number {
  return surface.toolDiameter * (surface.stepoverPercent / 100)
}

// The fixed raster start corner for every Z level (see CLAUDE.md's Surface
// design notes) — always min-X/min-Y of the tool-center bounds, regardless
// of shape (Cornered/Centered) or raster direction.
export function surfaceStartCorner(
  surface: Pick<SurfaceParams, 'shape' | 'width' | 'height' | 'offsetX' | 'offsetY' | 'toolDiameter'>,
): { x: number; y: number } {
  const bounds = surfaceToolBounds(surface)
  return { x: bounds.minX, y: bounds.minY }
}
