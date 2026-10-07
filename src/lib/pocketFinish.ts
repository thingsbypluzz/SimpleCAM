import type { PocketParams, Point2D, WizardParams } from '../types/wizard'
import {
  pocketCenter,
  pocketCircleWallRadius,
  pocketDonutWalls,
  pocketRectWallHalfDims,
  pocketRoughDonutWalls,
  pocketStockToLeave,
} from './pocketGeometry'
import { buildLevelDescents } from './surfaceZTransition'
import { fullTurn, ToolpathBuilder, type ArcDirection, type Move, type Point3D } from './toolpath'
import { cellInscribed, cellLoop, cellWallDistance, loopNearestFraction, type LightCell } from './pocketLightened'
import { lapPoints } from './pocketCellSpiral'

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
  if (pocket.shape === 'donut') {
    appendDonutFinish(b, params)
    return
  }
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

// One wall of a Donut, entered at angle 0: the lead arc's center and its two
// ends (both in the roughed band), or — when no arc fits — the point on the
// roughed band's edge the tool comes straight in from.
interface DonutWallLead {
  entry: Point2D
  wallRadius: number
  arc: { center: Point2D; start: Point2D; end: Point2D } | null
  straightFrom: Point2D
}

// Donut (BL-108): two laps per level — the outer wall, then the island the
// other way round, so both are the same kind of cut: climb (outer CCW,
// island CW) for Spiral, Adaptive's own Cut Direction (BL-110). Each lap
// enters and leaves on a quarter arc tangent to its wall, as close to the
// tool radius as the roughed band allows; the lead arcs turn the outer
// lap's way on both walls (on the island they bend away from it). A band with no room for
// an arc is entered straight across the stock. Between the walls the tool
// crosses the cleared band without retracting.
function appendDonutFinish(b: ToolpathBuilder, params: Pick<WizardParams, 'pocket' | 'feeds'>): void {
  const { pocket, feeds } = params
  const c = pocketCenter(pocket)
  const walls = pocketDonutWalls(pocket)
  const band = pocketRoughDonutWalls(pocket)
  const toolR = pocket.toolDiameter / 2
  const stock = pocketStockToLeave(pocket)
  const outerDirection = finishDirection(pocket)
  const islandDirection: ArcDirection = outerDirection === 'ccw' ? 'cw' : 'ccw'
  // +1: the outer lap runs CCW (+Y at angle 0); −1 mirrors everything in Y.
  const turn = outerDirection === 'ccw' ? 1 : -1
  const inBand = (x: number, y: number) => {
    const rho = Math.hypot(x, y)
    return rho >= band.inner - 1e-9 && rho <= band.outer + 1e-9
  }
  // side: −1 = outer wall (the band lies inward), +1 = island (outward).
  // With the outer lap CCW, travel at angle 0 runs +Y on the outer wall and
  // −Y on the island; the lead starts behind the entry point and ends
  // ahead of it.
  const wallLead = (wallRadius: number, side: 1 | -1): DonutWallLead => {
    const entry = { x: c.x + wallRadius, y: c.y }
    const straightFrom = { x: c.x + (side < 0 ? band.outer : band.inner), y: c.y }
    const fits = (r: number) => inBand(wallRadius + side * r, r)
    const candidates = [toolR, ...Array.from({ length: 60 }, (_, k) => toolR - ((toolR - stock) * (k + 1)) / 60)]
    const r = candidates.find((v) => v > 0 && fits(v))
    if (r === undefined) return { entry, wallRadius, arc: null, straightFrom }
    const x = c.x + wallRadius + side * r
    return {
      entry,
      wallRadius,
      arc: { center: { x, y: c.y }, start: { x, y: c.y + turn * side * r }, end: { x, y: c.y - turn * side * r } },
      straightFrom,
    }
  }
  const outer = wallLead(walls.outer, -1)
  const island = wallLead(walls.inner, 1)
  const startOf = (w: DonutWallLead) => (w.arc ? w.arc.start : w.straightFrom)
  const lap = (w: DonutWallLead, direction: ArcDirection, toZ: number) => {
    if (w.arc) b.arc('finish', w.arc.center, outerDirection, Math.PI / 2)
    else b.lineTo('finish', w.entry.x, w.entry.y)
    b.arc('finish', c, direction, fullTurn, toZ, { from: w.entry, radius: w.wallRadius })
    if (w.arc) b.arc('finish', w.arc.center, outerDirection, Math.PI / 2)
    else b.lineTo('finish', w.straightFrom.x, w.straightFrom.y)
  }

  const first = startOf(outer)
  b.zTo('rapid', feeds.safeZ)
  b.rapidXY(first.x, first.y)
  b.zTo('rapid', feeds.startZ)
  const levels = buildLevelDescents(feeds.startZ, pocket.totalDepth, feeds.stepdown)
  levels.forEach(({ toZ }, idx) => {
    b.zTo('plunge', toZ)
    lap(outer, outerDirection, toZ)
    const next = startOf(island)
    b.lineTo('finish', next.x, next.y)
    lap(island, islandDirection, toZ)
    if (idx < levels.length - 1) b.lineTo('finish', first.x, first.y)
  })
}

// The finishing moves on their own, continuing from `from` — for engines
// whose roughing move list is built separately (Adaptive).
export function pocketFinishMoves(from: Point3D, params: Pick<WizardParams, 'pocket' | 'feeds'>): Move[] {
  const b = new ToolpathBuilder(from)
  appendPocketFinish(b, params)
  return b.moves
}

// Lightened cells (OP-6): the same finishing pass per cell, on the cell's
// final tool-center wall (cellLoop() at the tool radius), always climb
// (CCW). The lap enters at the middle of the wall's longest edge. The lead
// radius is the tool radius, shrunk until both lead ends lie in the roughed
// area; when even Stock to Leave doesn't fit, a half-arc from the deepest
// cleared point along the edge's inward normal.
export function appendCellFinish(b: ToolpathBuilder, cell: LightCell, params: Pick<WizardParams, 'pocket' | 'feeds'>): void {
  const { pocket, feeds } = params
  if (!pocket.finishingEnabled) return
  const toolR = pocket.toolDiameter / 2
  const stock = pocketStockToLeave(pocket)
  // Climb = CCW (Spiral always; Adaptive per its Direction, BL-83); CW walks
  // the same wall reversed, with the inward normal on the right.
  const direction = finishDirection(pocket)
  const ccwWall = cellLoop(cell, toolR)
  const wall = direction === 'ccw' ? ccwWall : [...ccwWall].reverse()
  if (wall.length < 2) return

  const roughed = (p: Point2D) => cellWallDistance(cell, p) >= toolR + stock - 1e-9
  // A lead at the middle of wall edge i: a quarter arc (radius the tool
  // radius, shrunk until both ends lie in the roughed area), else a half
  // arc from the deepest roughed point along the edge's inward normal, else
  // none.
  const leadAt = (i: number): { entry: Point2D; lead: Lead } | null => {
    const a = wall[i]
    const q = wall[(i + 1) % wall.length]
    const len = Math.hypot(q.x - a.x, q.y - a.y)
    if (!(len > 0)) return null
    const entry = { x: (a.x + q.x) / 2, y: (a.y + q.y) / 2 }
    const tangent = { x: (q.x - a.x) / len, y: (q.y - a.y) / len }
    const normal = direction === 'ccw' ? { x: -tangent.y, y: tangent.x } : { x: tangent.y, y: -tangent.x }
    const at = (inward: number, along: number) => ({
      x: entry.x + normal.x * inward + tangent.x * along,
      y: entry.y + normal.y * inward + tangent.y * along,
    })
    const quarterFits = (r: number) => roughed(at(r, -r)) && roughed(at(r, r))
    const minR = Math.max(stock, 1e-6)
    if (quarterFits(minR)) {
      let r = Math.max(minR, toolR)
      if (!quarterFits(r)) {
        let lo = minR
        let hi = r
        for (let k = 0; k < 40; k++) {
          const mid = (lo + hi) / 2
          if (quarterFits(mid)) lo = mid
          else hi = mid
        }
        r = lo
      }
      return { entry, lead: { center: at(r, 0), sweep: Math.PI / 2, start: at(r, -r), end: at(r, r) } }
    }
    const reach = 2 * cellInscribed(cell).radius
    let depth = 0
    for (let k = 1; k <= 200; k++) {
      const t = (k / 200) * reach
      if (roughed(at(t, 0)) && (depth === 0 || cellWallDistance(cell, at(t, 0)) >= cellWallDistance(cell, at(depth, 0)))) depth = t
    }
    if (depth === 0) return null
    const r = depth / 2
    return { entry, lead: { center: at(r, 0), sweep: Math.PI, start: at(2 * r, 0), end: at(2 * r, 0) } }
  }
  // Longest wall edge first; the cell's center (always roughed) with
  // straight lead moves as the last resort.
  const order = wall
    .map((a, i) => ({ i, len: Math.hypot(wall[(i + 1) % wall.length].x - a.x, wall[(i + 1) % wall.length].y - a.y) }))
    .sort((x, y) => y.len - x.len)
  let chosen: { entry: Point2D; lead: Lead } | null = null
  for (const { i } of order) {
    chosen = leadAt(i)
    if (chosen) break
  }
  if (!chosen) {
    const center = cellInscribed(cell).center
    const e = order.length > 0 ? wall[order[0].i] : wall[0]
    chosen = { entry: e, lead: { center, sweep: 0, start: center, end: center } }
  }
  const { entry, lead } = chosen

  const lap = lapPoints(wall, loopNearestFraction(wall, entry))
  b.zTo('rapid', feeds.safeZ)
  b.rapidXY(lead.start.x, lead.start.y)
  b.zTo('rapid', feeds.startZ)
  const levels = buildLevelDescents(feeds.startZ, pocket.totalDepth, feeds.stepdown)
  levels.forEach(({ toZ }, idx) => {
    b.zTo('plunge', toZ)
    const leadMove = () => {
      if (lead.sweep > 0) b.arc('finish', lead.center, direction, lead.sweep)
      else b.lineTo('finish', entry.x, entry.y)
    }
    leadMove()
    for (const p of lap) b.lineTo('finish', p.x, p.y)
    if (lead.sweep > 0) b.arc('finish', lead.center, direction, lead.sweep)
    else b.lineTo('finish', lead.end.x, lead.end.y)
    if ((lead.sweep === 0 || lead.sweep < Math.PI) && idx < levels.length - 1 && (lead.end.x !== lead.start.x || lead.end.y !== lead.start.y))
      b.lineTo('finish', lead.start.x, lead.start.y)
  })
}
