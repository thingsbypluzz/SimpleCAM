import type { ComponentType } from 'react'
import { HelixIcon, StandardHoleIcon } from '../components/icons'
import { generateHelix } from '../lib/helix'
import { generateStandardHole } from '../lib/standardHole'
import type { OperationType, WizardParams } from '../types/wizard'

export interface OperationMeta {
  value: OperationType
  title: string
  shortLabel: string
  description: string
  Icon: ComponentType<{ className?: string }>
  generate: (params: WizardParams) => string[]
  stepdown: {
    fieldLabel: string
    shortLabel: string
  }
}

export const OPERATION_META: Record<OperationType, OperationMeta> = {
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

export const OPERATION_LIST: OperationMeta[] = [OPERATION_META.helix, OPERATION_META.standard]
