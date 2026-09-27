import type { MachineSettings } from '../types/machine'
import type { InterpolationMode, WizardParams } from '../types/wizard'
import { assembleProgram } from './program'
import { computeDepthPasses } from './depthPasses'
import { appendTabbedCirclePass, computeTabRanges } from './tabs'
import { fullTurn, ToolpathBuilder, toolpathToGcode, type Toolpath } from './toolpath'

export interface CircleTabsOptions {
  tabHeight: number
  tabWidth: number
  tabCount: number
}

export interface CircleToolpathOptions {
  radius: number
  totalDepth: number
  stepdown: number
  safeZ: number
  startZ: number
  feedrateXY: number
  plungeRate: number
  interpolation: InterpolationMode
  direction: 'cw' | 'ccw'
  tabs: CircleTabsOptions | null
}

// One full turn around (cx, cy) from the pass's start point (cx + radius,
// cy), ending there at `z` — flat when z is the current height, one helical
// turn when lower. G2/G3 with the start point's I/J, or 72 G1 segments (5°)
// ending exactly on the start point. Hole(s) always passes 'ccw': under M3
// (spindle CW seen from above) a CCW pass inside a bore has the wall on its
// right — climb milling, the app's convention for every contour. Circle
// Outline needs both directions, since keeping climb flips the winding
// between Inside and Outside cuts (see CLAUDE.md's Outline design notes).
export function appendFullTurn(b: ToolpathBuilder, cx: number, cy: number, radius: number, direction: 'cw' | 'ccw', z: number) {
  b.arc('cut', { x: cx, y: cy }, direction, fullTurn, z, { from: { x: cx + radius, y: cy }, radius })
}

// G-code for a circle toolpath (Hole(s), Circle Outline). Tabs force G1 for
// the whole program, not just the tab-band passes — simpler than emitting
// split G2/G3 arcs around each gap.
export function circleToolpathGcode(toolpath: Toolpath, opts: CircleToolpathOptions): string[] {
  return toolpathToGcode(toolpath, {
    feeds: { cut: opts.feedrateXY, plunge: opts.plungeRate },
    interpolation: opts.tabs ? 'linear' : opts.interpolation,
  })
}

// Spiral ramping: the tool sweeps a full 360° turn while descending by
// `stepdown` (the pitch), repeating until the target depth is reached, then
// one flat full-circle pass at the bottom to clean the bore floor. The
// spiral starts at `startZ` — the approach margin above the stock top (Z0),
// cut at feed in case zeroing is a little off, not extra material (BL-37) —
// and still ends at -totalDepth.
//
// When tabs are enabled (BL-14), the spiral is deliberately shortened to
// stop exactly at the tab-band top (the last `tabHeight` mm of depth),
// then flat `stepdown`-incremented passes take over for the remainder,
// each skipping the tab arcs — replacing the old single flat finishing
// pass entirely (its job — reaching -totalDepth — is now done by the last
// tab-band pass, correctly tabbed). The two paths are fully separate
// branches on purpose: bolting a tab-skip condition onto a shared tail
// risks the old finishing pass silently running anyway and cutting one
// final untabbed circle right through every tab.
//
// Shared by Hole(s) (holeCircleOptions below, always radius =
// (holeDiameter - toolDiameter)/2, direction 'ccw') and Circle Outline
// (outlineCircle.ts, radius/direction derived from offsetMode) — both read
// from an explicit options object instead of `params.geometry`, which only
// Hole(s) has. One move list (BL-61), starting over the pass start at Safe
// Z (where assembleProgram() leaves the tool): the G-code and the 3D
// preview are both made from it.
export function buildHelixCircleToolpath(cx: number, cy: number, opts: CircleToolpathOptions): Toolpath {
  const { radius, tabs } = opts
  const b = new ToolpathBuilder({ x: cx + radius, y: cy, z: opts.safeZ })
  b.zTo('rapid', opts.startZ)

  let currentZ = opts.startZ

  if (tabs) {
    const tabBandTopZ = -(opts.totalDepth - tabs.tabHeight)
    const spiralDepth = opts.totalDepth + opts.startZ - tabs.tabHeight
    const tabRanges = computeTabRanges(tabs.tabCount, tabs.tabWidth, radius)

    for (const turnDepth of computeDepthPasses(spiralDepth, opts.stepdown)) {
      currentZ -= turnDepth
      appendFullTurn(b, cx, cy, radius, opts.direction, currentZ)
    }

    // Square off the helical ledge the spiral's last turn leaves behind —
    // a spiral turn descends continuously as it sweeps, so what's left at
    // the tab-band top isn't a flat surface, it's a ramp (shallow right
    // after the seam angle, reaching the true tabBandTopZ only back at the
    // seam itself). Without this cleanup pass, the first tab-band pass
    // below bites unevenly: a correct `stepdown` right at the seam, but up
    // to 2x that on the far side of the ramp, since it's cutting into
    // whatever the spiral left rather than a flat surface one stepdown
    // above its target. Same idea as the untabbed path's flat finishing
    // pass below (a pure cleanup revolution) — just needed at this new
    // transition boundary too, not only at the true bottom.
    appendFullTurn(b, cx, cy, radius, opts.direction, currentZ)

    for (const passDepth of computeDepthPasses(tabs.tabHeight, opts.stepdown)) {
      currentZ -= passDepth
      b.zTo('plunge', currentZ)
      appendTabbedCirclePass(b, {
        centerX: cx,
        centerY: cy,
        radius,
        startX: cx + radius,
        startY: cy,
        cutZ: currentZ,
        liftZ: tabBandTopZ,
        tabRanges,
        direction: opts.direction,
      })
    }
  } else {
    for (const turnDepth of computeDepthPasses(opts.totalDepth + opts.startZ, opts.stepdown)) {
      currentZ -= turnDepth
      appendFullTurn(b, cx, cy, radius, opts.direction, currentZ)
    }

    // Flat finishing pass at full depth.
    appendFullTurn(b, cx, cy, radius, opts.direction, currentZ)
  }

  return b.build()
}

export function helixCircleToolpath(cx: number, cy: number, opts: CircleToolpathOptions): string[] {
  return circleToolpathGcode(buildHelixCircleToolpath(cx, cy, opts), opts)
}

// Hole(s)' options for one hole — shared by both methods and the 3D preview.
export function holeCircleOptions(params: WizardParams): CircleToolpathOptions {
  const { geometry, feeds, output } = params
  return {
    radius: (geometry.holeDiameter - geometry.toolDiameter) / 2,
    totalDepth: geometry.totalDepth,
    stepdown: feeds.stepdown,
    safeZ: feeds.safeZ,
    startZ: feeds.startZ,
    feedrateXY: feeds.feedrateXY,
    plungeRate: feeds.plungeRate,
    interpolation: output.interpolation,
    direction: 'ccw',
    tabs: geometry.tabsEnabled
      ? { tabHeight: geometry.tabHeight, tabWidth: geometry.tabWidth, tabCount: geometry.tabCount }
      : null,
  }
}

export function generateHelix(params: WizardParams, machine: MachineSettings): string[] {
  const opts = holeCircleOptions(params)
  return assembleProgram(params, machine, (cx, cy) => helixCircleToolpath(cx, cy, opts))
}
