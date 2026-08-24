import type { ComponentType } from 'react'
import {
  CircleHolesIcon,
  CustomPointsIcon,
  RectangleCenteredIcon,
  RectangleIcon,
  SingleIcon,
} from '../components/icons'
import { fmt } from '../lib/format'
import type { GeometryParams, PositioningMode } from '../types/wizard'

export interface PositioningMeta {
  value: PositioningMode
  title: string
  description: string
  Icon: ComponentType<{ className?: string }>
}

export const POSITIONING_META: Record<PositioningMode, PositioningMeta> = {
  single: {
    value: 'single',
    title: 'Single (0,0)',
    description: 'One hole at the origin — the simplest pattern.',
    Icon: SingleIcon,
  },
  grid: {
    value: 'grid',
    title: 'Rectangular Grid',
    description: 'Holes at the four corners of a rectangle, origin at one corner.',
    Icon: RectangleIcon,
  },
  gridCentered: {
    value: 'gridCentered',
    title: 'Rectangular Grid (Centered)',
    description: 'Holes at the four corners of a rectangle, origin at the center.',
    Icon: RectangleCenteredIcon,
  },
  circle: {
    value: 'circle',
    title: 'N-Holes on Circle',
    description: 'Holes evenly spaced around a circle centered at the origin.',
    Icon: CircleHolesIcon,
  },
  custom: {
    value: 'custom',
    title: 'Custom List',
    description: 'Any number of holes at arbitrary X,Y coordinates you type in.',
    Icon: CustomPointsIcon,
  },
}

export const POSITIONING_LIST: PositioningMeta[] = [
  POSITIONING_META.single,
  POSITIONING_META.grid,
  POSITIONING_META.gridCentered,
  POSITIONING_META.circle,
  POSITIONING_META.custom,
]

export function positioningIcon(mode: PositioningMode) {
  return POSITIONING_META[mode].Icon
}

// grid/gridCentered collapse to 2 holes when exactly one of gridX/gridY is
// 0 (see resolvePoints() in lib/positioning.ts) — returns the surviving
// distance in that case, so labeling can call it out instead of showing a
// degenerate-looking "0×N" rectangle. Both-zero collapses too (1 hole,
// resolvePoints() handles it) but isn't relabeled here — rare enough that
// falling back to the plain "0×0" text is fine.
function twoHoleDistance(geometry: GeometryParams): number | null {
  const { gridX, gridY } = geometry
  if (gridX === 0 && gridY !== 0) return gridY
  if (gridY === 0 && gridX !== 0) return gridX
  return null
}

// Short lines stacked in the narrow (80px) collapsed-bar badge — broken up
// rather than one long string so each line stays readable at the tiny font
// size the column allows.
export function positioningLines(geometry: GeometryParams): string[] {
  switch (geometry.positioning) {
    case 'single':
      return ['SINGLE', 'HOLE']
    case 'grid': {
      const twoHole = twoHoleDistance(geometry)
      if (twoHole !== null) return ['2 HOLES', `(${fmt(twoHole)}mm apart)`]
      return ['RECTANGLE', `(${fmt(geometry.gridX)}×${fmt(geometry.gridY)})`]
    }
    case 'gridCentered': {
      const twoHole = twoHoleDistance(geometry)
      if (twoHole !== null) return ['2 HOLES', `(${fmt(twoHole)}mm apart)`]
      return ['RECTANGLE', 'CENTERED', `(${fmt(geometry.gridX)}×${fmt(geometry.gridY)})`]
    }
    case 'circle':
      return [`${Math.round(geometry.circleHoleCount)}-HOLES`, 'CIRCLE', `(⌀${fmt(geometry.circleDiameter)})`]
    case 'custom':
      return ['CUSTOM', 'POINTS', `(${geometry.customPoints.length})`]
  }
}

export function positioningSummary(geometry: GeometryParams): string {
  return positioningLines(geometry).join(' ')
}

// Compact single-line label used by presetLabel() — pattern is the primary
// identity of a preset (see CLAUDE.md "Reorganizacja taksonomii"), so this
// is what distinguishes two presets that both use the same method.
export function patternLabel(geometry: GeometryParams): string {
  switch (geometry.positioning) {
    case 'single':
      return 'Single Hole'
    case 'grid': {
      const twoHole = twoHoleDistance(geometry)
      if (twoHole !== null) return `2 Holes (${fmt(twoHole)}mm apart)`
      return `Rectangle ${fmt(geometry.gridX)}×${fmt(geometry.gridY)}`
    }
    case 'gridCentered': {
      const twoHole = twoHoleDistance(geometry)
      if (twoHole !== null) return `2 Holes (${fmt(twoHole)}mm apart)`
      return `Rectangle Centered ${fmt(geometry.gridX)}×${fmt(geometry.gridY)}`
    }
    case 'circle':
      return `${Math.round(geometry.circleHoleCount)}-Holes Circle`
    case 'custom':
      return `Custom (${geometry.customPoints.length})`
  }
}

// Filename-safe slug used by buildFilename() — see CLAUDE.md, output
// filename is now pattern-based instead of method-based.
export function patternSlug(geometry: GeometryParams): string {
  switch (geometry.positioning) {
    case 'single':
      return 'single'
    case 'grid':
      return 'grid'
    case 'gridCentered':
      return 'grid-centered'
    case 'circle':
      return `${Math.round(geometry.circleHoleCount)}holes-circle`
    case 'custom':
      return 'custom'
  }
}
