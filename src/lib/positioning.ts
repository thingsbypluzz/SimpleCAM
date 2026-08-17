import type { GeometryParams, Point2D } from '../types/wizard'

export function resolvePoints(geometry: GeometryParams): Point2D[] {
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
    case 'custom':
      return geometry.customPoints
  }
}
