import type { OffsetMode, OutlineShape, Point2D } from '../types/wizard'

// Inside insets each side by toolRadius (tool center cuts inside the
// nominal rectangle — a pocket/hole); Outside offsets each side out by
// toolRadius (tool center cuts outside — a cut-out part); On-line leaves
// the nominal dimensions untouched. Axis-aligned rectangles stay
// rectangles under any of these — no miter-join math needed, since
// rounded corners are out of scope for this build (see CLAUDE.md).
export function rectToolDimensions(
  width: number,
  height: number,
  toolDiameter: number,
  offsetMode: OffsetMode,
): { toolWidth: number; toolHeight: number } {
  const delta = offsetMode === 'inside' ? -toolDiameter : offsetMode === 'outside' ? toolDiameter : 0
  return { toolWidth: width + delta, toolHeight: height + delta }
}

// Four tool-center corners, in traversal order. 'rectCornered' has its
// origin at the bottom-left corner (mirrors Hole(s)' Grid); 'rectCentered'
// is centered on the origin (mirrors Grid Centered). `direction` picks the
// winding order: 'ccw' walks bottom-left → bottom-right → top-right →
// top-left (mathematical-positive winding); 'cw' walks the same four
// corners in reverse. Callers derive `direction` from cut mode — see
// outlineRectangle.ts.
export function rectCorners(
  shape: Extract<OutlineShape, 'rectCornered' | 'rectCentered'>,
  toolWidth: number,
  toolHeight: number,
  offsetX: number,
  offsetY: number,
  direction: 'cw' | 'ccw',
): Point2D[] {
  const originX = shape === 'rectCentered' ? -toolWidth / 2 : 0
  const originY = shape === 'rectCentered' ? -toolHeight / 2 : 0

  const ccwCorners: Point2D[] = [
    { x: originX, y: originY },
    { x: originX + toolWidth, y: originY },
    { x: originX + toolWidth, y: originY + toolHeight },
    { x: originX, y: originY + toolHeight },
  ]
  const corners = direction === 'cw' ? [ccwCorners[0], ...ccwCorners.slice(1).reverse()] : ccwCorners

  return corners.map((p) => ({ x: p.x + offsetX, y: p.y + offsetY }))
}

export function rectPerimeter(toolWidth: number, toolHeight: number): number {
  return 2 * (toolWidth + toolHeight)
}

// Which of the 4 traversal edges (0: corners[0]→corners[1], 1:
// corners[1]→corners[2], 2/3 mirror 0/1's lengths on the opposite sides)
// is the longer one, for the given `rectCorners(...)` traversal order —
// that's the fixed edge the Ramp method descends along every lap (see
// outlineRectangle.ts). Only 0 or 1 is ever returned: edges 2 and 3
// always duplicate edge 0 and 1's lengths (opposite sides of a
// rectangle), so there's never a reason to ramp on them instead.
//
// Which physical dimension (width/height) maps to edge 0 depends on
// winding direction — rectCorners's ccw order visits a width-edge first
// (corner0→corner1 spans toolWidth), but its cw order reverses corners
// 1-3, so corner0→corner1 there spans toolHeight instead. Ties (a
// square) fall to edge 0, an arbitrary but deterministic choice.
export function longerEdgeIndex(toolWidth: number, toolHeight: number, direction: 'cw' | 'ccw'): 0 | 1 {
  const widthIsLonger = toolWidth >= toolHeight
  if (direction === 'ccw') return widthIsLonger ? 0 : 1
  return widthIsLonger ? 1 : 0
}
