import type { MachineSettings } from '../types/machine'
import type { Point2D, WizardParams } from '../types/wizard'
import { fmt } from './format'
import { assembleProgram, rapidToTop } from './program'
import { buildLevelDescents } from './surfaceZTransition'
import { computeRasterLines, zigzagWaypoints } from './surfaceRaster'
import { pocketZTransitionMoves } from './pocketZTransition'
import {
  circleRingMoves,
  pocketCircleRingRadii,
  pocketRectRingDims,
  RECT_HELIX_ENTRY_FRACTION,
  rectRingMoves,
  type RectRingDims,
} from './pocketSpiral'
import {
  pocketCenter,
  pocketCircleWallRadius,
  pocketRectRasterBounds,
  pocketRectWallHalfDims,
  pocketStepoverMm,
} from './pocketGeometry'

function pocketStartPoint(pocket: WizardParams['pocket']): Point2D {
  return pocketCenter(pocket)
}

function spiralCircleLevel(cx: number, cy: number, toZ: number, params: WizardParams): string[] {
  const { pocket, feeds, output } = params
  const wallRadius = pocketCircleWallRadius(pocket)
  const stepoverMm = pocketStepoverMm(pocket)
  const startRadius = pocket.zTransitionMode === 'helix' ? pocket.helixRadius : 0
  const radii = pocketCircleRingRadii(startRadius, wallRadius, stepoverMm)

  const lines: string[] = []
  let angle = 0
  for (let i = 1; i < radii.length; i++) {
    const { lines: ringLines, nextAngleDeg } = circleRingMoves(radii[i - 1], radii[i], angle, {
      centerX: cx,
      centerY: cy,
      z: toZ,
      feed: feeds.feedrateXY,
      interpolation: output.interpolation,
    })
    lines.push(...ringLines)
    angle = nextAngleDeg
  }
  return lines
}

function spiralRectLevel(cx: number, cy: number, toZ: number, params: WizardParams): string[] {
  const { pocket, feeds } = params
  const { halfWidth, halfHeight } = pocketRectWallHalfDims(pocket)
  const stepoverMm = pocketStepoverMm(pocket)
  const rings = pocketRectRingDims(halfWidth, halfHeight, stepoverMm)

  // Bootstrap ring 1 exactly like every later ring — Plunge enters at the
  // degenerate (0,0) "ring" (collapses to the pocket center regardless of
  // fraction), Helix enters at the (helixRadius,helixRadius) bounding
  // square, at the fraction that lands exactly on its own flat-finishing-
  // pass's end point. See RECT_HELIX_ENTRY_FRACTION's doc comment.
  let prevDims: RectRingDims =
    pocket.zTransitionMode === 'helix' ? { halfWidth: pocket.helixRadius, halfHeight: pocket.helixRadius } : { halfWidth: 0, halfHeight: 0 }
  let fraction = pocket.zTransitionMode === 'helix' ? RECT_HELIX_ENTRY_FRACTION : 0

  const lines: string[] = []
  for (const dims of rings) {
    const { lines: ringLines, nextFraction } = rectRingMoves(prevDims, dims, fraction, {
      centerX: cx,
      centerY: cy,
      z: toZ,
      feed: feeds.feedrateXY,
    })
    lines.push(...ringLines)
    prevDims = dims
    fraction = nextFraction
  }
  return lines
}

// cx/cy unused — the raster boundary is derived entirely from pocket.* (via
// pocketRectRasterBounds), and G-code is sequential, so the connecting move
// to the raster's first waypoint implicitly starts from wherever the
// preceding Z-entry left the tool. Kept in the signature only so every
// levelClear function shares the same shape as pocketToolpath() expects.
function rasterRectLevel(_cx: number, _cy: number, toZ: number, params: WizardParams): string[] {
  const { pocket, feeds } = params
  const bounds = pocketRectRasterBounds(pocket)
  const stepoverMm = pocketStepoverMm(pocket)
  const waypoints = zigzagWaypoints(computeRasterLines(bounds, pocket.rasterDirection, stepoverMm))

  const lines: string[] = []
  waypoints.forEach((p) => {
    lines.push(`G1 X${fmt(p.x)} Y${fmt(p.y)} Z${fmt(toZ)} F${fmt(feeds.feedrateXY)}`)
  })
  return lines
}

// Shared per-level structure for every method/shape combination — one full
// XY clear per Z level (buildLevelDescents(), reused unchanged from
// Surface): level 0 starts at Start Z with no retract, every later level
// fully retracts to Safe Z, repositions over the pocket's own center, and
// rapids back down to Start Z before its own Z-entry — see CLAUDE.md's
// Pocket design notes.
function pocketToolpath(
  cx: number,
  cy: number,
  params: WizardParams,
  levelClear: (cx: number, cy: number, toZ: number, params: WizardParams) => string[],
): string[] {
  const { pocket, feeds, output } = params
  const descents = buildLevelDescents(feeds.startZ, pocket.totalDepth, feeds.stepdown)

  const lines: string[] = [`G0 X${fmt(cx)} Y${fmt(cy)}`, rapidToTop(feeds.startZ)]

  descents.forEach(({ toZ }, idx) => {
    if (idx > 0) {
      lines.push(`G0 Z${fmt(feeds.safeZ)}`)
      lines.push(`G0 X${fmt(cx)} Y${fmt(cy)}`)
      lines.push(rapidToTop(feeds.startZ))
    }
    lines.push(
      ...pocketZTransitionMoves({
        fromZ: feeds.startZ,
        toZ,
        mode: pocket.zTransitionMode,
        stepdown: feeds.stepdown,
        feedrateXY: feeds.feedrateXY,
        plungeRate: feeds.plungeRate,
        helixRadius: pocket.helixRadius,
        interpolation: output.interpolation,
        centerX: cx,
        centerY: cy,
      }),
    )
    lines.push(...levelClear(cx, cy, toZ, params))
  })

  return lines
}

export function generatePocketSpiral(params: WizardParams, machine: MachineSettings): string[] {
  const levelClear = params.pocket.shape === 'circle' ? spiralCircleLevel : spiralRectLevel
  return assembleProgram(params, machine, (cx, cy, p) => pocketToolpath(cx, cy, p, levelClear), [pocketStartPoint(params.pocket)])
}

export function generatePocketRaster(params: WizardParams, machine: MachineSettings): string[] {
  return assembleProgram(params, machine, (cx, cy, p) => pocketToolpath(cx, cy, p, rasterRectLevel), [pocketStartPoint(params.pocket)])
}
