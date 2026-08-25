import type { MachineSettings } from '../types/machine'
import type { InterpolationMode, WizardParams } from '../types/wizard'
import { fmt } from './format'
import { fullCircleMove } from './circle'
import { assembleProgram, rapidToTop } from './program'
import { computeDepthPasses } from './depthPasses'
import { computeTabRanges, tabbedCirclePass } from './tabs'

export interface CircleTabsOptions {
  tabHeight: number
  tabWidth: number
  tabCount: number
}

export interface CircleToolpathOptions {
  radius: number
  totalDepth: number
  stepdown: number
  startZ: number
  feedrateXY: number
  plungeRate: number
  interpolation: InterpolationMode
  direction: 'cw' | 'ccw'
  tabs: CircleTabsOptions | null
}

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
//
// Shared by Hole(s) (helixToolpath below, always radius = (holeDiameter -
// toolDiameter)/2, direction 'ccw') and Circle Outline
// (outlineCircle.ts's generateCircleOutlineHelix, radius/direction derived
// from offsetMode) — extracted so both read from an explicit options object
// instead of `params.geometry`, which only Hole(s) has.
export function helixCircleToolpath(cx: number, cy: number, opts: CircleToolpathOptions): string[] {
  const { radius, tabs } = opts
  const startX = cx + radius
  const startY = cy

  const lines: string[] = [`G0 X${fmt(startX)} Y${fmt(startY)}`, rapidToTop(opts.startZ)]
  // Tabs force G1 for the whole program, not just the tab-band passes —
  // simpler than emitting split G2/G3 arcs around each gap.
  const effectiveInterpolation = tabs ? 'linear' : opts.interpolation

  let currentZ = opts.startZ

  if (tabs) {
    const tabBandTopZ = -(opts.totalDepth - tabs.tabHeight)
    const spiralDepth = opts.totalDepth + opts.startZ - tabs.tabHeight
    const tabRanges = computeTabRanges(tabs.tabCount, tabs.tabWidth, radius)

    for (const turnDepth of computeDepthPasses(spiralDepth, opts.stepdown)) {
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
          feed: opts.feedrateXY,
          interpolation: effectiveInterpolation,
          direction: opts.direction,
        }),
      )
      currentZ = nextZ
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
    // pass below (zStart === zEnd, a pure cleanup revolution) — just
    // needed at this new transition boundary too, not only at the true
    // bottom.
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

    for (const passDepth of computeDepthPasses(tabs.tabHeight, opts.stepdown)) {
      currentZ -= passDepth
      lines.push(`G1 Z${fmt(currentZ)} F${fmt(opts.plungeRate)}`)
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
    }
  } else {
    for (const turnDepth of computeDepthPasses(opts.totalDepth + opts.startZ, opts.stepdown)) {
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
          feed: opts.feedrateXY,
          interpolation: effectiveInterpolation,
          direction: opts.direction,
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
        feed: opts.feedrateXY,
        interpolation: effectiveInterpolation,
        direction: opts.direction,
      }),
    )
  }

  return lines
}

function helixToolpath(cx: number, cy: number, params: WizardParams): string[] {
  const { geometry, feeds, output } = params
  const radius = (geometry.holeDiameter - geometry.toolDiameter) / 2
  return helixCircleToolpath(cx, cy, {
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

export function generateHelix(params: WizardParams, machine: MachineSettings): string[] {
  return assembleProgram(params, machine, helixToolpath)
}
