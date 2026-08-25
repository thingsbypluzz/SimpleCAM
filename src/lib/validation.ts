import type { MachineSettings } from '../types/machine'
import type { FeedsParams, GeometryParams, OutlineParams, WizardParams } from '../types/wizard'
import { resolvePoints } from './positioning'
import { rectToolDimensions } from './outlineRectangleGeometry'
import { circleOutlineRadiusAndDirection } from './outlineCircle'

export function isToolDiameterValid(geometry: GeometryParams): boolean {
  return geometry.toolDiameter <= geometry.holeDiameter
}

export function isStepdownValid(feeds: FeedsParams): boolean {
  return feeds.stepdown > 0
}

export function isStartZValid(feeds: FeedsParams): boolean {
  return feeds.startZ <= feeds.safeZ
}

// Purely arbitrary sanity ceiling (BL-1) — unlike the machine-fit checks
// below, there's no physical quantity to derive this from, so it's a flat
// constant. Vacuously valid outside 'circle' positioning: circleHoleCount
// only affects the resolved pattern in that mode, and blocking Generate
// over a value the user can't even see (the Circle fields are hidden for
// every other mode) would be confusing rather than helpful.
export const MAX_CIRCLE_HOLE_COUNT = 100

export function isCircleHoleCountValid(geometry: GeometryParams): boolean {
  return geometry.positioning !== 'circle' || geometry.circleHoleCount <= MAX_CIRCLE_HOLE_COUNT
}

// Purely arbitrary sanity ceiling (BL-14), same category as
// MAX_CIRCLE_HOLE_COUNT above — a spinner/typing bound, not derived from
// anything physical.
export const MAX_TAB_COUNT = 20

// BL-14: tabHeight carves out the bottom of the cut, so it must leave
// something above it — 0 or negative is meaningless, and >= totalDepth
// would mean the entire cut is "tab band" (no normal full-circle cutting
// at all). Vacuously valid with tabs off, same pattern as
// isCircleHoleCountValid above.
export function isTabHeightValid(geometry: GeometryParams): boolean {
  return !geometry.tabsEnabled || (geometry.tabHeight > 0 && geometry.tabHeight < geometry.totalDepth)
}

// tabCount * tabWidth is the total arc length tabs would consume around
// the toolpath circle — at or past the full circumference, tabs overlap
// or swallow the whole ring, leaving nothing to cut.
export function isTabWidthValid(geometry: GeometryParams): boolean {
  if (!geometry.tabsEnabled) return true
  const toolPathRadius = Math.max(0, (geometry.holeDiameter - geometry.toolDiameter) / 2)
  const circumference = 2 * Math.PI * toolPathRadius
  return geometry.tabCount * geometry.tabWidth < circumference
}

// Outline validators — same "vacuously valid when not applicable"
// convention as the Hole(s) validators above, reading params.outline
// instead of params.geometry.

function outlineCircleRadius(outline: OutlineParams): number {
  return circleOutlineRadiusAndDirection(outline).radius
}

// Inside cuts remove material up to the tool's own width — a tool as wide
// as (or wider than) the shape leaves nothing behind. Outside/On-line
// never "don't fit" the same way (Outside only ever grows the cut,
// On-line uses nominal dimensions untouched), so they're always valid.
export function isOutlineToolDiameterValid(outline: OutlineParams): boolean {
  if (outline.offsetMode !== 'inside') return true
  if (outline.shape === 'circle') return outline.toolDiameter <= outline.diameter
  return outline.toolDiameter < Math.min(outline.width, outline.height)
}

// Same rule as isTabHeightValid above, reading outline.* fields.
export function isOutlineTabHeightValid(outline: OutlineParams): boolean {
  return !outline.tabsEnabled || (outline.tabHeight > 0 && outline.tabHeight < outline.totalDepth)
}

// Circle: same formula as isTabWidthValid (tabCount * tabWidth against the
// full circumference — tabCount is total-around-perimeter here, matching
// Hole(s)' semantics). Rectangle: tabCount is per SIDE (not total around
// the perimeter — see CLAUDE.md's Outline design notes), so the check is
// against a single side's length rather than the full perimeter; the
// shortest tool-corrected side is the binding constraint, since the same
// tabCount/tabWidth apply to every side regardless of that side's length.
export function isOutlineTabWidthValid(outline: OutlineParams): boolean {
  if (!outline.tabsEnabled) return true
  if (outline.shape === 'circle') {
    const circumference = 2 * Math.PI * Math.max(0, outlineCircleRadius(outline))
    return outline.tabCount * outline.tabWidth < circumference
  }
  const { toolWidth, toolHeight } = rectToolDimensions(
    outline.width,
    outline.height,
    outline.toolDiameter,
    outline.offsetMode,
  )
  return outline.tabCount * outline.tabWidth < Math.min(toolWidth, toolHeight)
}

// Outline's counterpart to patternSpan()/zSpan() below, for
// machineFitWarnings() — a single shape's own extent instead of a
// multi-point pattern's bounding box. Offset (outline.offsetX/offsetY)
// only translates the shape, so — like patternSpan()'s max-min span — it
// never affects footprint size, only where it sits.
export function outlineFootprint(outline: OutlineParams): { x: number; y: number } {
  if (outline.shape === 'circle') {
    const diameter = 2 * Math.max(0, outlineCircleRadius(outline))
    return { x: diameter, y: diameter }
  }
  const { toolWidth, toolHeight } = rectToolDimensions(
    outline.width,
    outline.height,
    outline.toolDiameter,
    outline.offsetMode,
  )
  return { x: Math.max(0, toolWidth), y: Math.max(0, toolHeight) }
}

export function outlineZSpan(outline: OutlineParams, feeds: FeedsParams): number {
  return feeds.safeZ + outline.totalDepth
}

// X/Y extent of the resolved pattern, hole footprint included (radius, not
// just center points) — the same bounding-box math buildScene.ts uses for
// 3D Preview framing, computed fresh in CNC space rather than reusing its
// THREE.Box3 (that one needs the three dependency and lives in Three's
// Y-up, Z-negated coordinate space — not worth adapting for this).
export function patternSpan(geometry: GeometryParams): { x: number; y: number } {
  const points = resolvePoints(geometry)
  if (points.length === 0) return { x: 0, y: 0 }
  const holeRadius = geometry.holeDiameter / 2
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return {
    x: Math.max(...xs) - Math.min(...xs) + 2 * holeRadius,
    y: Math.max(...ys) - Math.min(...ys) + 2 * holeRadius,
  }
}

// Vertical excursion the program actually needs, top to bottom. safeZ is
// always >= startZ (isStartZValid), so safeZ is the effective top
// regardless of startZ.
export function zSpan(geometry: GeometryParams, feeds: FeedsParams): number {
  return feeds.safeZ + geometry.totalDepth
}

// Span-based fit check — independent of where the operator zeroes the
// machine on the table (see CLAUDE.md, BL-9): a pattern whose span on some
// axis exceeds that axis's total travel can never fit, no matter where
// it's clamped, so this is the only thing worth flagging. One message per
// axis that actually fails; empty array once everything fits.
export function machineFitWarnings(params: WizardParams, machine: MachineSettings): string[] {
  const span =
    params.operation === 'outline' ? outlineFootprint(params.outline) : patternSpan(params.geometry)
  const warnings: string[] = []
  if (span.x > machine.travelX) {
    warnings.push(
      `X span ${span.x.toFixed(1)}mm exceeds the machine's X travel (${machine.travelX}mm).`,
    )
  }
  if (span.y > machine.travelY) {
    warnings.push(
      `Y span ${span.y.toFixed(1)}mm exceeds the machine's Y travel (${machine.travelY}mm).`,
    )
  }
  const totalZ =
    params.operation === 'outline'
      ? outlineZSpan(params.outline, params.feeds)
      : zSpan(params.geometry, params.feeds)
  if (totalZ > machine.travelZ) {
    warnings.push(
      `Z span ${totalZ.toFixed(1)}mm exceeds the machine's Z travel (${machine.travelZ}mm).`,
    )
  }
  return warnings
}
