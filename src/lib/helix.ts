import type { MachineSettings } from '../types/machine'
import type { WizardParams } from '../types/wizard'
import { fmt } from './format'
import { fullCircleMove } from './circle'
import { assembleProgram, rapidToTop } from './program'
import { computeDepthPasses } from './depthPasses'
import { computeTabRanges, tabbedCirclePass } from './tabs'

// Spiral ramping: the tool sweeps a full 360° turn while descending by
// `stepdown` (the pitch), repeating until the target depth is reached, then
// one flat full-circle pass at the bottom to clean the bore floor. `startZ`
// raises the top of the cut (material treated as taller by that amount) —
// the spiral itself starts there and still ends at -totalDepth.
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
function helixToolpath(cx: number, cy: number, params: WizardParams): string[] {
  const { geometry, feeds, output } = params
  const radius = (geometry.holeDiameter - geometry.toolDiameter) / 2
  const startX = cx + radius
  const startY = cy

  const lines: string[] = [`G0 X${fmt(startX)} Y${fmt(startY)}`, rapidToTop(feeds)]
  // Tabs force G1 for the whole program, not just the tab-band passes —
  // simpler than emitting split G2/G3 arcs around each gap.
  const effectiveInterpolation = geometry.tabsEnabled ? 'linear' : output.interpolation

  let currentZ = feeds.startZ

  if (geometry.tabsEnabled) {
    const tabBandTopZ = -(geometry.totalDepth - geometry.tabHeight)
    const spiralDepth = geometry.totalDepth + feeds.startZ - geometry.tabHeight
    const tabRanges = computeTabRanges(geometry.tabCount, geometry.tabWidth, radius)

    for (const turnDepth of computeDepthPasses(spiralDepth, feeds.stepdown)) {
      const nextZ = currentZ - turnDepth
      lines.push(
        ...fullCircleMove({
          centerX: cx,
          centerY: cy,
          radius,
          startX,
          startY,
          zStart: currentZ,
          zEnd: nextZ,
          feed: feeds.feedrateXY,
          interpolation: effectiveInterpolation,
        }),
      )
      currentZ = nextZ
    }

    for (const passDepth of computeDepthPasses(geometry.tabHeight, feeds.stepdown)) {
      currentZ -= passDepth
      lines.push(`G1 Z${fmt(currentZ)} F${fmt(feeds.plungeRate)}`)
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
    }
  } else {
    for (const turnDepth of computeDepthPasses(geometry.totalDepth + feeds.startZ, feeds.stepdown)) {
      const nextZ = currentZ - turnDepth
      lines.push(
        ...fullCircleMove({
          centerX: cx,
          centerY: cy,
          radius,
          startX,
          startY,
          zStart: currentZ,
          zEnd: nextZ,
          feed: feeds.feedrateXY,
          interpolation: effectiveInterpolation,
        }),
      )
      currentZ = nextZ
    }

    // Flat finishing pass at full depth.
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

  return lines
}

export function generateHelix(params: WizardParams, machine: MachineSettings): string[] {
  return assembleProgram(params, machine, helixToolpath)
}
