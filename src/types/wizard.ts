export type OperationType = 'helix' | 'standard'

export type PositioningMode = 'single' | 'grid' | 'custom'

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
  customPoints: Point2D[]
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
  returnSafeZEnd: boolean
  spindleStopEnd: boolean
  returnOriginEnd: boolean
}

export interface WizardParams {
  operation: OperationType
  geometry: GeometryParams
  feeds: FeedsParams
  output: OutputOptions
}

export const DEFAULT_WIZARD_PARAMS: WizardParams = {
  operation: 'helix',
  geometry: {
    toolDiameter: 3.175,
    holeDiameter: 8,
    totalDepth: 4,
    positioning: 'single',
    gridX: 50,
    gridY: 50,
    customPoints: [{ x: 10, y: 10 }],
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
    returnSafeZEnd: true,
    spindleStopEnd: true,
    returnOriginEnd: true,
  },
}
