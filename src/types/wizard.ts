export type MethodType = 'helix' | 'standard'

export type PositioningMode = 'single' | 'grid' | 'gridCentered' | 'circle' | 'custom'

export type InterpolationMode = 'arc' | 'linear'

export type OperationType = 'holes' | 'outline' | 'surface' | 'pocket' | 'facing'

// 'lobedCircle' (OP-8): a main circle with N lobe circles on a pitch circle
// merged into one outline — see lib/outlineLobedGeometry.ts.
export type OutlineShape = 'rectCornered' | 'rectCentered' | 'circle' | 'lobedCircle'

export type OffsetMode = 'inside' | 'outside' | 'onLine'

// Lobed Circle (BL-106): the lobe circles are added to the main circle, or
// cut out of it (notches on its rim).
export type LobeMode = 'add' | 'subtract'

export type SurfaceShape = 'rectCornered' | 'rectCentered'

export type SurfaceMethodType = 'zigzag' | 'unidirectional'

export type RasterDirection = 'x' | 'y'

export type ZTransitionMode = 'plunge' | 'helix'

// 'rectLightened'/'circleLightened' (OP-6): the area is split into cells
// by ribs and each cell is pocketed on its own — see lib/pocketLightened.ts.
// 'donut' (BL-108): a circle with an island left standing in its middle —
// the ring between the two diameters is cleared.
export type PocketShape = 'rectCornered' | 'rectCentered' | 'circle' | 'donut' | 'rectLightened' | 'circleLightened'

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

// 'ramp' only valid for rectCornered/rectCentered/lobedCircle; 'helix' only for circle;
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
  rampAngleDeg: number // Circle Helix / Rectangle and Lobed Circle Ramp only — caps the pitch per turn/lap below Stepdown (BL-80)
  // Lobed Circle only (OP-8).
  lobeMainDiameter: number // mm, the main circle
  lobeMode: LobeMode
  lobeCount: number
  lobePitchDiameter: number // mm, the circle the lobe centers sit on
  lobeDiameter: number // mm, each lobe
  lobeStartAngle: number // deg, first lobe, 0 = +X, CCW
  // Circle and Lobed Circle: where the first tab sits, deg, 0 = +X, CCW.
  tabStartAngle: number
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
  islandDiameter: number // mm, Donut only — the island left in the middle
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

// Facing (OP-7): which side of the part is milled. Bottom/Top run along X,
// Left/Right along Y; the material lies on the opposite side of the tool.
export type FacingSide = 'bottom' | 'top' | 'left' | 'right'

// Where the origin sits along the side: its low-coordinate end (left for
// Bottom/Top, bottom for Left/Right), its middle or its other end.
export type FacingOriginAlong = 'start' | 'center' | 'end'

// Where the origin sits across the side: on the edge as it is before the
// cut, or on the edge the cut leaves.
export type FacingOriginAcross = 'raw' | 'finished'

export interface FacingParams {
  side: FacingSide
  toolDiameter: number
  totalDepth: number // also the height of the side drawn in the previews
  length: number // mm, length of the side
  removal: number // mm of material taken off the side
  originAlong: FacingOriginAlong
  originAcross: FacingOriginAcross
  offsetX: number
  offsetY: number
  stepover: number // mm per sideways pass, single source of truth — the % value is derived
  cutDirection: CutDirection
  lead: number // mm the tool starts/ends beyond each end of the side, on top of its radius
  clearance: number // mm the tool backs away from the raw edge for the return move
  linkingFeed: number // mm/min — G1 return move beside the material
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
  facing: FacingParams
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
    lobeMainDiameter: 60,
    lobeMode: 'add',
    lobeCount: 5,
    lobePitchDiameter: 70,
    lobeDiameter: 16,
    lobeStartAngle: 90,
    tabStartAngle: 90,
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
    islandDiameter: 20,
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
  facing: {
    side: 'bottom',
    toolDiameter: 3.175,
    totalDepth: 4,
    length: 50,
    removal: 1,
    originAlong: 'start',
    originAcross: 'raw',
    offsetX: 0,
    offsetY: 0,
    stepover: 0.5,
    cutDirection: 'climb',
    lead: 1,
    clearance: 2,
    linkingFeed: 800,
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
