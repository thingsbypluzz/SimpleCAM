import type { ComponentType } from 'react'
import { CircleOutlineIcon, HelixIcon, RectangleCenteredIcon, RectangleIcon, StandardHoleIcon } from '../components/icons'
import { fmt } from '../lib/format'
import { METHOD_META } from './methodMeta'
import type { OffsetMode, OutlineParams, OutlineShape, OutlineMethod } from '../types/wizard'

export interface OutlineShapeMeta {
  value: OutlineShape
  title: string
  description: string
  Icon: ComponentType<{ className?: string }>
}

export const OUTLINE_SHAPE_META: Record<OutlineShape, OutlineShapeMeta> = {
  rectCornered: {
    value: 'rectCornered',
    title: 'Rectangle Cornered',
    description: 'Rectangle outline, origin at the bottom-left corner.',
    Icon: RectangleIcon,
  },
  rectCentered: {
    value: 'rectCentered',
    title: 'Rectangle Centered',
    description: 'Rectangle outline, origin at the center.',
    Icon: RectangleCenteredIcon,
  },
  circle: {
    value: 'circle',
    title: 'Circle',
    description: 'Circular outline, centered at the origin.',
    Icon: CircleOutlineIcon,
  },
}

export const OUTLINE_SHAPE_LIST: OutlineShapeMeta[] = [
  OUTLINE_SHAPE_META.rectCornered,
  OUTLINE_SHAPE_META.rectCentered,
  OUTLINE_SHAPE_META.circle,
]

export function outlineShapeIcon(shape: OutlineShape) {
  return OUTLINE_SHAPE_META[shape].Icon
}

export function outlineMethodFamily(shape: OutlineShape): 'rect' | 'circle' {
  return shape === 'circle' ? 'circle' : 'rect'
}

export interface OutlineMethodMeta {
  value: OutlineMethod
  title: string
  shortLabel: string
  description: string
  Icon: ComponentType<{ className?: string }>
  stepdown: {
    fieldLabel: string
    shortLabel: string
  }
}

// Circle Outline reuses Hole(s)' Helix/Standard engine wholesale (see
// lib/outlineCircle.ts) — shortLabel/description/Icon/stepdown are pulled
// straight from methodMeta.ts (single source of truth for that text) with
// only the title generalized (Hole(s)' "Standard Hole" doesn't fit a
// circle-outline cut). Rectangle's Ramp is genuinely new; its Standard
// gets its own description too, since methodMeta.ts's ("...a full 360°
// circle...") is circle-specific text that wouldn't fit a rectangle.
export const OUTLINE_METHOD_LIST: Record<'rect' | 'circle', OutlineMethodMeta[]> = {
  rect: [
    {
      value: 'ramp',
      title: 'Ramp',
      shortLabel: 'Ramp',
      description:
        'Continuous descent along the longer edge, one stepdown per lap — mirrors Helix, adapted for a straight-sided shape.',
      Icon: HelixIcon,
      stepdown: { fieldLabel: 'Stepdown [mm per lap]', shortLabel: 'STEP' },
    },
    {
      value: 'standard',
      title: 'Standard',
      shortLabel: 'Standard',
      description:
        'Straight plunge, then a full flat pass around the perimeter at that depth — step down in Z, repeat until the full depth is reached.',
      Icon: StandardHoleIcon,
      stepdown: { fieldLabel: 'Stepdown [mm per pass]', shortLabel: 'STEP' },
    },
  ],
  circle: [
    {
      value: 'helix',
      title: 'Helix',
      shortLabel: METHOD_META.helix.shortLabel,
      description: METHOD_META.helix.description,
      Icon: METHOD_META.helix.Icon,
      stepdown: METHOD_META.helix.stepdown,
    },
    {
      value: 'standard',
      title: 'Standard',
      shortLabel: METHOD_META.standard.shortLabel,
      description: METHOD_META.standard.description,
      Icon: METHOD_META.standard.Icon,
      stepdown: METHOD_META.standard.stepdown,
    },
  ],
}

// The currently-selected method's display meta, regardless of shape family
// — used by App.tsx's collapsed-bar/tooltip rendering, which needs a
// single resolved "active method" the same way METHOD_META[params.method]
// works for Hole(s). Falls back to the family's Standard entry (always
// present, always valid for every shape) if outline.method somehow isn't
// in the current family's list — mirrors generateOutline()'s own
// fallback-to-Standard rule in lib/outline.ts.
export function activeOutlineMethodMeta(outline: OutlineParams): OutlineMethodMeta {
  const list = OUTLINE_METHOD_LIST[outlineMethodFamily(outline.shape)]
  return list.find((m) => m.value === outline.method) ?? list[list.length - 1]
}

export function offsetModeLabel(mode: OffsetMode): string {
  switch (mode) {
    case 'inside':
      return 'Inside'
    case 'outside':
      return 'Outside'
    case 'onLine':
      return 'On-line'
  }
}

// Short lines stacked in the narrow (80px) collapsed-bar badge — same
// convention as positioningMeta.ts's positioningLines().
export function outlineShapeLines(outline: OutlineParams): string[] {
  switch (outline.shape) {
    case 'rectCornered':
      return ['RECTANGLE', `(${fmt(outline.width)}×${fmt(outline.height)})`]
    case 'rectCentered':
      return ['RECTANGLE', 'CENTERED', `(${fmt(outline.width)}×${fmt(outline.height)})`]
    case 'circle':
      return ['CIRCLE', `(⌀${fmt(outline.diameter)})`]
  }
}

export function outlineSummary(outline: OutlineParams): string {
  return outlineShapeLines(outline).join(' ')
}

// Compact single-line label used by lib/presetLabel.ts — same role as
// positioningMeta.ts's patternLabel() for Hole(s), offset mode included
// since Inside vs Outside meaningfully changes the cut for the same
// nominal dimensions.
export function outlineShapeLabel(outline: OutlineParams): string {
  const offset = offsetModeLabel(outline.offsetMode)
  switch (outline.shape) {
    case 'rectCornered':
      return `Rectangle ${fmt(outline.width)}×${fmt(outline.height)} (${offset})`
    case 'rectCentered':
      return `Rectangle Centered ${fmt(outline.width)}×${fmt(outline.height)} (${offset})`
    case 'circle':
      return `Circle ⌀${fmt(outline.diameter)} (${offset})`
  }
}

// Filename-safe slug used by lib/download.ts's buildFilename().
export function outlineShapeSlug(outline: OutlineParams): string {
  switch (outline.shape) {
    case 'rectCornered':
      return 'rectangle'
    case 'rectCentered':
      return 'rectangle-centered'
    case 'circle':
      return 'circle-outline'
  }
}
