import type { MachineSettings } from '../types/machine'
import type { WizardParams } from '../types/wizard'
import { fmt } from './format'
import { fullCircleMove } from './circle'
import { assembleProgram, rapidToTop } from './program'
import { computeDepthPasses } from './depthPasses'
import { computeTabRanges, tabbedCirclePass } from './tabs'
import type { CircleToolpathOptions } from './helix'

// Passes accumulate Z via repeated float subtraction — this tolerance on
// the tab-band-top comparison absorbs that drift (same convention as
// depthPasses.ts's own epsilon).
const TAB_BAND_EPSILON = 1e-9

// Layered pocket: plunge straight down by `stepdown`, sweep a full flat
// 360° circle at that depth, repeat until the target depth is reached.
// `startZ` raises the top of the cut (material treated as taller by that
// amount) — passes start there and still end at -totalDepth. When tabs
// are enabled (BL-14), passes at or below the tab-band top (the last
// `tabHeight` mm) skip the tab arcs instead of cutting a full circle —
// no restructuring needed here, since every pass is already flat at its
// own stepdown Z, so it's an atomic per-pass choice (unlike helix.ts,
// which has to shorten its spiral to reach this same boundary cleanly).
//
// Shared by Hole(s) (standardHoleToolpath below, always radius =
// (holeDiameter - toolDiameter)/2, direction 'ccw') and Circle Outline
// (outlineCircle.ts's generateCircleOutlineStandard, radius/direction
// derived from offsetMode) — same reasoning as helix.ts's
// helixCircleToolpath split, reuses the same CircleToolpathOptions shape.
export function standardCircleToolpath(cx: number, cy: number, opts: CircleToolpathOptions): string[] {
  const { radius, tabs } = opts
  const startX = cx + radius
  const startY = cy

  const lines: string[] = [`G0 X${fmt(startX)} Y${fmt(startY)}`, rapidToTop(opts.startZ)]

  // Tabs force G1 for the whole program, not just the tab-band passes —
  // simpler than emitting split G2/G3 arcs around each gap.
  const effectiveInterpolation = tabs ? 'linear' : opts.interpolation
  const tabBandTopZ = tabs ? -(opts.totalDepth - tabs.tabHeight) : 0
  const tabRanges = tabs ? computeTabRanges(tabs.tabCount, tabs.tabWidth, radius) : []

  let currentZ = opts.startZ
  for (const passDepth of computeDepthPasses(opts.totalDepth + opts.startZ, opts.stepdown)) {
    currentZ -= passDepth
    lines.push(`G1 Z${fmt(currentZ)} F${fmt(opts.plungeRate)}`)
    if (tabs && currentZ <= tabBandTopZ + TAB_BAND_EPSILON) {
      lines.push(
        ...tabbedCirclePass({
          centerX: cx,
          centerY: cy,
          radius,
          startX,
          startY,
          cutZ: currentZ,
          liftZ: tabBandTopZ,
          feed: opts.feedrateXY,
          tabRanges,
          direction: opts.direction,
        }),
      )
    } else {
      lines.push(
        ...fullCircleMove({
          centerX: cx,
          centerY: cy,
          radius,
          startX,
          startY,
          zStart: currentZ,
          zEnd: currentZ,
          feed: opts.feedrateXY,
          interpolation: effectiveInterpolation,
          direction: opts.direction,
        }),
      )
    }
  }

  return lines
}

function standardHoleToolpath(cx: number, cy: number, params: WizardParams): string[] {
  const { geometry, feeds, output } = params
  const radius = (geometry.holeDiameter - geometry.toolDiameter) / 2
  return standardCircleToolpath(cx, cy, {
    radius,
    totalDepth: geometry.totalDepth,
    stepdown: feeds.stepdown,
    startZ: feeds.startZ,
    feedrateXY: feeds.feedrateXY,
    plungeRate: feeds.plungeRate,
    interpolation: output.interpolation,
    direction: 'ccw',
    tabs: geometry.tabsEnabled
      ? { tabHeight: geometry.tabHeight, tabWidth: geometry.tabWidth, tabCount: geometry.tabCount }
      : null,
  })
}

export function generateStandardHole(params: WizardParams, machine: MachineSettings): string[] {
  return assembleProgram(params, machine, standardHoleToolpath)
}
