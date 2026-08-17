import type { WizardParams } from '../types/wizard'
import { fmt } from './format'
import { fullCircleMove } from './circle'
import { assembleProgram, rapidToTop } from './program'
import { computeDepthPasses } from './depthPasses'

// Layered pocket: plunge straight down by `stepdown`, sweep a full flat
// 360° circle at that depth, repeat until the target depth is reached.
// `startZ` raises the top of the cut (material treated as taller by that
// amount) — passes start there and still end at -totalDepth.
function standardHoleToolpath(cx: number, cy: number, params: WizardParams): string[] {
  const { geometry, feeds, output } = params
  const radius = (geometry.holeDiameter - geometry.toolDiameter) / 2
  const startX = cx + radius
  const startY = cy

  const lines: string[] = [`G0 X${fmt(startX)} Y${fmt(startY)}`, rapidToTop(feeds)]

  let currentZ = feeds.startZ
  for (const passDepth of computeDepthPasses(geometry.totalDepth + feeds.startZ, feeds.stepdown)) {
    currentZ -= passDepth
    lines.push(`G1 Z${fmt(currentZ)} F${fmt(feeds.plungeRate)}`)
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
  }

  return lines
}

export function generateStandardHole(params: WizardParams): string[] {
  return assembleProgram(params, standardHoleToolpath)
}
