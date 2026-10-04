import type { ComponentType } from 'react'
import { FacingBottomIcon, FacingLeftIcon, FacingRightIcon, FacingTopIcon, SideMillingIcon } from '../components/icons'
import { fmt } from '../lib/format'
import type { FacingParams, FacingSide } from '../types/wizard'
import type { MethodDisplay } from './operationMeta'

export interface FacingSideMeta {
  value: FacingSide
  title: string
  // Short name for the Step Summary and the filename.
  shortLabel: string
  description: string
  Icon: ComponentType<{ className?: string }>
}

export const FACING_SIDE_META: Record<FacingSide, FacingSideMeta> = {
  bottom: {
    value: 'bottom',
    title: 'Bottom Side',
    shortLabel: 'Bottom',
    description: 'Mills the low-Y side of the part, along X — the material lies toward +Y.',
    Icon: FacingBottomIcon,
  },
  top: {
    value: 'top',
    title: 'Top Side',
    shortLabel: 'Top',
    description: 'Mills the high-Y side of the part, along X — the material lies toward −Y.',
    Icon: FacingTopIcon,
  },
  left: {
    value: 'left',
    title: 'Left Side',
    shortLabel: 'Left',
    description: 'Mills the low-X side of the part, along Y — the material lies toward +X.',
    Icon: FacingLeftIcon,
  },
  right: {
    value: 'right',
    title: 'Right Side',
    shortLabel: 'Right',
    description: 'Mills the high-X side of the part, along Y — the material lies toward −X.',
    Icon: FacingRightIcon,
  },
}

export const FACING_SIDE_LIST: FacingSideMeta[] = [
  FACING_SIDE_META.bottom,
  FACING_SIDE_META.top,
  FACING_SIDE_META.left,
  FACING_SIDE_META.right,
]

// Facing has one way of cutting — no method picker; this is what the Step
// Summary, the Stepdown label and the Feedrate Calculator show for it.
export const FACING_METHOD: MethodDisplay & { value: string } = {
  value: 'sideMilling',
  Icon: SideMillingIcon,
  shortLabel: 'Side',
  title: 'Side Milling',
  stepdown: { fieldLabel: 'Stepdown [mm per level]', shortLabel: 'STEP' },
}

export function facingSideIcon(side: FacingSide) {
  return FACING_SIDE_META[side].Icon
}

// Short lines stacked in the narrow collapsed-bar badge — same convention
// as surfaceMeta.ts's surfaceShapeLines().
export function facingLines(facing: FacingParams): string[] {
  return [FACING_SIDE_META[facing.side].shortLabel.toUpperCase(), 'SIDE', `(${fmt(facing.length)}−${fmt(facing.removal)})`]
}

export function facingSummary(facing: FacingParams): string {
  return `${FACING_SIDE_META[facing.side].title}, ${fmt(facing.length)}mm long, ${fmt(facing.removal)}mm off`
}

// Compact single-line label used by lib/presetLabel.ts.
export function facingLabel(facing: FacingParams): string {
  return `Facing ${FACING_SIDE_META[facing.side].shortLabel} ${fmt(facing.length)}mm −${fmt(facing.removal)}`
}

// Filename-safe slug used by lib/download.ts's buildFilename().
export function facingSlug(facing: FacingParams): string {
  return `facing-${facing.side}`
}
