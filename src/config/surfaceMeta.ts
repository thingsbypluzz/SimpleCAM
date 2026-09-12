import type { ComponentType } from 'react'
import { RectangleSurfaceCenteredIcon, RectangleSurfaceIcon } from '../components/icons'
import { fmt } from '../lib/format'
import type { SurfaceParams, SurfaceShape } from '../types/wizard'

export interface SurfaceShapeMeta {
  value: SurfaceShape
  title: string
  description: string
  Icon: ComponentType<{ className?: string }>
}

export const SURFACE_SHAPE_META: Record<SurfaceShape, SurfaceShapeMeta> = {
  rectCornered: {
    value: 'rectCornered',
    title: 'Rectangle Cornered',
    description: 'Rectangular face area, origin at the bottom-left corner.',
    Icon: RectangleSurfaceIcon,
  },
  rectCentered: {
    value: 'rectCentered',
    title: 'Rectangle Centered',
    description: 'Rectangular face area, origin at the center.',
    Icon: RectangleSurfaceCenteredIcon,
  },
}

export const SURFACE_SHAPE_LIST: SurfaceShapeMeta[] = [SURFACE_SHAPE_META.rectCornered, SURFACE_SHAPE_META.rectCentered]

export function surfaceShapeIcon(shape: SurfaceShape) {
  return SURFACE_SHAPE_META[shape].Icon
}

// Short lines stacked in the narrow (80px) collapsed-bar badge — same
// convention as outlineMeta.ts's outlineShapeLines()/positioningMeta.ts's
// positioningLines().
export function surfaceShapeLines(surface: SurfaceParams): string[] {
  return surface.shape === 'rectCentered'
    ? ['SURFACE', 'CENTERED', `(${fmt(surface.width)}×${fmt(surface.height)})`]
    : ['SURFACE', `(${fmt(surface.width)}×${fmt(surface.height)})`]
}

export function surfaceSummary(surface: SurfaceParams): string {
  return surfaceShapeLines(surface).join(' ')
}

// Compact single-line label used by lib/presetLabel.ts — same role as
// outlineMeta.ts's outlineShapeLabel().
export function surfaceShapeLabel(surface: SurfaceParams): string {
  return surface.shape === 'rectCentered'
    ? `Surface Centered ${fmt(surface.width)}×${fmt(surface.height)}`
    : `Surface ${fmt(surface.width)}×${fmt(surface.height)}`
}

// Filename-safe slug used by lib/download.ts's buildFilename().
export function surfaceShapeSlug(surface: SurfaceParams): string {
  return surface.shape === 'rectCentered' ? 'surface-rectangle-centered' : 'surface-rectangle'
}
