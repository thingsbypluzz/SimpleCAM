import type { MachineSettings } from '../types/machine'
import type { PocketMethodType, Point2D, WizardParams } from '../types/wizard'
import { assembleProgram } from './program'
import { buildLevelDescents, helixPitchForRampAngle, levelEntryZ } from './surfaceZTransition'
import { appendPocketZTransition, pocketEntryPoint } from './pocketZTransition'
import { buildAdaptiveToolpath, type LevelContext } from './pocketAdaptive'
import { appendSectorAdaptiveLevel, planDonutAdaptive, planSectorAdaptive } from './pocketSectorAdaptive'
import { appendCellFinish, appendPocketFinish, pocketFinishMoves } from './pocketFinish'
import { cellInscribed, isLightenedShape, lightenedCells, type LightCell } from './pocketLightened'
import { appendCellSpiral } from './pocketCellSpiral'
import { appendCellAdaptiveLevel, planCellAdaptive } from './pocketCellAdaptive'
import { engagementAngleFor } from './pocketAdaptiveMath'
import { computeDepthPasses } from './depthPasses'
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
  pocketStockToLeave,
  pocketRoughCircleWallRadius,
  pocketRoughDonutWalls,
  pocketRoughRectWallHalfDims,
  pocketStepoverMm,
} from './pocketGeometry'
import { fullTurn, toolpathToGcode, ToolpathBuilder, type ArcDirection, type Toolpath } from './toolpath'

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

// Donut (BL-108): rings from the island outward. The first lap runs right
// next to the island — a Helix entry already cut it (its flat turn), a
// Plunge entry cuts it here — then every ring is a Circle ring.
function spiralDonutLevel(b: ToolpathBuilder, cx: number, cy: number, toZ: number, params: WizardParams): void {
  const { pocket } = params
  const { inner, outer } = pocketRoughDonutWalls(pocket)
  if (pocket.zTransitionMode !== 'helix') {
    b.arc('cut', { x: cx, y: cy }, 'ccw', fullTurn, toZ, { from: { x: cx + inner, y: cy }, radius: inner })
  }
  const radii = pocketCircleRingRadii(inner, outer, pocketStepoverMm(pocket))
  let angle = 0
  for (let i = 1; i < radii.length; i++) {
    angle = appendCircleRing(b, radii[i - 1], radii[i], angle, cx, cy, toZ, pocket.rampLengthFactor)
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
  const { pocket, feeds } = params
  const center = pocketCenter(pocket)

  // Donut Adaptive (BL-110): its own entry and level loop.
  if (pocket.shape === 'donut' && method === 'adaptive') {
    const adaptive = buildDonutAdaptiveToolpath(params)
    const last = adaptive.moves.length > 0 ? adaptive.moves[adaptive.moves.length - 1].to : adaptive.start
    return { start: adaptive.start, moves: [...adaptive.moves, ...pocketFinishMoves(last, params)] }
  }

  // Donut Spiral: entered on its first lap instead of the center (the
  // island stands there) — Plunge at the lap's start, Helix down the lap
  // itself.
  if (pocket.shape === 'donut') {
    const entryRadius = pocketRoughDonutWalls(pocket).inner
    const entry = { point: { x: center.x + entryRadius, y: center.y }, helixRadius: entryRadius }
    const b = new ToolpathBuilder({ x: entry.point.x, y: entry.point.y, z: feeds.safeZ })
    b.zTo('rapid', feeds.startZ)
    appendSpiralLevels(b, params, center, (toZ) => spiralDonutLevel(b, center.x, center.y, toZ, params), entry)
    appendPocketFinish(b, params)
    return b.build()
  }

  // Lightened shapes are Spiral-only (OP-6 stage 1), whatever is stored.
  if (isLightenedShape(pocket.shape)) return buildLightenedToolpath(params)

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
  appendSpiralLevels(b, params, center, (toZ) => levelClear(b, center.x, center.y, toZ, params))
  appendPocketFinish(b, params)

  return b.build()
}

// The Spiral level loop around one entry center: level 0 continues from
// Start Z; every later level retracts to Safe Z, rapids back over the entry
// point and down to just above the previous floor (levelEntryZ()); then the
// Plunge/Helix entry and the level's clearing. The tool starts over the
// entry point at Start Z.
function appendSpiralLevels(
  b: ToolpathBuilder,
  params: WizardParams,
  center: Point2D,
  clearLevel: (toZ: number) => void,
  // Donut: where the tool goes down and the radius a Helix entry turns on —
  // by default the pocket's own entry point and Helix Radius.
  entryOverride?: { point: Point2D; helixRadius: number },
): void {
  const { pocket, feeds, output } = params
  const helixRadius = entryOverride?.helixRadius ?? pocket.helixRadius
  const entry = entryOverride?.point ?? pocketEntryPoint(center.x, center.y, pocket.zTransitionMode, pocket.helixRadius)
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
      helixRadius,
      interpolation: output.interpolation,
      centerX: center.x,
      centerY: center.y,
    })
    clearLevel(toZ)
  })
}

// Donut Adaptive (BL-110): the helix goes down in the middle of the ring's
// width, phase A grows it to the circle touching both walls, and that
// circle is then walked all the way around the ring (planDonutAdaptive()).
// Like every Adaptive: no retract between levels, the tool links back to
// the helix start at the previous depth. Starts over the helix start at
// Safe Z.
function buildDonutAdaptiveToolpath(params: WizardParams): Toolpath {
  const { pocket, feeds } = params
  const origin = pocketCenter(pocket)
  const toolRadius = pocket.toolDiameter / 2
  const theta = engagementAngleFor(pocket.optimalLoadPercent)
  const helixRadius = pocket.helixRadius
  const sign: 1 | -1 = pocket.cutDirection === 'climb' ? 1 : -1
  const direction: ArcDirection = sign > 0 ? 'ccw' : 'cw'
  const { inner, outer } = pocketRoughDonutWalls(pocket)
  const usable = toolRadius > 0 && helixRadius > 0 && theta > 0
  const plan = usable ? planDonutAdaptive(origin, { rIn: inner, rOut: outer, toolRadius, theta, helixRadius, sign }) : null
  const center = plan ? plan.center : { x: origin.x + (inner + outer) / 2, y: origin.y }
  const entry = { x: center.x + helixRadius, y: center.y }
  const b = new ToolpathBuilder({ x: entry.x, y: entry.y, z: feeds.safeZ }, true)
  if (!plan) return b.build()
  b.zTo('rapid', feeds.startZ)
  const ctx: LevelContext = { b, cx: center.x, cy: center.y, toolRadius, theta, sign, direction }
  const pitch = helixPitchForRampAngle(helixRadius, pocket.rampAngleDeg)
  let fromZ = feeds.startZ
  for (const { toZ } of buildLevelDescents(feeds.startZ, pocket.totalDepth, feeds.stepdown)) {
    b.lineTo('link', entry.x, entry.y)
    let z = fromZ
    for (const turn of computeDepthPasses(fromZ - toZ, pitch)) {
      z -= turn
      b.arc('cut', center, direction, 2 * Math.PI, z)
    }
    b.arc('cut', center, direction, 2 * Math.PI, toZ)
    appendSectorAdaptiveLevel(ctx, plan)
    fromZ = toZ
  }
  return b.build()
}

// Lightened shapes (OP-6): every cell is a Spiral pocket of its own, cut to
// full depth (all levels, then its finishing laps) before moving on —
// Safe Z, rapid over the next cell's entry point, down to Start Z. Cells in
// lightenedCells()' order (snake / CCW around the circle).
function buildLightenedToolpath(params: WizardParams): Toolpath {
  const { pocket, feeds } = params
  if (pocket.method === 'adaptive') return buildLightenedAdaptiveToolpath(params)
  const cells = lightenedCells(pocket)
  const isHelix = pocket.zTransitionMode === 'helix'
  const roughWallDepth = pocket.toolDiameter / 2 + pocketStockToLeave(pocket)
  const entryOf = (i: number) => {
    const c = cellInscribed(cells[i]).center
    return pocketEntryPoint(c.x, c.y, pocket.zTransitionMode, pocket.helixRadius)
  }
  const first = cells.length > 0 ? entryOf(0) : pocketCenter(pocket)
  const b = new ToolpathBuilder({ x: first.x, y: first.y, z: feeds.safeZ })
  cells.forEach((cell, i) => {
    const center = cellInscribed(cell).center
    if (i > 0) {
      const entry = entryOf(i)
      b.zTo('rapid', feeds.safeZ)
      b.rapidXY(entry.x, entry.y)
    }
    b.zTo('rapid', feeds.startZ)
    appendSpiralLevels(b, params, center, (toZ) =>
      appendCellSpiral(b, cell, {
        roughWallDepth,
        stepover: pocketStepoverMm(pocket),
        startRadius: isHelix ? pocket.helixRadius : 0,
        helixEnd: isHelix ? { x: center.x + pocket.helixRadius, y: center.y } : null,
        z: toZ,
        rampLengthFactor: pocket.rampLengthFactor,
      }),
    )
    appendCellFinish(b, cell, params)
  })
  return b.build()
}

// Adaptive per cell (BL-83 triangles, BL-85 sectors): cell by cell like
// Spiral (retract and rapid between cells), and inside a cell Adaptive's
// own level loop — stay down between levels, link back to the helix start,
// helix at the Ramp Angle around the inscribed center, a flat turn, then
// phase A rings and the remnants (pocketCellAdaptive.ts for triangles,
// pocketSectorAdaptive.ts for sectors); the cell's finishing laps last.
function buildLightenedAdaptiveToolpath(params: WizardParams): Toolpath {
  const { pocket, feeds } = params
  const toolRadius = pocket.toolDiameter / 2
  const theta = engagementAngleFor(pocket.optimalLoadPercent)
  const helixRadius = pocket.helixRadius
  const sign: 1 | -1 = pocket.cutDirection === 'climb' ? 1 : -1
  const direction: ArcDirection = sign > 0 ? 'ccw' : 'cw'
  const roughWallDepth = toolRadius + pocketStockToLeave(pocket)
  const usable = toolRadius > 0 && helixRadius > 0 && theta > 0
  const cells = usable
    ? lightenedCells(pocket).flatMap((cell): { cell: LightCell; center: Point2D; level: (ctx: LevelContext) => void }[] => {
        if (cell.kind === 'sector') {
          const plan = planSectorAdaptive(cell, { toolRadius, theta, roughWallDepth, helixRadius })
          return plan ? [{ cell, center: plan.center, level: (ctx: LevelContext) => appendSectorAdaptiveLevel(ctx, plan) }] : []
        }
        const plan = planCellAdaptive(cell, { toolRadius, theta, roughWallDepth, helixRadius, sign })
        return plan ? [{ cell, center: plan.center, level: (ctx: LevelContext) => appendCellAdaptiveLevel(ctx, plan) }] : []
      })
    : []
  const entryOf = (center: Point2D) => ({ x: center.x + helixRadius, y: center.y })
  const first = cells.length > 0 ? entryOf(cells[0].center) : pocketCenter(pocket)
  const b = new ToolpathBuilder({ x: first.x, y: first.y, z: feeds.safeZ }, true)
  const pitch = helixPitchForRampAngle(helixRadius, pocket.rampAngleDeg)
  cells.forEach(({ cell, center, level }, i) => {
    const entry = entryOf(center)
    if (i > 0) {
      b.zTo('rapid', feeds.safeZ)
      b.rapidXY(entry.x, entry.y)
    }
    b.zTo('rapid', feeds.startZ)
    const ctx: LevelContext = { b, cx: center.x, cy: center.y, toolRadius, theta, sign, direction }
    let fromZ = feeds.startZ
    for (const { toZ } of buildLevelDescents(feeds.startZ, pocket.totalDepth, feeds.stepdown)) {
      b.lineTo('link', entry.x, entry.y)
      let z = fromZ
      for (const turn of computeDepthPasses(fromZ - toZ, pitch)) {
        z -= turn
        b.arc('cut', center, direction, 2 * Math.PI, z)
      }
      b.arc('cut', center, direction, 2 * Math.PI, toZ)
      level(ctx)
      fromZ = toZ
    }
    appendCellFinish(b, cell, params)
  })
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
