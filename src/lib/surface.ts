import type { MachineSettings } from '../types/machine'
import type { Point2D, SurfaceMethodType, WizardParams } from '../types/wizard'
import { assembleProgram } from './program'
import { surfaceStartCorner, surfaceStepoverMm, surfaceToolBounds } from './surfaceGeometry'
import { computeRasterLines, zigzagWaypoints } from './surfaceRaster'
import { appendZTransition, buildLevelDescents, LEVEL_REENTRY_CLEARANCE, levelEntryZ } from './surfaceZTransition'
import { ToolpathBuilder, toolpathToGcode, type Toolpath } from './toolpath'

function surfaceStartPoint(surface: WizardParams['surface']): Point2D {
  return surfaceStartCorner(surface)
}

// One move list for both methods, shared by the G-code below and the 3D
// preview (BL-61). Starts at the raster start corner at Safe Z (where
// assembleProgram() leaves the tool) and ends at the last cut — the final
// retract to Safe Z is assembleProgram()'s. Per level: level 0 rapids down
// to Start Z; every later one retracts to Safe Z, rapids back over the
// corner and down to just above the previous level's floor
// (levelEntryZ()); then the Plunge/Helix transition to the level's depth
// (appendZTransition()).
//
// Zigzag: one continuous G1 chain per level — waypoints[0] is the corner
// the transition already ended on, so the chain starts at index 1.
//
// Unidirectional: always cuts the same direction — full retract to Safe Z
// and reposition between lines within a level, then a rapid down to just
// above the previous level's floor and a straight plunge (NOT the
// Plunge/Helix toggle — that's for transitions between Z levels, not
// line-to-line re-entry at the same depth).
export function buildSurfaceToolpath(params: WizardParams, method = params.surface.method): Toolpath {
  const { surface, feeds, output } = params
  const corner = surfaceStartPoint(surface)
  const stepoverMm = surfaceStepoverMm(surface)
  const rasterLines = computeRasterLines(surfaceToolBounds(surface), surface.rasterDirection, stepoverMm)
  const waypoints = zigzagWaypoints(rasterLines)
  const descents = buildLevelDescents(feeds.startZ, surface.totalDepth, feeds.stepdown)

  const b = new ToolpathBuilder({ x: corner.x, y: corner.y, z: feeds.safeZ })
  b.zTo('rapid', feeds.startZ)

  let previousToZ = feeds.startZ
  descents.forEach(({ toZ }, idx) => {
    const entryZ = levelEntryZ(idx, previousToZ, feeds.startZ)
    previousToZ = toZ
    if (idx > 0) {
      b.zTo('rapid', feeds.safeZ)
      b.rapidXY(corner.x, corner.y)
      b.zTo('rapid', entryZ)
    }
    appendZTransition(b, {
      fromZ: entryZ,
      toZ,
      mode: surface.zTransitionMode,
      rampAngleDeg: surface.rampAngleDeg,
      feedrateXY: feeds.feedrateXY,
      plungeRate: feeds.plungeRate,
      helixRadius: surface.helixRadius,
      interpolation: output.interpolation,
      cornerX: corner.x,
      cornerY: corner.y,
      rasterDirection: surface.rasterDirection,
    })

    if (method === 'zigzag') {
      for (let i = 1; i < waypoints.length; i++) b.lineTo('cut', waypoints[i].x, waypoints[i].y, toZ)
      return
    }
    rasterLines.forEach((line, i) => {
      b.lineTo('cut', line.to.x, line.to.y, toZ)
      if (i === rasterLines.length - 1) return
      const next = rasterLines[i + 1].from
      b.zTo('rapid', feeds.safeZ)
      b.rapidXY(next.x, next.y)
      b.zTo('rapid', unidirectionalReentryZ(toZ, feeds.stepdown, feeds.safeZ))
      b.zTo('plunge', toZ)
    })
  })

  return b.build()
}

// BL-59: clearance kept above the previous level's floor (the highest
// material the next line's start can be sitting over) when rapiding back
// down between Unidirectional lines — the rapid used to stop exactly on
// that floor, and on the first level exactly on the stock top, so any Z
// error or lost step meant contact at rapid speed. Capped at Safe Z.
export const UNIDIRECTIONAL_REENTRY_CLEARANCE = LEVEL_REENTRY_CLEARANCE

export function unidirectionalReentryZ(toZ: number, stepdown: number, safeZ: number): number {
  return Math.min(safeZ, toZ + stepdown + UNIDIRECTIONAL_REENTRY_CLEARANCE)
}

function surfaceGcode(params: WizardParams, method: SurfaceMethodType): string[] {
  return toolpathToGcode(buildSurfaceToolpath(params, method), {
    feeds: { cut: params.feeds.feedrateXY, plunge: params.feeds.plungeRate },
    interpolation: params.output.interpolation,
  })
}

export function generateSurfaceZigzag(params: WizardParams, machine: MachineSettings): string[] {
  return assembleProgram(params, machine, (_cx, _cy, p) => surfaceGcode(p, 'zigzag'), [surfaceStartPoint(params.surface)])
}

export function generateSurfaceUnidirectional(params: WizardParams, machine: MachineSettings): string[] {
  return assembleProgram(params, machine, (_cx, _cy, p) => surfaceGcode(p, 'unidirectional'), [surfaceStartPoint(params.surface)])
}
