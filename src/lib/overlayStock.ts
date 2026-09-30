import polygonClipping, { type MultiPolygon, type Polygon, type Ring } from 'polygon-clipping'
import type { Point2D, WizardParams } from '../types/wizard'
import { rectCorners } from './outlineRectangleGeometry'
import { pocketCenter } from './pocketGeometry'
import { cellLoop, isLightenedShape, lightenedCells } from './pocketLightened'
import { resolvePoints } from './positioning'

// A void cut out of the stock sheet — a circle or a closed polygon, in CNC
// (x, y). Shared by both previews (2D fillStockSheet, 3D stock caps).
export type SheetVoid = { circle: Point2D; radius: number } | { polygon: Point2D[] }

// A Pocket's voids: its nominal boundary, or — Lightened (OP-6) — every
// cell's nominal outline (sharp corners, like the Rectangle's), leaving the
// ribs, rim and hub as sheet. Shared by both previews and the Overlay sheet.
export function pocketVoids(pocket: WizardParams['pocket']): SheetVoid[] {
  if (isLightenedShape(pocket.shape)) {
    return lightenedCells(pocket)
      .map((cell) => cellLoop(cell, 0))
      .filter((polygon) => polygon.length >= 3)
      .map((polygon) => ({ polygon }))
  }
  const c = pocketCenter(pocket)
  if (pocket.shape === 'circle') return [{ circle: c, radius: pocket.diameter / 2 }]
  const hw = pocket.width / 2
  const hh = pocket.height / 2
  return [
    {
      polygon: [
        { x: c.x - hw, y: c.y - hh },
        { x: c.x + hw, y: c.y - hh },
        { x: c.x + hw, y: c.y + hh },
        { x: c.x - hw, y: c.y + hh },
      ],
    },
  ]
}

// BL-75: in Overlay, one illusory stock sheet is shared by every overlaid
// preset — but only while none of them is a solid part of its own
// (Outline Outside/On-line keep a closed island, Surface a "remaining
// material" block). Returns that preset's voids, or null for a solid.
export function stockVoids(params: WizardParams): SheetVoid[] | null {
  if (params.operation === 'surface') return null
  if (params.operation === 'pocket') return pocketVoids(params.pocket)
  if (params.operation === 'outline') {
    const { outline } = params
    if (outline.offsetMode !== 'inside') return null
    if (outline.shape === 'circle') return [{ circle: { x: outline.offsetX, y: outline.offsetY }, radius: outline.diameter / 2 }]
    return [
      {
        polygon: rectCorners(
          outline.shape,
          outline.width,
          outline.height,
          outline.width,
          outline.height,
          outline.offsetX,
          outline.offsetY,
          'ccw',
        ),
      },
    ]
  }
  const { geometry } = params
  return resolvePoints(geometry).map((p) => ({ circle: p, radius: geometry.holeDiameter / 2 }))
}

// Every overlaid preset's voids together, or null as soon as one of them
// is a solid — then Overlay draws no shared sheet at all (BL-3's original
// rule: each preset shows its own extent through its own walls).
export function overlaySheetVoids(overlayParams: readonly WizardParams[]): SheetVoid[] | null {
  const all: SheetVoid[] = []
  for (const params of overlayParams) {
    const voids = stockVoids(params)
    if (voids === null) return null
    all.push(...voids)
  }
  return all
}

// Same density as every G1-approximated circle in the app (72 per turn).
const CIRCLE_SEGMENTS = 72

function voidRing(v: SheetVoid): Ring {
  if ('circle' in v) {
    const r = Math.max(0, v.radius)
    return Array.from({ length: CIRCLE_SEGMENTS }, (_, i) => {
      const a = (2 * Math.PI * i) / CIRCLE_SEGMENTS
      return [v.circle.x + r * Math.cos(a), v.circle.y + r * Math.sin(a)] as [number, number]
    })
  }
  return v.polygon.map((p) => [p.x, p.y] as [number, number])
}

export interface SheetRect {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

// The sheet with every void removed. Overlapping voids of different presets
// are unioned first, so the result is valid for THREE.Shape (outer ring +
// non-overlapping holes); a ring of holes enclosing material comes back as
// a separate polygon for that island.
export function sheetMinusVoids(sheet: SheetRect, voids: readonly SheetVoid[]): MultiPolygon {
  const sheetPolygon: Polygon = [
    [
      [sheet.minX, sheet.minY],
      [sheet.maxX, sheet.minY],
      [sheet.maxX, sheet.maxY],
      [sheet.minX, sheet.maxY],
    ],
  ]
  const clips: Polygon[] = voids.filter((v) => !('circle' in v) || v.radius > 0).map((v) => [voidRing(v)])
  if (clips.length === 0) return [sheetPolygon]
  return polygonClipping.difference(sheetPolygon, ...clips)
}
