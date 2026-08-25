import { getFixedColors, getPaletteAccents, type PaletteId } from '../../config/palettes'
import { resolvePoints } from '../../lib/positioning'
import { computeTabRanges, type TabRange } from '../../lib/tabs'
import { circleOutlineRadiusAndDirection } from '../../lib/outlineCircle'
import { rectCorners, rectToolDimensions } from '../../lib/outlineRectangleGeometry'
import { sideRangesFor, type SideTabRange } from '../../lib/outlineRectangleTabs'
import type { Point2D, WizardParams } from '../../types/wizard'
import { type Camera2D, type DataBounds, worldToScreen } from './camera2d'

interface Theme {
  background: string
  grid: string
  axisX: string
  axisY: string
  origin: string
  holeFill: string
  holeStroke: string
  toolpath: string
  rapid: string
  text: string
  offset: string
}

// Merges the palette-selectable accents (background/grid/toolpath/rapid/
// hole) with the fixed CNC-convention colors (axes/origin/offset/text) —
// see config/palettes.ts (BL-12) for why the two are split and where the
// actual color values live. holeStroke maps 1:1 to the palette's `hole`
// accent; holeFill stays a fixed, low-opacity origin tint (not palette
// accent) since it's not meant to stand out as a distinguishing color.
function buildTheme(paletteId: PaletteId, isDark: boolean): Theme {
  const fixed = getFixedColors(isDark)
  const accents = getPaletteAccents(paletteId, isDark)
  return {
    background: accents.background,
    grid: accents.grid,
    axisX: fixed.axisX,
    axisY: fixed.axisY,
    origin: fixed.origin,
    holeFill: fixed.holeFill,
    holeStroke: accents.hole,
    toolpath: accents.toolpath,
    rapid: accents.rapid,
    text: fixed.text,
    offset: fixed.offset,
  }
}

// Strokes a circle, skipping the angular ranges in `tabRanges` (BL-14) —
// leaves a visible gap wherever the toolpath does. `tabRanges` are in
// world/math angle convention (0 = +X, increasing = counterclockwise,
// same as tabs.ts and the engine); canvas's ctx.arc takes screen angles,
// which run the opposite way here since worldToScreen flips Y — negating
// both bounds (and swapping them back into increasing order) converts
// between the two without changing which points get traced.
function drawGappedCircle(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  radius: number,
  tabRanges: TabRange[],
) {
  if (tabRanges.length === 0) {
    ctx.beginPath()
    ctx.arc(px, py, radius, 0, Math.PI * 2)
    ctx.stroke()
    return
  }

  const drawArc = (worldLo: number, worldHi: number) => {
    if (worldHi <= worldLo) return
    ctx.beginPath()
    ctx.arc(px, py, radius, -worldHi, -worldLo)
    ctx.stroke()
  }

  const sorted = [...tabRanges].sort((a, b) => a.startAngle - b.startAngle)
  let cursor = 0
  for (const range of sorted) {
    drawArc(cursor, range.startAngle)
    cursor = range.endAngle
  }
  drawArc(cursor, Math.PI * 2)
}

// Rectangle analog of drawGappedCircle — walks the 4-corner perimeter in
// world space, skipping the fractional ranges in `sideRanges[edge]` per
// edge (BL-14 for Outline — see lib/outlineRectangleTabs.ts). Takes
// `toPx` directly rather than pre-converted screen coordinates, since
// (unlike a circle) each segment spans two different world points that
// both need converting.
function drawGappedRectangle(
  ctx: CanvasRenderingContext2D,
  toPx: (x: number, y: number) => [number, number],
  corners: Point2D[],
  sideRanges: SideTabRange[][],
) {
  const drawSegment = (p0: Point2D, p1: Point2D, fracLo: number, fracHi: number) => {
    if (fracHi <= fracLo) return
    const [xa, ya] = toPx(p0.x + (p1.x - p0.x) * fracLo, p0.y + (p1.y - p0.y) * fracLo)
    const [xb, yb] = toPx(p0.x + (p1.x - p0.x) * fracHi, p0.y + (p1.y - p0.y) * fracHi)
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
      drawSegment(p0, p1, 0, 1)
      continue
    }
    const sorted = [...ranges].sort((a, b) => a.startFrac - b.startFrac)
    let cursor = 0
    for (const range of sorted) {
      drawSegment(p0, p1, cursor, range.startFrac)
      cursor = range.endFrac
    }
    drawSegment(p0, p1, cursor, 1)
  }
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
function niceStep(rawStep: number): number {
  const exponent = Math.floor(Math.log10(rawStep))
  const fraction = rawStep / 10 ** exponent
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return niceFraction * 10 ** exponent
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
    }
  | {
      kind: 'outlineRect'
      params: WizardParams
      nominalCorners: Point2D[]
      toolCorners: Point2D[]
      sideTabRanges: SideTabRange[][]
    }

function resolvePattern(params: WizardParams): ResolvedPattern {
  if (params.operation === 'outline') {
    const { outline } = params
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
      }
    }
    // Direction never affects what gets drawn (a filled/stroked closed
    // shape looks identical regardless of which way its perimeter was
    // walked) — 'ccw' is an arbitrary, fixed choice for rendering only.
    const nominalCorners = rectCorners(
      outline.shape,
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

// Bounds spanning every rendered pattern (BL-3 overlay) — each pattern's
// own extent is padded by its own radius/corner set, since overlaid
// presets can differ in dimensions from the active one.
function computeCombinedBounds(patterns: ResolvedPattern[]): DataBounds {
  const allX = [0]
  const allY = [0]
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
      const r = Math.max(pattern.nominalRadius, pattern.toolRadius)
      allX.push(pattern.center.x - r, pattern.center.x + r)
      allY.push(pattern.center.y - r, pattern.center.y + r)
    } else {
      for (const p of [...pattern.nominalCorners, ...pattern.toolCorners]) {
        allX.push(p.x)
        allY.push(p.y)
      }
    }
  }
  return {
    dataMinX: Math.min(...allX),
    dataMaxX: Math.max(...allX),
    dataMinY: Math.min(...allY),
    dataMaxY: Math.max(...allY),
  }
}

// BL-11: exposed so ToolpathCanvas can compute a fit-to-data Camera2D
// (initial mount, Fit View click, BL-3 overlay-selection change) without
// duplicating the overlay/active-pattern resolution logic below.
export function computeToolpathDataBounds(
  params: WizardParams,
  overlayParams: WizardParams[] = [],
  showActivePattern = true,
): DataBounds {
  const allPatterns = [
    ...overlayParams.map(resolvePattern),
    ...(showActivePattern ? [resolvePattern(params)] : []),
  ]
  return computeCombinedBounds(allPatterns)
}

// Hole(s): rapid traverse between holes, then each hole's bore
// outline (fill) + tool-center toolpath (stroke) + offset vector. The
// fill stays a full disc even with tabs (rough "material removed here"
// indicator, not literal — same simplification as the 3D bore cylinder
// mesh); the outline and toolpath strokes get real gaps.
function drawHolesGeometry(
  ctx: CanvasRenderingContext2D,
  toPx: (x: number, y: number) => [number, number],
  scale: number,
  pattern: Extract<ResolvedPattern, { kind: 'holes' }>,
  theme: Theme,
  arrowSize: number,
) {
  const { points, holeRadius, toolPathRadius, params } = pattern
  const { geometry } = params

  if (points.length > 1) {
    ctx.strokeStyle = theme.rapid
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    points.forEach((p, i) => {
      const [px, py] = toPx(p.x, p.y)
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

    ctx.beginPath()
    ctx.arc(px, py, holeRadius * scale, 0, Math.PI * 2)
    ctx.fillStyle = theme.holeFill
    ctx.fill()
    ctx.strokeStyle = theme.holeStroke
    ctx.lineWidth = 1
    drawGappedCircle(ctx, px, py, holeRadius * scale, tabRanges)

    ctx.strokeStyle = theme.toolpath
    ctx.lineWidth = 1.5
    drawGappedCircle(ctx, px, py, toolPathRadius * scale, tabRanges)

    ctx.beginPath()
    ctx.arc(px, py, 2, 0, Math.PI * 2)
    ctx.fillStyle = theme.toolpath
    ctx.fill()
  }

  drawOffsetVector(ctx, toPx, geometry.offsetX, geometry.offsetY, theme, arrowSize)
}

// Circle Outline: nominal shape boundary (fill) + tool-center toolpath
// (stroke), both with tab gaps, same layering convention as Hole(s).
function drawOutlineCircleGeometry(
  ctx: CanvasRenderingContext2D,
  toPx: (x: number, y: number) => [number, number],
  scale: number,
  pattern: Extract<ResolvedPattern, { kind: 'outlineCircle' }>,
  theme: Theme,
  arrowSize: number,
) {
  const { center, nominalRadius, toolRadius, tabRanges, params } = pattern
  const [px, py] = toPx(center.x, center.y)

  ctx.beginPath()
  ctx.arc(px, py, nominalRadius * scale, 0, Math.PI * 2)
  ctx.fillStyle = theme.holeFill
  ctx.fill()
  ctx.strokeStyle = theme.holeStroke
  ctx.lineWidth = 1
  drawGappedCircle(ctx, px, py, nominalRadius * scale, tabRanges)

  ctx.strokeStyle = theme.toolpath
  ctx.lineWidth = 1.5
  drawGappedCircle(ctx, px, py, toolRadius * scale, tabRanges)

  ctx.beginPath()
  ctx.arc(px + toolRadius * scale, py, 2, 0, Math.PI * 2)
  ctx.fillStyle = theme.toolpath
  ctx.fill()

  drawOffsetVector(ctx, toPx, params.outline.offsetX, params.outline.offsetY, theme, arrowSize)
}

// Rectangle Outline: same nominal-boundary-fill + tool-path-stroke
// layering as Circle Outline, walking 4 corners instead of a radius.
function drawOutlineRectGeometry(
  ctx: CanvasRenderingContext2D,
  toPx: (x: number, y: number) => [number, number],
  pattern: Extract<ResolvedPattern, { kind: 'outlineRect' }>,
  theme: Theme,
  arrowSize: number,
) {
  const { nominalCorners, toolCorners, sideTabRanges, params } = pattern

  ctx.beginPath()
  nominalCorners.forEach((p, i) => {
    const [x, y] = toPx(p.x, p.y)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.closePath()
  ctx.fillStyle = theme.holeFill
  ctx.fill()
  ctx.strokeStyle = theme.holeStroke
  ctx.lineWidth = 1
  drawGappedRectangle(ctx, toPx, nominalCorners, sideTabRanges)

  ctx.strokeStyle = theme.toolpath
  ctx.lineWidth = 1.5
  drawGappedRectangle(ctx, toPx, toolCorners, sideTabRanges)

  const [startX, startY] = toPx(toolCorners[0].x, toolCorners[0].y)
  ctx.beginPath()
  ctx.arc(startX, startY, 2, 0, Math.PI * 2)
  ctx.fillStyle = theme.toolpath
  ctx.fill()

  drawOffsetVector(ctx, toPx, params.outline.offsetX, params.outline.offsetY, theme, arrowSize)
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
) {
  switch (pattern.kind) {
    case 'holes':
      drawHolesGeometry(ctx, toPx, scale, pattern, theme, arrowSize)
      break
    case 'outlineCircle':
      drawOutlineCircleGeometry(ctx, toPx, scale, pattern, theme, arrowSize)
      break
    case 'outlineRect':
      drawOutlineRectGeometry(ctx, toPx, pattern, theme, arrowSize)
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

export function drawToolpath(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  params: WizardParams,
  isDark: boolean,
  paletteId: PaletteId,
  camera: Camera2D,
  overlayParams: WizardParams[] = [],
  showActivePattern = true,
) {
  const theme = buildTheme(paletteId, isDark)

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

  for (const pattern of allPatterns) {
    drawPatternGeometry(ctx, toPx, camera.scale, pattern, theme, arrowSize)
  }

  // Origin marker
  ctx.beginPath()
  ctx.arc(originPxX, originPxY, 3, 0, Math.PI * 2)
  ctx.fillStyle = theme.origin
  ctx.fill()
  ctx.fillStyle = theme.text
  ctx.fillText('0,0', originPxX + 6, originPxY - 6)
}
