import type { ComponentType } from 'react'
import { AdaptiveIcon, HelixIcon } from '../components/icons'
import { generatePocketAdaptive, generatePocketSpiral } from '../lib/pocket'
import type { MachineSettings } from '../types/machine'
import type { PocketMethodType, WizardParams } from '../types/wizard'

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

// Flat registry, like SURFACE_METHOD_META — both methods work for every
// shape. See CLAUDE.md's Pocket design notes.
export const POCKET_METHOD_META: Record<PocketMethodType, PocketMethodMeta> = {
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

export const POCKET_METHOD_LIST: PocketMethodMeta[] = [POCKET_METHOD_META.spiral, POCKET_METHOD_META.adaptive]
