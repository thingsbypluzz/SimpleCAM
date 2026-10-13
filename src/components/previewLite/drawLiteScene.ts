import type { MultiPolygon } from 'polygon-clipping'
import { getFixedColors, getPaletteAccents, type PaletteId } from '../../config/palettes'
import { previewPolylines, type PreviewPolyline } from '../../lib/previewPaths'
import type { StockModel } from '../../lib/stockModel'
import type { MoveKind } from '../../lib/toolpath'
import type { ThemeId } from '../../types/theme'
import type { WizardParams } from '../../types/wizard'
import { computeToolpathDataBounds, previewStock, type StockSheet } from '../preview/drawToolpath'
import { project, type Box3, type LiteCamera } from './camera3d'

// Everything the simplified 3D preview draws, worked out once per change of
// what is shown — a turn of the view only re-projects it.
export interface LiteScene {
  sheet: StockSheet
  model: StockModel | null
  polylines: PreviewPolyline[]
  // Total number of toolpath points — what the drawing thins out while
  // the view is being moved.
  pointCount: number
  // What Fit View frames: the shapes' extent with the origin, Safe Z down
  // to the deepest cut.
  box: Box3
}

function safePolylines(params: WizardParams): PreviewPolyline[] {
  try {
    return previewPolylines(params)
  } catch (err) {
    // A preview must not take the app down over one preset's toolpath.
    console.warn('OnlyPaths: could not build a toolpath for the preview', err)
    return []
  }
}

export function buildLiteScene(
  params: WizardParams,
  overlayParams: readonly WizardParams[],
  showActivePattern: boolean,
  // Overlay with one preset being edited: the overlaid presets keep their
  // stock but lose their toolpaths, as in the other previews.
  dimOverlay: boolean,
  showActiveToolpath: boolean,
  cutShape: boolean,
): LiteScene {
  const { sheet, model } = previewStock(params, overlayParams, showActivePattern, cutShape)
  const polylines = [
    ...(dimOverlay ? [] : overlayParams.flatMap(safePolylines)),
    ...(showActivePattern && showActiveToolpath ? safePolylines(params) : []),
  ]

  const data = computeToolpathDataBounds(params, overlayParams, showActivePattern)
  let minZ = 0
  let maxZ = 0
  let pointCount = 0
  for (const { points } of polylines) {
    pointCount += points.length / 3
    for (let i = 2; i < points.length; i += 3) {
      if (points[i] < minZ) minZ = points[i]
      if (points[i] > maxZ) maxZ = points[i]
    }
  }
  for (const band of model?.walls ?? []) minZ = Math.min(minZ, band.zBottom)

  return {
    sheet,
    model,
    polylines,
    pointCount,
    box: { min: [data.dataMinX, data.dataMinY, minZ], max: [data.dataMaxX, data.dataMaxY, maxZ] },
  }
}

interface LiteTheme {
  background: string
  grid: string
  axisX: string
  axisY: string
  axisZ: string
  text: string
  stockFill: string
  floorFill: string
  stockEdge: string
  toolpath: string
  rapid: string
  linking: string
}

export function liteTheme(paletteId: PaletteId, isDark: boolean, themeId: ThemeId): LiteTheme {
  const fixed = getFixedColors(themeId, isDark)
  const accents = getPaletteAccents(paletteId, isDark, themeId)
  return {
    background: fixed.background,
    grid: accents.grid,
    axisX: fixed.axisX,
    axisY: fixed.axisY,
    axisZ: fixed.origin,
    text: fixed.text,
    stockFill: fixed.holeFill,
    floorFill: fixed.pocketFloorFill,
    stockEdge: accents.hole,
    toolpath: accents.toolpath,
    rapid: accents.rapid,
    linking: accents.linking,
  }
}

// A wall gets a vertical line where its outline turns by more than this —
// the corners of a rectangle, not the facets of a circle (the full 3D
// preview's rule, EDGE_CORNER_DEG).
const CORNER_COS = Math.cos((20 * Math.PI) / 180)

// How the tool's moves are told apart, as in the other previews: cutting
// solid, rapids dashed, plunges and linking moves dotted.
const MOVE_ORDER: MoveKind[] = ['rapid', 'link', 'plunge', 'cut', 'finish']
const MOVE_DASH: Record<MoveKind, number[]> = {
  cut: [],
  finish: [],
  rapid: [6, 4],
  plunge: [2, 3],
  link: [2, 3],
}

// While the view is being moved, at most this many toolpath points are
// drawn (every n-th one) — a Pocket Adaptive path can hold hundreds of
// thousands, too many to redraw on every pointer event on a weak device.
const MOVING_POINT_BUDGET = 12000

export function drawLiteScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  camera: LiteCamera,
  scene: LiteScene,
  theme: LiteTheme,
  showStock: boolean,
  showToolpath: boolean,
  moving: boolean,
) {
  const at = (x: number, y: number, z: number) => project(camera, width, height, x, y, z)
  const line = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
    const [x1, y1] = at(ax, ay, az)
    const [x2, y2] = at(bx, by, bz)
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
  }
  // Every ring of a region as a closed sub-path at height z.
  const traceRegion = (region: MultiPolygon, z: number) => {
    for (const polygon of region) {
      for (const ring of polygon) {
        ring.forEach(([x, y], i) => {
          const [px, py] = at(x, y, z)
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        })
        ctx.closePath()
      }
    }
  }

  ctx.setLineDash([])
  ctx.fillStyle = theme.background
  ctx.fillRect(0, 0, width, height)

  // The table: the stock sheet's grid at Z0, on real, round coordinates.
  const { sheet } = scene
  const half = sheet.size / 2
  ctx.beginPath()
  for (let i = -sheet.halfCells; i <= sheet.halfCells; i++) {
    const d = i * sheet.step
    line(sheet.centerX + d, sheet.centerY - half, 0, sheet.centerX + d, sheet.centerY + half, 0)
    line(sheet.centerX - half, sheet.centerY + d, 0, sheet.centerX + half, sheet.centerY + d, 0)
  }
  ctx.strokeStyle = theme.grid
  ctx.lineWidth = 1
  ctx.stroke()

  // Stock: the model's faces as flat tints (floors first — they lie below
  // the top face), then its edges. Nothing hides anything: this preview
  // has no depth, so the toolpath shows through the material.
  const { model } = scene
  if (showStock && model) {
    for (const floor of [...model.floors].reverse()) {
      ctx.beginPath()
      traceRegion(floor.region, floor.z)
      ctx.fillStyle = theme.floorFill
      ctx.fill('evenodd')
    }
    ctx.beginPath()
    traceRegion(model.top, 0)
    ctx.fillStyle = theme.stockFill
    ctx.fill('evenodd')

    ctx.beginPath()
    traceRegion(model.top, 0)
    for (const band of model.walls) {
      traceRegion(band.region, band.zBottom)
      for (const polygon of band.region) {
        for (const ring of polygon) {
          // polygon-clipping repeats the first point at the end.
          const n = ring.length - 1
          for (let i = 0; i < n; i++) {
            const [px, py] = ring[(i + n - 1) % n]
            const [x, y] = ring[i]
            const [nx, ny] = ring[i + 1]
            const inLen = Math.hypot(x - px, y - py)
            const outLen = Math.hypot(nx - x, ny - y)
            if (inLen === 0 || outLen === 0) continue
            const cos = ((x - px) * (nx - x) + (y - py) * (ny - y)) / (inLen * outLen)
            if (cos < CORNER_COS) line(x, y, band.zTop, x, y, band.zBottom)
          }
        }
      }
    }
    ctx.strokeStyle = theme.stockEdge
    ctx.lineWidth = 1.25
    ctx.stroke()
  }

  // The origin's axes, one grid step long.
  const axis = (color: string, x: number, y: number, z: number, label: string) => {
    ctx.beginPath()
    line(0, 0, 0, x, y, z)
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.stroke()
    const [px, py] = at(x, y, z)
    ctx.fillStyle = color
    ctx.fillText(label, px + 4, py - 4)
  }
  ctx.font = '11px ui-monospace, monospace'
  axis(theme.axisX, sheet.step, 0, 0, 'X')
  axis(theme.axisY, 0, sheet.step, 0, 'Y')
  axis(theme.axisZ, 0, 0, sheet.step, 'Z')

  if (showToolpath) {
    const stride = moving ? Math.max(1, Math.ceil(scene.pointCount / MOVING_POINT_BUDGET)) : 1
    ctx.lineWidth = 1.25
    ctx.lineJoin = 'round'
    for (const kind of MOVE_ORDER) {
      ctx.beginPath()
      let any = false
      for (const polyline of scene.polylines) {
        if (polyline.kind !== kind) continue
        any = true
        const { points } = polyline
        const last = points.length - 3
        for (let i = 0; i <= last; i += 3 * stride) {
          const [px, py] = at(points[i], points[i + 1], points[i + 2])
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        // The thinned-out path still ends where the real one does.
        if (last % (3 * stride) !== 0) {
          const [px, py] = at(points[last], points[last + 1], points[last + 2])
          ctx.lineTo(px, py)
        }
      }
      if (!any) continue
      ctx.setLineDash(MOVE_DASH[kind])
      ctx.strokeStyle = kind === 'rapid' ? theme.rapid : kind === 'link' ? theme.linking : theme.toolpath
      ctx.stroke()
    }
    ctx.setLineDash([])
  }
}
