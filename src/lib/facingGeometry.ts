import type { FacingParams, FacingSide, Point2D } from '../types/wizard'
import { computeDepthPasses } from './depthPasses'

// Facing (OP-7) works in the side's own frame: `u` runs along the side
// (0…length, toward +X for Bottom/Top and +Y for Left/Right), `v` runs
// across it — 0 on the raw edge, positive into the material.
const FRAME: Record<FacingSide, { u: Point2D; v: Point2D }> = {
  bottom: { u: { x: 1, y: 0 }, v: { x: 0, y: 1 } },
  top: { u: { x: 1, y: 0 }, v: { x: 0, y: -1 } },
  left: { u: { x: 0, y: 1 }, v: { x: 1, y: 0 } },
  right: { u: { x: 0, y: 1 }, v: { x: -1, y: 0 } },
}

export function facingAxes(side: FacingSide): { u: Point2D; v: Point2D } {
  return FRAME[side]
}

type FrameParams = Pick<FacingParams, 'side' | 'length' | 'removal' | 'originAlong' | 'originAcross' | 'offsetX' | 'offsetY'>

// (u, v) → XY. The origin sits at the chosen point along the side and on
// the raw or the finished edge; Offset X/Y moves the whole side from there.
export function facingPoint(facing: FrameParams, u: number, v: number): Point2D {
  const { u: du, v: dv } = FRAME[facing.side]
  const u0 = facing.originAlong === 'start' ? 0 : facing.originAlong === 'center' ? facing.length / 2 : facing.length
  const v0 = facing.originAcross === 'finished' ? facing.removal : 0
  return {
    x: facing.offsetX + du.x * (u - u0) + dv.x * (v - v0),
    y: facing.offsetY + du.y * (u - u0) + dv.y * (v - v0),
  }
}

// Where the edge sits after each sideways pass: stepover, 2·stepover, …,
// the last one trimmed to exactly `removal`.
export function facingPassEdges(facing: Pick<FacingParams, 'removal' | 'stepover'>): number[] {
  let edge = 0
  return computeDepthPasses(facing.removal, facing.stepover).map((step) => (edge += step))
}

// The tool center's travel along the side: it starts and ends its radius
// plus Lead beyond the side's ends, so it enters and leaves in the air.
// Under M3 climb keeps the material on the right of travel — toward +u for
// Top and Left, toward −u for Bottom and Right; conventional is the reverse.
export function facingTravel(
  facing: Pick<FacingParams, 'side' | 'length' | 'toolDiameter' | 'lead' | 'cutDirection'>,
): { from: number; to: number } {
  const overrun = facing.toolDiameter / 2 + facing.lead
  const low = -overrun
  const high = facing.length + overrun
  const climbTowardPlusU = facing.side === 'top' || facing.side === 'left'
  const towardPlusU = (facing.cutDirection === 'climb') === climbTowardPlusU
  return towardPlusU ? { from: low, to: high } : { from: high, to: low }
}

// Tool-center `v` while it returns beside the material.
export function facingClearV(facing: Pick<FacingParams, 'toolDiameter' | 'clearance'>): number {
  return -facing.toolDiameter / 2 - facing.clearance
}

// Tool-center `v` of the last pass — the deepest the tool goes sideways.
export function facingFinalV(facing: Pick<FacingParams, 'toolDiameter' | 'removal'>): number {
  return facing.removal - facing.toolDiameter / 2
}

export interface FacingBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

function boundsOf(points: Point2D[]): FacingBounds {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
}

// Everything the tool center visits, in XY.
export function facingToolBounds(facing: FacingParams): FacingBounds {
  const { from, to } = facingTravel(facing)
  const clear = facingClearV(facing)
  const final = facingFinalV(facing)
  return boundsOf([facingPoint(facing, from, clear), facingPoint(facing, to, final)])
}

// A segment of the side at the given `v` — the raw edge (v = 0) or the
// finished one (v = removal).
export function facingEdge(facing: FrameParams, v: number): [Point2D, Point2D] {
  return [facingPoint(facing, 0, v), facingPoint(facing, facing.length, v)]
}

// Previews: what Facing occupies on screen — the tool's travel plus a band
// of the part behind the finished edge, so the drawn block has some body
// before the view's stock sheet is sized around it.
export function facingViewBounds(facing: FacingParams): FacingBounds {
  const { from, to } = facingTravel(facing)
  const inward = facing.removal + Math.max(facing.toolDiameter, facing.length / 4)
  return boundsOf([facingPoint(facing, from, facingClearV(facing)), facingPoint(facing, to, inward)])
}

// Previews: the part as the cut leaves it — from the finished edge into
// the material as far as the visible stock sheet reaches (the app doesn't
// know the part's other dimension). Corners in order: finished edge start,
// finished edge end, far end, far start.
export function facingBlockCorners(facing: FacingParams, sheet: FacingBounds): Point2D[] {
  const { v } = FRAME[facing.side]
  const p = facingPoint(facing, 0, facing.removal)
  const reach = v.x > 0 ? sheet.maxX - p.x : v.x < 0 ? p.x - sheet.minX : v.y > 0 ? sheet.maxY - p.y : p.y - sheet.minY
  const far = facing.removal + Math.max(reach, facing.toolDiameter)
  return [
    facingPoint(facing, 0, facing.removal),
    facingPoint(facing, facing.length, facing.removal),
    facingPoint(facing, facing.length, far),
    facingPoint(facing, 0, far),
  ]
}

// Previews: the strip of material the cut removes, raw edge first.
export function facingStripCorners(facing: FacingParams): Point2D[] {
  return [
    facingPoint(facing, 0, 0),
    facingPoint(facing, facing.length, 0),
    facingPoint(facing, facing.length, facing.removal),
    facingPoint(facing, 0, facing.removal),
  ]
}
