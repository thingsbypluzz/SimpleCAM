import type { MachineSettings } from '../types/machine'
import type { OffsetMode, OutlineShape, Point2D, WizardParams } from '../types/wizard'
import { assembleProgram } from './program'
import { computeDepthPasses } from './depthPasses'
import { longerEdgeIndex, rectCorners, rectToolDimensions } from './outlineRectangleGeometry'
import { appendTabbedRectanglePass, sideRangesFor } from './outlineRectangleTabs'
import { ToolpathBuilder, toolpathToGcode, type Toolpath } from './toolpath'

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
  width: number
  height: number
  toolWidth: number
  toolHeight: number
  totalDepth: number
  stepdown: number
  safeZ: number
  startZ: number
  feedrateXY: number
  plungeRate: number
  direction: 'cw' | 'ccw'
  tabs: RectTabsOptions | null
}

// Same offset-mode → direction table as Circle Outline (outlineCircle.ts):
// climb milling under M3 means the kept material is on the right of
// travel — Inside (wall outside the path) → ccw, Outside (part inside the
// path) → cw. On-line is arbitrary (→ cw, no physical meaning at zero
// offset). Shape-independent, so shared between both engines.
export function outlineDirectionForOffsetMode(offsetMode: OffsetMode): 'cw' | 'ccw' {
  return offsetMode === 'inside' ? 'ccw' : 'cw'
}

// One lap around `ordered` (4 corners, already rotated so ordered[0] is the
// ramp edge's start — see buildRectRampToolpath), descending to `nextZ`.
// The ramp edge (ordered[0] -> ordered[1]) carries the full Z drop in a
// single move — a straight G1 X.. Y.. Z.. is already a linear ramp in 3D from
// wherever the tool currently is, no segmentation needed the way a
// circular ramp needs (helix.ts) and no need to know the starting Z
// explicitly. The other 3 edges are flat at `nextZ`. Calling this with the
// tool already sitting at `nextZ` (i.e. no real descent this lap) turns it
// into a pure flat lap — used both for Standard-style flat passes
// elsewhere and for Ramp's own cleanup lap below.
function rampLap(b: ToolpathBuilder, ordered: Point2D[], nextZ: number) {
  for (let i = 0; i < 4; i++) {
    const p = ordered[(i + 1) % 4]
    b.lineTo('cut', p.x, p.y, nextZ)
  }
}

// Rectangle's Standard method: straight plunge, then one flat 4-edge pass
// per depth level — direct structural mirror of standardHole.ts, just
// walking 4 corners instead of a circle. Tabs are an atomic per-pass
// toggle here too (every pass is already flat). Like every engine, one
// move list (BL-61) for the G-code and the 3D preview, starting over the
// first corner at Safe Z (where assembleProgram() leaves the tool).
export function buildRectStandardToolpath(cx: number, cy: number, opts: RectToolpathOptions): Toolpath {
  const corners = rectCorners(opts.shape, opts.width, opts.height, opts.toolWidth, opts.toolHeight, cx, cy, opts.direction)
  const b = new ToolpathBuilder({ x: corners[0].x, y: corners[0].y, z: opts.safeZ })
  b.zTo('rapid', opts.startZ)

  const tabBandTopZ = opts.tabs ? -(opts.totalDepth - opts.tabs.tabHeight) : 0
  const sideRanges = opts.tabs ? sideRangesFor(corners, opts.tabs.tabCount, opts.tabs.tabWidth) : null

  let currentZ = opts.startZ
  for (const passDepth of computeDepthPasses(opts.totalDepth + opts.startZ, opts.stepdown)) {
    currentZ -= passDepth
    b.zTo('plunge', currentZ)
    if (opts.tabs && sideRanges && currentZ <= tabBandTopZ + TAB_BAND_EPSILON) {
      appendTabbedRectanglePass(b, { corners, sideRanges, cutZ: currentZ, liftZ: tabBandTopZ })
    } else {
      appendTabbedRectanglePass(b, { corners, sideRanges: [[], [], [], []], cutZ: currentZ, liftZ: currentZ })
    }
  }

  return b.build()
}

// Rectangle's Ramp method: mirrors helix.ts's two-branch (tabbed/untabbed)
// structure. The ramp edge is fixed (always the longer of width/height,
// resolved once via longerEdgeIndex) and is the same physical edge every
// lap — corners are rotated once so that edge is always "edge 0" of the
// per-lap walk, keeping rampLap() itself agnostic to which edge that is.
export function buildRectRampToolpath(cx: number, cy: number, opts: RectToolpathOptions): Toolpath {
  const corners = rectCorners(opts.shape, opts.width, opts.height, opts.toolWidth, opts.toolHeight, cx, cy, opts.direction)
  const rampEdge = longerEdgeIndex(opts.toolWidth, opts.toolHeight, opts.direction)
  const ordered = [0, 1, 2, 3].map((i) => corners[(i + rampEdge) % 4])

  const b = new ToolpathBuilder({ x: ordered[0].x, y: ordered[0].y, z: opts.safeZ })
  b.zTo('rapid', opts.startZ)
  let currentZ = opts.startZ

  if (opts.tabs) {
    const tabBandTopZ = -(opts.totalDepth - opts.tabs.tabHeight)
    const rampDepth = opts.totalDepth + opts.startZ - opts.tabs.tabHeight
    const sideRanges = sideRangesFor(ordered, opts.tabs.tabCount, opts.tabs.tabWidth)

    for (const turnDepth of computeDepthPasses(rampDepth, opts.stepdown)) {
      currentZ -= turnDepth
      rampLap(b, ordered, currentZ)
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
    rampLap(b, ordered, currentZ)

    for (const passDepth of computeDepthPasses(opts.tabs.tabHeight, opts.stepdown)) {
      currentZ -= passDepth
      b.zTo('plunge', currentZ)
      appendTabbedRectanglePass(b, { corners: ordered, sideRanges, cutZ: currentZ, liftZ: tabBandTopZ })
    }
  } else {
    for (const turnDepth of computeDepthPasses(opts.totalDepth + opts.startZ, opts.stepdown)) {
      currentZ -= turnDepth
      rampLap(b, ordered, currentZ)
    }

    // Flat finishing lap at full depth — re-cuts the ramp edge's own
    // remnant from the last lap flat, same reasoning as the tabbed
    // branch's cleanup lap above (see its comment for the full
    // explanation of why only the ramp edge needs this, not all 4).
    rampLap(b, ordered, currentZ)
  }

  return b.build()
}

// Rectangle Outline's options — shared by both methods and the 3D preview.
export function rectOutlineOptions(params: WizardParams): RectToolpathOptions {
  const { outline, feeds } = params
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
    width: outline.width,
    height: outline.height,
    toolWidth,
    toolHeight,
    totalDepth: outline.totalDepth,
    stepdown: feeds.stepdown,
    safeZ: feeds.safeZ,
    startZ: feeds.startZ,
    feedrateXY: feeds.feedrateXY,
    plungeRate: feeds.plungeRate,
    direction: outlineDirectionForOffsetMode(outline.offsetMode),
    tabs: outline.tabsEnabled
      ? { tabHeight: outline.tabHeight, tabWidth: outline.tabWidth, tabCount: outline.tabCount }
      : null,
  }
}

// Rectangles are straight lines only — the interpolation toggle has
// nothing to act on (Step 4 shows it locked to G1).
function rectGcode(toolpath: Toolpath, opts: RectToolpathOptions): string[] {
  return toolpathToGcode(toolpath, { feeds: { cut: opts.feedrateXY, plunge: opts.plungeRate }, interpolation: 'linear' })
}

function rectOutlinePoint(outline: WizardParams['outline']): Point2D[] {
  return [{ x: outline.offsetX, y: outline.offsetY }]
}

export function generateRectOutlineStandard(params: WizardParams, machine: MachineSettings): string[] {
  const opts = rectOutlineOptions(params)
  return assembleProgram(params, machine, (cx, cy) => rectGcode(buildRectStandardToolpath(cx, cy, opts), opts), rectOutlinePoint(params.outline))
}

export function generateRectOutlineRamp(params: WizardParams, machine: MachineSettings): string[] {
  const opts = rectOutlineOptions(params)
  return assembleProgram(params, machine, (cx, cy) => rectGcode(buildRectRampToolpath(cx, cy, opts), opts), rectOutlinePoint(params.outline))
}
