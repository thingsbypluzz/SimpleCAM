import type { ComponentType } from 'react'
import { AdaptiveIcon, HelixIcon, ZigzagIcon } from '../components/icons'
import { generatePocketAdaptive, generatePocketRaster, generatePocketSpiral } from '../lib/pocket'
import type { MachineSettings } from '../types/machine'
import type { PocketMethodType, PocketShape, WizardParams } from '../types/wizard'

export interface PocketMethodMeta {
  value: PocketMethodType
  title: string
  shortLabel: string
  description: string
  Icon: ComponentType<{ className?: string }>
  generate: (params: WizardParams, machine: MachineSettings) => string[]
  stepdown: {
    fieldLabel: string
    shortLabel: string
  }
}

// Flat registry, like SURFACE_METHOD_META — but unlike Surface, Pocket's
// methods AREN'T both valid for every shape (see pocketMethodAllowed()
// below): Raster reuses Surface's raster engine wholesale, which has no
// circle-clipping math, so it's Rectangle-only. Spiral and Adaptive work
// for every shape. See CLAUDE.md's Pocket design notes.
export const POCKET_METHOD_META: Record<PocketMethodType, PocketMethodMeta> = {
  raster: {
    value: 'raster',
    title: 'Raster',
    shortLabel: 'Raster',
    description: 'Continuous back-and-forth sweep, clipped to the pocket wall — reuses the Surface raster engine.',
    Icon: ZigzagIcon,
    generate: generatePocketRaster,
    stepdown: { fieldLabel: 'Stepdown [mm per level]', shortLabel: 'STEP' },
  },
  spiral: {
    value: 'spiral',
    title: 'Spiral',
    shortLabel: 'Spiral',
    description:
      'Concentric rings growing outward from the center, each a short ramp (spreads radial engagement) plus a full clean lap.',
    Icon: HelixIcon,
    generate: generatePocketSpiral,
    stepdown: { fieldLabel: 'Stepdown [mm per level]', shortLabel: 'STEP' },
  },
  adaptive: {
    value: 'adaptive',
    title: 'Adaptive',
    shortLabel: 'Adaptive',
    description:
      'Constant tool engagement set by Optimal Load — gentle passes that allow much deeper stepdowns. Helix entry, stays down between levels.',
    Icon: AdaptiveIcon,
    generate: generatePocketAdaptive,
    stepdown: { fieldLabel: 'Stepdown [mm per level]', shortLabel: 'STEP' },
  },
}

export const POCKET_METHOD_LIST: PocketMethodMeta[] = [POCKET_METHOD_META.raster, POCKET_METHOD_META.spiral, POCKET_METHOD_META.adaptive]

export function pocketMethodAllowed(shape: PocketShape, method: PocketMethodType): boolean {
  return method !== 'raster' || shape !== 'circle'
}

// Methods available for the given shape — Circle offers Spiral and Adaptive, never Raster.
export function pocketMethodListForShape(shape: PocketShape): PocketMethodMeta[] {
  return POCKET_METHOD_LIST.filter((m) => pocketMethodAllowed(shape, m.value))
}
