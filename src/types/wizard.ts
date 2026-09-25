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

export type PocketShape = 'rectCornered' | 'rectCentered' | 'circle'

// 'raster' only valid for rectCornered/rectCentered (reuses the Surface
// raster engine, which has no circle-clipping math); 'spiral' and
// 'adaptive' are valid for every shape — see CLAUDE.md's Pocket design
// notes.
export type PocketMethodType = 'raster' | 'spiral' | 'adaptive'

// Pocket Adaptive only. Conventional = CCW for an internal cut under M3,
// the convention every other Pocket method is fixed to.
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
  customPoints: Point2D[]
  offsetX: number
  offsetY: number
  tabsEnabled: boolean
  tabHeight: number
  tabWidth: number
  tabCount: number
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
  rasterDirection: RasterDirection // only enforced/shown when method === 'raster'
  zTransitionMode: ZTransitionMode
  helixRadius: number // only enforced/shown when zTransitionMode === 'helix' (always, for Adaptive)
  optimalLoadPercent: number // Adaptive only, 1-30, single source of truth — mm and engagement angle are derived
  rampAngleDeg: number // Adaptive only — helix entry descent angle, independent of stepdown
  cutDirection: CutDirection // Adaptive only
  linkingFeed: number // Adaptive only, mm/min — G1 moves through already-cleared area
  // Adaptive only: the Feed XY value in effect when chip-thinning
  // compensation was last applied (null = never, or Feed XY edited by hand
  // since). Keeps the suggestion from compounding on an already-compensated
  // feed — see chipThinnedFeed().
  chipThinningBaseFeed: number | null
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
  spindleSpeed: number
  dwellSeconds: number
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
    customPoints: [{ x: 10, y: 10 }],
    offsetX: 0,
    offsetY: 0,
    tabsEnabled: false,
    tabHeight: 1,
    tabWidth: 3,
    tabCount: 3,
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
    rasterDirection: 'x',
    zTransitionMode: 'plunge',
    helixRadius: 1,
    optimalLoadPercent: 10,
    rampAngleDeg: 2,
    cutDirection: 'conventional',
    linkingFeed: 800,
    chipThinningBaseFeed: null,
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
    spindleSpeed: 12000,
    dwellSeconds: 3,
    spindleStopEnd: true,
    returnOriginEnd: true,
  },
}
