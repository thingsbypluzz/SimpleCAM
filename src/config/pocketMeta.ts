import type { ComponentType } from 'react'
import { CircleOutlineIcon, RectangleSurfaceCenteredIcon, RectangleSurfaceIcon } from '../components/icons'
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
    Icon: RectangleSurfaceIcon,
  },
  rectCentered: {
    value: 'rectCentered',
    title: 'Rectangle Centered',
    description: 'Rectangular pocket, origin at the center.',
    Icon: RectangleSurfaceCenteredIcon,
  },
  circle: {
    value: 'circle',
    title: 'Circle',
    description: 'Circular pocket, centered at the origin. Spiral method only.',
    Icon: CircleOutlineIcon,
  },
}

export const POCKET_SHAPE_LIST: PocketShapeMeta[] = [
  POCKET_SHAPE_META.rectCornered,
  POCKET_SHAPE_META.rectCentered,
  POCKET_SHAPE_META.circle,
]

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
  }
}
