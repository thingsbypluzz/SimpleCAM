import { resolvePoints } from '../../lib/positioning'
import type { WizardParams } from '../../types/wizard'

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

// axisX/axisY match preview3d/buildScene.ts's LIGHT_THEME/DARK_THEME exactly
// (red X, green Y) — same visual convention in both 2D and 3D previews.
// `offset` (amber) is deliberately a different hue family from axisX/axisY/
// origin — it's a meta annotation (a work-offset shift), not a physical
// axis or toolpath move.
const LIGHT_THEME: Theme = {
  background: '#ffffff',
  grid: '#e2e8f0',
  axisX: '#dc2626',
  axisY: '#16a34a',
  origin: '#4f46e5',
  holeFill: 'rgba(79, 70, 229, 0.08)',
  holeStroke: '#94a3b8',
  toolpath: '#16a34a',
  rapid: '#cbd5e1',
  text: '#64748b',
  offset: '#d97706',
}

const DARK_THEME: Theme = {
  background: '#0f172a',
  grid: '#1e293b',
  axisX: '#f87171',
  axisY: '#4ade80',
  origin: '#818cf8',
  holeFill: 'rgba(129, 140, 248, 0.12)',
  holeStroke: '#475569',
  toolpath: '#4ade80',
  rapid: '#334155',
  text: '#94a3b8',
  offset: '#fbbf24',
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

// "1-2-5" sequence — picks a round step (1, 2, 5, 10, 20, 50, 100 mm, ...)
// close to the raw target so grid lines land on human-friendly values.
function niceStep(rawStep: number): number {
  const exponent = Math.floor(Math.log10(rawStep))
  const fraction = rawStep / 10 ** exponent
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return niceFraction * 10 ** exponent
}

interface ResolvedPattern {
  params: WizardParams
  points: { x: number; y: number }[]
  holeRadius: number
  toolPathRadius: number
}

function resolvePattern(params: WizardParams): ResolvedPattern {
  const { geometry } = params
  const points = resolvePoints(geometry)
  const holeRadius = geometry.holeDiameter / 2
  // Guarded against a tool larger than the hole (allowed until Etap 5
  // validation exists) — a negative radius would throw in ctx.arc().
  const toolPathRadius = Math.max(0, (geometry.holeDiameter - geometry.toolDiameter) / 2)
  return { params, points, holeRadius, toolPathRadius }
}

// Bounds spanning every rendered pattern (BL-3 overlay) — each pattern's
// points are padded by its OWN holeRadius, since overlaid presets can have
// a different hole diameter than the active one.
function computeCombinedBounds(patterns: ResolvedPattern[]) {
  const allX = [0]
  const allY = [0]
  for (const pattern of patterns) {
    for (const p of pattern.points) {
      allX.push(p.x - pattern.holeRadius, p.x + pattern.holeRadius)
      allY.push(p.y - pattern.holeRadius, p.y + pattern.holeRadius)
    }
  }
  return {
    dataMinX: Math.min(...allX),
    dataMaxX: Math.max(...allX),
    dataMinY: Math.min(...allY),
    dataMaxY: Math.max(...allY),
  }
}

// Draws one pattern's full geometry (rapid traverse, holes, offset vector)
// as one atomic unit — this is what makes pattern-level (not element-level)
// draw ordering control occlusion between overlaid presets and the active
// pattern (see BL-3: active pattern is always drawn last, on top).
function drawPatternGeometry(
  ctx: CanvasRenderingContext2D,
  toPx: (x: number, y: number) => [number, number],
  scale: number,
  pattern: ResolvedPattern,
  theme: Theme,
  arrowSize: number,
) {
  const { points, holeRadius, toolPathRadius, params } = pattern
  const { geometry } = params

  // Rapid traverse between holes (G0 XY order)
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

  // Each hole: final bore outline (fill) + tool-center toolpath (stroke)
  for (const p of points) {
    const [px, py] = toPx(p.x, p.y)

    ctx.beginPath()
    ctx.arc(px, py, holeRadius * scale, 0, Math.PI * 2)
    ctx.fillStyle = theme.holeFill
    ctx.fill()
    ctx.strokeStyle = theme.holeStroke
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(px, py, toolPathRadius * scale, 0, Math.PI * 2)
    ctx.strokeStyle = theme.toolpath
    ctx.lineWidth = 1.5
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(px, py, 2, 0, Math.PI * 2)
    ctx.fillStyle = theme.toolpath
    ctx.fill()
  }

  // Offset vector — amber, physical origin to the shifted pattern. Hidden
  // entirely at (0,0), same rule as the collapsed Step 2 summary annotation.
  if (geometry.offsetX !== 0 || geometry.offsetY !== 0) {
    const [vecTailX, vecTailY] = toPx(0, 0)
    const [vecTipX, vecTipY] = toPx(geometry.offsetX, geometry.offsetY)
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
}

export function drawToolpath(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  params: WizardParams,
  isDark: boolean,
  overlayParams: WizardParams[] = [],
) {
  const theme = isDark ? DARK_THEME : LIGHT_THEME

  // Overlay patterns drawn first, active pattern last — the active pattern
  // ends up on top wherever it overlaps an overlaid preset (BL-3).
  const allPatterns = [...overlayParams.map(resolvePattern), resolvePattern(params)]

  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = theme.background
  ctx.fillRect(0, 0, width, height)

  if (allPatterns.every((p) => p.points.length === 0)) return

  const { dataMinX, dataMaxX, dataMinY, dataMaxY } = computeCombinedBounds(allPatterns)
  const dataWidth = Math.max(dataMaxX - dataMinX, 1)
  const dataHeight = Math.max(dataMaxY - dataMinY, 1)

  const padding = 40
  const availW = Math.max(width - padding * 2, 1)
  const availH = Math.max(height - padding * 2, 1)
  const scale = Math.min(availW / dataWidth, availH / dataHeight)

  const drawnWidth = dataWidth * scale
  const drawnHeight = dataHeight * scale
  const offsetX = padding + (availW - drawnWidth) / 2
  const offsetY = padding + (availH - drawnHeight) / 2

  const toPx = (x: number, y: number): [number, number] => [
    offsetX + (x - dataMinX) * scale,
    offsetY + (dataMaxY - y) * scale, // flip Y: world up = canvas up
  ]

  // Grid + axis labels
  const step = niceStep(Math.max(dataWidth, dataHeight) / 8)
  ctx.font = '10px ui-monospace, monospace'
  ctx.fillStyle = theme.text
  ctx.strokeStyle = theme.grid
  ctx.lineWidth = 1

  const gridStartX = Math.floor(dataMinX / step) * step
  for (let x = gridStartX; x <= dataMaxX; x += step) {
    const [px] = toPx(x, 0)
    ctx.beginPath()
    ctx.moveTo(px, offsetY)
    ctx.lineTo(px, offsetY + drawnHeight)
    ctx.stroke()
    if (Math.abs(x) > step / 2) ctx.fillText(`${Math.round(x)}`, px + 3, height - padding + 14)
  }

  const gridStartY = Math.floor(dataMinY / step) * step
  for (let y = gridStartY; y <= dataMaxY; y += step) {
    const [, py] = toPx(0, y)
    ctx.beginPath()
    ctx.moveTo(offsetX, py)
    ctx.lineTo(offsetX + drawnWidth, py)
    ctx.stroke()
    if (Math.abs(y) > step / 2) ctx.fillText(`${Math.round(y)}`, padding - 32, py + 3)
  }

  // Axes through the origin — red X / green Y, each with an arrowhead +
  // label at the positive end (same convention as 3D Preview's axes).
  const [originPxX, originPxY] = toPx(0, 0)
  const arrowSize = 7

  ctx.strokeStyle = theme.axisX
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(offsetX, originPxY)
  ctx.lineTo(offsetX + drawnWidth, originPxY)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(offsetX + drawnWidth, originPxY)
  ctx.lineTo(offsetX + drawnWidth - arrowSize, originPxY - arrowSize * 0.6)
  ctx.lineTo(offsetX + drawnWidth - arrowSize, originPxY + arrowSize * 0.6)
  ctx.closePath()
  ctx.fillStyle = theme.axisX
  ctx.fill()
  ctx.font = 'bold 12px ui-monospace, monospace'
  ctx.fillText('X', offsetX + drawnWidth + 4, originPxY + 4)

  // Canvas up = world +Y (toPx flips Y), so the positive end is at the top.
  ctx.strokeStyle = theme.axisY
  ctx.beginPath()
  ctx.moveTo(originPxX, offsetY)
  ctx.lineTo(originPxX, offsetY + drawnHeight)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(originPxX, offsetY)
  ctx.lineTo(originPxX - arrowSize * 0.6, offsetY + arrowSize)
  ctx.lineTo(originPxX + arrowSize * 0.6, offsetY + arrowSize)
  ctx.closePath()
  ctx.fillStyle = theme.axisY
  ctx.fill()
  ctx.fillText('Y', originPxX + 5, offsetY - 3)
  ctx.font = '10px ui-monospace, monospace'

  for (const pattern of allPatterns) {
    drawPatternGeometry(ctx, toPx, scale, pattern, theme, arrowSize)
  }

  // Origin marker
  ctx.beginPath()
  ctx.arc(originPxX, originPxY, 3, 0, Math.PI * 2)
  ctx.fillStyle = theme.origin
  ctx.fill()
  ctx.fillStyle = theme.text
  ctx.fillText('0,0', originPxX + 6, originPxY - 6)
}
