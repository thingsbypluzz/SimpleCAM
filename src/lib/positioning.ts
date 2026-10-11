import type { GeometryParams, Point2D } from '../types/wizard'

// Purely arbitrary sanity ceiling (BL-1) for N-Holes on Circle — no
// physical quantity to derive it from. Validation blocks Generate above it
// (isCircleHoleCountValid()); the pattern itself is capped here too, so a
// typo like "1000" can't make the 2D/3D previews build a thousand holes
// before the error shows (BL-63).
export const MAX_CIRCLE_HOLE_COUNT = 100

// Grid patterns (BL-117): at most this many columns or rows, and holes in
// all. Validation blocks Generate above either (isGridCountValid()); the
// pattern itself is capped too, like N-Holes on Circle.
export const MAX_GRID_COUNT = 20
export const MAX_GRID_HOLES = 100

// The columns and rows a grid actually drills. A spacing of exactly 0 folds
// that axis into one line of holes — the long-standing shortcut for "two
// holes N mm apart" (set the other spacing to 0), which would otherwise
// drill the same spot several times.
export function gridCounts(geometry: Pick<GeometryParams, 'gridX' | 'gridY' | 'gridCountX' | 'gridCountY'>): { columns: number; rows: number } {
  const clamp = (count: number) => Math.min(MAX_GRID_COUNT, Math.max(1, Math.round(count)))
  return {
    columns: geometry.gridX === 0 ? 1 : clamp(geometry.gridCountX),
    rows: geometry.gridY === 0 ? 1 : clamp(geometry.gridCountY),
  }
}

function rawPoints(geometry: GeometryParams): Point2D[] {
  switch (geometry.positioning) {
    case 'single':
      return [{ x: 0, y: 0 }]
    case 'grid':
    case 'gridCentered': {
      const { gridX, gridY } = geometry
      const { columns, rows } = gridCounts(geometry)
      const centered = geometry.positioning === 'gridCentered'
      const x0 = centered ? (-gridX * (columns - 1)) / 2 : 0
      const y0 = centered ? (-gridY * (rows - 1)) / 2 : 0
      // Row by row, every other row backwards (a snake): the shortest
      // travel between holes — and for 2 × 2 the lap around the rectangle
      // the pattern has always drilled.
      const points: Point2D[] = []
      for (let row = 0; row < rows; row++) {
        for (let i = 0; i < columns; i++) {
          const column = row % 2 === 0 ? i : columns - 1 - i
          points.push({ x: x0 + column * gridX, y: y0 + row * gridY })
        }
      }
      return points
    }
    case 'circle': {
      // Guarded against fractional/negative hole counts (same defensive
      // pattern as the toolRadius clamp in buildScene.ts) — 0 holes just
      // returns an empty pattern, same as an empty Custom List — and capped
      // at MAX_CIRCLE_HOLE_COUNT (see above).
      const count = Math.min(MAX_CIRCLE_HOLE_COUNT, Math.max(0, Math.round(geometry.circleHoleCount)))
      const radius = geometry.circleDiameter / 2
      const startRad = (geometry.circleStartAngle * Math.PI) / 180
      return Array.from({ length: count }, (_, i) => {
        const angle = startRad + (2 * Math.PI * i) / count
        return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) }
      })
    }
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
