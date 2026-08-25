import { describe, expect, it } from 'vitest'
import { computeRectTabRanges, tabbedRectanglePass } from './outlineRectangleTabs'
import { rectCorners } from './outlineRectangleGeometry'
import { fmt } from './format'

describe('computeRectTabRanges', () => {
  it('returns tabCountPerSide ranges, evenly spaced and phase-shifted by half a step', () => {
    const ranges = computeRectTabRanges(4, 2, 20) // widthFrac = 2/20 = 0.1
    expect(ranges).toHaveLength(4)
    const step = 1 / 4
    ranges.forEach((r, k) => {
      const center = (r.startFrac + r.endFrac) / 2
      expect(center).toBeCloseTo(step * (k + 0.5))
      expect(r.endFrac - r.startFrac).toBeCloseTo(0.1)
    })
  })

  it('keeps every range strictly within [0, 1] — corners never inside a tab', () => {
    const tabCount = 5
    const step = 1 / tabCount
    const ranges = computeRectTabRanges(tabCount, step * 0.99 * 20, 20) // tabWidth just under one step's worth
    expect(ranges[0].startFrac).toBeGreaterThan(0)
    expect(ranges[ranges.length - 1].endFrac).toBeLessThan(1)
  })

  it('returns an empty array for tabCountPerSide <= 0 or sideLength <= 0', () => {
    expect(computeRectTabRanges(0, 1, 20)).toEqual([])
    expect(computeRectTabRanges(3, 1, 0)).toEqual([])
  })
})

describe('tabbedRectanglePass', () => {
  const corners = rectCorners('rectCornered', 40, 20, 0, 0, 'ccw')
  const cutZ = -5
  const liftZ = -3
  const feed = 800

  it('degrades to a plain 4-line perimeter walk when no side has tabs', () => {
    const lines = tabbedRectanglePass({
      corners,
      sideRanges: [[], [], [], []],
      cutZ,
      liftZ,
      feed,
    })
    expect(lines).toHaveLength(4)
    expect(lines.every((l) => l.includes(`Z${cutZ}`))).toBe(true)
    expect(lines[0]).toBe('G1 X40 Y0 Z-5 F800')
    expect(lines[1]).toBe('G1 X40 Y20 Z-5 F800')
    expect(lines[2]).toBe('G1 X0 Y20 Z-5 F800')
    expect(lines[lines.length - 1]).toBe('G1 X0 Y0 Z-5 F800')
  })

  it('lifts to liftZ across a tab and plunges back to cutZ afterward', () => {
    const oneTabOnSide0 = computeRectTabRanges(1, 10, 40)
    const lines = tabbedRectanglePass({
      corners,
      sideRanges: [oneTabOnSide0, [], [], []],
      cutZ,
      liftZ,
      feed,
    })
    const liftLines = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.includes(`Z${liftZ} `))
    expect(liftLines.length).toBeGreaterThan(0)
    const firstLiftIdx = liftLines[0].i
    const lastLiftIdx = liftLines[liftLines.length - 1].i
    expect(lines[firstLiftIdx - 1]).toContain(`Z${cutZ} `)
    expect(lines[lastLiftIdx + 1]).toContain(`Z${cutZ} `)
  })

  it('produces one lift/plunge cycle per tab, summed across all 4 sides', () => {
    const twoPerSide = computeRectTabRanges(2, 2, 40)
    const threePerSide = computeRectTabRanges(3, 2, 20)
    const lines = tabbedRectanglePass({
      corners,
      sideRanges: [twoPerSide, threePerSide, twoPerSide, threePerSide],
      cutZ,
      liftZ,
      feed,
    })
    let transitions = 0
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].includes(`Z${liftZ} `) && lines[i - 1].includes(`Z${cutZ} `)) transitions++
    }
    expect(transitions).toBe(2 + 3 + 2 + 3)
  })

  it('always ends exactly on the start corner at cutZ', () => {
    const ranges = computeRectTabRanges(2, 3, 40)
    const lines = tabbedRectanglePass({ corners, sideRanges: [ranges, [], [], []], cutZ, liftZ, feed })
    expect(lines[lines.length - 1]).toBe(`G1 X${corners[0].x} Y${corners[0].y} Z${cutZ} F${feed}`)
  })

  it('plunges back to cutZ exactly at the tab\'s own end boundary, not the side\'s far corner', () => {
    // Regression test for BL-21: the exit transition used to travel all
    // the way to the NEXT breakpoint (here, the far corner — a rectangle
    // has no intermediate sampling between tab boundaries) while still
    // lifted, before plunging — so a single centered tab left roughly
    // half the side lifted instead of just the tab's own width.
    const oneTabOnSide0 = computeRectTabRanges(1, 10, 40)
    const lines = tabbedRectanglePass({
      corners,
      sideRanges: [oneTabOnSide0, [], [], []],
      cutZ,
      liftZ,
      feed,
    })

    const liftLines = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.includes(`Z${liftZ} `))
    const lastLiftIdx = liftLines[liftLines.length - 1].i
    const plungeLine = lines[lastLiftIdx + 1]

    const p0 = corners[0]
    const p1 = corners[1]
    const endFrac = oneTabOnSide0[0].endFrac
    const expectedX = p0.x + (p1.x - p0.x) * endFrac
    const expectedY = p0.y + (p1.y - p0.y) * endFrac
    expect(plungeLine).toBe(`G1 X${fmt(expectedX)} Y${fmt(expectedY)} Z${cutZ} F${feed}`)

    // The lift line right before it must sit at that exact same position
    // — a pure vertical plunge at the tab boundary, not a lifted detour
    // all the way to the far corner (X40).
    expect(lines[lastLiftIdx]).toBe(`G1 X${fmt(expectedX)} Y${fmt(expectedY)} Z${liftZ} F${feed}`)
  })

  it('never emits a diagonal move through a tab (lift/plunge are vertical-only)', () => {
    const ranges = computeRectTabRanges(1, 10, 40)
    const lines = tabbedRectanglePass({ corners, sideRanges: [ranges, [], [], []], cutZ, liftZ, feed })
    for (let i = 1; i < lines.length; i++) {
      const prevZ = /Z(-?[\d.]+)/.exec(lines[i - 1])?.[1]
      const curZ = /Z(-?[\d.]+)/.exec(lines[i])?.[1]
      if (prevZ !== curZ) {
        const prevXY = lines[i - 1].match(/X(-?[\d.]+) Y(-?[\d.]+)/)
        const curXY = lines[i].match(/X(-?[\d.]+) Y(-?[\d.]+)/)
        expect(curXY?.[1]).toBe(prevXY?.[1])
        expect(curXY?.[2]).toBe(prevXY?.[2])
      }
    }
  })
})
