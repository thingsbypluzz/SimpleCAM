import type { MachineSettings } from '../types/machine'
import type { OffsetMode, OutlineShape, Point2D, WizardParams } from '../types/wizard'
import { fmt } from './format'
import { assembleProgram, rapidToTop } from './program'
import { computeDepthPasses } from './depthPasses'
import { longerEdgeIndex, rectCorners, rectToolDimensions } from './outlineRectangleGeometry'
import { sideRangesFor, tabbedRectanglePass } from './outlineRectangleTabs'

// Passes accumulate Z via repeated float subtraction — same tolerance
// convention as standardHole.ts/depthPasses.ts.
const TAB_BAND_EPSILON = 1e-9

export interface RectTabsOptions {
  tabHeight: number
  tabWidth: number
  tabCount: number // per side, not total around the perimeter — see CLAUDE.md's Outline design notes
}

export interface RectToolpathOptions {
  shape: Extract<OutlineShape, 'rectCornered' | 'rectCentered'>
  toolWidth: number
  toolHeight: number
  totalDepth: number
  stepdown: number
  startZ: number
  feedrateXY: number
  plungeRate: number
  direction: 'cw' | 'ccw'
  tabs: RectTabsOptions | null
}

// Same offset-mode → direction table as Circle Outline (outlineCircle.ts):
// Inside is an internal cut (conventional milling → ccw), Outside is an
// external cut (→ cw), On-line is arbitrary (→ cw, no physical meaning at
// zero offset). Shape-independent, so shared between both engines.
export function outlineDirectionForOffsetMode(offsetMode: OffsetMode): 'cw' | 'ccw' {
  return offsetMode === 'inside' ? 'ccw' : 'cw'
}

// One lap around `ordered` (4 corners, already rotated so ordered[0] is the
// ramp edge's start — see rectRampToolpath), descending to `nextZ`. The
// ramp edge (ordered[0] -> ordered[1]) carries the full Z drop in a single
// G1 move — a straight G1 X.. Y.. Z.. is already a linear ramp in 3D from
// wherever the tool currently is, no segmentation needed the way a
// circular ramp needs (helix.ts) and no need to know the starting Z
// explicitly. The other 3 edges are flat at `nextZ`. Calling this with the
// tool already sitting at `nextZ` (i.e. no real descent this lap) turns it
// into a pure flat lap — used both for Standard-style flat passes
// elsewhere and for Ramp's own cleanup lap below.
function rampLap(ordered: Point2D[], nextZ: number, feed: number): string[] {
  const lines: string[] = [
    `G1 X${fmt(ordered[1].x)} Y${fmt(ordered[1].y)} Z${fmt(nextZ)} F${fmt(feed)}`,
  ]
  for (let i = 1; i < 4; i++) {
    const p = ordered[(i + 1) % 4]
    lines.push(`G1 X${fmt(p.x)} Y${fmt(p.y)} Z${fmt(nextZ)} F${fmt(feed)}`)
  }
  return lines
}

// Rectangle's Standard method: straight plunge, then one flat 4-edge pass
// per depth level — direct structural mirror of standardHole.ts, just
// walking 4 corners instead of a circle. Tabs are an atomic per-pass
// toggle here too (every pass is already flat).
function rectStandardToolpath(cx: number, cy: number, opts: RectToolpathOptions): string[] {
  const corners = rectCorners(opts.shape, opts.toolWidth, opts.toolHeight, cx, cy, opts.direction)
  const lines: string[] = [`G0 X${fmt(corners[0].x)} Y${fmt(corners[0].y)}`, rapidToTop(opts.startZ)]

  const tabBandTopZ = opts.tabs ? -(opts.totalDepth - opts.tabs.tabHeight) : 0
  const sideRanges = opts.tabs ? sideRangesFor(corners, opts.tabs.tabCount, opts.tabs.tabWidth) : null

  let currentZ = opts.startZ
  for (const passDepth of computeDepthPasses(opts.totalDepth + opts.startZ, opts.stepdown)) {
    currentZ -= passDepth
    lines.push(`G1 Z${fmt(currentZ)} F${fmt(opts.plungeRate)}`)
    if (opts.tabs && sideRanges && currentZ <= tabBandTopZ + TAB_BAND_EPSILON) {
      lines.push(
        ...tabbedRectanglePass({ corners, sideRanges, cutZ: currentZ, liftZ: tabBandTopZ, feed: opts.feedrateXY }),
      )
    } else {
      lines.push(
        ...tabbedRectanglePass({
          corners,
          sideRanges: [[], [], [], []],
          cutZ: currentZ,
          liftZ: currentZ,
          feed: opts.feedrateXY,
        }),
      )
    }
  }

  return lines
}

// Rectangle's Ramp method: mirrors helix.ts's two-branch (tabbed/untabbed)
// structure. The ramp edge is fixed (always the longer of width/height,
// resolved once via longerEdgeIndex) and is the same physical edge every
// lap — corners are rotated once so that edge is always "edge 0" of the
// per-lap walk, keeping rampLap() itself agnostic to which edge that is.
function rectRampToolpath(cx: number, cy: number, opts: RectToolpathOptions): string[] {
  const corners = rectCorners(opts.shape, opts.toolWidth, opts.toolHeight, cx, cy, opts.direction)
  const rampEdge = longerEdgeIndex(opts.toolWidth, opts.toolHeight, opts.direction)
  const ordered = [0, 1, 2, 3].map((i) => corners[(i + rampEdge) % 4])

  const lines: string[] = [`G0 X${fmt(ordered[0].x)} Y${fmt(ordered[0].y)}`, rapidToTop(opts.startZ)]
  let currentZ = opts.startZ

  if (opts.tabs) {
    const tabBandTopZ = -(opts.totalDepth - opts.tabs.tabHeight)
    const rampDepth = opts.totalDepth + opts.startZ - opts.tabs.tabHeight
    const sideRanges = sideRangesFor(ordered, opts.tabs.tabCount, opts.tabs.tabWidth)

    for (const turnDepth of computeDepthPasses(rampDepth, opts.stepdown)) {
      const nextZ = currentZ - turnDepth
      lines.push(...rampLap(ordered, nextZ, opts.feedrateXY))
      currentZ = nextZ
    }

    // Square off the ramp edge's own remnant before descending into the
    // tabbed passes — same idea as helix.ts's cleanup pass, narrower in
    // scope. Unlike a spiral (where the WHOLE circle ramps continuously
    // each turn, leaving every angle but the seam short of target), only
    // the ramp edge itself is sloped after a lap — the other 3 edges are
    // already flat at `currentZ` by construction (rampLap only puts a Z
    // change on the ramp edge's own line). So this lap's first line (the
    // ramp edge, walked again at the now-unchanged `currentZ`) re-cuts
    // that one sloped edge flat; the other 3 lines are a no-op repeat.
    lines.push(...rampLap(ordered, currentZ, opts.feedrateXY))

    for (const passDepth of computeDepthPasses(opts.tabs.tabHeight, opts.stepdown)) {
      currentZ -= passDepth
      lines.push(`G1 Z${fmt(currentZ)} F${fmt(opts.plungeRate)}`)
      lines.push(
        ...tabbedRectanglePass({ corners: ordered, sideRanges, cutZ: currentZ, liftZ: tabBandTopZ, feed: opts.feedrateXY }),
      )
    }
  } else {
    for (const turnDepth of computeDepthPasses(opts.totalDepth + opts.startZ, opts.stepdown)) {
      const nextZ = currentZ - turnDepth
      lines.push(...rampLap(ordered, nextZ, opts.feedrateXY))
      currentZ = nextZ
    }

    // Flat finishing lap at full depth — re-cuts the ramp edge's own
    // remnant from the last lap flat, same reasoning as the tabbed
    // branch's cleanup lap above (see its comment for the full
    // explanation of why only the ramp edge needs this, not all 4).
    lines.push(...rampLap(ordered, currentZ, opts.feedrateXY))
  }

  return lines
}

function toRectOptions(outline: WizardParams['outline'], feeds: WizardParams['feeds']): RectToolpathOptions {
  const shape = outline.shape
  if (shape === 'circle') throw new Error('outlineRectangle called with a circle outline shape')
  const { toolWidth, toolHeight } = rectToolDimensions(
    outline.width,
    outline.height,
    outline.toolDiameter,
    outline.offsetMode,
  )
  return {
    shape,
    toolWidth,
    toolHeight,
    totalDepth: outline.totalDepth,
    stepdown: feeds.stepdown,
    startZ: feeds.startZ,
    feedrateXY: feeds.feedrateXY,
    plungeRate: feeds.plungeRate,
    direction: outlineDirectionForOffsetMode(outline.offsetMode),
    tabs: outline.tabsEnabled
      ? { tabHeight: outline.tabHeight, tabWidth: outline.tabWidth, tabCount: outline.tabCount }
      : null,
  }
}

function rectOutlineStandardToolpath(cx: number, cy: number, params: WizardParams): string[] {
  return rectStandardToolpath(cx, cy, toRectOptions(params.outline, params.feeds))
}

function rectOutlineRampToolpath(cx: number, cy: number, params: WizardParams): string[] {
  return rectRampToolpath(cx, cy, toRectOptions(params.outline, params.feeds))
}

function rectOutlinePoint(outline: WizardParams['outline']): Point2D[] {
  return [{ x: outline.offsetX, y: outline.offsetY }]
}

export function generateRectOutlineStandard(params: WizardParams, machine: MachineSettings): string[] {
  return assembleProgram(params, machine, rectOutlineStandardToolpath, rectOutlinePoint(params.outline))
}

export function generateRectOutlineRamp(params: WizardParams, machine: MachineSettings): string[] {
  return assembleProgram(params, machine, rectOutlineRampToolpath, rectOutlinePoint(params.outline))
}
