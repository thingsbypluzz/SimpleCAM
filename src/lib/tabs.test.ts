import { describe, expect, it } from 'vitest'
import { appendTabbedCirclePass, computeTabRanges, tabGapLength } from './tabs'
import { ToolpathBuilder, toolpathToGcode } from './toolpath'

// One tabbed pass on its own, formatted as G-code (G1 at `feed`).
// Distinct from every `feed` used below, so the descent's F word shows it.
const PLUNGE_FEED = 123

function tabbedCirclePass(p: Parameters<typeof appendTabbedCirclePass>[1] & { feed: number }): string[] {
  const b = new ToolpathBuilder({ x: p.startX, y: p.startY, z: p.cutZ })
  appendTabbedCirclePass(b, p)
  return toolpathToGcode(b.build(), { feeds: { cut: p.feed, plunge: PLUNGE_FEED }, interpolation: 'linear', leadInRapid: false })
}

// Every Z change is vertical: either a bare `G1 Z…` (stays at the current
// XY by definition) or an X Y Z line at the XY of the line before it.
function expectNoDiagonalZMoves(lines: string[]) {
  let xy: string | null = null
  let z: string | undefined
  for (const line of lines) {
    const lineXY = /X(-?[\d.]+) Y(-?[\d.]+)/.exec(line)?.slice(1).join(',') ?? null
    const lineZ = /Z(-?[\d.]+)/.exec(line)?.[1]
    if (lineZ !== undefined && z !== undefined && lineZ !== z && lineXY !== null) expect(lineXY).toBe(xy)
    if (lineXY !== null) xy = lineXY
    if (lineZ !== undefined) z = lineZ
  }
}

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

  it('floors a fractional count and clamps ranges to [0, 2π] (BL-45)', () => {
    expect(computeTabRanges(2.5, 0.2, 1)).toHaveLength(2)
    const wide = computeTabRanges(1, 10, 1) // angularWidth 10 rad > 2π
    expect(wide[0].startAngle).toBe(0)
    expect(wide[0].endAngle).toBe(2 * Math.PI)
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

describe('appendTabbedCirclePass', () => {
  const base = {
    centerX: 0,
    centerY: 0,
    radius: 10,
    startX: 10,
    startY: 0,
    cutZ: -5,
    liftZ: -3,
    feed: 800,
    direction: 'ccw' as const,
  }

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
    expectNoDiagonalZMoves(lines)
  })

  it('plunges back to cutZ exactly at the tab\'s own end angle, not the next sample point', () => {
    // Regression test for BL-21: the exit transition used to travel all
    // the way to the NEXT breakpoint while still lifted before plunging,
    // instead of plunging immediately at the tab's own end boundary.
    // With SEGMENTS_PER_TURN=72 sampling this was small (~5°) and went
    // unnoticed here, but it's the same bug that was very visible in the
    // rectangle case (see outlineRectangleTabs.test.ts).
    const tabRanges = computeTabRanges(1, 5, base.radius)
    const lines = tabbedCirclePass({ ...base, tabRanges })

    const liftLines = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.includes(`Z${base.liftZ} `))
    const lastLiftIdx = liftLines[liftLines.length - 1].i
    const expectedX = base.centerX + base.radius * Math.cos(tabRanges[0].endAngle)
    const expectedY = base.centerY + base.radius * Math.sin(tabRanges[0].endAngle)
    // The last lifted move ends exactly at the tab's end angle (compared at
    // G-code output precision — fmt() rounds to 4 decimals)…
    const liftMatch = /X(-?[\d.]+) Y(-?[\d.]+)/.exec(lines[lastLiftIdx])
    expect(Number(liftMatch?.[1])).toBeCloseTo(expectedX, 3)
    expect(Number(liftMatch?.[2])).toBeCloseTo(expectedY, 3)
    // …and the tool goes straight down from there at Plunge Rate, not at
    // Feedrate XY: it enters the material end-first.
    expect(lines[lastLiftIdx + 1]).toBe(`G1 Z${base.cutZ} F${PLUNGE_FEED}`)
  })

  it('cw direction still ends on the start point, but sweeps the opposite way', () => {
    const tabRanges = computeTabRanges(1, 5, base.radius)
    const ccw = tabbedCirclePass({ ...base, tabRanges })
    const cw = tabbedCirclePass({ ...base, tabRanges, direction: 'cw' })
    expect(cw[cw.length - 1]).toBe(`G1 X${base.startX} Y${base.startY} Z${base.cutZ} F${base.feed}`)
    expect(cw[0]).not.toBe(ccw[0])
  })
})

describe('tabGapLength', () => {
  it('widens the toolpath gap by the tool diameter, so the bridge left is Tab Width', () => {
    expect(tabGapLength(5, 6)).toBe(11)
    expect(tabGapLength(3, 0)).toBe(3)
  })
})
