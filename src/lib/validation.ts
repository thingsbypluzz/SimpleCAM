import type { FeedsParams, GeometryParams } from '../types/wizard'

export function isToolDiameterValid(geometry: GeometryParams): boolean {
  return geometry.toolDiameter <= geometry.holeDiameter
}

export function isStepdownValid(feeds: FeedsParams): boolean {
  return feeds.stepdown > 0
}
