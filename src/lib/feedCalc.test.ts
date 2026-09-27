import { describe, expect, it } from 'vitest'
import { MATERIALS } from '../config/materials'
import { nearestDialPosition, ROUTERS } from '../config/routers'
import { DEFAULT_MACHINE_SETTINGS } from '../types/machine'
import { DEFAULT_WIZARD_PARAMS } from '../types/wizard'
import { chipThinningFactor } from './pocketAdaptiveMath'
import { OPERATION_RULES } from './validation'
import {
  computeFeeds,
  effectiveChipLoad,
  engagementChipThinning,
  suggestedChipLoad,
  tableChipLoad,
  type FeedCalcInput,
} from './feedCalc'

const machine = { spindleMinRpm: 0, spindleMaxRpm: 60000, maxFeed: 50000, rigidity: 'medium' as const }

const input = (patch: Partial<FeedCalcInput> = {}): FeedCalcInput => ({
  material: MATERIALS.mdf,
  toolMaterial: 'carbide',
  toolDiameter: 6,
  flutes: 2,
  chipLoad: null,
  engagementKind: 'slot',
  widthPercent: 100,
  currentRpm: 18000,
  useSuggestedRpm: true,
  machine,
  ...patch,
})

describe('tableChipLoad', () => {
  it('hits the table points and interpolates between them', () => {
    expect(tableChipLoad(MATERIALS.mdf, 3)).toBeCloseTo(0.05)
    expect(tableChipLoad(MATERIALS.mdf, 6)).toBeCloseTo(0.15)
    expect(tableChipLoad(MATERIALS.mdf, 8)).toBeCloseTo(0.2)
    expect(tableChipLoad(MATERIALS.mdf, 4.5)).toBeCloseTo(0.1)
    expect(tableChipLoad(MATERIALS.mdf, 7)).toBeCloseTo(0.175)
  })

  it('is proportional below 3 mm and flat above 8 mm', () => {
    expect(tableChipLoad(MATERIALS.mdf, 1.5)).toBeCloseTo(0.025)
    expect(tableChipLoad(MATERIALS.mdf, 12)).toBeCloseTo(0.2)
  })

  it('scales with rigidity', () => {
    expect(suggestedChipLoad(MATERIALS.mdf, 6, 'light')).toBeCloseTo(0.1125)
    expect(suggestedChipLoad(MATERIALS.mdf, 6, 'rigid')).toBeCloseTo(0.1875)
  })
})

describe('engagementChipThinning', () => {
  it('is 1 for a slot and for widths of half the diameter or more', () => {
    expect(engagementChipThinning({ kind: 'slot' })).toBe(1)
    expect(engagementChipThinning({ kind: 'stepover', percent: 50 })).toBe(1)
    expect(engagementChipThinning({ kind: 'stepover', percent: 80 })).toBe(1)
  })

  it('matches the Adaptive chip-thinning factor below half the diameter', () => {
    expect(engagementChipThinning({ kind: 'optimalLoad', percent: 10 })).toBeCloseTo(chipThinningFactor(10))
    expect(engagementChipThinning({ kind: 'stepover', percent: 25 })).toBeCloseTo(chipThinningFactor(25))
  })
})

describe('effectiveChipLoad', () => {
  it('inverts feed = RPM × z × fz × chip thinning', () => {
    expect(effectiveChipLoad(3600, 18000, 2, { kind: 'slot' })).toBeCloseTo(0.1)
    const f = chipThinningFactor(10)
    expect(effectiveChipLoad(3600 * f, 18000, 2, { kind: 'optimalLoad', percent: 10 })).toBeCloseTo(0.1)
  })

  it('is null when a number cannot be formed', () => {
    expect(effectiveChipLoad(1000, 0, 2, { kind: 'slot' })).toBeNull()
    expect(effectiveChipLoad(1000, 18000, 0, { kind: 'slot' })).toBeNull()
  })
})

describe('computeFeeds', () => {
  it('suggests RPM from the middle of the cutting speed range', () => {
    const r = computeFeeds(input())
    // MDF 450 m/min on a 6 mm tool: 450000 / (π·6) ≈ 23873 → 23900.
    expect(r.suggestedRpm).toBe(23900)
    expect(r.rpmClampedToRange).toBe(false)
    expect(r.feed).toBe(Math.round(23900 * 2 * 0.15))
  })

  it('takes 40% of the cutting speed for HSS', () => {
    const r = computeFeeds(input({ toolMaterial: 'hss' }))
    expect(r.vc).toBeCloseTo(180)
  })

  it('clamps the suggested RPM to the spindle range and keeps the chip load', () => {
    const r = computeFeeds(input({ machine: { ...machine, spindleMinRpm: 10000, spindleMaxRpm: 20000 } }))
    expect(r.suggestedRpm).toBe(20000)
    expect(r.rpmClampedToRange).toBe(true)
    expect(r.feed).toBe(20000 * 2 * 0.15)
  })

  it('uses the current RPM when the suggestion is not taken', () => {
    const r = computeFeeds(input({ useSuggestedRpm: false, currentRpm: 12000 }))
    expect(r.rpm).toBe(12000)
    expect(r.feed).toBe(3600)
  })

  it('lowers the RPM to stay under Max Feed before clamping the feed', () => {
    const r = computeFeeds(input({ machine: { ...machine, maxFeed: 4000 } }))
    expect(r.rpmLoweredForMaxFeed).toBe(true)
    expect(r.rpm).toBe(13300)
    expect(r.feedClampedToMax).toBe(false)
    expect(r.feed).toBeLessThanOrEqual(4000)
    expect(r.effectiveChipLoad).toBeCloseTo(0.15)
  })

  it('clamps the feed and reports the lower chip load when the RPM cannot drop further', () => {
    const r = computeFeeds(input({ machine: { ...machine, maxFeed: 2000, spindleMinRpm: 10000 } }))
    expect(r.rpm).toBe(10000)
    expect(r.feedClampedToMax).toBe(true)
    expect(r.feed).toBe(2000)
    expect(r.effectiveChipLoad).toBeCloseTo(0.1)
  })

  it('clamps without touching the RPM when the current RPM is kept', () => {
    const r = computeFeeds(input({ useSuggestedRpm: false, currentRpm: 18000, machine: { ...machine, maxFeed: 3000 } }))
    expect(r.rpm).toBe(18000)
    expect(r.rpmLoweredForMaxFeed).toBe(false)
    expect(r.feed).toBe(3000)
  })

  it('compensates chip thinning for Adaptive and reports the base feed', () => {
    const r = computeFeeds(input({ engagementKind: 'optimalLoad', widthPercent: 10, useSuggestedRpm: false }))
    const f = chipThinningFactor(10)
    expect(r.chipThinning).toBeCloseTo(f)
    expect(r.feed).toBe(Math.round(18000 * 2 * 0.15 * f))
    expect(r.baseFeed).toBe(Math.round(r.feed / f))
    expect(r.suggestedWidthPercent).toBe(MATERIALS.mdf.aeAdaptive)
    expect(r.linkingFeed).toBe(Math.min(machine.maxFeed, r.feed * 2))
  })

  it('bases Plunge Rate on the uncompensated feed', () => {
    const r = computeFeeds(input({ engagementKind: 'optimalLoad', widthPercent: 10, useSuggestedRpm: false }))
    expect(r.plungeRate).toBe(Math.round(r.baseFeed * MATERIALS.mdf.plungeFactor))
  })

  it('picks Stepdown per engagement, scaled by rigidity except for Adaptive, on a 0.05 mm grid', () => {
    expect(computeFeeds(input({ material: MATERIALS.aluminium })).stepdown).toBe(1.2)
    expect(computeFeeds(input({ material: MATERIALS.aluminium, engagementKind: 'optimalLoad', widthPercent: 8 })).stepdown).toBe(6)
    const light = computeFeeds(input({ material: MATERIALS.aluminium, machine: { ...machine, rigidity: 'light' } }))
    expect(light.stepdown).toBe(0.9)
    // Adaptive's depth ignores rigidity — its narrow width is what allows it.
    const lightAdaptive = computeFeeds(
      input({ material: MATERIALS.aluminium, engagementKind: 'optimalLoad', widthPercent: 8, machine: { ...machine, rigidity: 'light' } }),
    )
    expect(lightAdaptive.stepdown).toBe(6)
  })

  it('suggests no width and no linking feed for a slot', () => {
    const r = computeFeeds(input())
    expect(r.suggestedWidthPercent).toBeNull()
    expect(r.linkingFeed).toBeNull()
  })

  it('uses an overridden chip load as given', () => {
    const r = computeFeeds(input({ chipLoad: 0.05, useSuggestedRpm: false }))
    expect(r.feed).toBe(1800)
  })
})

describe('OPERATION_RULES.engagement', () => {
  it('is a slot for Hole(s) and Outline, a stepover for Surface/Pocket and an optimal load for Adaptive', () => {
    const p = DEFAULT_WIZARD_PARAMS
    expect(OPERATION_RULES.holes.engagement(p)).toEqual({ kind: 'slot' })
    expect(OPERATION_RULES.outline.engagement(p)).toEqual({ kind: 'slot' })
    expect(OPERATION_RULES.surface.engagement(p)).toEqual({ kind: 'stepover', percent: p.surface.stepoverPercent })
    expect(OPERATION_RULES.pocket.engagement({ ...p, pocket: { ...p.pocket, method: 'spiral' } })).toEqual({
      kind: 'stepover',
      percent: p.pocket.stepoverPercent,
    })
    expect(OPERATION_RULES.pocket.engagement({ ...p, pocket: { ...p.pocket, method: 'adaptive' } })).toEqual({
      kind: 'optimalLoad',
      percent: p.pocket.optimalLoadPercent,
    })
  })
})

describe('DEFAULT_MACHINE_SETTINGS', () => {
  it('leaves the calculator effectively unlimited', () => {
    expect(DEFAULT_MACHINE_SETTINGS.spindleMinRpm).toBe(0)
    expect(DEFAULT_MACHINE_SETTINGS.spindleMaxRpm).toBeGreaterThanOrEqual(30000)
    expect(DEFAULT_MACHINE_SETTINGS.rigidity).toBe('light')
  })
})

describe('router dials (BL-69)', () => {
  it('picks the closest dial position', () => {
    const dial = ROUTERS.makitaRt0700c.dial
    expect(nearestDialPosition(dial, 9000)).toBe(1)
    expect(nearestDialPosition(dial, 16000)).toBe(3)
    expect(nearestDialPosition(dial, 23900)).toBe(4)
    expect(nearestDialPosition(dial, 40000)).toBe(6)
  })

  it('spreads approximate dials evenly across the range, ascending', () => {
    for (const spec of Object.values(ROUTERS)) {
      expect(spec.dial.length).toBeGreaterThanOrEqual(2)
      for (let i = 1; i < spec.dial.length; i++) expect(spec.dial[i]).toBeGreaterThan(spec.dial[i - 1])
    }
    expect(ROUTERS.dewaltDwp611.dial[0]).toBe(16000)
    expect(ROUTERS.dewaltDwp611.dial[5]).toBe(27000)
  })
})
