import type { MaterialSpec } from '../lib/feedCalc'

// BL-68: starting points for the Feedrate Calculator — conservative values
// for a carbide tool, drawn from tool makers' public charts. Real numbers
// depend on the machine, the tool's stick-out and its condition; a test cut
// has the last word. `ap` is Stepdown ×D per engagement (slot / stepover /
// Adaptive), `aeStepover`/`aeAdaptive` are widths in % of D, `finishStock` the
// Pocket Finishing Pass's Stock to Leave in mm (BL-78).
export type MaterialId =
  | 'softwood'
  | 'hardwood'
  | 'mdf'
  | 'plywood'
  | 'pom'
  | 'acrylic'
  | 'hdpe'
  | 'pvc'
  | 'aluminium'
  | 'brass'

export const MATERIALS: Record<MaterialId, MaterialSpec> = {
  softwood: {
    label: 'Softwood (pine, spruce)',
    vc: [300, 600],
    fz: [0.05, 0.15, 0.2],
    plungeFactor: 0.5,
    ap: { slot: 1, stepover: 1, optimalLoad: 2 },
    aeStepover: 45,
    aeAdaptive: 20,
    finishStock: 0.3,
  },
  hardwood: {
    label: 'Hardwood (oak, beech)',
    vc: [250, 500],
    fz: [0.04, 0.12, 0.16],
    plungeFactor: 0.4,
    ap: { slot: 0.5, stepover: 0.75, optimalLoad: 1.5 },
    aeStepover: 40,
    aeAdaptive: 15,
    finishStock: 0.3,
  },
  mdf: {
    label: 'MDF',
    vc: [300, 600],
    fz: [0.05, 0.15, 0.2],
    plungeFactor: 0.5,
    ap: { slot: 1, stepover: 1, optimalLoad: 2 },
    aeStepover: 45,
    aeAdaptive: 20,
    finishStock: 0.3,
    note: 'Very abrasive dust — use extraction; edges fuzz if the chip load is too low.',
  },
  plywood: {
    label: 'Plywood',
    vc: [250, 500],
    fz: [0.04, 0.12, 0.17],
    plungeFactor: 0.4,
    ap: { slot: 0.75, stepover: 0.75, optimalLoad: 1.5 },
    aeStepover: 40,
    aeAdaptive: 15,
    finishStock: 0.3,
  },
  pom: {
    label: 'Delrin / POM',
    vc: [200, 450],
    fz: [0.05, 0.12, 0.15],
    plungeFactor: 0.4,
    ap: { slot: 0.75, stepover: 0.75, optimalLoad: 2 },
    aeStepover: 40,
    aeAdaptive: 15,
    finishStock: 0.25,
    note: 'Too low a chip load rubs instead of cutting and melts the material — keep the feed up. Single-flute (O-flute) tools clear chips best.',
  },
  acrylic: {
    label: 'Acrylic (PMMA)',
    vc: [150, 350],
    fz: [0.04, 0.1, 0.13],
    plungeFactor: 0.3,
    ap: { slot: 0.5, stepover: 0.5, optimalLoad: 1.5 },
    aeStepover: 35,
    aeAdaptive: 10,
    finishStock: 0.2,
    note: 'Melts and re-welds chips when it runs hot, cracks when pushed too hard — single-flute tool, air blast.',
  },
  hdpe: {
    label: 'HDPE',
    vc: [250, 500],
    fz: [0.06, 0.15, 0.2],
    plungeFactor: 0.5,
    ap: { slot: 1, stepover: 1, optimalLoad: 2 },
    aeStepover: 45,
    aeAdaptive: 20,
    finishStock: 0.25,
    note: 'Soft and gummy — keep the chip load high to avoid melting.',
  },
  pvc: {
    label: 'PVC',
    vc: [150, 300],
    fz: [0.04, 0.1, 0.13],
    plungeFactor: 0.4,
    ap: { slot: 0.5, stepover: 0.5, optimalLoad: 1.5 },
    aeStepover: 35,
    aeAdaptive: 12,
    finishStock: 0.25,
    note: 'Releases corrosive fumes when it overheats — keep it cool.',
  },
  aluminium: {
    label: 'Aluminium',
    vc: [150, 300],
    fz: [0.013, 0.03, 0.04],
    plungeFactor: 0.3,
    ap: { slot: 0.2, stepover: 0.3, optimalLoad: 1 },
    aeStepover: 25,
    aeAdaptive: 8,
    finishStock: 0.15,
    note: 'Clear the chips (air or mist) — recut chips weld to the tool. 1–2 flutes.',
  },
  brass: {
    label: 'Brass',
    vc: [100, 200],
    fz: [0.015, 0.03, 0.04],
    plungeFactor: 0.3,
    ap: { slot: 0.25, stepover: 0.3, optimalLoad: 1 },
    aeStepover: 25,
    aeAdaptive: 8,
    finishStock: 0.1,
  },
}

export const MATERIAL_IDS = Object.keys(MATERIALS) as MaterialId[]

export function isMaterialId(value: unknown): value is MaterialId {
  return typeof value === 'string' && value in MATERIALS
}
