import type { ComponentType } from 'react'
import {
  CircleHolesIcon,
  CustomPointsIcon,
  RectangleCenteredIcon,
  RectangleIcon,
  SingleIcon,
} from '../components/icons'
import { fmt } from '../lib/format'
import { gridCounts } from '../lib/positioning'
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
    description:
      'A grid of holes, origin at its bottom-left hole: Columns × Rows, Spacing X and Y apart. 2 × 2 is the four corners of a rectangle. Set a spacing to 0 for a single line of holes.',
    Icon: RectangleIcon,
  },
  gridCentered: {
    value: 'gridCentered',
    title: 'Rectangular Grid (Centered)',
    description:
      'A grid of holes, origin at its center: Columns × Rows, Spacing X and Y apart. 2 × 2 is the four corners of a rectangle. Set a spacing to 0 for a single line of holes.',
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

// How a grid reads in labels: two holes are called just that (the distance
// between them is what matters), 2 × 2 is the rectangle the pattern started
// as, anything else is a grid with its counts and spacing.
type GridLook = { kind: 'twoHoles'; distance: number } | { kind: 'rectangle' } | { kind: 'grid'; columns: number; rows: number }

function gridLook(geometry: GeometryParams): GridLook {
  const { columns, rows } = gridCounts(geometry)
  if (columns * rows === 2) return { kind: 'twoHoles', distance: columns === 2 ? geometry.gridX : geometry.gridY }
  if (columns === 2 && rows === 2) return { kind: 'rectangle' }
  // A spacing of 0 with the other one given keeps the old "0×N" text for
  // the single hole it leaves; a real grid shows its counts.
  if (columns * rows === 1 && geometry.gridCountX === 2 && geometry.gridCountY === 2) return { kind: 'rectangle' }
  return { kind: 'grid', columns, rows }
}

// Short lines stacked in the narrow (80px) collapsed-bar badge — broken up
// rather than one long string so each line stays readable at the tiny font
// size the column allows.
export function positioningLines(geometry: GeometryParams): string[] {
  switch (geometry.positioning) {
    case 'single':
      return ['SINGLE', 'HOLE']
    case 'grid':
    case 'gridCentered': {
      const look = gridLook(geometry)
      const centered = geometry.positioning === 'gridCentered'
      const spacing = `(${fmt(geometry.gridX)}×${fmt(geometry.gridY)})`
      if (look.kind === 'twoHoles') return ['2 HOLES', `(${fmt(look.distance)}mm apart)`]
      if (look.kind === 'rectangle') return centered ? ['RECTANGLE', 'CENTERED', spacing] : ['RECTANGLE', spacing]
      return [`GRID ${look.columns}×${look.rows}`, ...(centered ? ['CENTERED'] : []), spacing]
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
    case 'grid':
    case 'gridCentered': {
      const look = gridLook(geometry)
      const centered = geometry.positioning === 'gridCentered' ? ' Centered' : ''
      const spacing = `${fmt(geometry.gridX)}×${fmt(geometry.gridY)}`
      if (look.kind === 'twoHoles') return `2 Holes (${fmt(look.distance)}mm apart)`
      if (look.kind === 'rectangle') return `Rectangle${centered} ${spacing}`
      return `Grid${centered} ${look.columns}×${look.rows} (${spacing})`
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
