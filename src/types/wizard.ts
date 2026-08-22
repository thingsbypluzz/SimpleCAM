export type MethodType = 'helix' | 'standard'

export type PositioningMode = 'single' | 'grid' | 'gridCentered' | 'circle' | 'custom'

export type InterpolationMode = 'arc' | 'linear'

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
  method: MethodType
  geometry: GeometryParams
  feeds: FeedsParams
  output: OutputOptions
}

export const DEFAULT_WIZARD_PARAMS: WizardParams = {
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
