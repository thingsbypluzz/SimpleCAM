import type { MachineSettings, Rigidity } from '../types/machine'
import { chipThinningFactor } from './pocketAdaptiveMath'

// Feedrate Calculator (BL-68): cutting parameters from a material, a tool
// and the machine's limits. Pure — the modal (FeedCalculatorModal.tsx)
// renders the result and decides what to write back. Every number here is
// a starting point, not a guarantee (see config/materials.ts).

export type ToolMaterial = 'carbide' | 'hss'

// How the tool meets the material, from the active operation and method
// (OPERATION_RULES.engagement): a full-width slot (Hole(s), Outline), a
// stepover (Surface, Pocket Raster/Spiral) or Adaptive's optimal load —
// both widths as % of the tool diameter.
export type EngagementKind = 'slot' | 'stepover' | 'optimalLoad'
export type Engagement = { kind: 'slot' } | { kind: 'stepover' | 'optimalLoad'; percent: number }

export interface MaterialSpec {
  label: string
  // Cutting speed range for carbide [m/min]; the middle is suggested.
  vc: [number, number]
  // Chip load [mm/tooth] for a 3, 6 and 8+ mm tool (interpolated between).
  fz: [number, number, number]
  // Plunge Rate as a fraction of the uncompensated feed.
  plungeFactor: number
  // Stepdown as a multiple of the tool diameter, per engagement.
  ap: Record<EngagementKind, number>
  // Suggested width [% of D]: stepover for stepover operations, optimal
  // load for Adaptive.
  aeStepover: number
  aeAdaptive: number
  note?: string
}

// HSS takes roughly 40% of carbide's cutting speed.
const HSS_VC_FACTOR = 0.4
const RIGIDITY_FACTOR: Record<Rigidity, number> = { light: 0.75, medium: 1, rigid: 1.25 }
const FZ_DIAMETERS = [3, 6, 8] as const
// Adaptive's linking moves run through already-cleared area.
const LINKING_FEED_FACTOR = 2
// Chip thinning only matters below half the diameter — at 50%+ the
// thickest chip already equals fz.
const CHIP_THINNING_LIMIT_PERCENT = 50

export function rigidityFactor(rigidity: Rigidity): number {
  return RIGIDITY_FACTOR[rigidity]
}

// Table chip load for a diameter: proportional below 3 mm, linear between
// the table's 3/6/8 mm points, flat above 8 mm.
export function tableChipLoad(material: MaterialSpec, toolDiameter: number): number {
  const [d0, d1, d2] = FZ_DIAMETERS
  const [f0, f1, f2] = material.fz
  if (toolDiameter <= d0) return (f0 * Math.max(0, toolDiameter)) / d0
  if (toolDiameter <= d1) return f0 + ((f1 - f0) * (toolDiameter - d0)) / (d1 - d0)
  if (toolDiameter <= d2) return f1 + ((f2 - f1) * (toolDiameter - d1)) / (d2 - d1)
  return f2
}

// Chip load the calculator starts from: the table value scaled by the
// machine's rigidity.
export function suggestedChipLoad(material: MaterialSpec, toolDiameter: number, rigidity: Rigidity): number {
  return tableChipLoad(material, toolDiameter) * rigidityFactor(rigidity)
}

export function engagementChipThinning(engagement: Engagement): number {
  if (engagement.kind === 'slot' || engagement.percent >= CHIP_THINNING_LIMIT_PERCENT) return 1
  const factor = chipThinningFactor(engagement.percent)
  return Number.isFinite(factor) ? factor : 1
}

// Actual chip load of the current parameters (Step 2's read-only fz):
// Feed ÷ (RPM × z), and ÷ chip thinning for a narrow cut. null when any
// input can't give a number.
export function effectiveChipLoad(feed: number, rpm: number, flutes: number, engagement: Engagement): number | null {
  if (!(feed > 0) || !(rpm > 0) || !(flutes > 0)) return null
  return feed / (rpm * flutes * engagementChipThinning(engagement))
}

export interface FeedCalcInput {
  material: MaterialSpec
  toolMaterial: ToolMaterial
  toolDiameter: number
  flutes: number
  // null = the table value (scaled by rigidity).
  chipLoad: number | null
  engagementKind: EngagementKind
  // Width in effect for chip thinning [% of D] — ignored for a slot.
  widthPercent: number
  // Settings → Machine's spindle speed, and whether the suggested RPM
  // replaces it (then it may also be lowered to respect Max Feed).
  currentRpm: number
  useSuggestedRpm: boolean
  machine: Pick<MachineSettings, 'spindleMinRpm' | 'spindleMaxRpm' | 'maxFeed' | 'rigidity'>
}

export interface FeedCalcResult {
  vc: number
  idealRpm: number
  // Suggested RPM after the spindle range (before any Max Feed lowering).
  suggestedRpm: number
  rpmClampedToRange: boolean
  // The RPM every feed below is computed for.
  rpm: number
  rpmLoweredForMaxFeed: boolean
  chipLoad: number
  chipThinning: number
  feed: number
  // Feed without chip thinning — Adaptive's chipThinningBaseFeed.
  baseFeed: number
  feedClampedToMax: boolean
  // Chip load actually reached when the feed had to be clamped.
  effectiveChipLoad: number
  plungeRate: number
  stepdown: number
  suggestedWidthPercent: number | null
  linkingFeed: number | null
}

const RPM_STEP = 100
const roundRpm = (rpm: number) => Math.round(rpm / RPM_STEP) * RPM_STEP
const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value))

export function computeFeeds(input: FeedCalcInput): FeedCalcResult {
  const { material, machine, toolDiameter: d, flutes } = input
  const rigidity = rigidityFactor(machine.rigidity)
  const vc = ((material.vc[0] + material.vc[1]) / 2) * (input.toolMaterial === 'hss' ? HSS_VC_FACTOR : 1)
  const idealRpm = d > 0 ? (vc * 1000) / (Math.PI * d) : 0
  const suggestedRpm = clamp(roundRpm(idealRpm), machine.spindleMinRpm, machine.spindleMaxRpm)
  const rpmClampedToRange = suggestedRpm !== roundRpm(idealRpm)

  const chipLoad = input.chipLoad ?? suggestedChipLoad(material, d, machine.rigidity)
  const engagement: Engagement =
    input.engagementKind === 'slot' ? { kind: 'slot' } : { kind: input.engagementKind, percent: input.widthPercent }
  const chipThinning = engagementChipThinning(engagement)
  const feedPerRev = flutes * chipLoad * chipThinning

  // Over Max Feed: a suggested RPM may drop (not below the spindle's
  // minimum) to keep the chip load; whatever is still over is clamped.
  let rpm = input.useSuggestedRpm ? suggestedRpm : input.currentRpm
  let rpmLoweredForMaxFeed = false
  if (input.useSuggestedRpm && rpm * feedPerRev > machine.maxFeed && feedPerRev > 0) {
    const lowered = Math.max(machine.spindleMinRpm, Math.floor(machine.maxFeed / feedPerRev / RPM_STEP) * RPM_STEP)
    rpmLoweredForMaxFeed = lowered < rpm
    rpm = Math.min(rpm, lowered)
  }
  const rawFeed = rpm * feedPerRev
  const feedClampedToMax = rawFeed > machine.maxFeed
  const feed = Math.round(Math.min(rawFeed, machine.maxFeed))
  const effectiveLoad = rpm > 0 && flutes > 0 ? feed / (rpm * flutes * chipThinning) : 0
  const baseFeed = Math.round(feed / chipThinning)

  // Rigidity scales the depth only for wide cuts (slot, stepover), where
  // the tool loads the frame across its whole width. Adaptive's narrow
  // width is what makes a deep pass possible on a light machine — and its
  // chip load is already scaled — so its depth isn't reduced a second time.
  const stepdownRigidity = input.engagementKind === 'optimalLoad' ? 1 : rigidity
  const stepdownRaw = d * material.ap[input.engagementKind] * stepdownRigidity
  const suggestedWidthPercent =
    input.engagementKind === 'stepover'
      ? material.aeStepover
      : input.engagementKind === 'optimalLoad'
        ? material.aeAdaptive
        : null

  return {
    vc,
    idealRpm,
    suggestedRpm,
    rpmClampedToRange,
    rpm,
    rpmLoweredForMaxFeed,
    chipLoad,
    chipThinning,
    feed,
    baseFeed,
    feedClampedToMax,
    effectiveChipLoad: effectiveLoad,
    plungeRate: Math.min(machine.maxFeed, Math.round(baseFeed * material.plungeFactor)),
    stepdown: Math.max(0.05, Math.round(stepdownRaw * 20) / 20),
    suggestedWidthPercent,
    linkingFeed: input.engagementKind === 'optimalLoad' ? Math.min(machine.maxFeed, Math.round(feed * LINKING_FEED_FACTOR)) : null,
  }
}
