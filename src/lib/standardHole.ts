import type { MachineSettings } from '../types/machine'
import type { WizardParams } from '../types/wizard'
import { assembleProgram } from './program'
import { computeDepthPasses } from './depthPasses'
import { appendTabbedCirclePass, computeTabRanges } from './tabs'
import { appendFullTurn, circlePassStartAngle, circleToolpathGcode, holeCircleOptions, type CircleToolpathOptions } from './helix'
import { ToolpathBuilder, type Toolpath } from './toolpath'

// Passes accumulate Z via repeated float subtraction — this tolerance on
// the tab-band-top comparison absorbs that drift (same convention as
// depthPasses.ts's own epsilon).
const TAB_BAND_EPSILON = 1e-9

// Layered pocket: plunge straight down by `stepdown`, sweep a full flat
// 360° circle at that depth, repeat until the target depth is reached.
// Passes start at `startZ` — the approach margin above the stock top (Z0),
// not extra material (BL-37) — and still end at -totalDepth. When tabs
// are enabled (BL-14), passes at or below the tab-band top (the last
// `tabHeight` mm) skip the tab arcs instead of cutting a full circle —
// no restructuring needed here, since every pass is already flat at its
// own stepdown Z, so it's an atomic per-pass choice (unlike helix.ts,
// which has to shorten its spiral to reach this same boundary cleanly).
//
// Shared by Hole(s) (holeCircleOptions in helix.ts, always radius =
// (holeDiameter - toolDiameter)/2, direction 'ccw') and Circle Outline
// (outlineCircle.ts's generateCircleOutlineStandard, radius/direction
// derived from offsetMode) — same reasoning as helix.ts's
// buildHelixCircleToolpath, same CircleToolpathOptions and the same single
// move list for G-code and the 3D preview (BL-61).
export function buildStandardCircleToolpath(cx: number, cy: number, opts: CircleToolpathOptions): Toolpath {
  const { radius, tabs } = opts
  const startAngle = circlePassStartAngle(opts)
  const startX = startAngle === 0 ? cx + radius : cx + radius * Math.cos(startAngle)
  const startY = startAngle === 0 ? cy : cy + radius * Math.sin(startAngle)
  const b = new ToolpathBuilder({ x: startX, y: startY, z: opts.safeZ })
  b.zTo('rapid', opts.startZ)

  const tabBandTopZ = tabs ? -(opts.totalDepth - tabs.tabHeight) : 0
  const tabRanges = tabs ? computeTabRanges(tabs.tabCount, tabs.tabWidth, radius) : []

  let currentZ = opts.startZ
  for (const passDepth of computeDepthPasses(opts.totalDepth + opts.startZ, opts.stepdown)) {
    currentZ -= passDepth
    b.zTo('plunge', currentZ)
    if (tabs && currentZ <= tabBandTopZ + TAB_BAND_EPSILON) {
      appendTabbedCirclePass(b, {
        centerX: cx,
        centerY: cy,
        radius,
        startX,
        startY,
        startAngle,
        cutZ: currentZ,
        liftZ: tabBandTopZ,
        tabRanges,
        direction: opts.direction,
      })
    } else {
      appendFullTurn(b, cx, cy, radius, opts.direction, currentZ, startAngle)
    }
  }

  return b.build()
}

export function standardCircleToolpath(cx: number, cy: number, opts: CircleToolpathOptions): string[] {
  return circleToolpathGcode(buildStandardCircleToolpath(cx, cy, opts), opts)
}

export function generateStandardHole(params: WizardParams, machine: MachineSettings): string[] {
  const opts = holeCircleOptions(params)
  return assembleProgram(params, machine, (cx, cy) => standardCircleToolpath(cx, cy, opts))
}
