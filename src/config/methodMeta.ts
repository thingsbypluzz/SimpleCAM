import type { ComponentType } from 'react'
import { DrillIcon, HelixIcon, StandardHoleIcon } from '../components/icons'
import { generateDrill } from '../lib/drill'
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
      'Spiral ramping — the tool descends in a helical motion on X, Y and Z at once, no steeper than the Ramp Angle and at most one Stepdown per turn. Chip-friendly, easy on the tool.',
    Icon: HelixIcon,
    generate: generateHelix,
    stepdown: {
      fieldLabel: 'Stepdown [max mm per turn]',
      shortLabel: 'STEP',
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
  drill: {
    value: 'drill',
    title: 'Drill',
    shortLabel: 'Drill',
    description:
      'Pecking with a drill bit — straight down at the hole center by Peck Depth, back off, repeat to Depth. The hole is as wide as the drill. Depth is to the drill tip: for a through hole add the tip length (about 0.3 × the diameter for a 118° drill).',
    Icon: DrillIcon,
    generate: generateDrill,
    stepdown: {
      fieldLabel: 'Peck Depth [mm]',
      shortLabel: 'PECK',
    },
  },
}

export const METHOD_LIST: MethodMeta[] = [METHOD_META.helix, METHOD_META.standard, METHOD_META.drill]
