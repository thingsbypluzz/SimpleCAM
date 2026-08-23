import type { MachineSettings } from '../types/machine'
import type { WizardParams } from '../types/wizard'
import { fmt } from './format'
import { fullCircleMove } from './circle'
import { assembleProgram, rapidToTop } from './program'
import { computeDepthPasses } from './depthPasses'
import { computeTabRanges, tabbedCirclePass } from './tabs'

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
function standardHoleToolpath(cx: number, cy: number, params: WizardParams): string[] {
  const { geometry, feeds, output } = params
  const radius = (geometry.holeDiameter - geometry.toolDiameter) / 2
  const startX = cx + radius
  const startY = cy

  const lines: string[] = [`G0 X${fmt(startX)} Y${fmt(startY)}`, rapidToTop(feeds)]

  // Tabs force G1 for the whole program, not just the tab-band passes —
  // simpler than emitting split G2/G3 arcs around each gap.
  const effectiveInterpolation = geometry.tabsEnabled ? 'linear' : output.interpolation
  const tabBandTopZ = -(geometry.totalDepth - geometry.tabHeight)
  const tabRanges = geometry.tabsEnabled
    ? computeTabRanges(geometry.tabCount, geometry.tabWidth, radius)
    : []

  let currentZ = feeds.startZ
  for (const passDepth of computeDepthPasses(geometry.totalDepth + feeds.startZ, feeds.stepdown)) {
    currentZ -= passDepth
    lines.push(`G1 Z${fmt(currentZ)} F${fmt(feeds.plungeRate)}`)
    if (geometry.tabsEnabled && currentZ <= tabBandTopZ + TAB_BAND_EPSILON) {
      lines.push(
        ...tabbedCirclePass({
          centerX: cx,
          centerY: cy,
          radius,
          startX,
          startY,
          cutZ: currentZ,
          liftZ: tabBandTopZ,
          feed: feeds.feedrateXY,
          tabRanges,
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
          feed: feeds.feedrateXY,
          interpolation: effectiveInterpolation,
        }),
      )
    }
  }

  return lines
}

export function generateStandardHole(params: WizardParams, machine: MachineSettings): string[] {
  return assembleProgram(params, machine, standardHoleToolpath)
}
