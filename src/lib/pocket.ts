import type { MachineSettings } from '../types/machine'
import type { PocketMethodType, Point2D, WizardParams } from '../types/wizard'
import { assembleProgram } from './program'
import { buildLevelDescents, levelEntryZ } from './surfaceZTransition'
import { appendPocketZTransition, pocketEntryPoint } from './pocketZTransition'
import { buildAdaptiveToolpath } from './pocketAdaptive'
import { appendPocketFinish, pocketFinishMoves } from './pocketFinish'
import {
  appendCircleRing,
  appendRectRing,
  pocketCircleRingRadii,
  pocketRectRingDims,
  RECT_HELIX_ENTRY_FRACTION,
  type RectRingDims,
} from './pocketSpiral'
import {
  pocketCenter,
  pocketRoughCircleWallRadius,
  pocketRoughRectWallHalfDims,
  pocketStepoverMm,
} from './pocketGeometry'
import { toolpathToGcode, ToolpathBuilder, type Toolpath } from './toolpath'

function pocketStartPoint(pocket: WizardParams['pocket']): Point2D {
  return pocketCenter(pocket)
}

type LevelClear = (b: ToolpathBuilder, cx: number, cy: number, toZ: number, params: WizardParams) => void

function spiralCircleLevel(b: ToolpathBuilder, cx: number, cy: number, toZ: number, params: WizardParams): void {
  const { pocket } = params
  const startRadius = pocket.zTransitionMode === 'helix' ? pocket.helixRadius : 0
  const radii = pocketCircleRingRadii(startRadius, pocketRoughCircleWallRadius(pocket), pocketStepoverMm(pocket))
  let angle = 0
  for (let i = 1; i < radii.length; i++) {
    angle = appendCircleRing(b, radii[i - 1], radii[i], angle, cx, cy, toZ, pocket.rampLengthFactor)
  }
}

function spiralRectLevel(b: ToolpathBuilder, cx: number, cy: number, toZ: number, params: WizardParams): void {
  const { pocket } = params
  const { halfWidth, halfHeight } = pocketRoughRectWallHalfDims(pocket)
  const isHelix = pocket.zTransitionMode === 'helix'
  const rings = pocketRectRingDims(halfWidth, halfHeight, pocketStepoverMm(pocket), isHelix ? pocket.helixRadius : 0)

  // Bootstrap ring 1 exactly like every later ring — Plunge enters at the
  // degenerate (0,0) "ring" (collapses to the pocket center regardless of
  // fraction), Helix enters at the (helixRadius,helixRadius) bounding
  // square, at the fraction that lands exactly on its own flat-finishing-
  // pass's end point. See RECT_HELIX_ENTRY_FRACTION's doc comment.
  let prevDims: RectRingDims = isHelix
    ? { halfWidth: pocket.helixRadius, halfHeight: pocket.helixRadius }
    : { halfWidth: 0, halfHeight: 0 }
  let fraction = isHelix ? RECT_HELIX_ENTRY_FRACTION : 0
  for (const dims of rings) {
    fraction = appendRectRing(b, prevDims, dims, fraction, cx, cy, toZ, pocket.rampLengthFactor)
    prevDims = dims
  }
}

const LEVEL_CLEAR: Record<Exclude<PocketMethodType, 'adaptive'>, (pocket: WizardParams['pocket']) => LevelClear> = {
  spiral: (pocket) => (pocket.shape === 'circle' ? spiralCircleLevel : spiralRectLevel),
}

// One move list per Pocket, shared by the G-code below and both previews
// (BL-61). Starts over the Z-entry point at Safe Z (where assembleProgram()
// leaves the tool) and ends at the last cut — the final retract to Safe Z
// is assembleProgram()'s.
//
// Spiral: one full XY clear per Z level (buildLevelDescents(), reused
// unchanged from Surface) — level 0 rapids down to Start Z; every later
// level retracts to Safe Z, rapids back over the entry point and down to
// just above the previous level's floor (levelEntryZ()); then the
// Plunge/Helix entry (appendPocketZTransition(), helix at the Ramp Angle)
// and the method's level clear. See CLAUDE.md's Pocket design notes.
//
// Adaptive has its own level structure (stays down between levels, helix
// pitch from the ramp angle) inside buildAdaptiveToolpath(), which starts at
// the helix start at Start Z — only the rapid down to it is added here.
//
// Both methods rough to the roughing wall; the optional finishing wall
// pass (lib/pocketFinish.ts, BL-42) follows the whole roughing.
export function buildPocketToolpath(params: WizardParams, method = params.pocket.method): Toolpath {
  const { pocket, feeds, output } = params
  const center = pocketCenter(pocket)

  if (method === 'adaptive') {
    const adaptive = buildAdaptiveToolpath(params)
    const b = new ToolpathBuilder({ x: adaptive.start.x, y: adaptive.start.y, z: feeds.safeZ })
    b.zTo('rapid', feeds.startZ)
    const last = adaptive.moves.length > 0 ? adaptive.moves[adaptive.moves.length - 1].to : b.current
    return { start: b.start, moves: [...b.moves, ...adaptive.moves, ...pocketFinishMoves(last, params)] }
  }

  const entry = pocketEntryPoint(center.x, center.y, pocket.zTransitionMode, pocket.helixRadius)
  const levelClear = LEVEL_CLEAR[method](pocket)
  const b = new ToolpathBuilder({ x: entry.x, y: entry.y, z: feeds.safeZ })
  b.zTo('rapid', feeds.startZ)

  let previousToZ = feeds.startZ
  buildLevelDescents(feeds.startZ, pocket.totalDepth, feeds.stepdown).forEach(({ toZ }, idx) => {
    const entryZ = levelEntryZ(idx, previousToZ, feeds.startZ)
    previousToZ = toZ
    if (idx > 0) {
      b.zTo('rapid', feeds.safeZ)
      b.rapidXY(entry.x, entry.y)
      b.zTo('rapid', entryZ)
    }
    appendPocketZTransition(b, {
      fromZ: entryZ,
      toZ,
      mode: pocket.zTransitionMode,
      rampAngleDeg: pocket.rampAngleDeg,
      feedrateXY: feeds.feedrateXY,
      plungeRate: feeds.plungeRate,
      helixRadius: pocket.helixRadius,
      interpolation: output.interpolation,
      centerX: center.x,
      centerY: center.y,
    })
    levelClear(b, center.x, center.y, toZ, params)
  })
  appendPocketFinish(b, params)

  return b.build()
}

function pocketGcode(params: WizardParams, method: PocketMethodType): string[] {
  return toolpathToGcode(buildPocketToolpath(params, method), {
    feeds: {
      cut: params.feeds.feedrateXY,
      plunge: params.feeds.plungeRate,
      link: params.pocket.linkingFeed,
      finish: params.pocket.finishFeed,
    },
    interpolation: params.output.interpolation,
  })
}

function generate(method: PocketMethodType) {
  return (params: WizardParams, machine: MachineSettings): string[] =>
    assembleProgram(params, machine, (_cx, _cy, p) => pocketGcode(p, method), [pocketStartPoint(params.pocket)])
}

export const generatePocketSpiral = generate('spiral')
export const generatePocketAdaptive = generate('adaptive')
