import type { ComponentType } from 'react'
import { HelixIcon, StandardHoleIcon } from '../components/icons'
import { generateHelix } from '../lib/helix'
import { generateStandardHole } from '../lib/standardHole'
import type { MachineSettings } from '../types/machine'
import type { MethodType, WizardParams } from '../types/wizard'

export interface MethodMeta {
  value: MethodType
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

export const METHOD_META: Record<MethodType, MethodMeta> = {
  helix: {
    value: 'helix',
    title: 'Helix Hole',
    shortLabel: 'Helix',
    description:
      'Spiral ramping — the tool descends in a helical motion on X, Y and Z at once. Chip-friendly, easy on the tool.',
    Icon: HelixIcon,
    generate: generateHelix,
    stepdown: {
      fieldLabel: 'Stepdown / Pitch [mm per 360° turn]',
      shortLabel: 'PITCH',
    },
  },
  standard: {
    value: 'standard',
    title: 'Standard Hole',
    shortLabel: 'Standard',
    description:
      'Layered pocket — a full 360° circle at a given depth, step down in Z, repeat until the full depth is reached.',
    Icon: StandardHoleIcon,
    generate: generateStandardHole,
    stepdown: {
      fieldLabel: 'Stepdown [mm per pass]',
      shortLabel: 'STEP',
    },
  },
}

export const METHOD_LIST: MethodMeta[] = [METHOD_META.helix, METHOD_META.standard]
