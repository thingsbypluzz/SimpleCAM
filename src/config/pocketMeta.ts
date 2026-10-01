import type { ComponentType } from 'react'
import {
  PocketCircleIcon,
  PocketCircleLightenedIcon,
  PocketRectangleCenteredIcon,
  PocketRectangleIcon,
  PocketRectLightenedIcon,
} from '../components/icons'
import { fmt } from '../lib/format'
import type { PocketParams, PocketShape } from '../types/wizard'

export interface PocketShapeMeta {
  value: PocketShape
  title: string
  description: string
  Icon: ComponentType<{ className?: string }>
}

export const POCKET_SHAPE_META: Record<PocketShape, PocketShapeMeta> = {
  rectCornered: {
    value: 'rectCornered',
    title: 'Rectangle Cornered',
    description: 'Rectangular pocket, origin at the bottom-left corner.',
    Icon: PocketRectangleIcon,
  },
  rectCentered: {
    value: 'rectCentered',
    title: 'Rectangle Centered',
    description: 'Rectangular pocket, origin at the center.',
    Icon: PocketRectangleCenteredIcon,
  },
  circle: {
    value: 'circle',
    title: 'Circle',
    description: 'Circular pocket, centered at the origin. Spiral or Adaptive.',
    Icon: PocketCircleIcon,
  },
  rectLightened: {
    value: 'rectLightened',
    title: 'Rectangle Lightened',
    description:
      'Lightening pockets in a rectangle, origin at the center: triangular cells cut out between ribs, filling the Width × Height — an X-grid or a Warren/isogrid of triangles. Spiral or Adaptive.',
    Icon: PocketRectLightenedIcon,
  },
  circleLightened: {
    value: 'circleLightened',
    title: 'Circle Lightened',
    description:
      'Lightening pockets in a circle, centered at the origin: sector cells cut out between spokes and a center hub, filling the Diameter. Spiral or Adaptive.',
    Icon: PocketCircleLightenedIcon,
  },
}

export const POCKET_SHAPE_LIST: PocketShapeMeta[] = [
  POCKET_SHAPE_META.rectCornered,
  POCKET_SHAPE_META.rectCentered,
  POCKET_SHAPE_META.circle,
  POCKET_SHAPE_META.rectLightened,
  POCKET_SHAPE_META.circleLightened,
]

// "Triangles 4×1" / "X-grid 3×2" / "5 spokes" — the Lightened pattern in a
// few characters.
export function lightenedPatternLabel(pocket: PocketParams): string {
  if (pocket.shape === 'circleLightened') return `${fmt(pocket.spokeCount)} spokes`
  return `${pocket.lightLayout === 'xgrid' ? 'X-grid' : 'Triangles'} ${fmt(pocket.lightCountX)}×${fmt(pocket.lightCountY)}`
}

export function pocketShapeIcon(shape: PocketShape) {
  return POCKET_SHAPE_META[shape].Icon
}

// Short lines stacked in the narrow (80px) collapsed-bar badge — same
// convention as surfaceMeta.ts's surfaceShapeLines()/outlineMeta.ts's
// outlineShapeLines().
export function pocketShapeLines(pocket: PocketParams): string[] {
  switch (pocket.shape) {
    case 'rectCornered':
      return ['POCKET', `(${fmt(pocket.width)}×${fmt(pocket.height)})`]
    case 'rectCentered':
      return ['POCKET', 'CENTERED', `(${fmt(pocket.width)}×${fmt(pocket.height)})`]
    case 'circle':
      return ['POCKET', `(⌀${fmt(pocket.diameter)})`]
    case 'rectLightened':
      return ['LIGHTENED', `(${fmt(pocket.width)}×${fmt(pocket.height)})`]
    case 'circleLightened':
      return ['LIGHTENED', `(⌀${fmt(pocket.diameter)})`]
  }
}

export function pocketSummary(pocket: PocketParams): string {
  return pocketShapeLines(pocket).join(' ')
}

// Compact single-line label used by lib/presetLabel.ts — same role as
// surfaceShapeLabel()/outlineShapeLabel().
export function pocketShapeLabel(pocket: PocketParams): string {
  switch (pocket.shape) {
    case 'rectCornered':
      return `Pocket ${fmt(pocket.width)}×${fmt(pocket.height)}`
    case 'rectCentered':
      return `Pocket Centered ${fmt(pocket.width)}×${fmt(pocket.height)}`
    case 'circle':
      return `Pocket ⌀${fmt(pocket.diameter)}`
    case 'rectLightened':
      return `Lightened ${fmt(pocket.width)}×${fmt(pocket.height)} ${lightenedPatternLabel(pocket)}`
    case 'circleLightened':
      return `Lightened ⌀${fmt(pocket.diameter)} ${lightenedPatternLabel(pocket)}`
  }
}

// Filename-safe slug used by lib/download.ts's buildFilename().
export function pocketShapeSlug(pocket: PocketParams): string {
  switch (pocket.shape) {
    case 'rectCornered':
      return 'pocket-rectangle'
    case 'rectCentered':
      return 'pocket-rectangle-centered'
    case 'circle':
      return 'pocket-circle'
    case 'rectLightened':
      return 'pocket-rect-lightened'
    case 'circleLightened':
      return 'pocket-circle-lightened'
  }
}
