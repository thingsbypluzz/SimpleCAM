import {
  DEFAULT_WIZARD_PARAMS,
  type FacingParams,
  type OutlineShape,
  type PocketMethodType,
  type PocketParams,
  type PocketShape,
  type SurfaceParams,
  type TextLayout,
  type WizardParams,
} from '../types/wizard'
import { surfaceStepoverMm } from './surfaceGeometry'
import { pocketMaxHelixRadius } from './validation'

// BL-103: Simple Mode hides the fields a beginner doesn't need. The rule is
// that a hidden field always holds its default — so what Simple shows fully
// describes the G-code, and a hidden field can never block Generate.
// simplifyParams() applies that rule; App.tsx runs it on every change of
// the wizard's parameters while Simple is on (and when switching to it, and
// on every preset load). A shape or method Simple doesn't offer becomes the
// nearest one it does, keeping the sizes and the position.

const D = DEFAULT_WIZARD_PARAMS

// The shapes, layouts and methods Simple doesn't offer — Step 1 and the
// method picker leave them out; simplifyParams() maps them away.
const HIDDEN_OUTLINE_SHAPES: readonly OutlineShape[] = ['lobedCircle']
const HIDDEN_POCKET_SHAPES: readonly PocketShape[] = ['donut', 'rectLightened', 'circleLightened']
const HIDDEN_POCKET_METHODS: readonly PocketMethodType[] = ['adaptive']
const HIDDEN_TEXT_LAYOUTS: readonly TextLayout[] = ['circle']

export const isOutlineShapeInSimple = (shape: OutlineShape) => !HIDDEN_OUTLINE_SHAPES.includes(shape)
export const isPocketShapeInSimple = (shape: PocketShape) => !HIDDEN_POCKET_SHAPES.includes(shape)
export const isPocketMethodInSimple = (method: PocketMethodType) => !HIDDEN_POCKET_METHODS.includes(method)
export const isTextLayoutInSimple = (layout: TextLayout) => !HIDDEN_TEXT_LAYOUTS.includes(layout)

const floor2 = (v: number) => Math.floor(v * 100 + 1e-9) / 100
const round2 = (v: number) => Math.round(v * 100) / 100

// The defaults that depend on other fields. Also the start values in
// DEFAULT_WIZARD_PARAMS (for the default 3.175 mm tool), so Advanced starts
// from them too — but Advanced doesn't follow a change of the tool.

// A quarter of the tool diameter (an entry hole of 1.5 × D), cut down to
// what validation allows: one stepover on Surface.
export function defaultSurfaceHelixRadius(surface: SurfaceParams): number {
  return floor2(Math.min(surface.toolDiameter / 4, surfaceStepoverMm(surface)))
}

// …and the pocket's smallest wall extent (and the tool radius) on Pocket.
export function defaultPocketHelixRadius(pocket: PocketParams): number {
  return floor2(Math.min(pocket.toolDiameter / 4, pocketMaxHelixRadius(pocket)))
}

// Half the tool diameter beyond each end of the side.
export function defaultFacingLead(facing: FacingParams): number {
  return round2(facing.toolDiameter / 2)
}

function simplifyPocket(pocket: PocketParams, feedrateXY: number): PocketParams {
  let shape = pocket.shape
  if (shape === 'donut' || shape === 'circleLightened') shape = 'circle'
  else if (shape === 'rectLightened') shape = 'rectCentered'
  const next: PocketParams = {
    ...pocket,
    shape,
    method: 'spiral',
    rampLengthFactor: D.pocket.rampLengthFactor,
    zTransitionMode: 'plunge',
    optimalLoadPercent: D.pocket.optimalLoadPercent,
    rampAngleDeg: D.pocket.rampAngleDeg,
    cutDirection: D.pocket.cutDirection,
    linkingFeed: feedrateXY,
    chipThinningBaseFeed: null,
    finishingEnabled: false,
    stockToLeave: D.pocket.stockToLeave,
    finishFeed: D.pocket.finishFeed,
    // Bottom Open (BL-82) belongs to the Lightened shapes Simple hides.
    bottomOpen: D.pocket.bottomOpen,
    contourMethod: D.pocket.contourMethod,
    tabsEnabled: D.pocket.tabsEnabled,
    tabHeight: D.pocket.tabHeight,
    tabWidth: D.pocket.tabWidth,
    tabCount: D.pocket.tabCount,
  }
  return { ...next, helixRadius: defaultPocketHelixRadius(next) }
}

export function simplifyParams(params: WizardParams): WizardParams {
  const { geometry, outline, surface, facing, text, feeds } = params
  const lobed = outline.shape === 'lobedCircle'
  return {
    ...params,
    geometry: { ...geometry, rampAngleDeg: D.geometry.rampAngleDeg },
    outline: {
      ...outline,
      // Lobed Circle → Circle of its main diameter; its Ramp becomes the
      // circle's Helix (both descend along the path).
      ...(lobed ? { shape: 'circle' as const, diameter: outline.lobeMainDiameter, method: outline.method === 'ramp' ? ('helix' as const) : outline.method } : {}),
      rampAngleDeg: D.outline.rampAngleDeg,
    },
    surface: {
      ...surface,
      zTransitionMode: 'plunge',
      rampAngleDeg: D.surface.rampAngleDeg,
      helixRadius: defaultSurfaceHelixRadius(surface),
    },
    pocket: simplifyPocket(params.pocket, feeds.feedrateXY),
    facing: {
      ...facing,
      originAcross: D.facing.originAcross,
      cutDirection: D.facing.cutDirection,
      lead: defaultFacingLead(facing),
      linkingFeed: feeds.feedrateXY,
    },
    text: {
      ...text,
      // On Circle → Straight, centered where the circle's center was.
      ...(text.layout === 'circle' ? { layout: 'straight' as const, originX: 'center' as const, originY: 'middle' as const, angleDeg: 0 } : {}),
      letterSpacingPercent: D.text.letterSpacingPercent,
      lineSpacing: D.text.lineSpacing,
      mirror: false,
      vbitAngleDeg: D.text.vbitAngleDeg,
    },
    feeds: { ...feeds, startZ: D.feeds.startZ },
  }
}

// Whether simplifyParams() would change anything — switching to Simple
// invalidates the generated G-code only then.
export function isSimplified(params: WizardParams): boolean {
  return JSON.stringify(simplifyParams(params)) === JSON.stringify(params)
}
