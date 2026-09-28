import type { PocketParams, Point2D, WizardParams } from '../types/wizard'
import { pocketCenter, pocketCircleWallRadius, pocketRectWallHalfDims, pocketStockToLeave } from './pocketGeometry'
import { buildLevelDescents } from './surfaceZTransition'
import { fullTurn, ToolpathBuilder, type ArcDirection, type Move, type Point3D } from './toolpath'

// Pocket finishing wall pass (BL-42) — runs after the whole roughing, on
// the final tool-center wall (pocketRectWallHalfDims()/
// pocketCircleWallRadius()), while roughing stopped pocketStockToLeave()
// short of it. One lap per roughing Z level (buildLevelDescents()), top to
// bottom, without retracting between levels: the pocket interior is
// already cleared to full depth, so the tool drops between laps at the
// lead-in start at Plunge Rate.
//
// Every lap enters and leaves the wall along a tangent arc (no dwell mark
// where it meets the wall):
// - quarter-arc lead-in/lead-out of radius R, starting/ending R inward from
//   the wall on either side of the entry point; a straight finish move
//   along the chord between them closes the loop. R is kept so both ends
//   lie inside the roughed area (never plunging into the stock left on
//   the wall), as close to the tool radius as that allows (after the last
//   lap there is no chord: the final retract starts at the lead-out end);
// - when no such R exists (a small pocket with a lot of stock left), a
//   half-arc from the pocket center instead — the center is always cleared.
// The entry point is the middle of a longer side (Rectangle) or angle 0
// (Circle). Direction: climb (CCW) for Spiral, Adaptive's own Cut
// Direction.

interface Lead {
  // Arc center of the lead-in/lead-out, and their sweep (π/2 or π).
  center: Point2D
  sweep: number
  // Lead-in start (also where each lap's descent happens).
  start: Point2D
  // Lead-out end — equals `start` for the half-arc lead.
  end: Point2D
}

interface FinishFrame {
  // Entry point on the wall, inward unit normal there, and the distance
  // from the entry point to the pocket center along that normal.
  entry: Point2D
  normal: Point2D
  depthToCenter: number
}

function finishDirection(pocket: Pick<PocketParams, 'method' | 'cutDirection'>): ArcDirection {
  return pocket.method === 'adaptive' && pocket.cutDirection === 'conventional' ? 'cw' : 'ccw'
}

function finishFrame(pocket: PocketParams): FinishFrame {
  const c = pocketCenter(pocket)
  if (pocket.shape === 'circle') {
    const r = pocketCircleWallRadius(pocket)
    return { entry: { x: c.x + r, y: c.y }, normal: { x: -1, y: 0 }, depthToCenter: r }
  }
  const { halfWidth, halfHeight } = pocketRectWallHalfDims(pocket)
  return halfWidth >= halfHeight
    ? { entry: { x: c.x, y: c.y - halfHeight }, normal: { x: 0, y: 1 }, depthToCenter: halfHeight }
    : { entry: { x: c.x + halfWidth, y: c.y }, normal: { x: -1, y: 0 }, depthToCenter: halfWidth }
}

// Largest quarter-arc lead radius range [lo, hi] whose ends stay inside the
// roughed area, or null when there is none.
function quarterLeadRange(pocket: PocketParams): [number, number] | null {
  const stock = pocketStockToLeave(pocket)
  if (pocket.shape === 'circle') {
    // Ends at (Rw − R, ±R) from the center must satisfy hypot ≤ Rw − stock.
    const rw = pocketCircleWallRadius(pocket)
    const rr = rw - stock
    const disc = 2 * rr * rr - rw * rw
    if (!(disc >= 0)) return null
    return [(rw - Math.sqrt(disc)) / 2, (rw + Math.sqrt(disc)) / 2]
  }
  // Ends at ±R along the entry side, R inward from it: R ≥ stock clears
  // the wall stock, R ≤ (along-side half) − stock and R ≤ 2·(across half)
  // − stock keep them off the other walls' stock.
  const { halfWidth, halfHeight } = pocketRectWallHalfDims(pocket)
  const along = Math.max(halfWidth, halfHeight)
  const across = Math.min(halfWidth, halfHeight)
  const hi = Math.min(along - stock, 2 * across - stock)
  return stock <= hi ? [stock, hi] : null
}

function finishLead(pocket: PocketParams, frame: FinishFrame, direction: ArcDirection): Lead {
  const { entry, normal } = frame
  // Travel direction along the wall at the entry point: the inward normal
  // turned right for CCW (the wall stays on the right of a climb cut).
  const s = direction === 'ccw' ? 1 : -1
  const tangent = { x: s * normal.y, y: -s * normal.x }
  const at = (inward: number, along: number) => ({
    x: entry.x + normal.x * inward + tangent.x * along,
    y: entry.y + normal.y * inward + tangent.y * along,
  })

  const range = quarterLeadRange(pocket)
  if (range) {
    const r = Math.min(range[1], Math.max(range[0], pocket.toolDiameter / 2))
    return { center: at(r, 0), sweep: Math.PI / 2, start: at(r, -r), end: at(r, r) }
  }
  const r = frame.depthToCenter / 2
  return { center: at(r, 0), sweep: Math.PI, start: at(2 * r, 0), end: at(2 * r, 0) }
}

// The four wall corners in travel order, starting with the first one
// reached from the entry point.
function rectLapCorners(pocket: PocketParams, direction: ArcDirection): Point2D[] {
  const c = pocketCenter(pocket)
  const { halfWidth: w, halfHeight: h } = pocketRectWallHalfDims(pocket)
  const br = { x: c.x + w, y: c.y - h }
  const tr = { x: c.x + w, y: c.y + h }
  const tl = { x: c.x - w, y: c.y + h }
  const bl = { x: c.x - w, y: c.y - h }
  const entryOnBottom = w >= h
  if (direction === 'ccw') return entryOnBottom ? [br, tr, tl, bl] : [tr, tl, bl, br]
  return entryOnBottom ? [bl, tl, tr, br] : [br, bl, tl, tr]
}

// Appends the finishing pass (nothing when it is off) to a toolpath that
// ends wherever roughing left the tool, at the bottom of the pocket.
export function appendPocketFinish(b: ToolpathBuilder, params: Pick<WizardParams, 'pocket' | 'feeds'>): void {
  const { pocket, feeds } = params
  if (!pocket.finishingEnabled) return
  const direction = finishDirection(pocket)
  const frame = finishFrame(pocket)
  const lead = finishLead(pocket, frame, direction)
  const center = pocketCenter(pocket)
  const wallRadius = pocketCircleWallRadius(pocket)
  const corners = pocket.shape === 'circle' ? [] : rectLapCorners(pocket, direction)

  b.zTo('rapid', feeds.safeZ)
  b.rapidXY(lead.start.x, lead.start.y)
  b.zTo('rapid', feeds.startZ)
  const levels = buildLevelDescents(feeds.startZ, pocket.totalDepth, feeds.stepdown)
  levels.forEach(({ toZ }, idx) => {
    b.zTo('plunge', toZ)
    b.arc('finish', lead.center, direction, lead.sweep)
    if (pocket.shape === 'circle') {
      b.arc('finish', center, direction, fullTurn, toZ, { from: frame.entry, radius: wallRadius })
    } else {
      for (const p of corners) b.lineTo('finish', p.x, p.y)
      b.lineTo('finish', frame.entry.x, frame.entry.y)
    }
    b.arc('finish', lead.center, direction, lead.sweep)
    // Back to the lead-in start for the next lap's descent; after the last
    // lap the tool retracts right where the lead-out ended.
    if (lead.sweep < Math.PI && idx < levels.length - 1) b.lineTo('finish', lead.start.x, lead.start.y)
  })
}

// The finishing moves on their own, continuing from `from` — for engines
// whose roughing move list is built separately (Adaptive).
export function pocketFinishMoves(from: Point3D, params: Pick<WizardParams, 'pocket' | 'feeds'>): Move[] {
  const b = new ToolpathBuilder(from)
  appendPocketFinish(b, params)
  return b.moves
}
