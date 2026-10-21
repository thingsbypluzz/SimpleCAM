import type { ComponentType } from 'react'
import { AdaptiveIcon, HelixIcon, StandardHoleIcon } from '../components/icons'
import { generatePocketAdaptive, generatePocketSpiral } from '../lib/pocket'
import type { MachineSettings } from '../types/machine'
import { isPocketContour } from '../lib/pocketContour'
import type { PocketContourMethod, PocketMethodType, PocketParams, WizardParams } from '../types/wizard'

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

// Lightened shapes with Bottom Open (BL-82): each cell's contour, Ramp or
// Standard like Outline's rectangle. The engine is the Pocket one
// (buildPocketToolpath() dispatches on isPocketContour()), so these only
// carry what the UI shows.
export interface PocketContourMethodMeta {
  value: PocketContourMethod
  title: string
  shortLabel: string
  label: string // Step 2's picker, where Bottom Open already says "contour"
  description: string
  Icon: ComponentType<{ className?: string }>
  stepdown: {
    fieldLabel: string
    shortLabel: string
  }
}

export const POCKET_CONTOUR_METHOD_LIST: PocketContourMethodMeta[] = [
  {
    value: 'ramp',
    title: 'Contour — Ramp',
    shortLabel: 'Contour Ramp',
    label: 'Ramp',
    description:
      "Each cell's contour only, the middle drops out: continuous descent around the contour, no steeper than the Ramp Angle and at most one Stepdown per lap.",
    Icon: HelixIcon,
    stepdown: { fieldLabel: 'Stepdown [max mm per lap]', shortLabel: 'STEP' },
  },
  {
    value: 'standard',
    title: 'Contour — Standard',
    shortLabel: 'Contour Standard',
    label: 'Standard',
    description:
      "Each cell's contour only, the middle drops out: straight plunge, then a full flat lap around the contour at that depth, repeated to full depth.",
    Icon: StandardHoleIcon,
    stepdown: { fieldLabel: 'Stepdown [mm per lap]', shortLabel: 'STEP' },
  },
]

// The method Pocket actually cuts with — Step 2 Summary, the preset label,
// the Feedrate Calculator.
export function activePocketMethodMeta(pocket: PocketParams): PocketMethodMeta | PocketContourMethodMeta {
  if (isPocketContour(pocket)) {
    return POCKET_CONTOUR_METHOD_LIST.find((m) => m.value === pocket.contourMethod) ?? POCKET_CONTOUR_METHOD_LIST[0]
  }
  return POCKET_METHOD_META[pocket.method]
}
