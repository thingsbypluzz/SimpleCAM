import { describe, expect, it } from 'vitest'
import { DEFAULT_MACHINE_SETTINGS } from '../types/machine'
import { DEFAULT_WIZARD_PARAMS, type WizardParams } from '../types/wizard'
import { forcedLinearReason } from './interpolation'
import { buildPocketToolpath, generatePocketSpiral } from './pocket'
import { cellContour, isPocketContour, pocketContours, tabsPerSide } from './pocketContour'
import { lightenedCells, type TriangleCell } from './pocketLightened'
import { simplifyParams } from './simpleMode'
import { stockModel } from './stockModel'
import { isWizardParamsValid, OPERATION_RULES } from './validation'

function contourParams(pocket: Partial<WizardParams['pocket']> = {}, feeds: Partial<WizardParams['feeds']> = {}): WizardParams {
  return {
    ...DEFAULT_WIZARD_PARAMS,
    operation: 'pocket',
    feeds: { ...DEFAULT_WIZARD_PARAMS.feeds, stepdown: 1, startZ: 0, ...feeds },
    pocket: {
      ...DEFAULT_WIZARD_PARAMS.pocket,
      shape: 'rectLightened',
      width: 120,
      height: 50,
      totalDepth: 3,
      bottomOpen: true,
      tabsEnabled: true,
      tabHeight: 1,
      tabWidth: 3,
      tabCount: 3,
      ...pocket,
    },
  }
}

const triangle = (a: [number, number], b: [number, number], c: [number, number]): TriangleCell => ({
  kind: 'triangle',
  vertices: [
    { x: a[0], y: a[1] },
    { x: b[0], y: b[1] },
    { x: c[0], y: c[1] },
  ],
})

describe('tabsPerSide', () => {
  // The rule as agreed in /grill-me (BL-82), on a 40 / 30 / 25 mm triangle.
  it('puts each next tab on the side with the most length per tab', () => {
    const sides = [40, 30, 25]
    expect(tabsPerSide(sides, 1)).toEqual([1, 0, 0])
    expect(tabsPerSide(sides, 2)).toEqual([1, 1, 0])
    expect(tabsPerSide(sides, 3)).toEqual([1, 1, 1])
    expect(tabsPerSide(sides, 4)).toEqual([2, 1, 1])
    // 40 / 3 ≈ 13.3 still beats 25 / 2 = 12.5.
    expect(tabsPerSide(sides, 6)).toEqual([3, 2, 1])
  })

  it('breaks ties by side order', () => {
    expect(tabsPerSide([10, 10, 10], 1)).toEqual([1, 0, 0])
    expect(tabsPerSide([10, 10, 10], 2)).toEqual([1, 1, 0])
  })
})

describe('cellContour', () => {
  const cell = triangle([0, 0], [60, 0], [0, 30])

  it('starts at the corner where the longest side begins, CCW', () => {
    const c = cellContour(cell, 1, null)!
    expect(c.points).toHaveLength(3)
    expect(c.sideLengths[0]).toBe(Math.max(...c.sideLengths))
    let area = 0
    c.points.forEach((p, i) => {
      const q = c.points[(i + 1) % c.points.length]
      area += p.x * q.y - q.x * p.y
    })
    expect(area).toBeGreaterThan(0)
  })

  it('places tabs evenly on their side, never on a corner', () => {
    const c = cellContour(cell, 1, { tabCount: 4, tabWidth: 2 })!
    const corners = [0, c.sideLengths[0], c.sideLengths[0] + c.sideLengths[1], c.length]
    expect(c.tabs).toHaveLength(4)
    for (const t of c.tabs) {
      expect(t.end - t.start).toBeCloseTo(2)
      for (const corner of corners) expect(corner <= t.start || corner >= t.end).toBe(true)
    }
    // The longest side got two, centered at 1/4 and 3/4 of it.
    const first = c.sideLengths[0]
    expect((c.tabs[0].start + c.tabs[0].end) / 2).toBeCloseTo(first / 4)
    expect((c.tabs[1].start + c.tabs[1].end) / 2).toBeCloseTo((3 * first) / 4)
  })

  it('is null when the tool does not fit the cell', () => {
    expect(cellContour(cell, 50, null)).toBeNull()
  })

  it('splits a sector into its arcs and spoke sides', () => {
    const params = contourParams({ shape: 'circleLightened', diameter: 100, hubDiameter: 30, spokeCount: 4 })
    const contours = pocketContours(params.pocket)
    expect(contours).toHaveLength(4)
    expect(contours[0].sideLengths).toHaveLength(4)
  })
})

describe('buildPocketToolpath with Bottom Open', () => {
  it('cuts every cell to full depth, one after another', () => {
    const params = contourParams()
    const toolpath = buildPocketToolpath(params)
    const cells = lightenedCells(params.pocket).length
    const xyRapids = toolpath.moves.filter((m) => m.kind === 'rapid' && m.type === 'line' && m.axes === 'xy')
    expect(xyRapids).toHaveLength(cells - 1)
    const zs = toolpath.moves.map((m) => m.to.z)
    expect(Math.min(...zs)).toBeCloseTo(-3)
  })

  it('lifts to the top of the tab band over every tab', () => {
    const params = contourParams({ contourMethod: 'standard' })
    const toolpath = buildPocketToolpath(params)
    const zs = toolpath.moves.filter((m) => m.kind === 'cut').map((m) => m.to.z)
    // Laps at -1 and -2 are above the band, the last one at -3 skips the tabs at -2.
    expect(zs.some((z) => Math.abs(z + 3) < 1e-9)).toBe(true)
    const deepest = toolpath.moves.filter((m) => m.kind === 'cut' && Math.abs(m.to.z + 3) < 1e-9).length
    const lifted = toolpath.moves.filter((m) => m.kind === 'cut' && Math.abs(m.to.z + 2) < 1e-9).length
    expect(deepest).toBeGreaterThan(0)
    expect(lifted).toBeGreaterThan(0)
  })

  it('ramps down along the contour without plunges above the tab band', () => {
    const params = contourParams({ contourMethod: 'ramp', tabsEnabled: false, rampAngleDeg: 2 })
    const toolpath = buildPocketToolpath(params)
    expect(toolpath.moves.some((m) => m.kind === 'plunge')).toBe(false)
  })

  it('leaves the Spiral path when Bottom Open is off', () => {
    const on = buildPocketToolpath(contourParams())
    const off = buildPocketToolpath(contourParams({ bottomOpen: false }))
    expect(off.moves.length).not.toBe(on.moves.length)
  })

  it('ignores Bottom Open on shapes other than Lightened', () => {
    const params = contourParams({ shape: 'rectCornered' })
    expect(isPocketContour(params.pocket)).toBe(false)
  })
})

describe('Bottom Open validation and rules', () => {
  it('accepts the defaults', () => {
    expect(isWizardParamsValid(contourParams())).toBe(true)
    expect(generatePocketSpiral(contourParams(), DEFAULT_MACHINE_SETTINGS).at(-1)).toMatch(/^M(30|2)$/)
  })

  it('rejects tabs that do not fit their sides instead of dropping some', () => {
    expect(isWizardParamsValid(contourParams({ tabWidth: 40 }))).toBe(false)
  })

  it('rejects a tab band as deep as the cut', () => {
    expect(isWizardParamsValid(contourParams({ tabHeight: 3 }))).toBe(false)
  })

  it('treats the contour as a slot and forces G1 with tabs', () => {
    const params = contourParams()
    expect(OPERATION_RULES.pocket.engagement(params)).toEqual({ kind: 'slot' })
    expect(forcedLinearReason(params)).toBe('tabs')
    expect(forcedLinearReason(contourParams({ tabsEnabled: false }))).toBeNull()
  })

  it('reports the ramp of the shortest contour, none for Standard', () => {
    const shortest = Math.min(...pocketContours(contourParams().pocket).map((c) => c.length))
    expect(OPERATION_RULES.pocket.rampPathLength(contourParams())).toBeCloseTo(shortest)
    expect(OPERATION_RULES.pocket.rampPathLength(contourParams({ contourMethod: 'standard' }))).toBeNull()
  })

  it('is reset by Simple Mode', () => {
    expect(simplifyParams(contourParams()).pocket.bottomOpen).toBe(false)
  })
})

describe('stock model with Bottom Open', () => {
  it('cuts the cells through, with no floor', () => {
    const open = contourParams()
    const closed = contourParams({ bottomOpen: false })
    const sheet = { minX: -100, minY: -100, maxX: 100, maxY: 100 }
    expect(stockModel([open], sheet, false)?.floors).toHaveLength(0)
    expect(stockModel([closed], sheet, false)?.floors.length).toBeGreaterThan(0)
  })
})
