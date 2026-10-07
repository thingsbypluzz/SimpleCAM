import { getFixedColors, getPaletteAccents, type PaletteId } from '../../config/palettes'
import { resolvePoints } from '../../lib/positioning'
import { computeTabRanges, type TabRange } from '../../lib/tabs'
import { circleOutlineOptions, circleOutlineRadiusAndDirection, onLineCircleEdges } from '../../lib/outlineCircle'
import { onLineRectDimensions, rectCorners, rectToolDimensions } from '../../lib/outlineRectangleGeometry'
import { sideRangesFor, type SideTabRange } from '../../lib/outlineRectangleTabs'
import { surfaceNominalBounds, surfaceStepoverMm, surfaceToolBounds, type SurfaceBounds } from '../../lib/surfaceGeometry'
import { computeRasterLines, zigzagWaypoints, type RasterLine } from '../../lib/surfaceRaster'
import { buildFacingToolpath } from '../../lib/facing'
import { circlePassStartAngle } from '../../lib/helix'
import { lobedOutlineOptions, type LoopTabRange } from '../../lib/outlineLobed'
import {
  arcPoint,
  lobedNominalLoop,
  lobedOnLineEdges,
  loopBounds,
  loopPointAtLength,
  loopPolygon,
  loopSamplePositions,
  translateLoop,
  type Loop,
  type LoopBounds,
} from '../../lib/outlineLobedGeometry'
import { facingBlockCorners, facingStripCorners, facingViewBounds, type FacingBounds } from '../../lib/facingGeometry'
import { pocketCenter } from '../../lib/pocketGeometry'
import { buildPocketToolpath } from '../../lib/pocket'
import { movePoints, type MoveKind, type Toolpath } from '../../lib/toolpath'
import { cutContours, pocketVoids, stockModel, type StockModel } from '../../lib/stockModel'
import type { MultiPolygon } from 'polygon-clipping'
import type { Point2D, PocketMethodType, PocketShape, WizardParams } from '../../types/wizard'
import type { ThemeId } from '../../types/theme'
import { cellInscribed, isLightenedShape, lightenedCells } from '../../lib/pocketLightened'
import { type Camera2D, type DataBounds, worldToScreen } from './camera2d'

interface Theme {
  background: string
  grid: string
  axisX: string
  axisY: string
  origin: string
  holeFill: string
  pocketFloorFill: string
  holeStroke: string
  toolpath: string
  rapid: string
  linking: string
  text: string
  offset: string
  // The edited preset's outline inside an overlay (BL-116).
  edit: string
}

// Merges the palette-selectable accents (background/grid/toolpath/rapid/
// hole) with the fixed CNC-convention colors (axes/origin/offset/text) —
// see config/palettes.ts (BL-12) for why the two are split and where the
// actual color values live. holeStroke maps 1:1 to the palette's `hole`
// accent; holeFill/pocketFloorFill stay fixed, low-opacity origin tints
// (not palette accents) since they're not meant to stand out as a
// distinguishing color.
function buildTheme(paletteId: PaletteId, isDark: boolean, themeId: ThemeId): Theme {
  const fixed = getFixedColors(themeId, isDark)
  const accents = getPaletteAccents(paletteId, isDark, themeId)
  return {
    background: fixed.background,
    grid: accents.grid,
    axisX: fixed.axisX,
    axisY: fixed.axisY,
    origin: fixed.origin,
    holeFill: fixed.holeFill,
    pocketFloorFill: fixed.pocketFloorFill,
    holeStroke: accents.hole,
    toolpath: accents.toolpath,
    rapid: accents.rapid,
    linking: accents.linking,
    text: fixed.text,
    offset: fixed.offset,
    edit: fixed.edit,
  }
}

// Dash pattern (px) used for the tab arcs/segments below — BL-15: a gap
// with nothing drawn read as a missing piece of the toolpath/outline, not
// a physical bridge. Dashing the tab span in the same stroke color (no
// new palette color needed, see BL-15's CLAUDE.md note) keeps it visually
// distinct from the solid cut line while still tracing the true geometry.
const TAB_DASH: [number, number] = [3, 3]

// Strokes a circle, dashing the angular ranges in `tabRanges` (BL-14) —
// a dashed arc wherever the toolpath skips cutting (BL-15), solid
// elsewhere. `tabRanges` are in world/math angle convention (0 = +X,
// increasing = counterclockwise, same as tabs.ts and the engine);
// canvas's ctx.arc takes screen angles, which run the opposite way here
// since worldToScreen flips Y — negating both bounds (and swapping them
// back into increasing order) converts between the two without changing
// which points get traced.
function drawGappedCircle(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  radius: number,
  tabRanges: TabRange[],
  // Angle of the pass's start point — tab ranges are measured from it
  // (they are symmetric about it, so the travel direction doesn't matter).
  rotation = 0,
) {
  if (tabRanges.length === 0) {
    ctx.beginPath()
    ctx.arc(px, py, radius, 0, Math.PI * 2)
    ctx.stroke()
    return
  }

  const drawArc = (worldLo: number, worldHi: number, dashed: boolean) => {
    if (worldHi <= worldLo) return
    ctx.setLineDash(dashed ? TAB_DASH : [])
    ctx.beginPath()
    ctx.arc(px, py, radius, -(worldHi + rotation), -(worldLo + rotation))
    ctx.stroke()
  }

  const sorted = [...tabRanges].sort((a, b) => a.startAngle - b.startAngle)
  let cursor = 0
  for (const range of sorted) {
    drawArc(cursor, range.startAngle, false)
    drawArc(range.startAngle, range.endAngle, true)
    cursor = range.endAngle
  }
  drawArc(cursor, Math.PI * 2, false)
  ctx.setLineDash([])
}

// Rectangle analog of drawGappedCircle — walks the 4-corner perimeter in
// world space, dashing the fractional ranges in `sideRanges[edge]` per
// edge (BL-14 for Outline — see lib/outlineRectangleTabs.ts; dashing
// itself is BL-15, same treatment as the circle). Takes `toPx` directly
// rather than pre-converted screen coordinates, since (unlike a circle)
// each segment spans two different world points that both need
// converting.
function drawGappedRectangle(
  ctx: CanvasRenderingContext2D,
  toPx: (x: number, y: number) => [number, number],
  corners: Point2D[],
  sideRanges: SideTabRange[][],
) {
  const drawSegment = (p0: Point2D, p1: Point2D, fracLo: number, fracHi: number, dashed: boolean) => {
    if (fracHi <= fracLo) return
    const [xa, ya] = toPx(p0.x + (p1.x - p0.x) * fracLo, p0.y + (p1.y - p0.y) * fracLo)
    const [xb, yb] = toPx(p0.x + (p1.x - p0.x) * fracHi, p0.y + (p1.y - p0.y) * fracHi)
    ctx.setLineDash(dashed ? TAB_DASH : [])
    ctx.beginPath()
    ctx.moveTo(xa, ya)
    ctx.lineTo(xb, yb)
    ctx.stroke()
  }

  for (let edge = 0; edge < 4; edge++) {
    const p0 = corners[edge]
    const p1 = corners[(edge + 1) % 4]
    const ranges = sideRanges[edge]
    if (ranges.length === 0) {
      drawSegment(p0, p1, 0, 1, false)
      continue
    }
    const sorted = [...ranges].sort((a, b) => a.startFrac - b.startFrac)
    let cursor = 0
    for (const range of sorted) {
      drawSegment(p0, p1, cursor, range.startFrac, false)
      drawSegment(p0, p1, range.startFrac, range.endFrac, true)
      cursor = range.endFrac
    }
    drawSegment(p0, p1, cursor, 1, false)
  }
  ctx.setLineDash([])
}

// Arrowhead pointing along an arbitrary unit direction (dirX, dirY), tip at
// (tipX, tipY) — unlike the X/Y axis arrowheads (always horizontal/
// vertical, hand-coded inline), the offset vector can point any way.
function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  tipX: number,
  tipY: number,
  dirX: number,
  dirY: number,
  size: number,
  color: string,
) {
  const perpX = -dirY
  const perpY = dirX
  const backX = tipX - dirX * size
  const backY = tipY - dirY * size
  ctx.beginPath()
  ctx.moveTo(tipX, tipY)
  ctx.lineTo(backX + perpX * size * 0.6, backY + perpY * size * 0.6)
  ctx.lineTo(backX - perpX * size * 0.6, backY - perpY * size * 0.6)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

// Offset vector — amber, physical origin to the shifted pattern/shape.
// Hidden entirely at (0,0), same rule as the collapsed Step 2 summary
// annotation. Shared by every pattern kind below (Hole(s) and both
// Outline shapes all carry their own offsetX/offsetY).
function drawOffsetVector(
  ctx: CanvasRenderingContext2D,
  toPx: (x: number, y: number) => [number, number],
  offsetX: number,
  offsetY: number,
  theme: Theme,
  arrowSize: number,
) {
  if (offsetX === 0 && offsetY === 0) return
  const [vecTailX, vecTailY] = toPx(0, 0)
  const [vecTipX, vecTipY] = toPx(offsetX, offsetY)
  const vecDx = vecTipX - vecTailX
  const vecDy = vecTipY - vecTailY
  const vecLen = Math.hypot(vecDx, vecDy) || 1

  ctx.strokeStyle = theme.offset
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(vecTailX, vecTailY)
  ctx.lineTo(vecTipX, vecTipY)
  ctx.stroke()
  drawArrowhead(ctx, vecTipX, vecTipY, vecDx / vecLen, vecDy / vecLen, arrowSize, theme.offset)
}

// "1-2-5" sequence — picks a round step (1, 2, 5, 10, 20, 50, 100 mm, ...)
// close to the raw target so grid lines land on human-friendly values.
export function niceStep(rawStep: number): number {
  const exponent = Math.floor(Math.log10(rawStep))
  const fraction = rawStep / 10 ** exponent
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return niceFraction * 10 ** exponent
}

// BL-74: the square "stock sheet" behind every cut-through shape — the
// same footprint as the 3D Preview's material plane/grid/stock cap
// (buildScene.ts calls this too): the data footprint padded by 25% of its
// span, stretched to reach the origin, made square, centered on a
// multiple of a niceStep() and sized in whole steps. `footprint` is the
// XY extent of the drawn shapes WITHOUT the origin forced in (null when
// there is nothing to draw).
export interface StockSheet {
  centerX: number
  centerY: number
  size: number
  step: number
  halfCells: number
}

export function stockSheetRect(footprint: DataBounds | null): StockSheet {
  const f = footprint ?? { dataMinX: 0, dataMaxX: 0, dataMinY: 0, dataMaxY: 0 }
  const dataSpan = Math.max(f.dataMaxX - f.dataMinX, f.dataMaxY - f.dataMinY, 10)
  const pad = dataSpan * 0.25
  const minX = Math.min(f.dataMinX - pad, 0)
  const maxX = Math.max(f.dataMaxX + pad, 0)
  const minY = Math.min(f.dataMinY - pad, 0)
  const maxY = Math.max(f.dataMaxY + pad, 0)
  const planeSize = Math.max(maxX - minX, maxY - minY, 10)
  const step = niceStep(planeSize / 8)
  const halfCells = Math.ceil(planeSize / 2 / step)
  return {
    centerX: Math.round((minX + maxX) / 2 / step) * step,
    centerY: Math.round((minY + maxY) / 2 / step) * step,
    size: halfCells * 2 * step,
    step,
    halfCells,
  }
}

// Discriminated by operation/shape — Hole(s) is a repeated point pattern,
// Outline is a single shape (circle, or a 4-corner rectangle). Each
// variant carries exactly what its own draw function needs; bounds
// computation and drawing both switch on `kind`.
type ResolvedPattern =
  | { kind: 'holes'; params: WizardParams; points: Point2D[]; holeRadius: number; toolPathRadius: number }
  | {
      kind: 'outlineCircle'
      params: WizardParams
      center: Point2D
      nominalRadius: number
      toolRadius: number
      tabRanges: TabRange[]
      // Where every pass starts — turned by Tab Start when tabs are on.
      startAngle: number
    }
  | {
      kind: 'outlineLobed'
      params: WizardParams
      // Edges of the stock, in place: the nominal outline, or On-line's
      // inner and outer edge.
      edges: Point2D[][]
      // Tool-center loop (in place, travel direction, from the lap start)
      // and its tabs.
      loop: Loop
      tabRanges: LoopTabRange[]
      bounds: LoopBounds
    }
  | {
      kind: 'outlineRect'
      params: WizardParams
      nominalCorners: Point2D[]
      toolCorners: Point2D[]
      sideTabRanges: SideTabRange[][]
    }
  | {
      kind: 'surface'
      params: WizardParams
      nominalBounds: SurfaceBounds
      bounds: SurfaceBounds
      lines: RasterLine[]
      method: WizardParams['surface']['method']
    }
  | {
      kind: 'facing'
      params: WizardParams
      // Tool travel plus a band of the part behind the finished edge.
      bounds: FacingBounds
      toolpath: Toolpath
    }
  | {
      kind: 'pocket'
      params: WizardParams
      center: Point2D
      shape: PocketShape
      method: PocketMethodType
      // Nominal (un-inset) boundary — what's actually rendered as "stock",
      // same convention as Outline's nominalCorners/Surface's nominalBounds.
      nominal: { shape: 'circle'; radius: number } | { shape: 'rect'; halfWidth: number; halfHeight: number }
      // The engine's own move list (lib/pocket.ts, BL-61), every method.
      toolpath: Toolpath
    }

// An engine's own move list (lib/toolpath.ts), projected onto XY — the same
// moves the G-code is formatted from (BL-61), arcs sampled exactly as the
// G1 output samples them. Cutting moves solid in the toolpath color,
// linking moves dotted in the palette's `linking` color, rapids dashed in
// the rapid color; plunges are vertical, so nothing to draw in XY.
// Consecutive moves of one kind share a single stroke.
const LINK_DASH: [number, number] = [1.5, 3]
const RAPID_DASH: [number, number] = [4, 4]

function drawToolpathMoves(
  ctx: CanvasRenderingContext2D,
  toPx: (x: number, y: number) => [number, number],
  toolpath: Toolpath,
  theme: Theme,
) {
  let current = toolpath.start
  let i = 0
  const moves = toolpath.moves
  // The finishing pass (Pocket, BL-42) is a cut at another feed — drawn as one.
  const styleOf = (kind: MoveKind) => (kind === 'finish' ? 'cut' : kind)
  while (i < moves.length) {
    const kind = styleOf(moves[i].kind)
    ctx.beginPath()
    const [sx, sy] = toPx(current.x, current.y)
    ctx.moveTo(sx, sy)
    while (i < moves.length && styleOf(moves[i].kind) === kind) {
      for (const p of movePoints(current, moves[i])) {
        const [x, y] = toPx(p.x, p.y)
        ctx.lineTo(x, y)
      }
      current = moves[i].to
      i++
    }
    if (kind === 'plunge') continue
    ctx.lineWidth = kind === 'rapid' ? 1 : 1.5
    ctx.strokeStyle = kind === 'cut' ? theme.toolpath : kind === 'link' ? theme.linking : theme.rapid
    ctx.setLineDash(kind === 'cut' ? [] : kind === 'link' ? LINK_DASH : RAPID_DASH)
    ctx.stroke()
  }
  ctx.setLineDash([])
}

function resolvePattern(params: WizardParams): ResolvedPattern {
  if (params.operation === 'pocket') {
    const { pocket } = params
    const center = pocketCenter(pocket)
    const isCircle = pocket.shape === 'circle' || pocket.shape === 'circleLightened' || pocket.shape === 'donut'
    const nominal: Extract<ResolvedPattern, { kind: 'pocket' }>['nominal'] = isCircle
      ? { shape: 'circle', radius: pocket.diameter / 2 }
      : { shape: 'rect', halfWidth: pocket.width / 2, halfHeight: pocket.height / 2 }

    const toolpath = buildPocketToolpath(params)

    return { kind: 'pocket', params, center, shape: pocket.shape, method: pocket.method, nominal, toolpath }
  }
  if (params.operation === 'facing') {
    return { kind: 'facing', params, bounds: facingViewBounds(params.facing), toolpath: buildFacingToolpath(params) }
  }
  if (params.operation === 'surface') {
    const { surface } = params
    const nominalBounds = surfaceNominalBounds(surface)
    const bounds = surfaceToolBounds(surface)
    const lines = computeRasterLines(bounds, surface.rasterDirection, surfaceStepoverMm(surface))
    return { kind: 'surface', params, nominalBounds, bounds, lines, method: surface.method }
  }
  if (params.operation === 'outline') {
    const { outline } = params
    if (outline.shape === 'lobedCircle') {
      const opts = lobedOutlineOptions(params)
      const place = (loop: Loop | null) => (loop ? translateLoop(loop, outline.offsetX, outline.offsetY) : [])
      const r = outline.toolDiameter / 2
      const nominal = place(lobedNominalLoop(outline))
      const onLine = lobedOnLineEdges(outline, r)
      const edgeLoops = outline.offsetMode === 'onLine' ? [place(onLine.inner), place(onLine.outer)] : [nominal]
      const loop = place(opts.loop)
      const extent = [nominal, loop, ...edgeLoops].map(loopBounds).filter((b): b is LoopBounds => b !== null)
      return {
        kind: 'outlineLobed',
        params,
        edges: edgeLoops.map(loopPolygon).filter((polygon) => polygon.length >= 3),
        loop,
        tabRanges: opts.tabs ? opts.tabs.ranges : [],
        bounds:
          extent.length > 0
            ? {
                minX: Math.min(...extent.map((b) => b.minX)),
                maxX: Math.max(...extent.map((b) => b.maxX)),
                minY: Math.min(...extent.map((b) => b.minY)),
                maxY: Math.max(...extent.map((b) => b.maxY)),
              }
            : { minX: outline.offsetX, maxX: outline.offsetX, minY: outline.offsetY, maxY: outline.offsetY },
      }
    }
    if (outline.shape === 'circle') {
      const { radius: toolRadius } = circleOutlineRadiusAndDirection(outline)
      const tabRanges = outline.tabsEnabled
        ? computeTabRanges(outline.tabCount, outline.tabWidth, Math.max(0, toolRadius))
        : []
      return {
        kind: 'outlineCircle',
        params,
        center: { x: outline.offsetX, y: outline.offsetY },
        nominalRadius: outline.diameter / 2,
        toolRadius: Math.max(0, toolRadius),
        tabRanges,
        startAngle: circlePassStartAngle(circleOutlineOptions(params)),
      }
    }
    // Direction never affects what gets drawn (a filled/stroked closed
    // shape looks identical regardless of which way its perimeter was
    // walked) — 'ccw' is an arbitrary, fixed choice for rendering only.
    const nominalCorners = rectCorners(
      outline.shape,
      outline.width,
      outline.height,
      outline.width,
      outline.height,
      outline.offsetX,
      outline.offsetY,
      'ccw',
    )
    const { toolWidth, toolHeight } = rectToolDimensions(
      outline.width,
      outline.height,
      outline.toolDiameter,
      outline.offsetMode,
    )
    const toolCorners = rectCorners(
      outline.shape,
      outline.width,
      outline.height,
      Math.max(0, toolWidth),
      Math.max(0, toolHeight),
      outline.offsetX,
      outline.offsetY,
      'ccw',
    )
    const sideTabRanges = outline.tabsEnabled
      ? sideRangesFor(toolCorners, outline.tabCount, outline.tabWidth)
      : [[], [], [], []]
    return { kind: 'outlineRect', params, nominalCorners, toolCorners, sideTabRanges }
  }

  const { geometry } = params
  const points = resolvePoints(geometry)
  const holeRadius = geometry.holeDiameter / 2
  // Guarded against a tool larger than the hole (allowed until Etap 5
  // validation exists) — a negative radius would throw in ctx.arc().
  const toolPathRadius = Math.max(0, (geometry.holeDiameter - geometry.toolDiameter) / 2)
  return { kind: 'holes', params, points, holeRadius, toolPathRadius }
}

// XY extent of every rendered pattern (BL-3 overlay), without the origin —
// each pattern's own extent is padded by its own radius/corner set, since
// overlaid presets can differ in dimensions from the active one. Same
// footprint as the 3D Preview's expandBoundsForPattern() (nominal shape,
// tool path and On-line's outer edge), so the stock sheet matches 3D.
function patternFootprint(patterns: ResolvedPattern[]): DataBounds | null {
  const allX: number[] = []
  const allY: number[] = []
  for (const pattern of patterns) {
    if (pattern.kind === 'holes') {
      for (const p of pattern.points) {
        allX.push(p.x - pattern.holeRadius, p.x + pattern.holeRadius)
        allY.push(p.y - pattern.holeRadius, p.y + pattern.holeRadius)
      }
    } else if (pattern.kind === 'outlineCircle') {
      // Whichever of nominal/tool radius is larger is the true physical
      // extent — Outside grows the tool path beyond nominal, Inside
      // shrinks it below nominal, On-line keeps them equal.
      let r = Math.max(pattern.nominalRadius, pattern.toolRadius)
      if (pattern.params.outline.offsetMode === 'onLine') r = Math.max(r, onLineCircleEdges(pattern.params.outline).outerRadius)
      allX.push(pattern.center.x - r, pattern.center.x + r)
      allY.push(pattern.center.y - r, pattern.center.y + r)
    } else if (pattern.kind === 'outlineRect') {
      for (const p of [...pattern.nominalCorners, ...pattern.toolCorners, ...onLineRectEdges(pattern).outer]) {
        allX.push(p.x)
        allY.push(p.y)
      }
    } else if (pattern.kind === 'pocket') {
      // Nominal boundary is always >= the tool-center wall (inset), so it's
      // the true physical extent — same reasoning as outlineFootprint()'s
      // Inside case in lib/validation.ts.
      const hw = pattern.nominal.shape === 'circle' ? pattern.nominal.radius : pattern.nominal.halfWidth
      const hh = pattern.nominal.shape === 'circle' ? pattern.nominal.radius : pattern.nominal.halfHeight
      allX.push(pattern.center.x - hw, pattern.center.x + hw)
      allY.push(pattern.center.y - hh, pattern.center.y + hh)
    } else {
      allX.push(pattern.bounds.minX, pattern.bounds.maxX)
      allY.push(pattern.bounds.minY, pattern.bounds.maxY)
    }
  }
  if (allX.length === 0) return null
  return {
    dataMinX: Math.min(...allX),
    dataMaxX: Math.max(...allX),
    dataMinY: Math.min(...allY),
    dataMaxY: Math.max(...allY),
  }
}

// Footprint plus the origin — what Fit View frames.
function computeCombinedBounds(patterns: ResolvedPattern[]): DataBounds {
  const f = patternFootprint(patterns) ?? { dataMinX: 0, dataMaxX: 0, dataMinY: 0, dataMaxY: 0 }
  return {
    dataMinX: Math.min(f.dataMinX, 0),
    dataMaxX: Math.max(f.dataMaxX, 0),
    dataMinY: Math.min(f.dataMinY, 0),
    dataMaxY: Math.max(f.dataMaxY, 0),
  }
}

// BL-11: exposed so ToolpathCanvas can compute a fit-to-data Camera2D
// (initial mount, Fit View click, BL-3 overlay-selection change) without
// duplicating the overlay/active-pattern resolution logic below.
export function computeToolpathDataBounds(
  params: WizardParams,
  overlayParams: readonly WizardParams[] = [],
  showActivePattern = true,
): DataBounds {
  const allPatterns = [
    ...overlayParams.map(resolvePattern),
    ...(showActivePattern ? [resolvePattern(params)] : []),
  ]
  return computeCombinedBounds(allPatterns)
}

// On-line Rectangle's two real edges (inner island, outer wall of the
// surrounding stock) — empty for Inside/Outside. Same geometry as the 3D
// walls (onLineRectDimensions()).
function onLineRectEdges(pattern: Extract<ResolvedPattern, { kind: 'outlineRect' }>): { inner: Point2D[]; outer: Point2D[] } {
  const { outline } = pattern.params
  if (outline.offsetMode !== 'onLine' || outline.shape === 'circle') return { inner: [], outer: [] }
  const { innerWidth, innerHeight, outerWidth, outerHeight } = onLineRectDimensions(outline.width, outline.height, outline.toolDiameter)
  const corners = (w: number, h: number) =>
    rectCorners(outline.shape as 'rectCornered' | 'rectCentered', outline.width, outline.height, w, h, outline.offsetX, outline.offsetY, 'ccw')
  return { inner: corners(innerWidth, innerHeight), outer: corners(outerWidth, outerHeight) }
}

// The stock model of the last draw. The canvas redraws on every pan and
// zoom step, while the model only changes with the presets, the sheet or
// the cut-shape option — and a Lightened pocket's model takes long enough
// to build to make panning stutter.
// Two slots: everything drawn, and — BL-116 — the edited preset on its own
// (its outline), so neither evicts the other on every frame.
type StockCacheEntry = { presets: readonly WizardParams[]; key: string; model: StockModel | null }
const stockCache: { all: StockCacheEntry | null; own: StockCacheEntry | null } = { all: null, own: null }

function cachedStockModel(
  presets: readonly WizardParams[],
  sheet: StockSheet,
  cutShape: boolean,
  slot: keyof typeof stockCache = 'all',
): StockModel | null {
  const key = `${sheet.centerX}|${sheet.centerY}|${sheet.size}|${cutShape}`
  let lastStock = stockCache[slot]
  const same = lastStock && lastStock.key === key && lastStock.presets.length === presets.length && presets.every((p, i) => p === lastStock!.presets[i])
  if (!same) {
    const half = sheet.size / 2
    const model = stockModel(
      presets,
      { minX: sheet.centerX - half, minY: sheet.centerY - half, maxX: sheet.centerX + half, maxY: sheet.centerY + half },
      cutShape,
    )
    lastStock = { presets, key, model }
    stockCache[slot] = lastStock
  }
  return lastStock!.model
}

// One face of the stock model (lib/stockModel.ts): its polygons never
// overlap, and a ring inside another alternates hole / enclosed island, so
// a single even-odd path fills exactly the material. No outline — the
// edges are stroked per pattern, with their tab gaps.
function fillRegion(ctx: CanvasRenderingContext2D, toPx: (x: number, y: number) => [number, number], region: MultiPolygon, color: string) {
  ctx.beginPath()
  for (const polygon of region) {
    for (const ring of polygon) {
      ring.forEach(([rx, ry], i) => {
        const [x, y] = toPx(rx, ry)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.closePath()
    }
  }
  ctx.fillStyle = color
  ctx.fill('evenodd')
}

// Hole(s): rapid traverse between holes, then each hole's outline +
// tool-center toolpath (stroke) + offset vector. The holes are voids in
// the stock (drawn once by drawToolpath()), so only their outline is drawn
// here — with real tab gaps, which the stock itself ignores.
function drawHolesGeometry(
  ctx: CanvasRenderingContext2D,
  toPx: (x: number, y: number) => [number, number],
  scale: number,
  pattern: Extract<ResolvedPattern, { kind: 'holes' }>,
  theme: Theme,
  arrowSize: number,
  showStock: boolean,
  showToolpath: boolean,
) {
  const { points, holeRadius, toolPathRadius, params } = pattern
  const { geometry } = params

  // Rapid traverse between holes, through each hole's actual descent-start
  // XY (center + toolPathRadius on +X) — matches the real G-code
  // (program.ts's assembleProgram no longer rapids to the raw center
  // first) instead of stopping short of where the toolpath actually starts.
  if (showToolpath && points.length > 1) {
    ctx.strokeStyle = theme.rapid
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    points.forEach((p, i) => {
      const [px, py] = toPx(p.x + toolPathRadius, p.y)
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    })
    ctx.stroke()
    ctx.setLineDash([])
  }

  // Tab angular ranges (BL-14) — same for every hole in this pattern
  // (angle only depends on tabWidth/toolPathRadius, not hole position),
  // so computed once outside the loop below.
  const tabRanges = geometry.tabsEnabled
    ? computeTabRanges(geometry.tabCount, geometry.tabWidth, toolPathRadius)
    : []

  for (const p of points) {
    const [px, py] = toPx(p.x, p.y)

    if (showStock) {
      ctx.strokeStyle = theme.holeStroke
      ctx.lineWidth = 1
      drawGappedCircle(ctx, px, py, holeRadius * scale, tabRanges)
    }

    if (showToolpath) {
      ctx.strokeStyle = theme.toolpath
      ctx.lineWidth = 1.5
      drawGappedCircle(ctx, px, py, toolPathRadius * scale, tabRanges)

      ctx.beginPath()
      ctx.arc(px, py, 2, 0, Math.PI * 2)
      ctx.fillStyle = theme.toolpath
      ctx.fill()
    }
  }

  drawOffsetVector(ctx, toPx, geometry.offsetX, geometry.offsetY, theme, arrowSize)
}

// Circle Outline: the real edges of the cut — the nominal circle, or
// On-line's inner and outer edge around the tool-wide band — stroked with
// tab gaps, then the tool-center toolpath on top. The material itself
// comes from the stock model (drawToolpath()).
function drawOutlineCircleGeometry(
  ctx: CanvasRenderingContext2D,
  toPx: (x: number, y: number) => [number, number],
  scale: number,
  pattern: Extract<ResolvedPattern, { kind: 'outlineCircle' }>,
  theme: Theme,
  arrowSize: number,
  showStock: boolean,
  showToolpath: boolean,
) {
  const { center, nominalRadius, toolRadius, tabRanges, startAngle, params } = pattern
  const [px, py] = toPx(center.x, center.y)

  if (showStock) {
    const { offsetMode } = params.outline
    const edges =
      offsetMode === 'onLine'
        ? [onLineCircleEdges(params.outline).innerRadius, onLineCircleEdges(params.outline).outerRadius]
        : [nominalRadius]
    ctx.strokeStyle = theme.holeStroke
    ctx.lineWidth = 1
    for (const r of edges) drawGappedCircle(ctx, px, py, r * scale, tabRanges, startAngle)
  }

  if (showToolpath) {
    ctx.strokeStyle = theme.toolpath
    ctx.lineWidth = 1.5
    drawGappedCircle(ctx, px, py, toolRadius * scale, tabRanges, startAngle)

    ctx.beginPath()
    ctx.arc(px + toolRadius * scale * Math.cos(startAngle), py - toolRadius * scale * Math.sin(startAngle), 2, 0, Math.PI * 2)
    ctx.fillStyle = theme.toolpath
    ctx.fill()
  }

  drawOffsetVector(ctx, toPx, params.outline.offsetX, params.outline.offsetY, theme, arrowSize)
}

// Lobed Circle Outline (OP-8): the stock's edges (nominal outline, or
// On-line's two), and the tool-center loop with every tab dashed — sampled
// from the same loop and tab ranges the engine cuts.
function drawOutlineLobedGeometry(
  ctx: CanvasRenderingContext2D,
  toPx: (x: number, y: number) => [number, number],
  pattern: Extract<ResolvedPattern, { kind: 'outlineLobed' }>,
  theme: Theme,
  arrowSize: number,
  showStock: boolean,
  showToolpath: boolean,
) {
  const { edges, loop, tabRanges, params } = pattern

  if (showStock) {
    ctx.strokeStyle = theme.holeStroke
    ctx.lineWidth = 1
    for (const polygon of edges) {
      ctx.beginPath()
      polygon.forEach((p, i) => {
        const [x, y] = toPx(p.x, p.y)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.closePath()
      ctx.stroke()
    }
  }

  if (showToolpath && loop.length > 0) {
    const positions = [...new Set([...loopSamplePositions(loop), ...tabRanges.flatMap((r) => [r.start, r.end])])].sort((a, b) => a - b)
    const inTabAt = (s: number) => tabRanges.some((r) => s > r.start && s < r.end)
    ctx.strokeStyle = theme.toolpath
    ctx.lineWidth = 1.5
    let i = 1
    while (i < positions.length) {
      const dashed = inTabAt((positions[i - 1] + positions[i]) / 2)
      ctx.beginPath()
      const from = loopPointAtLength(loop, positions[i - 1])
      ctx.moveTo(...toPx(from.x, from.y))
      while (i < positions.length && inTabAt((positions[i - 1] + positions[i]) / 2) === dashed) {
        const p = i === positions.length - 1 ? arcPoint(loop[0], 0) : loopPointAtLength(loop, positions[i])
        ctx.lineTo(...toPx(p.x, p.y))
        i++
      }
      ctx.setLineDash(dashed ? TAB_DASH : [])
      ctx.stroke()
    }
    ctx.setLineDash([])

    const start = arcPoint(loop[0], 0)
    const [startX, startY] = toPx(start.x, start.y)
    ctx.beginPath()
    ctx.arc(startX, startY, 2, 0, Math.PI * 2)
    ctx.fillStyle = theme.toolpath
    ctx.fill()
  }

  drawOffsetVector(ctx, toPx, params.outline.offsetX, params.outline.offsetY, theme, arrowSize)
}

// Rectangle Outline: same as Circle Outline, walking 4 corners instead of
// a radius. On-line's edges reuse
// the tool path's tab fractions — a tab sits at the same relative spot on
// every parallel edge.
function drawOutlineRectGeometry(
  ctx: CanvasRenderingContext2D,
  toPx: (x: number, y: number) => [number, number],
  pattern: Extract<ResolvedPattern, { kind: 'outlineRect' }>,
  theme: Theme,
  arrowSize: number,
  showStock: boolean,
  showToolpath: boolean,
) {
  const { nominalCorners, toolCorners, sideTabRanges, params } = pattern

  if (showStock) {
    const { offsetMode } = params.outline
    const onLine = onLineRectEdges(pattern)
    const edges = offsetMode === 'onLine' ? [onLine.inner, onLine.outer] : [nominalCorners]
    ctx.strokeStyle = theme.holeStroke
    ctx.lineWidth = 1
    for (const corners of edges) drawGappedRectangle(ctx, toPx, corners, sideTabRanges)
  }

  if (showToolpath) {
    ctx.strokeStyle = theme.toolpath
    ctx.lineWidth = 1.5
    drawGappedRectangle(ctx, toPx, toolCorners, sideTabRanges)

    const [startX, startY] = toPx(toolCorners[0].x, toolCorners[0].y)
    ctx.beginPath()
    ctx.arc(startX, startY, 2, 0, Math.PI * 2)
    ctx.fillStyle = theme.toolpath
    ctx.fill()
  }

  drawOffsetVector(ctx, toPx, params.outline.offsetX, params.outline.offsetY, theme, arrowSize)
}

// Surface: nominal material area (fill), tool-center raster lines (stroke)
// — a continuous polyline for Zigzag (no lift between lines, mirrors the
// engine's own G1 chain), separate solid lines joined by dashed rapid
// connectors for Unidirectional (mirrors Hole(s)' inter-hole rapid style) —
// plus a small direction arrowhead per line and a dot marking the fixed
// start corner (always min-X/min-Y, see lib/surfaceGeometry.ts).
function drawSurfaceGeometry(
  ctx: CanvasRenderingContext2D,
  toPx: (x: number, y: number) => [number, number],
  pattern: Extract<ResolvedPattern, { kind: 'surface' }>,
  theme: Theme,
  arrowSize: number,
  showStock: boolean,
  showToolpath: boolean,
) {
  const { nominalBounds, lines, method, params } = pattern

  if (showStock) {
    ctx.beginPath()
    const corners: Point2D[] = [
      { x: nominalBounds.minX, y: nominalBounds.minY },
      { x: nominalBounds.maxX, y: nominalBounds.minY },
      { x: nominalBounds.maxX, y: nominalBounds.maxY },
      { x: nominalBounds.minX, y: nominalBounds.maxY },
    ]
    corners.forEach((p, i) => {
      const [x, y] = toPx(p.x, p.y)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.closePath()
    ctx.fillStyle = theme.holeFill
    ctx.fill()
    ctx.strokeStyle = theme.holeStroke
    ctx.lineWidth = 1
    ctx.stroke()
  }

  if (showToolpath) {
    ctx.strokeStyle = theme.toolpath
    ctx.lineWidth = 1.5

    const drawArrowOnLine = (line: RasterLine, forward: boolean) => {
      const from = forward ? line.from : line.to
      const to = forward ? line.to : line.from
      const [fx, fy] = toPx(from.x, from.y)
      const [tx, ty] = toPx(to.x, to.y)
      const midX = (fx + tx) / 2
      const midY = (fy + ty) / 2
      const dx = tx - fx
      const dy = ty - fy
      const len = Math.hypot(dx, dy) || 1
      drawArrowhead(ctx, midX, midY, dx / len, dy / len, arrowSize * 0.7, theme.toolpath)
    }

    if (method === 'zigzag') {
      const waypoints = zigzagWaypoints(lines)
      ctx.beginPath()
      waypoints.forEach((p, i) => {
        const [x, y] = toPx(p.x, p.y)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
      lines.forEach((line, i) => drawArrowOnLine(line, i % 2 === 0))
    } else {
      lines.forEach((line, i) => {
        const [fx, fy] = toPx(line.from.x, line.from.y)
        const [tx, ty] = toPx(line.to.x, line.to.y)
        ctx.beginPath()
        ctx.moveTo(fx, fy)
        ctx.lineTo(tx, ty)
        ctx.stroke()
        drawArrowOnLine(line, true)

        if (i < lines.length - 1) {
          const [nx, ny] = toPx(lines[i + 1].from.x, lines[i + 1].from.y)
          ctx.strokeStyle = theme.rapid
          ctx.lineWidth = 1
          ctx.setLineDash([4, 4])
          ctx.beginPath()
          ctx.moveTo(tx, ty)
          ctx.lineTo(nx, ny)
          ctx.stroke()
          ctx.setLineDash([])
          ctx.strokeStyle = theme.toolpath
          ctx.lineWidth = 1.5
        }
      })
    }

    if (lines.length > 0) {
      const [startX, startY] = toPx(lines[0].from.x, lines[0].from.y)
      ctx.beginPath()
      ctx.arc(startX, startY, 2, 0, Math.PI * 2)
      ctx.fillStyle = theme.toolpath
      ctx.fill()
    }
  }

  drawOffsetVector(ctx, toPx, params.surface.offsetX, params.surface.offsetY, theme, arrowSize)
}

// Facing (OP-7): the part as the cut leaves it — a block from the finished
// edge into the material, as far as the stock sheet reaches (its far edge
// is left open: the part goes on) — the removed strip dotted along the raw
// edge, and the engine's own move list.
function drawFacingGeometry(
  ctx: CanvasRenderingContext2D,
  toPx: (x: number, y: number) => [number, number],
  pattern: Extract<ResolvedPattern, { kind: 'facing' }>,
  theme: Theme,
  arrowSize: number,
  showStock: boolean,
  showToolpath: boolean,
  sheet: FacingBounds,
) {
  const { params, toolpath } = pattern
  const { facing } = params
  const path = (points: Point2D[]) => {
    ctx.beginPath()
    points.forEach((p, i) => {
      const [x, y] = toPx(p.x, p.y)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
  }

  if (showStock) {
    const [edgeStart, edgeEnd, farEnd, farStart] = facingBlockCorners(facing, sheet)
    path([edgeStart, edgeEnd, farEnd, farStart])
    ctx.closePath()
    ctx.fillStyle = theme.holeFill
    ctx.fill()
    path([farStart, edgeStart, edgeEnd, farEnd])
    ctx.strokeStyle = theme.holeStroke
    ctx.lineWidth = 1
    ctx.stroke()

    const [rawStart, rawEnd, stripEnd, stripStart] = facingStripCorners(facing)
    path([stripStart, rawStart, rawEnd, stripEnd])
    ctx.setLineDash(LINK_DASH)
    ctx.stroke()
    ctx.setLineDash([])
  }

  if (showToolpath) {
    drawToolpathMoves(ctx, toPx, toolpath, theme)
    // Direction of cut: an arrowhead mid-way along the first pass (moves:
    // rapid down, plunge, feed in, cut along the side).
    const cut = toolpath.moves.findIndex((m, i) => i > 0 && m.kind === 'cut' && toolpath.moves[i - 1].kind === 'cut')
    if (cut > 0) {
      const [fx, fy] = toPx(toolpath.moves[cut - 1].to.x, toolpath.moves[cut - 1].to.y)
      const [tx, ty] = toPx(toolpath.moves[cut].to.x, toolpath.moves[cut].to.y)
      const len = Math.hypot(tx - fx, ty - fy) || 1
      drawArrowhead(ctx, (fx + tx) / 2, (fy + ty) / 2, (tx - fx) / len, (ty - fy) / len, arrowSize * 0.7, theme.toolpath)
    }
    const [startX, startY] = toPx(toolpath.start.x, toolpath.start.y)
    ctx.beginPath()
    ctx.arc(startX, startY, 2, 0, Math.PI * 2)
    ctx.fillStyle = theme.toolpath
    ctx.fill()
  }

  drawOffsetVector(ctx, toPx, facing.offsetX, facing.offsetY, theme, arrowSize)
}

// Pocket: nominal boundary (stroke — its floor is filled by the stock
// model, drawToolpath()) + toolpath — the engine's own move list for every method (BL-61), so the
// Helix entry, ring-to-ring ramps, laps and raster chain are exactly what
// pocket.ts cuts, never a re-derivation of it.
function drawPocketGeometry(
  ctx: CanvasRenderingContext2D,
  toPx: (x: number, y: number) => [number, number],
  scale: number,
  pattern: Extract<ResolvedPattern, { kind: 'pocket' }>,
  theme: Theme,
  arrowSize: number,
  showStock: boolean,
  showToolpath: boolean,
) {
  const { center, nominal, toolpath, params } = pattern
  const [cx, cy] = toPx(center.x, center.y)

  // Lightened (OP-6): one outline per cell.
  const lightened = isLightenedShape(params.pocket.shape)
  if (showStock) {
    ctx.strokeStyle = theme.holeStroke
    ctx.lineWidth = 1
    if (lightened) {
      for (const v of pocketVoids(params.pocket)) {
        if (!('polygon' in v)) continue
        ctx.beginPath()
        v.polygon.forEach((p, i) => {
          const [x, y] = toPx(p.x, p.y)
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        })
        ctx.closePath()
        ctx.stroke()
      }
    } else if (nominal.shape === 'circle') {
      ctx.beginPath()
      ctx.arc(cx, cy, nominal.radius * scale, 0, Math.PI * 2)
      ctx.stroke()
      // Donut (BL-108): the island left standing in the middle.
      if (params.pocket.shape === 'donut' && params.pocket.islandDiameter > 0) {
        ctx.beginPath()
        ctx.arc(cx, cy, (params.pocket.islandDiameter / 2) * scale, 0, Math.PI * 2)
        ctx.stroke()
      }
    } else {
      const corners: Point2D[] = [
        { x: center.x - nominal.halfWidth, y: center.y - nominal.halfHeight },
        { x: center.x + nominal.halfWidth, y: center.y - nominal.halfHeight },
        { x: center.x + nominal.halfWidth, y: center.y + nominal.halfHeight },
        { x: center.x - nominal.halfWidth, y: center.y + nominal.halfHeight },
      ]
      ctx.beginPath()
      corners.forEach((p, i) => {
        const [x, y] = toPx(p.x, p.y)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.closePath()
      ctx.stroke()
    }
  }

  if (showToolpath) {
    drawToolpathMoves(ctx, toPx, toolpath, theme)

    // Entry point marker — the pocket's own center (see CLAUDE.md's Pocket
    // design notes: entry is always centered), or every cell's center.
    const entries = lightened ? lightenedCells(params.pocket).map((c) => toPx(cellInscribed(c).center.x, cellInscribed(c).center.y)) : [[cx, cy]]
    ctx.fillStyle = theme.toolpath
    for (const [ex, ey] of entries) {
      ctx.beginPath()
      ctx.arc(ex, ey, 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  drawOffsetVector(ctx, toPx, params.pocket.offsetX, params.pocket.offsetY, theme, arrowSize)
}

// Draws one pattern's full geometry as one atomic unit — this is what
// makes pattern-level (not element-level) draw ordering control occlusion
// between overlaid presets and the active pattern (see BL-3: active
// pattern is always drawn last, on top).
function drawPatternGeometry(
  ctx: CanvasRenderingContext2D,
  toPx: (x: number, y: number) => [number, number],
  scale: number,
  pattern: ResolvedPattern,
  theme: Theme,
  arrowSize: number,
  showStock: boolean,
  showToolpath: boolean,
  sheet: FacingBounds,
) {
  switch (pattern.kind) {
    case 'holes':
      drawHolesGeometry(ctx, toPx, scale, pattern, theme, arrowSize, showStock, showToolpath)
      break
    case 'outlineCircle':
      drawOutlineCircleGeometry(ctx, toPx, scale, pattern, theme, arrowSize, showStock, showToolpath)
      break
    case 'outlineRect':
      drawOutlineRectGeometry(ctx, toPx, pattern, theme, arrowSize, showStock, showToolpath)
      break
    case 'outlineLobed':
      drawOutlineLobedGeometry(ctx, toPx, pattern, theme, arrowSize, showStock, showToolpath)
      break
    case 'surface':
      drawSurfaceGeometry(ctx, toPx, pattern, theme, arrowSize, showStock, showToolpath)
      break
    case 'pocket':
      drawPocketGeometry(ctx, toPx, scale, pattern, theme, arrowSize, showStock, showToolpath)
      break
    case 'facing':
      drawFacingGeometry(ctx, toPx, pattern, theme, arrowSize, showStock, showToolpath, sheet)
      break
  }
}

// Fixed screen-space margin (px) kept between the visible canvas edge and
// the axis arrow tips/labels/grid-number labels — BL-11 replaced the old
// "data rect with padding" layout (axes/grid bounded to where the data
// happened to fit) with a real pan/zoom camera, so there's no longer a
// canonical drawn rectangle to anchor these to; they're anchored to the
// canvas edges instead, like a ruler.
const EDGE_MARGIN = 24

// BL-107: how much of an overlaid preset stays visible next to the one
// being edited — shared with the 3D Preview.
export const DIMMED_OVERLAY_OPACITY = 0.35

export function drawToolpath(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  params: WizardParams,
  isDark: boolean,
  paletteId: PaletteId,
  themeId: ThemeId,
  camera: Camera2D,
  overlayParams: readonly WizardParams[] = [],
  showActivePattern = true,
  showStock = true,
  showToolpath = true,
  cutShape = false,
  // BL-107: Overlay with one preset being edited — the live pattern is that
  // preset, the overlaid ones are drawn faded behind it; its own toolpath
  // is left out while its parameters are invalid.
  dimOverlay = false,
  showActiveToolpath = true,
) {
  const theme = buildTheme(paletteId, isDark, themeId)

  // Overlay patterns drawn first, active pattern last — the active pattern
  // ends up on top wherever it overlaps an overlaid preset (BL-3). While
  // comparing presets, the live pattern is left out entirely
  // (showActivePattern=false) — mixing it in made it hard to tell what was
  // being compared against what.
  const allPatterns = [
    ...overlayParams.map(resolvePattern),
    ...(showActivePattern ? [resolvePattern(params)] : []),
  ]

  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = theme.background
  ctx.fillRect(0, 0, width, height)

  const hasNothingToDraw = allPatterns.every(
    (p) => (p.kind === 'holes' ? p.points.length === 0 : false),
  )
  if (hasNothingToDraw) return

  const toPx = (x: number, y: number): [number, number] => worldToScreen(camera, width, height, x, y)

  // Grid + axis labels — spans the visible viewport (derived from the
  // camera), not the data extent, so panning/zooming out never reveals an
  // area with no grid (BL-11; the old fit-only camera made "visible
  // viewport" and "data extent with padding" the same rectangle, so this
  // distinction didn't exist before).
  const halfWorldW = width / (2 * camera.scale)
  const halfWorldH = height / (2 * camera.scale)
  const visMinX = camera.centerX - halfWorldW
  const visMaxX = camera.centerX + halfWorldW
  const visMinY = camera.centerY - halfWorldH
  const visMaxY = camera.centerY + halfWorldH

  const step = niceStep(Math.max(halfWorldW, halfWorldH) / 4)
  ctx.font = '10px ui-monospace, monospace'
  ctx.fillStyle = theme.text
  ctx.strokeStyle = theme.grid
  ctx.lineWidth = 1

  const gridStartX = Math.floor(visMinX / step) * step
  for (let x = gridStartX; x <= visMaxX; x += step) {
    const [px] = toPx(x, 0)
    ctx.beginPath()
    ctx.moveTo(px, 0)
    ctx.lineTo(px, height)
    ctx.stroke()
    if (Math.abs(x) > step / 2) ctx.fillText(`${Math.round(x)}`, px + 3, height - EDGE_MARGIN + 14)
  }

  const gridStartY = Math.floor(visMinY / step) * step
  for (let y = gridStartY; y <= visMaxY; y += step) {
    const [, py] = toPx(0, y)
    ctx.beginPath()
    ctx.moveTo(0, py)
    ctx.lineTo(width, py)
    ctx.stroke()
    if (Math.abs(y) > step / 2) ctx.fillText(`${Math.round(y)}`, 4, py + 3)
  }

  // Axes through the origin — red X / green Y, spanning the full visible
  // canvas, each with an arrowhead + label pinned near the screen edge
  // (same convention as 3D Preview's axes, adapted for a pannable camera).
  const [originPxX, originPxY] = toPx(0, 0)
  const arrowSize = 7

  ctx.strokeStyle = theme.axisX
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(0, originPxY)
  ctx.lineTo(width, originPxY)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(width - EDGE_MARGIN, originPxY)
  ctx.lineTo(width - EDGE_MARGIN - arrowSize, originPxY - arrowSize * 0.6)
  ctx.lineTo(width - EDGE_MARGIN - arrowSize, originPxY + arrowSize * 0.6)
  ctx.closePath()
  ctx.fillStyle = theme.axisX
  ctx.fill()
  ctx.font = 'bold 12px ui-monospace, monospace'
  ctx.fillText('X', width - EDGE_MARGIN + 4, originPxY + 4)

  // Canvas up = world +Y (toPx flips Y), so the positive end is at the top.
  ctx.strokeStyle = theme.axisY
  ctx.beginPath()
  ctx.moveTo(originPxX, 0)
  ctx.lineTo(originPxX, height)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(originPxX, EDGE_MARGIN)
  ctx.lineTo(originPxX - arrowSize * 0.6, EDGE_MARGIN + arrowSize)
  ctx.lineTo(originPxX + arrowSize * 0.6, EDGE_MARGIN + arrowSize)
  ctx.closePath()
  ctx.fillStyle = theme.axisY
  ctx.fill()
  ctx.fillText('Y', originPxX + 5, EDGE_MARGIN - 5)
  ctx.font = '10px ui-monospace, monospace'

  // Stock: one model of everything drawn (lib/stockModel.ts, the same one
  // the 3D Preview builds), within the 3D material plane's footprint — the
  // uncut face, and pocket floors in a fainter tint. Drawn once, before
  // the patterns; Surface and Facing are not part of it and fill their own.
  const sheet = stockSheetRect(patternFootprint(allPatterns))
  const sheetBounds = {
    minX: sheet.centerX - sheet.size / 2,
    maxX: sheet.centerX + sheet.size / 2,
    minY: sheet.centerY - sheet.size / 2,
    maxY: sheet.centerY + sheet.size / 2,
  }
  if (showStock) {
    const presets = [...overlayParams, ...(showActivePattern ? [params] : [])]
    const model = cachedStockModel(presets, sheet, cutShape)
    if (model) {
      fillRegion(ctx, toPx, model.top, theme.holeFill)
      for (const floor of model.floors) fillRegion(ctx, toPx, floor.region, theme.pocketFloorFill)
    }
  }
  allPatterns.forEach((pattern, index) => {
    const isActive = showActivePattern && index === allPatterns.length - 1
    ctx.globalAlpha = dimOverlay && !isActive ? DIMMED_OVERLAY_OPACITY : 1
    drawPatternGeometry(
      ctx,
      toPx,
      camera.scale,
      pattern,
      theme,
      arrowSize,
      showStock,
      // BL-116 (trial): overlaid presets' toolpaths are left out while one
      // preset is edited — only its own path is shown.
      showToolpath && (isActive ? showActiveToolpath : !dimOverlay),
      sheetBounds,
    )
  })
  ctx.globalAlpha = 1

  // BL-86: next to each nominal outline (solid, above), the contour the
  // tool actually leaves — dotted. It runs along the nominal one on
  // straight edges and parts from it at every inside corner.
  if (showStock && cutShape) {
    ctx.strokeStyle = theme.holeStroke
    ctx.lineWidth = 1
    ctx.setLineDash(LINK_DASH)
    for (const pattern of allPatterns) {
      for (const contour of cutContours(pattern.params)) {
        ctx.beginPath()
        contour.forEach((p, i) => {
          const [x, y] = toPx(p.x, p.y)
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        })
        ctx.closePath()
        ctx.stroke()
      }
    }
    ctx.setLineDash([])
  }

  // BL-116: while one preset is edited inside an overlay, its own outline —
  // every wall of the stock model of that preset alone — in the Edit color,
  // over everything else (the 3D Preview colors the same edges). Surface
  // and Facing have no stock model, hence no outline.
  if (showStock && dimOverlay && showActivePattern) {
    const own = cachedStockModel([params], sheet, cutShape, 'own')
    if (own) {
      ctx.strokeStyle = theme.edit
      ctx.lineWidth = 2
      // Bands of one void stacked at different depths share their outline.
      const drawn = new Set<string>()
      for (const band of own.walls) {
        for (const polygon of band.region) {
          for (const ring of polygon) {
            const id = `${ring.length}|${ring[0]?.[0]}|${ring[0]?.[1]}`
            if (drawn.has(id)) continue
            drawn.add(id)
            ctx.beginPath()
            ring.forEach(([wx, wy], i) => {
              const [x, y] = toPx(wx, wy)
              if (i === 0) ctx.moveTo(x, y)
              else ctx.lineTo(x, y)
            })
            ctx.closePath()
            ctx.stroke()
          }
        }
      }
      ctx.lineWidth = 1
    }
  }

  // Origin marker
  ctx.beginPath()
  ctx.arc(originPxX, originPxY, 3, 0, Math.PI * 2)
  ctx.fillStyle = theme.origin
  ctx.fill()
  ctx.fillStyle = theme.text
  ctx.fillText('0,0', originPxX + 6, originPxY - 6)
}
