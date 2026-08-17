import type { WizardParams } from '../types/wizard'
import { fmt } from './format'
import { fullCircleMove } from './circle'
import { assembleProgram, rapidToTop } from './program'
import { computeDepthPasses } from './depthPasses'

// Spiral ramping: the tool sweeps a full 360° turn while descending by
// `stepdown` (the pitch), repeating until the target depth is reached, then
// one flat full-circle pass at the bottom to clean the bore floor. `startZ`
// raises the top of the cut (material treated as taller by that amount) —
// the spiral itself starts there and still ends at -totalDepth.
function helixToolpath(cx: number, cy: number, params: WizardParams): string[] {
  const { geometry, feeds, output } = params
  const radius = (geometry.holeDiameter - geometry.toolDiameter) / 2
  const startX = cx + radius
  const startY = cy

  const lines: string[] = [`G0 X${fmt(startX)} Y${fmt(startY)}`, rapidToTop(feeds)]

  let currentZ = feeds.startZ
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
        interpolation: output.interpolation,
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
      interpolation: output.interpolation,
    }),
  )

  return lines
}

export function generateHelix(params: WizardParams): string[] {
  return assembleProgram(params, helixToolpath)
}
