import { describe, expect, it } from 'vitest'
import { computeTabRanges, tabbedCirclePass } from './tabs'

describe('computeTabRanges', () => {
  it('returns tabCount ranges, evenly spaced and phase-shifted by half a step', () => {
    // radius=1 keeps angularWidth === tabWidth (in radians), simplifying the math.
    const ranges = computeTabRanges(4, 0.2, 1)
    expect(ranges).toHaveLength(4)
    const step = (2 * Math.PI) / 4
    ranges.forEach((r, k) => {
      const center = (r.startAngle + r.endAngle) / 2
      expect(center).toBeCloseTo(step * (k + 0.5))
      expect(r.endAngle - r.startAngle).toBeCloseTo(0.2)
    })
  })

  it('keeps every range strictly within [0, 2π] — no wraparound needed', () => {
    // tabWidth close to the validation boundary (tabCount*tabWidth just
    // under the circumference, i.e. angularWidth just under `step`).
    const tabCount = 5
    const step = (2 * Math.PI) / tabCount
    const ranges = computeTabRanges(tabCount, step * 0.99, 1)
    expect(ranges[0].startAngle).toBeGreaterThan(0)
    expect(ranges[ranges.length - 1].endAngle).toBeLessThan(2 * Math.PI)
  })

  it('returns an empty array for tabCount <= 0 or radius <= 0', () => {
    expect(computeTabRanges(0, 1, 5)).toEqual([])
    expect(computeTabRanges(4, 1, 0)).toEqual([])
  })
})

describe('tabbedCirclePass', () => {
  const base = { centerX: 0, centerY: 0, radius: 10, startX: 10, startY: 0, cutZ: -5, liftZ: -3, feed: 800 }

  it('behaves like a plain 72-segment sweep with no tabs', () => {
    const lines = tabbedCirclePass({ ...base, tabRanges: [] })
    expect(lines).toHaveLength(72)
    expect(lines.some((l) => l.includes(`Z${base.liftZ}`))).toBe(false)
    expect(lines[lines.length - 1]).toBe('G1 X10 Y0 Z-5 F800')
  })

  it('lifts to liftZ across a tab and plunges back to cutZ afterward', () => {
    const tabRanges = computeTabRanges(1, 5, base.radius) // one wide tab
    const lines = tabbedCirclePass({ ...base, tabRanges })

    const liftLines = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.includes(`Z${base.liftZ} `))
    expect(liftLines.length).toBeGreaterThan(0)

    const firstLiftIdx = liftLines[0].i
    const lastLiftIdx = liftLines[liftLines.length - 1].i
    // Cutting right up until the lift, and resuming cutting right after.
    expect(lines[firstLiftIdx - 1]).toContain(`Z${base.cutZ} `)
    expect(lines[lastLiftIdx + 1]).toContain(`Z${base.cutZ} `)
  })

  it('produces one lift/plunge cycle per tab', () => {
    const tabRanges = computeTabRanges(3, 2, base.radius)
    const lines = tabbedCirclePass({ ...base, tabRanges })

    // Count transitions from a cutZ line into a liftZ line.
    let transitions = 0
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].includes(`Z${base.liftZ} `) && lines[i - 1].includes(`Z${base.cutZ} `)) transitions++
    }
    expect(transitions).toBe(3)
  })

  it('always ends exactly on the start point at cutZ', () => {
    const tabRanges = computeTabRanges(2, 3, base.radius)
    const lines = tabbedCirclePass({ ...base, tabRanges })
    expect(lines[lines.length - 1]).toBe(`G1 X${base.startX} Y${base.startY} Z${base.cutZ} F${base.feed}`)
  })

  it('never emits a diagonal move through a tab (lift/plunge are vertical-only)', () => {
    const tabRanges = computeTabRanges(1, 5, base.radius)
    const lines = tabbedCirclePass({ ...base, tabRanges })
    for (let i = 1; i < lines.length; i++) {
      const prevZ = /Z(-?[\d.]+)/.exec(lines[i - 1])?.[1]
      const curZ = /Z(-?[\d.]+)/.exec(lines[i])?.[1]
      if (prevZ !== curZ) {
        // A Z change happened on this line — X/Y must be unchanged from the previous line.
        const prevXY = lines[i - 1].match(/X(-?[\d.]+) Y(-?[\d.]+)/)
        const curXY = lines[i].match(/X(-?[\d.]+) Y(-?[\d.]+)/)
        expect(curXY?.[1]).toBe(prevXY?.[1])
        expect(curXY?.[2]).toBe(prevXY?.[2])
      }
    }
  })
})
