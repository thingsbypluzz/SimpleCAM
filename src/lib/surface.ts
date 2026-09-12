import type { MachineSettings } from '../types/machine'
import type { Point2D, WizardParams } from '../types/wizard'
import { fmt } from './format'
import { assembleProgram, rapidToTop } from './program'
import { surfaceStartCorner, surfaceStepoverMm, surfaceToolBounds } from './surfaceGeometry'
import { computeRasterLines, zigzagWaypoints } from './surfaceRaster'
import { buildLevelDescents, zTransitionMoves } from './surfaceZTransition'

function surfaceStartPoint(surface: WizardParams['surface']): Point2D {
  return surfaceStartCorner(surface)
}

// Zigzag: continuous G1 chain per Z level (no G0 between raster lines,
// see CLAUDE.md's Surface design notes) — waypoints[0] is always the raster
// start corner, already reached by the preceding zTransitionMoves call, so
// the loop below starts at index 1.
function zigzagSurfaceToolpath(cx: number, cy: number, params: WizardParams): string[] {
  const { surface, feeds, output } = params
  const bounds = surfaceToolBounds(surface)
  const stepoverMm = surfaceStepoverMm(surface)
  const waypoints = zigzagWaypoints(computeRasterLines(bounds, surface.rasterDirection, stepoverMm))
  const descents = buildLevelDescents(feeds.startZ, surface.totalDepth, feeds.stepdown)

  const lines: string[] = [`G0 X${fmt(cx)} Y${fmt(cy)}`, rapidToTop(feeds.startZ)]

  descents.forEach(({ toZ }, idx) => {
    if (idx > 0) {
      lines.push(`G0 Z${fmt(feeds.safeZ)}`)
      lines.push(`G0 X${fmt(cx)} Y${fmt(cy)}`)
      lines.push(rapidToTop(feeds.startZ))
    }
    lines.push(
      ...zTransitionMoves({
        fromZ: feeds.startZ,
        toZ,
        mode: surface.zTransitionMode,
        stepdown: feeds.stepdown,
        feedrateXY: feeds.feedrateXY,
        plungeRate: feeds.plungeRate,
        helixRadius: surface.helixRadius,
        interpolation: output.interpolation,
        cornerX: cx,
        cornerY: cy,
        rasterDirection: surface.rasterDirection,
      }),
    )
    for (let i = 1; i < waypoints.length; i++) {
      lines.push(`G1 X${fmt(waypoints[i].x)} Y${fmt(waypoints[i].y)} Z${fmt(toZ)} F${fmt(feeds.feedrateXY)}`)
    }
  })

  return lines
}

// Unidirectional: always cuts the same direction — full retract to Safe Z
// and reposition between lines within the same level (existing "return to
// Safe Z before G0 to next point" convention), then a straight plunge
// (NOT the Plunge/Helix toggle — that's reserved for transitions between Z
// depth levels, not line-to-line re-entry at the same depth) back down,
// mirroring standardHole.ts's explicit per-pass plunge line.
function unidirectionalSurfaceToolpath(cx: number, cy: number, params: WizardParams): string[] {
  const { surface, feeds, output } = params
  const bounds = surfaceToolBounds(surface)
  const stepoverMm = surfaceStepoverMm(surface)
  const rasterLines = computeRasterLines(bounds, surface.rasterDirection, stepoverMm)
  const descents = buildLevelDescents(feeds.startZ, surface.totalDepth, feeds.stepdown)

  const lines: string[] = [`G0 X${fmt(cx)} Y${fmt(cy)}`, rapidToTop(feeds.startZ)]

  descents.forEach(({ toZ }, idx) => {
    if (idx > 0) {
      lines.push(`G0 Z${fmt(feeds.safeZ)}`)
      lines.push(`G0 X${fmt(cx)} Y${fmt(cy)}`)
      lines.push(rapidToTop(feeds.startZ))
    }
    lines.push(
      ...zTransitionMoves({
        fromZ: feeds.startZ,
        toZ,
        mode: surface.zTransitionMode,
        stepdown: feeds.stepdown,
        feedrateXY: feeds.feedrateXY,
        plungeRate: feeds.plungeRate,
        helixRadius: surface.helixRadius,
        interpolation: output.interpolation,
        cornerX: cx,
        cornerY: cy,
        rasterDirection: surface.rasterDirection,
      }),
    )

    rasterLines.forEach((line, i) => {
      lines.push(`G1 X${fmt(line.to.x)} Y${fmt(line.to.y)} Z${fmt(toZ)} F${fmt(feeds.feedrateXY)}`)
      if (i < rasterLines.length - 1) {
        lines.push(`G0 Z${fmt(feeds.safeZ)}`)
        lines.push(`G0 X${fmt(rasterLines[i + 1].from.x)} Y${fmt(rasterLines[i + 1].from.y)}`)
        lines.push(`G1 Z${fmt(toZ)} F${fmt(feeds.plungeRate)}`)
      }
    })
  })

  return lines
}

export function generateSurfaceZigzag(params: WizardParams, machine: MachineSettings): string[] {
  return assembleProgram(params, machine, zigzagSurfaceToolpath, [surfaceStartPoint(params.surface)])
}

export function generateSurfaceUnidirectional(params: WizardParams, machine: MachineSettings): string[] {
  return assembleProgram(params, machine, unidirectionalSurfaceToolpath, [surfaceStartPoint(params.surface)])
}
