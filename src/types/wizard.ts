export type MethodType = 'helix' | 'standard'

export type PositioningMode = 'single' | 'grid' | 'gridCentered' | 'circle' | 'custom'

export type InterpolationMode = 'arc' | 'linear'

export type OperationType = 'holes' | 'outline' | 'surface' | 'pocket'

export type OutlineShape = 'rectCornered' | 'rectCentered' | 'circle'

export type OffsetMode = 'inside' | 'outside' | 'onLine'

export type SurfaceShape = 'rectCornered' | 'rectCentered'

export type SurfaceMethodType = 'zigzag' | 'unidirectional'

export type RasterDirection = 'x' | 'y'

export type ZTransitionMode = 'plunge' | 'helix'

// 'rectLightened'/'circleLightened' (OP-6): the area is split into cells
// by ribs and each cell is pocketed on its own — see lib/pocketLightened.ts.
export type PocketShape = 'rectCornered' | 'rectCentered' | 'circle' | 'rectLightened' | 'circleLightened'

// Rectangle Lightened rib layout: 'xgrid' = N×M cells, each split by its
// diagonals; 'triangles' = M rows of N zigzag diagonals (M = 1: Warren).
export type LightLayout = 'xgrid' | 'triangles'

// Both valid for every shape — see CLAUDE.md's Pocket design notes.
export type PocketMethodType = 'spiral' | 'adaptive'

// Pocket Adaptive only. Under M3 (spindle CW seen from above), climb = CCW
// for an internal cut (uncut material on the right of travel), conventional
// = CW. Every other Pocket method is fixed to CCW, i.e. climb — so the
// default matches them.
export type CutDirection = 'conventional' | 'climb'

// 'ramp' only valid for rectCornered/rectCentered; 'helix' only for circle;
// 'standard' is valid for every shape, which is why it's the shared default.
export type OutlineMethod = 'ramp' | 'standard' | 'helix'

export interface Point2D {
  x: number
  y: number
}

export interface GeometryParams {
  toolDiameter: number
  holeDiameter: number
  totalDepth: number
  positioning: PositioningMode
  gridX: number
  gridY: number
  circleHoleCount: number
  circleDiameter: number
  circleStartAngle: number
  // BL-48: the Custom List textarea's raw text is the source of truth
  // (validated per line, see lib/customPoints.ts); customPoints is always
  // written alongside it and holds only the lines that parsed.
  customPointsText: string
  customPoints: Point2D[]
  offsetX: number
  offsetY: number
  tabsEnabled: boolean
  tabHeight: number
  tabWidth: number
  tabCount: number
  rampAngleDeg: number // Helix method only — caps the helix pitch below Stepdown (BL-80)
}

export interface OutlineParams {
  shape: OutlineShape
  offsetMode: OffsetMode
  method: OutlineMethod
  toolDiameter: number
  totalDepth: number
  width: number
  height: number
  diameter: number
  offsetX: number
  offsetY: number
  tabsEnabled: boolean
  tabHeight: number
  tabWidth: number
  tabCount: number
  rampAngleDeg: number // Circle Helix / Rectangle Ramp only — caps the pitch per turn/lap below Stepdown (BL-80)
}

export interface SurfaceParams {
  shape: SurfaceShape
  method: SurfaceMethodType
  toolDiameter: number
  totalDepth: number
  width: number
  height: number
  offsetX: number
  offsetY: number
  rasterDirection: RasterDirection
  stepoverPercent: number // 1-100, single source of truth — mm value is derived
  zTransitionMode: ZTransitionMode
  helixRadius: number // only enforced/shown when zTransitionMode === 'helix'
  rampAngleDeg: number // only enforced/shown when zTransitionMode === 'helix' — descent angle of the entry helix
}

export interface PocketParams {
  shape: PocketShape
  method: PocketMethodType
  toolDiameter: number
  totalDepth: number
  width: number
  height: number
  diameter: number
  offsetX: number
  offsetY: number
  stepoverPercent: number // 1-100, single source of truth — mm value is derived
  rampLengthFactor: number // Spiral only (BL-41) — ring-to-ring ramp arc length as a multiple of the ring spacing, 1-10
  zTransitionMode: ZTransitionMode
  helixRadius: number // only enforced/shown when zTransitionMode === 'helix' (always, for Adaptive)
  optimalLoadPercent: number // Adaptive only, 1-30, single source of truth — mm and engagement angle are derived
  rampAngleDeg: number // every Helix entry (always, for Adaptive) — descent angle, independent of stepdown
  cutDirection: CutDirection // Adaptive only
  linkingFeed: number // Adaptive only, mm/min — G1 moves through already-cleared area
  // Adaptive only: the Feed XY value in effect when chip-thinning
  // compensation was last applied (null = never, or Feed XY edited by hand
  // since). Keeps the suggestion from compounding on an already-compensated
  // feed — see chipThinnedFeed().
  chipThinningBaseFeed: number | null
  // Optional finishing wall pass (BL-42, Spiral and Adaptive): roughing
  // stops stockToLeave short of the wall, then one lap per Z level runs on
  // the nominal wall at finishFeed. Walls only — the floor is always cut
  // to full depth.
  finishingEnabled: boolean
  stockToLeave: number // mm, only enforced/shown when finishingEnabled
  finishFeed: number // mm/min, only enforced/shown when finishingEnabled
  // Lightened shapes only (OP-6). Width/Height/Diameter are the area the
  // cells fill (BL-84: like every Pocket shape, the size is what gets
  // cleared — no rim); the ribs and the hub are the material left.
  lightLayout: LightLayout // Rectangle Lightened
  lightCountX: number // N — X-grid: cells along X; Triangles: diagonals per row
  lightCountY: number // M — X-grid: cells along Y; Triangles: rows
  ribWidth: number // mm, width of every rib
  spokeCount: number // Circle Lightened
  hubDiameter: number // mm, Circle Lightened center hub (0 = spokes meet)
  spokeStartAngle: number // deg, first spoke's axis, 0 = +X, CCW
}

export interface FeedsParams {
  stepdown: number
  feedrateXY: number
  plungeRate: number
  safeZ: number
  startZ: number
}

export interface OutputOptions {
  interpolation: InterpolationMode
  spindleStart: boolean
  spindleStopEnd: boolean
  returnOriginEnd: boolean
}

export interface WizardParams {
  operation: OperationType
  method: MethodType
  geometry: GeometryParams
  outline: OutlineParams
  surface: SurfaceParams
  pocket: PocketParams
  feeds: FeedsParams
  output: OutputOptions
}

export const DEFAULT_WIZARD_PARAMS: WizardParams = {
  operation: 'holes',
  method: 'helix',
  geometry: {
    toolDiameter: 3.175,
    holeDiameter: 8,
    totalDepth: 4,
    positioning: 'single',
    gridX: 50,
    gridY: 50,
    circleHoleCount: 5,
    circleDiameter: 45,
    circleStartAngle: 0,
    customPointsText: '10,10',
    customPoints: [{ x: 10, y: 10 }],
    offsetX: 0,
    offsetY: 0,
    tabsEnabled: false,
    tabHeight: 1,
    tabWidth: 3,
    tabCount: 3,
    rampAngleDeg: 2,
  },
  outline: {
    shape: 'rectCornered',
    offsetMode: 'inside',
    method: 'standard',
    toolDiameter: 3.175,
    totalDepth: 4,
    width: 50,
    height: 30,
    diameter: 45,
    offsetX: 0,
    offsetY: 0,
    tabsEnabled: false,
    tabHeight: 1,
    tabWidth: 3,
    tabCount: 3,
    rampAngleDeg: 2,
  },
  surface: {
    shape: 'rectCornered',
    method: 'zigzag',
    toolDiameter: 3.175,
    totalDepth: 4,
    width: 50,
    height: 30,
    offsetX: 0,
    offsetY: 0,
    rasterDirection: 'x',
    stepoverPercent: 40,
    zTransitionMode: 'plunge',
    helixRadius: 1,
    rampAngleDeg: 2,
  },
  pocket: {
    shape: 'rectCornered',
    method: 'spiral',
    toolDiameter: 3.175,
    totalDepth: 4,
    width: 50,
    height: 30,
    diameter: 45,
    offsetX: 0,
    offsetY: 0,
    stepoverPercent: 40,
    rampLengthFactor: 3,
    zTransitionMode: 'plunge',
    helixRadius: 1,
    optimalLoadPercent: 10,
    rampAngleDeg: 2,
    cutDirection: 'climb',
    linkingFeed: 800,
    chipThinningBaseFeed: null,
    finishingEnabled: false,
    stockToLeave: 0.3,
    finishFeed: 800,
    lightLayout: 'triangles',
    lightCountX: 4,
    lightCountY: 1,
    ribWidth: 4,
    spokeCount: 5,
    hubDiameter: 16,
    spokeStartAngle: 90,
  },
  feeds: {
    stepdown: 1,
    feedrateXY: 800,
    plungeRate: 300,
    safeZ: 5,
    startZ: 0,
  },
  output: {
    interpolation: 'linear',
    spindleStart: true,
    spindleStopEnd: true,
    returnOriginEnd: true,
  },
}
