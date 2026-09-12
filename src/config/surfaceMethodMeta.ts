import type { ComponentType } from 'react'
import { UnidirectionalIcon, ZigzagIcon } from '../components/icons'
import { generateSurfaceUnidirectional, generateSurfaceZigzag } from '../lib/surface'
import type { MachineSettings } from '../types/machine'
import type { SurfaceMethodType, WizardParams } from '../types/wizard'

export interface SurfaceMethodMeta {
  value: SurfaceMethodType
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

// Flat registry (not a shape-restricted bespoke switch like lib/outline.ts)
// — both methods apply uniformly to Surface's one shape family, so there's
// no impossible shape×method combination to guard against, unlike Outline's
// Ramp/Helix restrictions. See CLAUDE.md's Surface design notes.
export const SURFACE_METHOD_META: Record<SurfaceMethodType, SurfaceMethodMeta> = {
  zigzag: {
    value: 'zigzag',
    title: 'Zigzag',
    shortLabel: 'Zigzag',
    description:
      'Continuous back-and-forth raster, no lift between lines — fastest, one unbroken path per depth level.',
    Icon: ZigzagIcon,
    generate: generateSurfaceZigzag,
    stepdown: { fieldLabel: 'Stepdown [mm per level]', shortLabel: 'STEP' },
  },
  unidirectional: {
    value: 'unidirectional',
    title: 'Unidirectional',
    shortLabel: 'Uni',
    description:
      'Always cuts the same direction — retracts to Safe Z and repositions between lines, for a more uniform finish.',
    Icon: UnidirectionalIcon,
    generate: generateSurfaceUnidirectional,
    stepdown: { fieldLabel: 'Stepdown [mm per level]', shortLabel: 'STEP' },
  },
}

export const SURFACE_METHOD_LIST: SurfaceMethodMeta[] = [SURFACE_METHOD_META.zigzag, SURFACE_METHOD_META.unidirectional]
