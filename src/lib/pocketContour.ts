import type { PocketParams, Point2D, WizardParams } from '../types/wizard'
import { computeDepthPasses } from './depthPasses'
import { cellLoopSides, isLightenedShape, lightenedCells, type LightCell } from './pocketLightened'
import { pocketCenter } from './pocketGeometry'
import { cappedRampPitch } from './rampPitch'
import { ToolpathBuilder, type Point3D, type Toolpath } from './toolpath'

// Lightened Pocket with Bottom Open (BL-82): the cells go right through the
// stock, so each cell's contour is cut on its own — the tool-center loop
// one tool radius inside the cell (cellLoopSides()), CCW (climb under M3,
// like Outline Inside) — and its middle drops out, held by tabs. Cell by
// cell to full depth, Ramp or Standard like Outline's rectangle
// (outlineRectangle.ts), always G1. One move list for the G-code and both
// previews, like every engine.

// Passes accumulate Z via repeated float subtraction — same tolerance
// convention as outlineRectangle.ts.
const TAB_BAND_EPSILON = 1e-9

export function isPocketContour(pocket: Pick<PocketParams, 'shape' | 'bottomOpen'>): boolean {
  return pocket.bottomOpen && isLightenedShape(pocket.shape)
}

// A tab as a stretch of the contour, in mm from the lap's start.
export interface ContourTabRange {
  start: number
  end: number
}

export interface CellContour {
  // Closed tool-center loop, CCW, first point not repeated; starts at the
  // corner where the cell's longest side begins.
  points: Point2D[]
  // Where each point sits along the loop, mm from the start.
  positions: number[]
  length: number
  sideLengths: number[] // in loop order, the longest first
  tabs: ContourTabRange[]
}

const dist = (a: Point2D, b: Point2D) => Math.hypot(a.x - b.x, a.y - b.y)

function polylineLength(pts: Point2D[]): number {
  let len = 0
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i])
  return len
}

// How many of `count` tabs go on each side: each next tab lands on the side
// with the most length per tab (length / (its tabs + 1)) — so the first one
// is on the longest side, and a long side gets a second before a short one
// gets its first. Ties go to the earlier side.
export function tabsPerSide(sideLengths: number[], count: number): number[] {
  const tabs = sideLengths.map(() => 0)
  const n = Math.floor(count)
  for (let k = 0; k < n; k++) {
    let best = -1
    let bestRoom = 0
    sideLengths.forEach((len, i) => {
      const room = len / (tabs[i] + 1)
      if (room > bestRoom + 1e-9) {
        best = i
        bestRoom = room
      }
    })
    if (best < 0) break
    tabs[best]++
  }
  return tabs
}

export interface ContourTabsOptions {
  tabCount: number
  tabWidth: number
}

// The cell's contour for a tool of `toolRadius`, or null when the tool
// doesn't fit (validation rejects that). On a side with m tabs they are
// spread evenly, half a spacing from either corner (Outline Rectangle's
// rule, outlineRectangleTabs.ts) — so a corner, and with it the lap start,
// is never inside a tab while m × Tab Width < the side's length.
export function cellContour(cell: LightCell, toolRadius: number, tabs: ContourTabsOptions | null): CellContour | null {
  const sides = cellLoopSides(cell, toolRadius)
  if (!sides) return null
  const lengths = sides.map(polylineLength)
  const longest = lengths.reduce((best, len, i) => (len > lengths[best] + 1e-9 ? i : best), 0)
  const ordered = [...sides.slice(longest), ...sides.slice(0, longest)]
  const sideLengths = [...lengths.slice(longest), ...lengths.slice(0, longest)]

  const points: Point2D[] = []
  const positions: number[] = []
  const sideStarts: number[] = []
  let walked = 0
  ordered.forEach((side, i) => {
    sideStarts.push(walked)
    for (let k = 0; k < side.length - 1; k++) {
      points.push(side[k])
      positions.push(walked)
      walked += dist(side[k], side[k + 1])
    }
    // Keep the side's own total, not the float sum of its segments.
    walked = sideStarts[i] + sideLengths[i]
  })

  const ranges: ContourTabRange[] = []
  if (tabs) {
    tabsPerSide(sideLengths, tabs.tabCount).forEach((m, i) => {
      const len = sideLengths[i]
      for (let k = 0; k < m; k++) {
        const center = sideStarts[i] + (len * (k + 0.5)) / m
        ranges.push({
          start: Math.max(sideStarts[i], center - tabs.tabWidth / 2),
          end: Math.min(sideStarts[i] + len, center + tabs.tabWidth / 2),
        })
      }
    })
  }
  return { points, positions, length: walked, sideLengths, tabs: ranges }
}

function contourTabs(pocket: PocketParams): ContourTabsOptions | null {
  return pocket.tabsEnabled ? { tabCount: pocket.tabCount, tabWidth: pocket.tabWidth } : null
}

// Every cell's contour in cutting order (lightenedCells()), cells the tool
// doesn't fit left out — the engine, validation and the 2D preview's tabs.
export function pocketContours(pocket: PocketParams): CellContour[] {
  const tabs = contourTabs(pocket)
  return lightenedCells(pocket).flatMap((cell) => {
    const c = cellContour(cell, pocket.toolDiameter / 2, tabs)
    return c ? [c] : []
  })
}

// Every side has room for its tabs (m × Tab Width < its length). An error,
// not a quietly smaller count: the G-code must match what was entered.
export function pocketContourTabsFit(pocket: PocketParams): boolean {
  if (!pocket.tabsEnabled) return true
  return pocketContours(pocket).every((c) => {
    const counts = tabsPerSide(c.sideLengths, pocket.tabCount)
    return counts.every((m, i) => m * pocket.tabWidth < c.sideLengths[i] - 1e-9)
  })
}

// The shortest cell contour — the steepest ramp for a given pitch, so the
// one the Ramp Angle checks and the Feedrate Calculator use.
export function shortestContourLength(pocket: PocketParams): number {
  const lengths = pocketContours(pocket).map((c) => c.length)
  return lengths.length > 0 ? Math.min(...lengths) : 0
}

function pointAt(c: CellContour, s: number): Point2D {
  for (let i = 0; i < c.points.length; i++) {
    const next = i + 1 < c.points.length ? c.positions[i + 1] : c.length
    if (s <= next || i === c.points.length - 1) {
      const a = c.points[i]
      const b = c.points[(i + 1) % c.points.length]
      const span = next - c.positions[i]
      const t = span > 0 ? Math.min(1, Math.max(0, (s - c.positions[i]) / span)) : 0
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    }
  }
  return c.points[0]
}

// One lap from `fromZ` down to `toZ`, every segment descending in proportion
// to its length — a constant slope all the way round. fromZ === toZ is a
// flat lap.
function appendLap(b: ToolpathBuilder, c: CellContour, fromZ: number, toZ: number) {
  const n = c.points.length
  for (let i = 1; i <= n; i++) {
    const p = c.points[i % n]
    const walked = i < n ? c.positions[i] : c.length
    const z = i === n || !(c.length > 0) ? toZ : fromZ - ((fromZ - toZ) * walked) / c.length
    b.lineTo('cut', p.x, p.y, z)
  }
}

// One flat lap at `cutZ` that skips every tab: up to `liftZ` where a tab
// begins, across it there, back down where it ends — vertical moves at a
// fixed XY, like outlineLobed.ts's appendTabbedLap(). The walk is the
// loop's points plus every tab's exact ends.
function appendTabbedLap(b: ToolpathBuilder, c: CellContour, cutZ: number, liftZ: number) {
  const positions = [...new Set([...c.positions, c.length, ...c.tabs.flatMap((r) => [r.start, r.end])])].sort((x, y) => x - y)
  const inTabAt = (s: number) => c.tabs.some((r) => s > r.start && s < r.end)
  const start = c.points[0]
  const out: Point3D[] = []
  let prev: Point2D = start
  let inTab = false // the lap starts at a corner, never inside a tab
  for (let i = 1; i < positions.length; i++) {
    const nextInTab = inTabAt((positions[i - 1] + positions[i]) / 2)
    const p = pointAt(c, positions[i])
    if (nextInTab && !inTab) out.push({ x: prev.x, y: prev.y, z: liftZ }, { x: p.x, y: p.y, z: liftZ })
    else if (!nextInTab && inTab) out.push({ x: prev.x, y: prev.y, z: cutZ }, { x: p.x, y: p.y, z: cutZ })
    else out.push({ x: p.x, y: p.y, z: nextInTab ? liftZ : cutZ })
    prev = p
    inTab = nextInTab
  }
  if (out.length === 0) return
  // Close exactly on the lap start (no float drift).
  out[out.length - 1] = { x: start.x, y: start.y, z: cutZ }
  for (const pt of out) b.lineTo('cut', pt.x, pt.y, pt.z)
}

// Standard: straight plunge, then one flat lap per depth level; laps in the
// tab band skip the tabs.
function appendStandardCell(b: ToolpathBuilder, c: CellContour, params: WizardParams, tabHeight: number | null) {
  const { pocket, feeds } = params
  const tabBandTopZ = tabHeight !== null ? -(pocket.totalDepth - tabHeight) : 0
  let z = feeds.startZ
  for (const pass of computeDepthPasses(pocket.totalDepth + feeds.startZ, feeds.stepdown)) {
    z -= pass
    b.zTo('plunge', z)
    if (tabHeight !== null && z <= tabBandTopZ + TAB_BAND_EPSILON) appendTabbedLap(b, c, z, tabBandTopZ)
    else appendLap(b, c, z, z)
  }
}

// Ramp: every lap descends the pitch (Stepdown capped by the Ramp Angle over
// this cell's contour) spread over the whole loop, then a flat lap squares
// off the slope. With tabs the ramp stops at the top of the tab band and
// flat tabbed laps take over, one Stepdown each.
function appendRampCell(b: ToolpathBuilder, c: CellContour, params: WizardParams, tabHeight: number | null) {
  const { pocket, feeds } = params
  const pitch = cappedRampPitch(c.length, feeds.stepdown, pocket.rampAngleDeg)
  let z = feeds.startZ
  for (const lap of computeDepthPasses(pocket.totalDepth + feeds.startZ - (tabHeight ?? 0), pitch)) {
    const fromZ = z
    z -= lap
    appendLap(b, c, fromZ, z)
  }
  appendLap(b, c, z, z)
  if (tabHeight !== null) {
    const tabBandTopZ = -(pocket.totalDepth - tabHeight)
    for (const pass of computeDepthPasses(tabHeight, feeds.stepdown)) {
      z -= pass
      b.zTo('plunge', z)
      appendTabbedLap(b, c, z, tabBandTopZ)
    }
  }
}

// Starts over the first cell's lap start at Safe Z; between cells Safe Z and
// a rapid to the next one's start; ends at the last cut (the final retract
// is assembleProgram()'s).
export function buildPocketContourToolpath(params: WizardParams): Toolpath {
  const { pocket, feeds } = params
  const contours = pocketContours(pocket)
  const first = contours.length > 0 ? contours[0].points[0] : pocketCenter(pocket)
  const b = new ToolpathBuilder({ x: first.x, y: first.y, z: feeds.safeZ })
  const tabHeight = pocket.tabsEnabled ? pocket.tabHeight : null
  const appendCell = pocket.contourMethod === 'ramp' ? appendRampCell : appendStandardCell
  contours.forEach((c, i) => {
    if (i > 0) {
      b.zTo('rapid', feeds.safeZ)
      b.rapidXY(c.points[0].x, c.points[0].y)
    }
    b.zTo('rapid', feeds.startZ)
    appendCell(b, c, params, tabHeight)
  })
  return b.build()
}
