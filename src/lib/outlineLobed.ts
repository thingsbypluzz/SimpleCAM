import type { MachineSettings } from '../types/machine'
import type { InterpolationMode, OutlineParams, Point2D, WizardParams } from '../types/wizard'
import { computeDepthPasses } from './depthPasses'
import {
  arcLength,
  arcPoint,
  lobeCountOf,
  lobedCenterLoop,
  loopLength,
  loopOutermostOnRay,
  loopPointAtLength,
  loopSamplePositions,
  loopStartingAt,
  reverseLoop,
  translateLoop,
  type Loop,
} from './outlineLobedGeometry'
import { outlineDirectionForOffsetMode } from './outlineRectangle'
import { assembleProgram } from './program'
import { cappedRampPitch } from './rampPitch'
import { ToolpathBuilder, toolpathToGcode, type Point3D, type Toolpath } from './toolpath'

// Passes accumulate Z via repeated float subtraction — same tolerance
// convention as standardHole.ts/outlineRectangle.ts.
const TAB_BAND_EPSILON = 1e-9
// G-code prints 4 decimals; below this an arc's ends may round together.
const MIN_ARC_CHORD = 0.01

// A tab as a stretch of the tool path, in mm from the lap's start.
export interface LoopTabRange {
  start: number
  end: number
}

export interface LobedToolpathOptions {
  // Tool-center loop in the shape's own frame, in travel direction,
  // starting where every lap starts. Empty when there is nothing to cut
  // (invalid geometry, or an Inside tool that doesn't fit).
  loop: Loop
  totalDepth: number
  stepdown: number
  // Depth per ramp lap — Stepdown capped by the Ramp Angle over the whole
  // loop (cappedRampPitch, BL-80). Standard ignores it.
  rampPitch: number
  safeZ: number
  startZ: number
  feedrateXY: number
  plungeRate: number
  interpolation: InterpolationMode
  tabs: { tabHeight: number; ranges: LoopTabRange[] } | null
}

const rad = (deg: number) => (deg * Math.PI) / 180

// Tool-center loop for the offset mode, in travel direction (Outside and
// On-line clockwise, Inside counter-clockwise — climb under M3), before the
// lap start is chosen. Empty when the tool doesn't fit (Add cut Inside,
// Subtract cut Outside or Inside) — see lobedCenterLoop().
export function lobedToolLoop(outline: OutlineParams): Loop {
  const loop = lobedCenterLoop(outline, outline.offsetMode, outline.toolDiameter / 2) ?? []
  return outlineDirectionForOffsetMode(outline.offsetMode) === 'cw' ? reverseLoop(loop) : loop
}

// Tabs spread evenly along the loop's length. The first one is centered
// where the ray at Tab Start crosses the path farthest out; every lap
// starts half a spacing before it, so the start is never inside a tab.
// Returns the loop rotated to that start and the tab ranges measured from it.
function withTabs(loop: Loop, outline: OutlineParams): { loop: Loop; ranges: LoopTabRange[] } {
  const count = Math.floor(outline.tabCount)
  const length = loopLength(loop)
  if (count <= 0 || !(length > 0)) return { loop, ranges: [] }
  const step = length / count
  const first = loopOutermostOnRay(loop, rad(outline.tabStartAngle))
  const ranges: LoopTabRange[] = []
  for (let k = 0; k < count; k++) {
    const center = step * (k + 0.5)
    ranges.push({ start: Math.max(0, center - outline.tabWidth / 2), end: Math.min(length, center + outline.tabWidth / 2) })
  }
  return { loop: loopStartingAt(loop, first - step / 2), ranges }
}

// Lobed Circle's options — shared by both methods and the previews.
export function lobedOutlineOptions(params: WizardParams): LobedToolpathOptions {
  const { outline, feeds, output } = params
  const base = lobedToolLoop(outline)
  const tabbed = outline.tabsEnabled ? withTabs(base, outline) : null
  // Without tabs a lap starts at the tip of the first lobe — or, with the
  // lobes cut out (Subtract), on the main circle half-way to the next notch.
  const startAngle = outline.lobeStartAngle + (outline.lobeMode === 'subtract' ? 180 / Math.max(1, lobeCountOf(outline)) : 0)
  const loop = tabbed ? tabbed.loop : loopStartingAt(base, loopOutermostOnRay(base, rad(startAngle)))
  return {
    loop,
    totalDepth: outline.totalDepth,
    stepdown: feeds.stepdown,
    rampPitch: cappedRampPitch(loopLength(loop), feeds.stepdown, outline.rampAngleDeg),
    safeZ: feeds.safeZ,
    startZ: feeds.startZ,
    feedrateXY: feeds.feedrateXY,
    plungeRate: feeds.plungeRate,
    interpolation: output.interpolation,
    tabs: tabbed ? { tabHeight: outline.tabHeight, ranges: tabbed.ranges } : null,
  }
}

// One lap along the loop from `fromZ` down to `toZ`, every arc descending
// in proportion to its length (helical arcs) — a constant slope all the
// way round. fromZ === toZ is a flat lap.
function appendLap(b: ToolpathBuilder, loop: Loop, fromZ: number, toZ: number) {
  const total = loopLength(loop)
  let walked = 0
  loop.forEach((arc, i) => {
    walked += arcLength(arc)
    const z = i === loop.length - 1 || !(total > 0) ? toZ : fromZ - ((fromZ - toZ) * walked) / total
    const from = arcPoint(arc, 0)
    const to = arcPoint(arc, 1)
    // A sliver of an arc would print the same start and end in G-code —
    // which a controller reads as a full circle. Cut it as a line.
    if (arc.sweep < Math.PI && Math.hypot(to.x - from.x, to.y - from.y) < MIN_ARC_CHORD) b.lineTo('cut', to.x, to.y, z)
    else b.arc('cut', arc.center, arc.ccw ? 'ccw' : 'cw', arc.sweep, z, { from, radius: arc.radius })
  })
}

// One flat lap at `cutZ` that skips every tab: feed up to `liftZ` where the
// tab begins, cross it there, feed back down where it ends — always
// vertical moves at a fixed XY. Straight 'cut' moves only (tabs force G1).
// The walk is the loop's 5° samples plus every tab's exact ends, so a tab
// is always detected and sized exactly — same approach as
// tabs.ts's appendTabbedCirclePass.
function appendTabbedLap(b: ToolpathBuilder, loop: Loop, ranges: LoopTabRange[], cutZ: number, liftZ: number) {
  const positions = [...new Set([...loopSamplePositions(loop), ...ranges.flatMap((r) => [r.start, r.end])])].sort((a, c) => a - c)
  const inTabAt = (s: number) => ranges.some((r) => s > r.start && s < r.end)
  const start = arcPoint(loop[0], 0)
  const points: Point3D[] = []
  let prev: Point2D = start
  let inTab = false // the lap start is never inside a tab, see withTabs()

  for (let i = 1; i < positions.length; i++) {
    const nextInTab = inTabAt((positions[i - 1] + positions[i]) / 2)
    const p = loopPointAtLength(loop, positions[i])
    if (nextInTab && !inTab) points.push({ x: prev.x, y: prev.y, z: liftZ }, { x: p.x, y: p.y, z: liftZ })
    else if (!nextInTab && inTab) points.push({ x: prev.x, y: prev.y, z: cutZ }, { x: p.x, y: p.y, z: cutZ })
    else points.push({ x: p.x, y: p.y, z: nextInTab ? liftZ : cutZ })
    prev = p
    inTab = nextInTab
  }
  if (points.length === 0) return
  // Close exactly on the lap start (no float drift).
  points[points.length - 1] = { x: start.x, y: start.y, z: cutZ }
  for (const pt of points) b.lineTo('cut', pt.x, pt.y, pt.z)
}

function startBuilder(loop: Loop, cx: number, cy: number, opts: LobedToolpathOptions): ToolpathBuilder {
  const start = loop.length > 0 ? arcPoint(loop[0], 0) : { x: cx, y: cy }
  const b = new ToolpathBuilder({ x: start.x, y: start.y, z: opts.safeZ })
  b.zTo('rapid', opts.startZ)
  return b
}

// Standard: straight plunge, then one flat lap per depth level; laps at or
// below the tab band skip the tabs. Like every engine, one move list
// (BL-61) for the G-code and the previews, starting over the lap start at
// Safe Z.
export function buildLobedStandardToolpath(cx: number, cy: number, opts: LobedToolpathOptions): Toolpath {
  const loop = translateLoop(opts.loop, cx, cy)
  const b = startBuilder(loop, cx, cy, opts)
  if (loop.length === 0) return b.build()

  const tabBandTopZ = opts.tabs ? -(opts.totalDepth - opts.tabs.tabHeight) : 0
  let currentZ = opts.startZ
  for (const passDepth of computeDepthPasses(opts.totalDepth + opts.startZ, opts.stepdown)) {
    currentZ -= passDepth
    b.zTo('plunge', currentZ)
    if (opts.tabs && currentZ <= tabBandTopZ + TAB_BAND_EPSILON) appendTabbedLap(b, loop, opts.tabs.ranges, currentZ, tabBandTopZ)
    else appendLap(b, loop, currentZ, currentZ)
  }
  return b.build()
}

// Ramp: every lap descends `rampPitch` spread over the whole loop, then a
// flat lap squares off the slope. With tabs the ramp stops at the top of
// the tab band and flat tabbed laps take over, one Stepdown each — the
// same two-branch structure as helix.ts and outlineRectangle.ts.
export function buildLobedRampToolpath(cx: number, cy: number, opts: LobedToolpathOptions): Toolpath {
  const loop = translateLoop(opts.loop, cx, cy)
  const b = startBuilder(loop, cx, cy, opts)
  if (loop.length === 0) return b.build()

  let currentZ = opts.startZ
  const rampDepth = opts.totalDepth + opts.startZ - (opts.tabs ? opts.tabs.tabHeight : 0)
  for (const lapDepth of computeDepthPasses(rampDepth, opts.rampPitch)) {
    const fromZ = currentZ
    currentZ -= lapDepth
    appendLap(b, loop, fromZ, currentZ)
  }
  appendLap(b, loop, currentZ, currentZ)

  if (opts.tabs) {
    const tabBandTopZ = -(opts.totalDepth - opts.tabs.tabHeight)
    for (const passDepth of computeDepthPasses(opts.tabs.tabHeight, opts.stepdown)) {
      currentZ -= passDepth
      b.zTo('plunge', currentZ)
      appendTabbedLap(b, loop, opts.tabs.ranges, currentZ, tabBandTopZ)
    }
  }
  return b.build()
}

export function buildLobedToolpath(params: WizardParams): Toolpath {
  const opts = lobedOutlineOptions(params)
  const build = params.outline.method === 'ramp' ? buildLobedRampToolpath : buildLobedStandardToolpath
  return build(params.outline.offsetX, params.outline.offsetY, opts)
}

// Tabs force G1 for the whole program, like Circle Outline.
function lobedGcode(toolpath: Toolpath, opts: LobedToolpathOptions): string[] {
  return toolpathToGcode(toolpath, {
    feeds: { cut: opts.feedrateXY, plunge: opts.plungeRate },
    interpolation: opts.tabs ? 'linear' : opts.interpolation,
  })
}

function lobedOutlinePoint(outline: OutlineParams): Point2D[] {
  return [{ x: outline.offsetX, y: outline.offsetY }]
}

export function generateLobedOutlineStandard(params: WizardParams, machine: MachineSettings): string[] {
  const opts = lobedOutlineOptions(params)
  return assembleProgram(params, machine, (cx, cy) => lobedGcode(buildLobedStandardToolpath(cx, cy, opts), opts), lobedOutlinePoint(params.outline))
}

export function generateLobedOutlineRamp(params: WizardParams, machine: MachineSettings): string[] {
  const opts = lobedOutlineOptions(params)
  return assembleProgram(params, machine, (cx, cy) => lobedGcode(buildLobedRampToolpath(cx, cy, opts), opts), lobedOutlinePoint(params.outline))
}
