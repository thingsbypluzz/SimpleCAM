import type { MachineSettings } from '../types/machine'
import type { DrillRetractMode, GeometryParams, WizardParams } from '../types/wizard'
import { computeDepthPasses } from './depthPasses'
import { assembleProgram } from './program'
import { ToolpathBuilder, toolpathToGcode, type Toolpath } from './toolpath'

// Hole(s) Drill (BL-120): a drill bit goes straight down at the hole's
// center in pecks of Stepdown, backing off after each one, until it reaches
// -totalDepth. The hole is as wide as the drill. Plain G0/G1 — GRBL and
// Marlin have no drilling cycles (G81/G83/G73), so the cycle is written
// out move by move.
//
//   full      — after each peck the drill backs out to Start Z (chips
//               leave the hole), rapids back down to `retract` above the
//               last peck's bottom and drills on from there (like G83);
//   chipBreak — after each peck the drill backs off by `retract` to break
//               the chip and drills on (like G73).
//
// Pecks start at Start Z — the approach margin above the stock top (Z0),
// as in every engine — and the last one ends at -totalDepth. A Stepdown at
// least as deep as the hole gives one plunge without pecking.

export interface DrillOptions {
  totalDepth: number
  stepdown: number
  safeZ: number
  startZ: number
  plungeRate: number
  retractMode: DrillRetractMode
  retract: number
}

export function drillOptions(params: WizardParams): DrillOptions {
  const { geometry, feeds } = params
  return {
    totalDepth: geometry.totalDepth,
    stepdown: feeds.stepdown,
    safeZ: feeds.safeZ,
    startZ: feeds.startZ,
    plungeRate: feeds.plungeRate,
    retractMode: geometry.drillRetractMode,
    retract: geometry.drillRetract,
  }
}

export function buildDrillToolpath(cx: number, cy: number, opts: DrillOptions): Toolpath {
  const b = new ToolpathBuilder({ x: cx, y: cy, z: opts.safeZ })
  b.zTo('rapid', opts.startZ)

  const passes = computeDepthPasses(opts.totalDepth + opts.startZ, opts.stepdown)
  let bottomZ = opts.startZ
  passes.forEach((passDepth, i) => {
    if (i > 0) {
      // Never above Start Z: a back-off larger than the hole so far stops
      // where the drilling started.
      if (opts.retractMode === 'full') {
        b.zTo('rapid', opts.startZ)
        b.zTo('rapid', Math.min(opts.startZ, bottomZ + opts.retract))
      } else {
        b.zTo('rapid', Math.min(opts.startZ, bottomZ + opts.retract))
      }
    }
    bottomZ -= passDepth
    b.zTo('plunge', bottomZ)
  })

  return b.build()
}

export function drillToolpathGcode(toolpath: Toolpath, opts: DrillOptions): string[] {
  return toolpathToGcode(toolpath, { feeds: { cut: opts.plungeRate, plunge: opts.plungeRate }, interpolation: 'linear' })
}

export function generateDrill(params: WizardParams, machine: MachineSettings): string[] {
  const opts = drillOptions(params)
  return assembleProgram(params, machine, (cx, cy) => drillToolpathGcode(buildDrillToolpath(cx, cy, opts), opts))
}

// The geometry a Hole(s) preset actually cuts: with Drill, the hole is as
// wide as the drill and there are no tabs — the stored Hole Diameter and
// tab settings stay in the preset for the other methods, unused. Everything
// that draws, measures or validates the holes reads this, not
// params.geometry.
export function holeGeometry(params: WizardParams): GeometryParams {
  const { geometry } = params
  if (params.method !== 'drill') return geometry
  return { ...geometry, holeDiameter: geometry.toolDiameter, tabsEnabled: false }
}
