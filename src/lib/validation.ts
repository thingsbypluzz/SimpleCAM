import type { MachineSettings } from '../types/machine'
import type { FacingParams, FeedsParams, GeometryParams, OperationType, OutlineParams, PocketParams, SurfaceParams, WizardParams } from '../types/wizard'
import type { ToolDiameterOption } from '../types/toolDiameters'
import type { Engagement } from './feedCalc'
import { MAX_CIRCLE_HOLE_COUNT, resolvePoints } from './positioning'
import { parseCustomPointsText } from './customPoints'
import { rectToolDimensions } from './outlineRectangleGeometry'
import { circleOutlineOptions, circleOutlineRadiusAndDirection } from './outlineCircle'
import { rectOutlineOptions } from './outlineRectangle'
import { holeCircleOptions } from './helix'
import { surfaceStepoverMm, surfaceToolBounds } from './surfaceGeometry'
import { facingPassEdges, facingToolBounds } from './facingGeometry'
import { effectivePocketZTransitionMode } from './pocketZTransition'
import { buildLevelDescents, entryHelixExceedsTurnLimit, entryHelixTurnCount } from './surfaceZTransition'
import { engagementAngleFor, MAX_OPTIMAL_LOAD_PERCENT, MIN_OPTIMAL_LOAD_PERCENT } from './pocketAdaptiveMath'
import { exceedsPassLimit, MAX_PASSES } from './depthPasses'
import { exceedsLineLimit, rasterExceedsLineLimit } from './surfaceRaster'
import {
  pocketCircleWallRadius,
  pocketRectWallHalfDims,
  pocketRoughCircleWallRadius,
  pocketRoughRectWallHalfDims,
  pocketStepoverMm,
  pocketStockToLeave,
} from './pocketGeometry'
import {
  cellInscribed,
  isLightenedShape,
  lightenedCells,
  lightenedCellsOrNull,
  MAX_LIGHT_COUNT,
  MAX_SPOKES,
  MIN_LIGHT_COUNT,
  MIN_SPOKES,
  type LightCell,
} from './pocketLightened'
import { cellAdaptiveExceedsLimits, planCellAdaptive } from './pocketCellAdaptive'
import { planSectorAdaptive, sectorAdaptiveExceedsLimits } from './pocketSectorAdaptive'
import { adaptiveExceedsLimits } from './pocketAdaptive'

// Strict (BL-49): a tool exactly as wide as the hole leaves a zero-radius
// toolpath — `G2/G3 … I0 J0` arcs, or in G1 mode a vertical plunge at
// Feedrate XY instead of Plunge Rate.
export function isToolDiameterValid(geometry: GeometryParams): boolean {
  return geometry.toolDiameter < geometry.holeDiameter
}

// Purely arbitrary sanity ceiling (BL-19), same category as
// MAX_TAB_COUNT/MAX_CIRCLE_HOLE_COUNT below — a growable Settings list, not
// a value derived from anything physical.
export const MAX_TOOL_DIAMETER_COUNT = 30

// Gates the "Add" button in Settings -> Tool Diameters: rejects non-finite/
// non-positive input and exact duplicates of an already-listed value. The
// list-length cap is checked separately by the caller (it's a property of
// `existing`, not of the candidate `value`).
export function isToolDiameterEntryValid(value: number, existing: ToolDiameterOption[]): boolean {
  return Number.isFinite(value) && value > 0 && !existing.some((opt) => opt.value === value)
}

export function isStepdownValid(feeds: FeedsParams): boolean {
  return feeds.stepdown > 0
}

export function isStartZValid(feeds: FeedsParams): boolean {
  return feeds.startZ <= feeds.safeZ
}

// BL-46: every XY move happens at Safe Z, so at or below the stock top
// (Z0) each rapid between points would drag the tool across the surface.
export function isSafeZValid(feeds: FeedsParams): boolean {
  return feeds.safeZ > 0
}

// BL-46: a cleared field commits 0 (Number('') === 0), which emitted `F0` —
// GRBL error 22 with the spindle already running. Negative is error 4.
export function isFeedrateXYValid(feeds: FeedsParams): boolean {
  return feeds.feedrateXY > 0
}

export function isPlungeRateValid(feeds: FeedsParams): boolean {
  return feeds.plungeRate > 0
}

// BL-46: non-blocking by design — a negative Start Z is a legitimate way
// to resume a partially cut job, but every toolpath's first move then
// rapids from Safe Z straight to Start Z, below Z0 (into material, unless it's already been removed there).
export function isStartZBelowStock(feeds: FeedsParams): boolean {
  return feeds.startZ < 0
}

export function feedsWarnings(feeds: FeedsParams): string[] {
  return isStartZBelowStock(feeds)
    ? [`Start Z is below 0 — the G0 rapid down to Z${feeds.startZ} goes into the stock at rapid speed unless that material is already gone.`]
    : []
}

// The active operation's cut depth — Step 3's checks (pass count, descent
// angle) apply to whichever operation is selected.
export function activeTotalDepth(params: WizardParams): number {
  return OPERATION_RULES[params.operation].totalDepth(params)
}

// Lowest Start Z that still leaves something to cut from above: the cut
// floor, or — with tabs on — the top of the tab band, since the tabbed
// passes step down from there (a Start Z already inside the band made them
// step down from Start Z instead and overshoot the floor, found by the
// BL-62 invariant test). Holes and Outline are the only operations with tabs.
export function minStartZ(params: WizardParams): number {
  const floor = -activeTotalDepth(params)
  const tabs = OPERATION_RULES[params.operation].tabs(params)
  return tabs?.tabsEnabled ? floor + tabs.tabHeight : floor
}

// A negative Start Z is allowed (resuming a partly cut job — see
// feedsWarnings()), but not at or below minStartZ(): the rapid down to Start
// Z would then already be deeper than what's left to cut.
export function isStartZAboveCut(params: WizardParams): boolean {
  return params.feeds.startZ > minStartZ(params)
}

// BL-55: the depth loops stop at MAX_PASSES as a freeze guard; a real job
// needing more than that would silently stop short of the full depth.
// Engines descend from Start Z, so a positive Start Z adds to the distance.
export { MAX_PASSES }
export function isPassCountWithinLimit(params: WizardParams): boolean {
  return !exceedsPassLimit(activeTotalDepth(params) + Math.max(0, params.feeds.startZ), params.feeds.stepdown)
}

// BL-55: raster line / ring / arc sequences stop at the same kind of cap —
// past it, the last gap swallowed the rest of the area (or the wall ring
// was never reached). Blocks Generate instead.
export function isSurfaceLineCountWithinLimit(surface: SurfaceParams): boolean {
  return !rasterExceedsLineLimit(surfaceToolBounds(surface), surface.rasterDirection, surfaceStepoverMm(surface))
}

// A gentle ramp on a tiny helix radius takes many turns per level — past
// MAX_PASSES the entry would stop short of the level's depth.
export function isSurfaceEntryHelixWithinLimit(params: WizardParams): boolean {
  const { surface, feeds } = params
  if (surface.zTransitionMode !== 'helix' || !isSurfaceRampAngleValid(surface)) return true
  return !entryHelixExceedsTurnLimit(feeds.startZ, surface.totalDepth, feeds.stepdown, surface.helixRadius, surface.rampAngleDeg)
}

export function isPocketToolpathWithinLimits(params: WizardParams): boolean {
  const { pocket } = params
  // Adaptive per Lightened cell (BL-83 triangles, BL-85 sectors): the
  // entry helix repeats in every cell (turns capped over all of them, like
  // Spiral), and every cell's rings and remnants must reach their walls.
  if (pocket.method === 'adaptive' && isLightenedShape(pocket.shape)) {
    const cells = lightenedCells(pocket)
    if (
      isPocketRampAngleValid(pocket) &&
      cells.length *
        entryHelixTurnCount(params.feeds.startZ, pocket.totalDepth, params.feeds.stepdown, pocket.helixRadius, pocket.rampAngleDeg) >
        MAX_PASSES
    )
      return false
    const toolRadius = pocket.toolDiameter / 2
    const theta = engagementAngleFor(pocket.optimalLoadPercent)
    if (!(toolRadius > 0) || !(pocket.helixRadius > 0) || !(theta > 0)) return true
    const roughWallDepth = toolRadius + pocketStockToLeave(pocket)
    const opts = { toolRadius, theta, roughWallDepth, helixRadius: pocket.helixRadius }
    return cells.every((cell) =>
      cell.kind === 'sector'
        ? !sectorAdaptiveExceedsLimits(planSectorAdaptive(cell, opts))
        : !cellAdaptiveExceedsLimits(planCellAdaptive(cell, { ...opts, sign: 1 })),
    )
  }
  if (pocket.method === 'adaptive') return !adaptiveExceedsLimits(params)
  if (
    pocket.zTransitionMode === 'helix' &&
    isPocketRampAngleValid(pocket) &&
    entryHelixExceedsTurnLimit(params.feeds.startZ, pocket.totalDepth, params.feeds.stepdown, pocket.helixRadius, pocket.rampAngleDeg)
  )
    return false
  const stepoverMm = pocketStepoverMm(pocket)
  if (isLightenedShape(pocket.shape)) {
    const cells = lightenedCells(pocket)
    const isHelix = pocket.zTransitionMode === 'helix'
    // Every cell repeats the entry helix — cap the turns over all of them.
    if (
      isHelix &&
      isPocketRampAngleValid(pocket) &&
      cells.length *
        entryHelixTurnCount(params.feeds.startZ, pocket.totalDepth, params.feeds.stepdown, pocket.helixRadius, pocket.rampAngleDeg) >
        MAX_PASSES
    )
      return false
    const startRadius = isHelix ? pocket.helixRadius : 0
    return cells.every((cell) => !exceedsLineLimit(startRadius, lightCellRoughReach(pocket, cell), stepoverMm))
  }
  if (pocket.shape === 'circle') {
    const startRadius = pocket.zTransitionMode === 'helix' ? pocket.helixRadius : 0
    return !exceedsLineLimit(startRadius, pocketRoughCircleWallRadius(pocket), stepoverMm)
  }
  const { halfWidth, halfHeight } = pocketRoughRectWallHalfDims(pocket)
  return !exceedsLineLimit(0, Math.max(halfWidth, halfHeight), stepoverMm)
}

// BL-50: a helix or ramp descending steeply at Feedrate XY is close to a
// plunge at cutting feed. Hole(s)/Outline descend at most one Stepdown per
// turn/lap and never steeper than their Ramp Angle (BL-80), Surface/Pocket
// entry helixes at their Ramp Angle — so this only fires for a Ramp Angle
// set above it. Non-blocking by design.
export const MAX_RECOMMENDED_DESCENT_DEG = 10

// The Hole(s)/Outline helix or rectangle ramp of the active method, or null
// (Standard methods, Surface/Pocket). Read from the engines' own options
// builders, so validation, warnings and Step 2's Pitch readout see exactly
// the pitch the toolpath uses.
export interface RampDescent {
  unit: 'turn' | 'lap'
  pathLength: number // one turn/lap
  pitch: number // depth per turn/lap — Stepdown capped by the Ramp Angle
  stepdown: number
  depth: number // from Start Z (when above Z0) to the cut floor
  rampAngleDeg: number
}

export function rampDescent(params: WizardParams): RampDescent | null {
  return OPERATION_RULES[params.operation].rampDescent(params)
}

function descentFromStartZ(params: WizardParams): number {
  return activeTotalDepth(params) + Math.max(0, params.feeds.startZ)
}

function holesRampDescent(params: WizardParams): RampDescent | null {
  if (params.method !== 'helix') return null
  const opts = holeCircleOptions(params)
  return {
    unit: 'turn',
    pathLength: 2 * Math.PI * opts.radius,
    pitch: opts.pitch,
    stepdown: opts.stepdown,
    depth: descentFromStartZ(params),
    rampAngleDeg: params.geometry.rampAngleDeg,
  }
}

function outlineRampDescent(params: WizardParams): RampDescent | null {
  const { outline } = params
  const common = { stepdown: params.feeds.stepdown, depth: descentFromStartZ(params), rampAngleDeg: outline.rampAngleDeg }
  if (outline.shape === 'circle') {
    if (outline.method !== 'helix') return null
    const opts = circleOutlineOptions(params)
    return { unit: 'turn', pathLength: 2 * Math.PI * opts.radius, pitch: opts.pitch, ...common }
  }
  if (outline.method !== 'ramp') return null
  const opts = rectOutlineOptions(params)
  return { unit: 'lap', pathLength: 2 * (opts.toolWidth + opts.toolHeight), pitch: opts.rampPitch, ...common }
}

// Blocks Generate: the Ramp Angle's range is the same as Surface/Pocket's.
export function isRampAngleValid(params: WizardParams): boolean {
  const descent = rampDescent(params)
  return descent === null || isRampAngleInRange(descent.rampAngleDeg)
}

// A gentle Ramp Angle on a tiny helix radius takes many turns — past
// MAX_PASSES the helix would stop short of the floor. Blocks Generate.
export function isRampTurnCountWithinLimit(params: WizardParams): boolean {
  const descent = rampDescent(params)
  if (descent === null || !isRampAngleInRange(descent.rampAngleDeg)) return true
  return !exceedsPassLimit(descent.depth, descent.pitch)
}

function rampDescentAngleDeg(descent: RampDescent | null): number | null {
  if (descent === null) return null
  const pitch = Math.min(descent.pitch, descent.depth)
  if (!(pitch > 0) || !(descent.pathLength > 0)) return null
  return (Math.atan(pitch / descent.pathLength) * 180) / Math.PI
}

// Steepest helix/ramp descent angle of the active operation, in degrees, or
// null when it has no helix/ramp (Standard methods, Plunge entries).
export function descentAngleDeg(params: WizardParams): number | null {
  return OPERATION_RULES[params.operation].descentAngleDeg(params)
}

// BL-80: when the Ramp Angle, not Stepdown, limits the pitch on a short
// path (a bore barely wider than the tool), descending one Stepdown takes
// many turns — slow, and the Standard method is usually the better choice.
// Non-blocking.
export const MAX_RECOMMENDED_TURNS_PER_STEPDOWN = 10

export function rampTurnsPerStepdown(params: WizardParams): number | null {
  const descent = rampDescent(params)
  if (descent === null || !(descent.pitch > 0)) return null
  return Math.min(descent.stepdown, descent.depth) / descent.pitch
}

export function descentWarnings(params: WizardParams): string[] {
  const warnings: string[] = []
  const angle = descentAngleDeg(params)
  if (angle !== null && angle > MAX_RECOMMENDED_DESCENT_DEG) {
    warnings.push(
      `The helix/ramp descends at about ${Math.round(angle)}° (more than ${MAX_RECOMMENDED_DESCENT_DEG}°) while moving at Feedrate XY — close to plunging at cutting feed. A lower Ramp Angle makes it gentler.`,
    )
  }
  const turns = rampTurnsPerStepdown(params)
  const descent = rampDescent(params)
  if (descent !== null && turns !== null && turns > MAX_RECOMMENDED_TURNS_PER_STEPDOWN) {
    warnings.push(
      `At this Ramp Angle the ${descent.unit === 'turn' ? 'helix' : 'ramp'} needs about ${Math.round(turns)} ${descent.unit}s to descend one Stepdown — the path is short. The Standard method is usually faster here.`,
    )
  }
  return warnings
}

// BL-46: sizes and depth must be positive — a zero depth still emitted a
// full "cutting" pass at Start Z, and a zero/negative shape made the
// footprint collapse or flip. Pairs with the (stricter) tool-diameter
// checks below, which already imply some of these for Inside/Pocket cuts.
export function isHolesSizeValid(geometry: GeometryParams): boolean {
  return geometry.holeDiameter > 0 && geometry.totalDepth > 0
}

export function isOutlineSizeValid(outline: OutlineParams): boolean {
  if (!(outline.totalDepth > 0)) return false
  return outline.shape === 'circle' ? outline.diameter > 0 : outline.width > 0 && outline.height > 0
}

export function isSurfaceSizeValid(surface: SurfaceParams): boolean {
  return surface.totalDepth > 0 && surface.width > 0 && surface.height > 0
}

export function isPocketSizeValid(pocket: PocketParams): boolean {
  if (!(pocket.totalDepth > 0)) return false
  return pocket.shape === 'circle' || pocket.shape === 'circleLightened'
    ? pocket.diameter > 0
    : pocket.width > 0 && pocket.height > 0
}

// Lightened shapes (OP-6): the pattern's own ranges — whole counts, a rib
// wider than 0, a hub of at least 0 smaller than the circle.
export function isPocketLightParamsValid(pocket: PocketParams): boolean {
  if (!isLightenedShape(pocket.shape)) return true
  const whole = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max
  if (!(pocket.ribWidth > 0)) return false
  if (pocket.shape === 'circleLightened') {
    return (
      whole(pocket.spokeCount, MIN_SPOKES, MAX_SPOKES) &&
      pocket.hubDiameter >= 0 &&
      pocket.hubDiameter < pocket.diameter
    )
  }
  return (
    whole(pocket.lightCountX, MIN_LIGHT_COUNT, MAX_LIGHT_COUNT) &&
    whole(pocket.lightCountY, MIN_LIGHT_COUNT, MAX_LIGHT_COUNT)
  )
}

// How far a cell's center lies inside its roughing wall (tool radius plus
// Stock to Leave in from the cell's edge) — the room its rings grow into.
export function lightCellRoughReach(pocket: PocketParams, cell: LightCell): number {
  return cellInscribed(cell).radius - pocket.toolDiameter / 2 - pocketStockToLeave(pocket)
}

// Every cell must survive the ribs and still fit the tool (plus Stock to
// Leave) — a cell the tool can't enter would silently stay uncut.
export function isPocketLightCellsValid(pocket: PocketParams): boolean {
  if (!isLightenedShape(pocket.shape) || !isPocketLightParamsValid(pocket)) return true
  const cells = lightenedCellsOrNull(pocket)
  return cells.length > 0 && cells.every((c) => c !== null && lightCellRoughReach(pocket, c) > 1e-9)
}

// MAX_CIRCLE_HOLE_COUNT lives in positioning.ts (the pattern is capped
// there too). Vacuously valid outside 'circle' positioning:
// circleHoleCount only affects the resolved pattern in that mode, and
// blocking Generate over a value the user can't even see (the Circle
// fields are hidden for every other mode) would be confusing rather than
// helpful.
export { MAX_CIRCLE_HOLE_COUNT }

export function isCircleHoleCountValid(geometry: GeometryParams): boolean {
  return geometry.positioning !== 'circle' || geometry.circleHoleCount <= MAX_CIRCLE_HOLE_COUNT
}

// BL-48: every non-blank line must parse, and the list can't be empty (an
// empty list would generate a program with no holes at all). Vacuously
// valid outside 'custom', same reasoning as isCircleHoleCountValid.
export function isCustomPointsValid(geometry: GeometryParams): boolean {
  if (geometry.positioning !== 'custom') return true
  const { points, invalidLines } = parseCustomPointsText(geometry.customPointsText)
  return invalidLines.length === 0 && points.length > 0
}

// Purely arbitrary sanity ceiling (BL-14), same category as
// MAX_CIRCLE_HOLE_COUNT above — a spinner/typing bound, not derived from
// anything physical.
export const MAX_TAB_COUNT = 20

// BL-45: a whole number in 1..MAX_TAB_COUNT. A fractional count made the
// Outline Rectangle generator place a tab past the corner (cutting into the
// kept wall at full depth), and 0 silently meant "no tabs" with Enable Tabs
// still checked. Shared with Settings -> Tabs -> Default Tab Count.
export function isValidTabCount(count: number): boolean {
  return Number.isInteger(count) && count >= 1 && count <= MAX_TAB_COUNT
}

export function isTabCountValid(geometry: GeometryParams): boolean {
  return !geometry.tabsEnabled || isValidTabCount(geometry.tabCount)
}

// BL-14: tabHeight carves out the bottom of the cut, so it must leave
// something above it — 0 or negative is meaningless, and >= totalDepth
// would mean the entire cut is "tab band" (no normal full-circle cutting
// at all). Vacuously valid with tabs off, same pattern as
// isCircleHoleCountValid above.
export function isTabHeightValid(geometry: GeometryParams): boolean {
  return !geometry.tabsEnabled || (geometry.tabHeight > 0 && geometry.tabHeight < geometry.totalDepth)
}

// tabCount * tabWidth is the total arc length tabs would consume around
// the toolpath circle — at or past the full circumference, tabs overlap
// or swallow the whole ring, leaving nothing to cut.
export function isTabWidthValid(geometry: GeometryParams): boolean {
  if (!geometry.tabsEnabled) return true
  const toolPathRadius = Math.max(0, (geometry.holeDiameter - geometry.toolDiameter) / 2)
  const circumference = 2 * Math.PI * toolPathRadius
  return geometry.tabCount * geometry.tabWidth < circumference
}

// Outline validators — same "vacuously valid when not applicable"
// convention as the Hole(s) validators above, reading params.outline
// instead of params.geometry.

function outlineCircleRadius(outline: OutlineParams): number {
  return circleOutlineRadiusAndDirection(outline).radius
}

// Inside cuts remove material up to the tool's own width — a tool as wide
// as (or wider than) the shape leaves nothing behind. Outside/On-line
// never "don't fit" the same way (Outside only ever grows the cut,
// On-line uses nominal dimensions untouched), so they're always valid.
export function isOutlineToolDiameterValid(outline: OutlineParams): boolean {
  if (outline.offsetMode !== 'inside') return true
  // Strict for the same zero-radius reason as isToolDiameterValid (BL-49).
  if (outline.shape === 'circle') return outline.toolDiameter < outline.diameter
  return outline.toolDiameter < Math.min(outline.width, outline.height)
}

// Same rule as isTabHeightValid above, reading outline.* fields.
export function isOutlineTabHeightValid(outline: OutlineParams): boolean {
  return !outline.tabsEnabled || (outline.tabHeight > 0 && outline.tabHeight < outline.totalDepth)
}

// Same rule as isTabCountValid above (per side for Rectangle, total for Circle).
export function isOutlineTabCountValid(outline: OutlineParams): boolean {
  return !outline.tabsEnabled || isValidTabCount(outline.tabCount)
}

// Circle: same formula as isTabWidthValid (tabCount * tabWidth against the
// full circumference — tabCount is total-around-perimeter here, matching
// Hole(s)' semantics). Rectangle: tabCount is per SIDE (not total around
// the perimeter — see CLAUDE.md's Outline design notes), so the check is
// against a single side's length rather than the full perimeter; the
// shortest tool-corrected side is the binding constraint, since the same
// tabCount/tabWidth apply to every side regardless of that side's length.
export function isOutlineTabWidthValid(outline: OutlineParams): boolean {
  if (!outline.tabsEnabled) return true
  if (outline.shape === 'circle') {
    const circumference = 2 * Math.PI * Math.max(0, outlineCircleRadius(outline))
    return outline.tabCount * outline.tabWidth < circumference
  }
  const { toolWidth, toolHeight } = rectToolDimensions(
    outline.width,
    outline.height,
    outline.toolDiameter,
    outline.offsetMode,
  )
  return outline.tabCount * outline.tabWidth < Math.min(toolWidth, toolHeight)
}

// Outline's counterpart to patternSpan()/zSpan() below, for
// machineFitWarnings() — a single shape's own extent instead of a
// multi-point pattern's bounding box. Offset (outline.offsetX/offsetY)
// only translates the shape, so — like patternSpan()'s max-min span — it
// never affects footprint size, only where it sits.
export function outlineFootprint(outline: OutlineParams): { x: number; y: number } {
  if (outline.shape === 'circle') {
    const diameter = 2 * Math.max(0, outlineCircleRadius(outline))
    return { x: diameter, y: diameter }
  }
  const { toolWidth, toolHeight } = rectToolDimensions(
    outline.width,
    outline.height,
    outline.toolDiameter,
    outline.offsetMode,
  )
  return { x: Math.max(0, toolWidth), y: Math.max(0, toolHeight) }
}

export function outlineZSpan(outline: OutlineParams, feeds: FeedsParams): number {
  return feeds.safeZ + outline.totalDepth
}

// Surface validators — same "vacuously valid when not applicable"
// convention as Outline's above. Unlike Hole(s)/Outline, Surface has no
// "tool must physically fit inside the shape" constraint (overtravel always
// grows the tool path outward regardless of tool size), so the only real
// invariant on tool diameter is that it's positive.
export function isSurfaceToolDiameterValid(surface: SurfaceParams): boolean {
  return surface.toolDiameter > 0
}

export function isSurfaceStepoverValid(surface: SurfaceParams): boolean {
  return surface.stepoverPercent >= 1 && surface.stepoverPercent <= 100
}

// Only enforced in Helix mode — a Plunge transition has no radius to bound.
export function isSurfaceHelixRadiusValid(surface: SurfaceParams): boolean {
  if (surface.zTransitionMode !== 'helix') return true
  return surface.helixRadius > 0 && surface.helixRadius <= surfaceStepoverMm(surface)
}

// Surface's counterpart to outlineFootprint()/patternSpan() above — the
// tool-center bounding box (already overtravel-expanded) is exactly the
// area machineFitWarnings() needs to check against machine travel.
export function surfaceFootprint(surface: SurfaceParams): { x: number; y: number } {
  const bounds = surfaceToolBounds(surface)
  return { x: Math.max(0, bounds.maxX - bounds.minX), y: Math.max(0, bounds.maxY - bounds.minY) }
}

export function surfaceZSpan(surface: SurfaceParams, feeds: FeedsParams): number {
  return feeds.safeZ + surface.totalDepth
}

// Facing validators (OP-7). The tool never has to fit anywhere — it works
// from outside the part — so its diameter only has to exist.
export function isFacingToolDiameterValid(facing: FacingParams): boolean {
  return facing.toolDiameter > 0
}

export function isFacingSizeValid(facing: FacingParams): boolean {
  return facing.totalDepth > 0 && facing.length > 0 && facing.removal > 0
}

// One sideways pass can't take more than the tool is wide. A stepover
// above Material to Remove is fine: the single pass is trimmed to it.
export function isFacingStepoverValid(facing: FacingParams): boolean {
  return facing.stepover > 0 && facing.stepover <= facing.toolDiameter
}

export function isFacingLeadValid(facing: FacingParams): boolean {
  return facing.lead >= 0
}

export function isFacingClearanceValid(facing: FacingParams): boolean {
  return facing.clearance > 0
}

export function isFacingLinkingFeedValid(facing: FacingParams): boolean {
  return facing.linkingFeed > 0
}

// Sideways passes × Z levels — past MAX_PASSES either list would stop
// short of the full removal or depth.
export function isFacingPassCountWithinLimit(params: WizardParams): boolean {
  const { facing, feeds } = params
  if (!isFacingStepoverValid(facing) || !(feeds.stepdown > 0)) return true
  if (exceedsPassLimit(facing.removal, facing.stepover)) return false
  const levels = buildLevelDescents(feeds.startZ, facing.totalDepth, feeds.stepdown).length
  return facingPassEdges(facing).length * levels <= MAX_PASSES
}

// Radial engagement of one sideways pass, as % of the tool diameter.
export function facingStepoverPercent(facing: Pick<FacingParams, 'stepover' | 'removal' | 'toolDiameter'>): number {
  if (!(facing.toolDiameter > 0)) return 0
  return (Math.min(facing.stepover, facing.removal) / facing.toolDiameter) * 100
}

export function facingFootprint(facing: FacingParams): { x: number; y: number } {
  const bounds = facingToolBounds(facing)
  return { x: Math.max(0, bounds.maxX - bounds.minX), y: Math.max(0, bounds.maxY - bounds.minY) }
}

// Pocket validators — same "vacuously valid when not applicable"
// convention as Surface's above. Unlike Surface, Pocket DOES have a "tool
// must physically fit inside the shape" constraint (it always cuts
// inside a closed boundary, never overtravels outward) — same formula as
// isOutlineToolDiameterValid's 'inside' branch, since Pocket is inherently
// always an inside cut.
export function isPocketToolDiameterValid(pocket: PocketParams): boolean {
  // Lightened: checked per cell (isPocketLightCellsValid).
  if (isLightenedShape(pocket.shape)) return true
  if (pocket.shape === 'circle') return pocket.toolDiameter < pocket.diameter
  return pocket.toolDiameter < Math.min(pocket.width, pocket.height)
}

// Adaptive derives its own pass spacing from Optimal Load — stepover isn't
// used (or shown) there.
export function isPocketStepoverValid(pocket: PocketParams): boolean {
  if (pocket.method === 'adaptive') return true
  return pocket.stepoverPercent >= 1 && pocket.stepoverPercent <= 100
}

// Spiral's ring-to-ring Ramp Length (BL-41) — Adaptive never uses it.
export const MIN_RAMP_LENGTH_FACTOR = 1
export const MAX_RAMP_LENGTH_FACTOR = 10

export function isPocketRampLengthValid(pocket: PocketParams): boolean {
  if (pocket.method !== 'spiral') return true
  return pocket.rampLengthFactor >= MIN_RAMP_LENGTH_FACTOR && pocket.rampLengthFactor <= MAX_RAMP_LENGTH_FACTOR
}

export function isPocketOptimalLoadValid(pocket: PocketParams): boolean {
  if (pocket.method !== 'adaptive') return true
  return pocket.optimalLoadPercent >= MIN_OPTIMAL_LOAD_PERCENT && pocket.optimalLoadPercent <= MAX_OPTIMAL_LOAD_PERCENT
}

export const MIN_RAMP_ANGLE_DEG = 0.5
export const MAX_RAMP_ANGLE_DEG = 30

const isRampAngleInRange = (deg: number) => deg >= MIN_RAMP_ANGLE_DEG && deg <= MAX_RAMP_ANGLE_DEG

// Every Pocket Helix entry (always, for Adaptive) descends at this angle.
export function isPocketRampAngleValid(pocket: PocketParams): boolean {
  if (effectivePocketZTransitionMode(pocket) !== 'helix') return true
  return isRampAngleInRange(pocket.rampAngleDeg)
}

export function isSurfaceRampAngleValid(surface: SurfaceParams): boolean {
  if (surface.zTransitionMode !== 'helix') return true
  return isRampAngleInRange(surface.rampAngleDeg)
}

// Finishing pass (BL-42) — vacuously valid when off. Stock to Leave must be
// positive (0 would be a second identical lap on the roughed wall), at most
// the tool radius (a finishing lap takes a narrow, even cut, not a slot),
// and leave the roughing a wall of its own to clear to.
export function isPocketStockToLeaveValid(pocket: PocketParams): boolean {
  if (!pocket.finishingEnabled) return true
  if (!(pocket.stockToLeave > 0) || pocket.stockToLeave > pocket.toolDiameter / 2) return false
  // Lightened: the roughing room is checked per cell (isPocketLightCellsValid).
  if (isLightenedShape(pocket.shape)) return true
  if (pocket.shape === 'circle') return pocketRoughCircleWallRadius(pocket) > 0
  const { halfWidth, halfHeight } = pocketRoughRectWallHalfDims(pocket)
  return halfWidth > 0 && halfHeight > 0
}

export function isPocketFinishFeedValid(pocket: PocketParams): boolean {
  if (!pocket.finishingEnabled) return true
  return pocket.finishFeed > 0
}

export function isPocketLinkingFeedValid(pocket: PocketParams): boolean {
  if (pocket.method !== 'adaptive') return true
  return pocket.linkingFeed > 0
}

// Non-blocking hints for Adaptive. A small helix bore means many helix
// turns at a shallow ramp angle and very dense first rings; a stepdown
// below one tool diameter leaves Adaptive's main benefit — deep, light
// passes — unused.
export function isPocketHelixRadiusSmall(pocket: PocketParams): boolean {
  return pocket.method === 'adaptive' && pocket.helixRadius > 0 && pocket.helixRadius < pocket.toolDiameter * 0.25
}

// What the Step 3 hint's Apply button sets Stepdown to — mid-range of the
// 1–2× diameter the hint recommends.
export function suggestedAdaptiveStepdown(pocket: PocketParams): number {
  return Math.round(pocket.toolDiameter * 1.5 * 100) / 100
}

export function isAdaptiveStepdownShallow(pocket: PocketParams, stepdown: number): boolean {
  return pocket.method === 'adaptive' && stepdown > 0 && stepdown < pocket.toolDiameter
}

// The roughing wall's nearest distance from the pocket's own center —
// the hard ceiling for a centered Helix entry (it must land inside the
// first ring, not past the wall — nor into the stock left for the
// finishing pass).
function pocketMinWallExtent(pocket: PocketParams): number {
  // Lightened: the helix sits at every cell's center — the smallest cell wins.
  if (isLightenedShape(pocket.shape)) {
    const reaches = lightenedCells(pocket).map((c) => lightCellRoughReach(pocket, c))
    return reaches.length > 0 ? Math.min(...reaches) : 0
  }
  if (pocket.shape === 'circle') return pocketRoughCircleWallRadius(pocket)
  const { halfWidth, halfHeight } = pocketRoughRectWallHalfDims(pocket)
  return Math.min(halfWidth, halfHeight)
}

// Only enforced in Helix mode — a Plunge transition has no radius to
// bound. Two ceilings, the lower wins: the pocket's own smallest wall
// extent (see pocketMinWallExtent above — Pocket's helix is centered on the
// pocket itself, so it must fit inside the wall, not inside one raster step
// like Surface's isSurfaceHelixRadiusValid), and the tool RADIUS: the helix
// cuts an annulus from r − R to r + R around the center, so any r > R
// leaves an uncut post of radius r − R standing in the middle — Spiral and
// Adaptive only grow outward from r and never come back for it.
export function pocketMaxHelixRadius(pocket: PocketParams): number {
  return Math.min(pocketMinWallExtent(pocket), pocket.toolDiameter / 2)
}

export function isPocketHelixRadiusValid(pocket: PocketParams): boolean {
  if (effectivePocketZTransitionMode(pocket) !== 'helix') return true
  return pocket.helixRadius > 0 && pocket.helixRadius <= pocketMaxHelixRadius(pocket)
}

// Pocket's counterpart to surfaceFootprint()/outlineFootprint() above —
// the tool-center wall (inset, not overtravel-expanded like Surface) is
// exactly the area machineFitWarnings() needs to check against machine
// travel.
export function pocketFootprint(pocket: PocketParams): { x: number; y: number } {
  // Lightened: the outer size of the lightened area.
  if (pocket.shape === 'circleLightened') return { x: pocket.diameter, y: pocket.diameter }
  if (pocket.shape === 'rectLightened') return { x: pocket.width, y: pocket.height }
  if (pocket.shape === 'circle') {
    const diameter = 2 * Math.max(0, pocketCircleWallRadius(pocket))
    return { x: diameter, y: diameter }
  }
  const { halfWidth, halfHeight } = pocketRectWallHalfDims(pocket)
  return { x: 2 * Math.max(0, halfWidth), y: 2 * Math.max(0, halfHeight) }
}

export function pocketZSpan(pocket: PocketParams, feeds: FeedsParams): number {
  return feeds.safeZ + pocket.totalDepth
}

// X/Y extent of the resolved pattern, hole footprint included (radius, not
// just center points) — the same bounding-box math buildScene.ts uses for
// 3D Preview framing, computed fresh in CNC space rather than reusing its
// THREE.Box3 (that one needs the three dependency and lives in Three's
// Y-up, Z-negated coordinate space — not worth adapting for this).
export function patternSpan(geometry: GeometryParams): { x: number; y: number } {
  const points = resolvePoints(geometry)
  if (points.length === 0) return { x: 0, y: 0 }
  const holeRadius = geometry.holeDiameter / 2
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return {
    x: Math.max(...xs) - Math.min(...xs) + 2 * holeRadius,
    y: Math.max(...ys) - Math.min(...ys) + 2 * holeRadius,
  }
}

// Vertical excursion the program actually needs, top to bottom. safeZ is
// always >= startZ (isStartZValid), so safeZ is the effective top
// regardless of startZ.
export function zSpan(geometry: GeometryParams, feeds: FeedsParams): number {
  return feeds.safeZ + geometry.totalDepth
}

// Span-based fit check — independent of where the operator zeroes the
// machine on the table (see CLAUDE.md, BL-9): a pattern whose span on some
// axis exceeds that axis's total travel can never fit, no matter where
// it's clamped, so this is the only thing worth flagging. One message per
// axis that actually fails; empty array once everything fits.
export function machineFitWarnings(params: WizardParams, machine: MachineSettings): string[] {
  const rules = OPERATION_RULES[params.operation]
  const span = rules.footprint(params)
  const warnings: string[] = []
  if (span.x > machine.travelX) {
    warnings.push(
      `X span ${span.x.toFixed(1)}mm exceeds the machine's X travel (${machine.travelX}mm).`,
    )
  }
  if (span.y > machine.travelY) {
    warnings.push(
      `Y span ${span.y.toFixed(1)}mm exceeds the machine's Y travel (${machine.travelY}mm).`,
    )
  }
  const totalZ = rules.zSpan(params)
  if (totalZ > machine.travelZ) {
    warnings.push(
      `Z span ${totalZ.toFixed(1)}mm exceeds the machine's Z travel (${machine.travelZ}mm).`,
    )
  }
  return warnings
}

// Everything that gates Generate (and Edit Mode's live-save) for the active
// operation, in one place — App.tsx and the cross-operation invariant test
// (gcodeInvariants.test.ts) must apply exactly the same rule, since that
// test's promise is "anything that passes validation produces sane G-code".
export function isWizardParamsValid(params: WizardParams): boolean {
  // Step 3 (feeds/Z) validity is shared by every operation.
  const areFeedsValid =
    isStepdownValid(params.feeds) &&
    isStartZValid(params.feeds) &&
    isSafeZValid(params.feeds) &&
    isFeedrateXYValid(params.feeds) &&
    isPlungeRateValid(params.feeds) &&
    isStartZAboveCut(params) &&
    isPassCountWithinLimit(params)
  return areFeedsValid && OPERATION_RULES[params.operation].isValid(params)
}

// Per-operation rules, in one place instead of an `operation === …` chain
// in every function above (BL-61 — such chains caused BL-51). Keyed by
// OperationType, so a new operation doesn't type-check until it fills in
// every entry. UI-side counterparts (labels, icons, generate) live in
// config/operationMeta.ts; this one stays free of React/config imports.
interface OperationRules {
  totalDepth: (params: WizardParams) => number
  // The operation's tab settings, or null for operations without tabs.
  tabs: (params: WizardParams) => { tabsEnabled: boolean; tabHeight: number } | null
  // Everything operation-specific that gates Generate (Step 3's shared
  // checks are added by isWizardParamsValid()).
  isValid: (params: WizardParams) => boolean
  footprint: (params: WizardParams) => { x: number; y: number }
  zSpan: (params: WizardParams) => number
  // The Hole(s)/Outline helix or rectangle ramp (BL-80), or null.
  rampDescent: (params: WizardParams) => RampDescent | null
  descentAngleDeg: (params: WizardParams) => number | null
  // How the tool meets the material with the current method and width —
  // the Feedrate Calculator's model and Step 2's live chip load (BL-68).
  engagement: (params: WizardParams) => Engagement
}

export const OPERATION_RULES: Record<OperationType, OperationRules> = {
  holes: {
    totalDepth: (p) => p.geometry.totalDepth,
    tabs: (p) => p.geometry,
    isValid: (p) =>
      isToolDiameterValid(p.geometry) &&
      isHolesSizeValid(p.geometry) &&
      isCircleHoleCountValid(p.geometry) &&
      isCustomPointsValid(p.geometry) &&
      isTabHeightValid(p.geometry) &&
      isTabWidthValid(p.geometry) &&
      isTabCountValid(p.geometry) &&
      isRampAngleValid(p) &&
      isRampTurnCountWithinLimit(p),
    footprint: (p) => patternSpan(p.geometry),
    zSpan: (p) => zSpan(p.geometry, p.feeds),
    rampDescent: holesRampDescent,
    descentAngleDeg: (p) => rampDescentAngleDeg(holesRampDescent(p)),
    engagement: () => ({ kind: 'slot' }),
  },
  outline: {
    totalDepth: (p) => p.outline.totalDepth,
    tabs: (p) => p.outline,
    isValid: (p) =>
      isOutlineToolDiameterValid(p.outline) &&
      isOutlineSizeValid(p.outline) &&
      isOutlineTabHeightValid(p.outline) &&
      isOutlineTabWidthValid(p.outline) &&
      isOutlineTabCountValid(p.outline) &&
      isRampAngleValid(p) &&
      isRampTurnCountWithinLimit(p),
    footprint: (p) => outlineFootprint(p.outline),
    zSpan: (p) => outlineZSpan(p.outline, p.feeds),
    rampDescent: outlineRampDescent,
    descentAngleDeg: (p) => rampDescentAngleDeg(outlineRampDescent(p)),
    engagement: () => ({ kind: 'slot' }),
  },
  surface: {
    totalDepth: (p) => p.surface.totalDepth,
    tabs: () => null,
    isValid: (p) =>
      isSurfaceToolDiameterValid(p.surface) &&
      isSurfaceSizeValid(p.surface) &&
      isSurfaceStepoverValid(p.surface) &&
      isSurfaceLineCountWithinLimit(p.surface) &&
      isSurfaceHelixRadiusValid(p.surface) &&
      isSurfaceRampAngleValid(p.surface) &&
      isSurfaceEntryHelixWithinLimit(p),
    footprint: (p) => surfaceFootprint(p.surface),
    zSpan: (p) => surfaceZSpan(p.surface, p.feeds),
    rampDescent: () => null,
    descentAngleDeg: (p) => (p.surface.zTransitionMode === 'helix' ? p.surface.rampAngleDeg : null),
    engagement: (p) => ({ kind: 'stepover', percent: p.surface.stepoverPercent }),
  },
  pocket: {
    totalDepth: (p) => p.pocket.totalDepth,
    tabs: () => null,
    isValid: (p) =>
      isPocketToolDiameterValid(p.pocket) &&
      isPocketSizeValid(p.pocket) &&
      isPocketStepoverValid(p.pocket) &&
      isPocketRampLengthValid(p.pocket) &&
      isPocketLightParamsValid(p.pocket) &&
      isPocketLightCellsValid(p.pocket) &&
      isPocketHelixRadiusValid(p.pocket) &&
      isPocketOptimalLoadValid(p.pocket) &&
      isPocketRampAngleValid(p.pocket) &&
      isPocketLinkingFeedValid(p.pocket) &&
      isPocketStockToLeaveValid(p.pocket) &&
      isPocketFinishFeedValid(p.pocket) &&
      isPocketToolpathWithinLimits(p),
    footprint: (p) => pocketFootprint(p.pocket),
    zSpan: (p) => pocketZSpan(p.pocket, p.feeds),
    rampDescent: () => null,
    descentAngleDeg: (p) => (effectivePocketZTransitionMode(p.pocket) === 'helix' ? p.pocket.rampAngleDeg : null),
    engagement: (p) =>
      p.pocket.method === 'adaptive'
        ? { kind: 'optimalLoad', percent: p.pocket.optimalLoadPercent }
        : { kind: 'stepover', percent: p.pocket.stepoverPercent },
  },
  facing: {
    totalDepth: (p) => p.facing.totalDepth,
    tabs: () => null,
    isValid: (p) =>
      isFacingToolDiameterValid(p.facing) &&
      isFacingSizeValid(p.facing) &&
      isFacingStepoverValid(p.facing) &&
      isFacingLeadValid(p.facing) &&
      isFacingClearanceValid(p.facing) &&
      isFacingLinkingFeedValid(p.facing) &&
      isFacingPassCountWithinLimit(p),
    footprint: (p) => facingFootprint(p.facing),
    zSpan: (p) => p.feeds.safeZ + p.facing.totalDepth,
    rampDescent: () => null,
    descentAngleDeg: () => null,
    engagement: (p) => ({ kind: 'stepover', percent: facingStepoverPercent(p.facing) }),
  },
}
