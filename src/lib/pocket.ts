import type { MachineSettings } from '../types/machine'
import type { PocketMethodType, Point2D, WizardParams } from '../types/wizard'
import { assembleProgram } from './program'
import { buildLevelDescents } from './surfaceZTransition'
import { computeRasterLines, zigzagWaypoints } from './surfaceRaster'
import { appendPocketZTransition, pocketEntryPoint } from './pocketZTransition'
import { buildAdaptiveToolpath } from './pocketAdaptive'
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
  pocketCircleWallRadius,
  pocketRectRasterBounds,
  pocketRectWallHalfDims,
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
  const radii = pocketCircleRingRadii(startRadius, pocketCircleWallRadius(pocket), pocketStepoverMm(pocket))
  let angle = 0
  for (let i = 1; i < radii.length; i++) {
    angle = appendCircleRing(b, radii[i - 1], radii[i], angle, cx, cy, toZ)
  }
}

function spiralRectLevel(b: ToolpathBuilder, cx: number, cy: number, toZ: number, params: WizardParams): void {
  const { pocket } = params
  const { halfWidth, halfHeight } = pocketRectWallHalfDims(pocket)
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
    fraction = appendRectRing(b, prevDims, dims, fraction, cx, cy, toZ)
    prevDims = dims
  }
}

// The raster boundary is derived entirely from pocket.* (via
// pocketRectRasterBounds); the connecting move to the raster's first
// waypoint starts from wherever the preceding Z-entry left the tool.
function rasterRectLevel(b: ToolpathBuilder, _cx: number, _cy: number, toZ: number, params: WizardParams): void {
  const { pocket } = params
  const lines = computeRasterLines(pocketRectRasterBounds(pocket), pocket.rasterDirection, pocketStepoverMm(pocket))
  for (const p of zigzagWaypoints(lines)) b.lineTo('cut', p.x, p.y, toZ)
}

const LEVEL_CLEAR: Record<Exclude<PocketMethodType, 'adaptive'>, (pocket: WizardParams['pocket']) => LevelClear> = {
  raster: () => rasterRectLevel,
  spiral: (pocket) => (pocket.shape === 'circle' ? spiralCircleLevel : spiralRectLevel),
}

// One move list per Pocket, shared by the G-code below and both previews
// (BL-61). Starts over the Z-entry point at Safe Z (where assembleProgram()
// leaves the tool) and ends at the last cut — the final retract to Safe Z
// is assembleProgram()'s.
//
// Raster/Spiral: one full XY clear per Z level (buildLevelDescents(), reused
// unchanged from Surface) — level 0 rapids down to Start Z; every later
// level retracts to Safe Z, rapids back over the entry point and down to
// Start Z first; then the Plunge/Helix entry (appendPocketZTransition()) and
// the method's level clear. See CLAUDE.md's Pocket design notes.
//
// Adaptive has its own level structure (stays down between levels, helix
// pitch from the ramp angle) inside buildAdaptiveToolpath(), which starts at
// the helix start at Start Z — only the rapid down to it is added here.
export function buildPocketToolpath(params: WizardParams, method = params.pocket.method): Toolpath {
  const { pocket, feeds, output } = params
  const center = pocketCenter(pocket)

  if (method === 'adaptive') {
    const adaptive = buildAdaptiveToolpath(params)
    const b = new ToolpathBuilder({ x: adaptive.start.x, y: adaptive.start.y, z: feeds.safeZ })
    b.zTo('rapid', feeds.startZ)
    return { start: b.start, moves: [...b.moves, ...adaptive.moves] }
  }

  const entry = pocketEntryPoint(center.x, center.y, pocket.zTransitionMode, pocket.helixRadius)
  const levelClear = LEVEL_CLEAR[method](pocket)
  const b = new ToolpathBuilder({ x: entry.x, y: entry.y, z: feeds.safeZ })
  b.zTo('rapid', feeds.startZ)

  buildLevelDescents(feeds.startZ, pocket.totalDepth, feeds.stepdown).forEach(({ toZ }, idx) => {
    if (idx > 0) {
      b.zTo('rapid', feeds.safeZ)
      b.rapidXY(entry.x, entry.y)
      b.zTo('rapid', feeds.startZ)
    }
    appendPocketZTransition(b, {
      fromZ: feeds.startZ,
      toZ,
      mode: pocket.zTransitionMode,
      stepdown: feeds.stepdown,
      feedrateXY: feeds.feedrateXY,
      plungeRate: feeds.plungeRate,
      helixRadius: pocket.helixRadius,
      interpolation: output.interpolation,
      centerX: center.x,
      centerY: center.y,
    })
    levelClear(b, center.x, center.y, toZ, params)
  })

  return b.build()
}

function pocketGcode(params: WizardParams, method: PocketMethodType): string[] {
  return toolpathToGcode(buildPocketToolpath(params, method), {
    feeds: { cut: params.feeds.feedrateXY, plunge: params.feeds.plungeRate, link: params.pocket.linkingFeed },
    interpolation: params.output.interpolation,
  })
}

function generate(method: PocketMethodType) {
  return (params: WizardParams, machine: MachineSettings): string[] =>
    assembleProgram(params, machine, (_cx, _cy, p) => pocketGcode(p, method), [pocketStartPoint(params.pocket)])
}

export const generatePocketSpiral = generate('spiral')
export const generatePocketRaster = generate('raster')
export const generatePocketAdaptive = generate('adaptive')
