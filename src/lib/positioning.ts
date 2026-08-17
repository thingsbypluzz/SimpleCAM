import type { GeometryParams, Point2D } from '../types/wizard'

function rawPoints(geometry: GeometryParams): Point2D[] {
  switch (geometry.positioning) {
    case 'single':
      return [{ x: 0, y: 0 }]
    case 'grid':
      return [
        { x: 0, y: 0 },
        { x: geometry.gridX, y: 0 },
        { x: geometry.gridX, y: geometry.gridY },
        { x: 0, y: geometry.gridY },
      ]
    case 'gridCentered':
      return [
        { x: -geometry.gridX / 2, y: -geometry.gridY / 2 },
        { x: geometry.gridX / 2, y: -geometry.gridY / 2 },
        { x: geometry.gridX / 2, y: geometry.gridY / 2 },
        { x: -geometry.gridX / 2, y: geometry.gridY / 2 },
      ]
    case 'custom':
      return geometry.customPoints
  }
}

// offsetX/offsetY shift the whole pattern uniformly — applied once, here,
// after the per-mode geometry is resolved, so every mode (including future
// ones) gets it automatically without touching the switch above. Every
// caller (G-code engine, 2D/3D previews) goes through this function, so
// there's nowhere else offset needs to be plumbed through.
export function resolvePoints(geometry: GeometryParams): Point2D[] {
  return rawPoints(geometry).map((p) => ({
    x: p.x + geometry.offsetX,
    y: p.y + geometry.offsetY,
  }))
}
