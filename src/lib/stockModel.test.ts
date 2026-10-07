import { describe, expect, it } from 'vitest'
import type { MultiPolygon, Ring } from 'polygon-clipping'
import { cutContours, pocketVoids, roundedOffsetLoop, stockModel } from './stockModel'
import { DEFAULT_WIZARD_PARAMS, type WizardParams } from '../types/wizard'

const sheet = { minX: -100, minY: -100, maxX: 100, maxY: 100 }
const SHEET_AREA = 200 * 200

// Single hole at (x, y).
const hole = (x: number, y: number, holeDiameter: number, totalDepth: number): WizardParams => ({
  ...DEFAULT_WIZARD_PARAMS,
  operation: 'holes',
  geometry: { ...DEFAULT_WIZARD_PARAMS.geometry, positioning: 'single', holeDiameter, totalDepth, offsetX: x, offsetY: y },
})
// Rectangle Centered outline at (x, y).
const outline = (
  offsetMode: WizardParams['outline']['offsetMode'],
  width: number,
  height: number,
  totalDepth: number,
  x = 0,
  y = 0,
): WizardParams => ({
  ...DEFAULT_WIZARD_PARAMS,
  operation: 'outline',
  outline: { ...DEFAULT_WIZARD_PARAMS.outline, shape: 'rectCentered', offsetMode, width, height, totalDepth, toolDiameter: 4, offsetX: x, offsetY: y },
})
// Rectangle Centered pocket at (x, y).
const pocket = (width: number, height: number, totalDepth: number, x = 0, y = 0): WizardParams => ({
  ...DEFAULT_WIZARD_PARAMS,
  operation: 'pocket',
  pocket: { ...DEFAULT_WIZARD_PARAMS.pocket, shape: 'rectCentered', width, height, totalDepth, offsetX: x, offsetY: y },
})
const surface: WizardParams = { ...DEFAULT_WIZARD_PARAMS, operation: 'surface' }

const ringArea = (ring: Ring) =>
  Math.abs(ring.reduce((sum, [x, y], i) => {
    const [nx, ny] = ring[(i + 1) % ring.length]
    return sum + x * ny - nx * y
  }, 0)) / 2
const area = (mp: MultiPolygon) =>
  mp.reduce((sum, [outer, ...holeRings]) => sum + ringArea(outer) - holeRings.reduce((s, h) => s + ringArea(h), 0), 0)
// A 72-gon inscribed in a circle of radius r.
const circleArea = (r: number) => 36 * r * r * Math.sin((2 * Math.PI) / 72)

describe('pocketVoids', () => {
  it('is the nominal boundary of a plain shape', () => {
    // Default Pocket: Rectangle Cornered 50×30 at the origin.
    expect(pocketVoids(DEFAULT_WIZARD_PARAMS.pocket)).toEqual([
      {
        polygon: [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
          { x: 50, y: 30 },
          { x: 0, y: 30 },
        ],
      },
    ])
  })
})

describe('stockModel — stock sheet', () => {
  it('has no stock for Surface alone, and leaves Surface out next to other presets', () => {
    expect(stockModel([surface], sheet)).toBeNull()
    expect(stockModel([], sheet)).toBeNull()
    const model = stockModel([surface, hole(0, 0, 10, 5)], sheet)!
    expect(model.solid).toBe(false)
    expect(area(model.top)).toBeCloseTo(SHEET_AREA - circleArea(5))
  })

  it('cuts separate voids as separate holes, overlapping ones as one', () => {
    const apart = stockModel([hole(-20, 0, 10, 5), hole(20, 0, 10, 5)], sheet)!
    expect(apart.top).toHaveLength(1)
    expect(apart.top[0]).toHaveLength(3)
    expect(apart.bottom).toBeNull()
    expect(apart.floors).toEqual([])

    const merged = stockModel([hole(-3, 0, 10, 5), hole(3, 0, 10, 5)], sheet)!
    expect(merged.top[0]).toHaveLength(2)
    expect(area(merged.top)).toBeGreaterThan(SHEET_AREA - 2 * circleArea(5))
    expect(area(merged.top)).toBeLessThan(SHEET_AREA - circleArea(5))
  })

  it('walls follow the voids, never the edge of the sheet', () => {
    const model = stockModel([hole(0, 0, 10, 5)], sheet)!
    expect(model.walls).toHaveLength(1)
    expect(model.walls[0]).toMatchObject({ zTop: -0, zBottom: -5 })
    expect(area(model.walls[0].region)).toBeCloseTo(circleArea(5))
  })

  it('gives a pocket a floor at its depth', () => {
    const model = stockModel([pocket(40, 20, 6)], sheet)!
    expect(area(model.top)).toBeCloseTo(SHEET_AREA - 800)
    expect(model.floors).toHaveLength(1)
    expect(model.floors[0].z).toBe(-6)
    expect(area(model.floors[0].region)).toBeCloseTo(800)
  })

  it('a hole deeper than the pocket pierces its floor and has a wall below it only', () => {
    const model = stockModel([pocket(40, 20, 6), hole(0, 0, 10, 15)], sheet)!
    expect(area(model.floors[0].region)).toBeCloseTo(800 - circleArea(5))
    expect(model.walls.map((w) => [w.zTop, w.zBottom])).toEqual([
      [-0, -6],
      [-6, -15],
    ])
    expect(area(model.walls[0].region)).toBeCloseTo(800)
    expect(area(model.walls[1].region)).toBeCloseTo(circleArea(5))
  })

  it('a hole shallower than the pocket it sits in leaves the floor whole', () => {
    const model = stockModel([pocket(40, 20, 6), hole(0, 0, 10, 3)], sheet)!
    expect(model.floors).toHaveLength(1)
    expect(area(model.floors[0].region)).toBeCloseTo(800)
    // Both bands are the pocket's own wall — the hole adds nothing.
    for (const band of model.walls) expect(area(band.region)).toBeCloseTo(800)
  })

  it('a hole as deep as the pocket leaves no floor under it', () => {
    const model = stockModel([pocket(40, 20, 6), hole(0, 0, 10, 6)], sheet)!
    expect(area(model.floors[0].region)).toBeCloseTo(800 - circleArea(5))
  })

  it('an Open hole is cut through; a Closed one keeps a floor at its depth (BL-111)', () => {
    const closed = (p: WizardParams): WizardParams => ({ ...p, geometry: { ...p.geometry, holeBottom: 'closed' } })
    expect(stockModel([hole(0, 0, 10, 5)], sheet)!.floors).toHaveLength(0)
    const model = stockModel([closed(hole(0, 0, 10, 5))], sheet)!
    expect(model.floors).toHaveLength(1)
    expect(model.floors[0].z).toBeCloseTo(-5)
    expect(area(model.floors[0].region)).toBeCloseTo(circleArea(5))
    expect(area(model.top)).toBeCloseTo(SHEET_AREA - circleArea(5))
  })

  it('a Closed counterbore over a deeper Open hole shows its step (BL-111)', () => {
    const counterbore: WizardParams = { ...hole(0, 0, 10, 5), geometry: { ...hole(0, 0, 10, 5).geometry, holeBottom: 'closed' } }
    const model = stockModel([hole(0, 0, 5.3, 12), counterbore], sheet)!
    // The step: the counterbore's floor with the through hole cut out of it.
    expect(model.floors).toHaveLength(1)
    expect(model.floors[0].z).toBeCloseTo(-5)
    expect(area(model.floors[0].region)).toBeCloseTo(circleArea(5) - circleArea(2.65))
    expect(model.walls.map((w) => [w.zTop, w.zBottom])).toEqual([
      [-0, -5],
      [-5, -12],
    ])
    expect(area(model.walls[0].region)).toBeCloseTo(circleArea(5))
    expect(area(model.walls[1].region)).toBeCloseTo(circleArea(2.65))
  })

  it('a deeper pocket inside a shallower one makes a step', () => {
    const model = stockModel([pocket(40, 20, 3), pocket(10, 10, 8)], sheet)!
    expect(model.floors.map((f) => f.z)).toEqual([-3, -8])
    expect(area(model.floors[0].region)).toBeCloseTo(800 - 100)
    expect(area(model.floors[1].region)).toBeCloseTo(100)
  })

  it('a lone On-line outline keeps the sheet, cut by a tool-wide band', () => {
    const model = stockModel([outline('onLine', 40, 20, 5)], sheet)!
    expect(model.solid).toBe(false)
    // Band between 36×16 and 44×24; the inner island stays part of the top.
    expect(model.top).toHaveLength(2)
    expect(area(model.top)).toBeCloseTo(SHEET_AREA - (44 * 24 - 36 * 16))
    expect(model.walls[0].region[0]).toHaveLength(2)
  })
})

describe('stockModel — Outline Outside part', () => {
  it('is the part alone: top, bottom and outer walls', () => {
    const model = stockModel([outline('outside', 40, 20, 5)], sheet)!
    expect(model.solid).toBe(true)
    expect(area(model.top)).toBeCloseTo(800)
    expect(model.bottom?.z).toBe(-5)
    expect(area(model.bottom!.region)).toBeCloseTo(800)
    expect(model.walls).toHaveLength(1)
    expect(model.walls[0]).toMatchObject({ zTop: -0, zBottom: -5 })
  })

  it('cuts a pocket into the part, with a floor and walls in two bands', () => {
    const model = stockModel([outline('outside', 40, 20, 5), pocket(10, 10, 2)], sheet)!
    expect(area(model.top)).toBeCloseTo(800 - 100)
    expect(model.floors).toHaveLength(1)
    expect(model.floors[0].z).toBe(-2)
    expect(area(model.floors[0].region)).toBeCloseTo(100)
    expect(model.walls.map((w) => [w.zTop, w.zBottom])).toEqual([
      [-0, -2],
      [-2, -5],
    ])
    // Above the floor the section has the pocket cut out, below it is whole.
    expect(model.walls[0].region[0]).toHaveLength(2)
    expect(model.walls[1].region[0]).toHaveLength(1)
    expect(area(model.bottom!.region)).toBeCloseTo(800)
  })

  it('a pocket as deep as the part goes through it', () => {
    const model = stockModel([outline('outside', 40, 20, 5), pocket(10, 10, 9)], sheet)!
    expect(model.floors).toEqual([])
    expect(area(model.bottom!.region)).toBeCloseTo(800 - 100)
    expect(model.walls.map((w) => [w.zTop, w.zBottom])).toEqual([[-0, -5]])
  })

  it('a pocket open to the edge of the part only keeps the floor inside it', () => {
    const model = stockModel([outline('outside', 40, 20, 5), pocket(20, 10, 2, 20, 0)], sheet)!
    expect(area(model.floors[0].region)).toBeCloseTo(100)
    expect(area(model.top)).toBeCloseTo(800 - 100)
  })

  it('merges overlapping parts into one, as thick as the deepest', () => {
    const model = stockModel([outline('outside', 40, 20, 5), outline('outside', 40, 20, 8, 30, 0)], sheet)!
    expect(model.top).toHaveLength(1)
    expect(area(model.top)).toBeCloseTo(70 * 20)
    expect(model.bottom?.z).toBe(-8)
  })

  it('ignores a void outside every part', () => {
    const model = stockModel([outline('outside', 40, 20, 5), hole(60, 60, 10, 5)], sheet)!
    expect(area(model.top)).toBeCloseTo(800)
    expect(area(model.bottom!.region)).toBeCloseTo(800)
  })
})

describe('stockModel — coinciding edges', () => {
  // Presets sharing an origin put edges almost on top of each other, which
  // polygon-clipping only survives on snapped coordinates.
  it('still yields a model for overlapping Lightened pockets on one origin', () => {
    const lightened = (shape: 'rectLightened' | 'circleLightened'): WizardParams => ({
      ...DEFAULT_WIZARD_PARAMS,
      operation: 'pocket',
      pocket: { ...DEFAULT_WIZARD_PARAMS.pocket, shape, width: 180, height: 180, diameter: 190, spokeCount: 24, hubDiameter: 30, ribWidth: 4, offsetX: 0, offsetY: 0 },
    })
    const onLine: WizardParams = {
      ...DEFAULT_WIZARD_PARAMS,
      operation: 'outline',
      outline: { ...DEFAULT_WIZARD_PARAMS.outline, shape: 'circle', offsetMode: 'onLine', diameter: 120, offsetX: 0, offsetY: 0 },
    }
    const big = { minX: -300, minY: -300, maxX: 300, maxY: 300 }
    const model = stockModel([lightened('rectLightened'), lightened('circleLightened'), hole(0, 0, 6, 6), onLine], big)
    expect(model).not.toBeNull()
    expect(area(model!.top)).toBeLessThan(600 * 600)
  })
})

describe('cut shape (BL-86)', () => {
  // A corner arc is a polyline inscribed in the true arc (15° steps), so
  // areas come out a hair off the exact π·r² terms.
  const TOLERANCE = 0.5
  const withTool = (params: WizardParams, toolDiameter: number): WizardParams =>
    params.operation === 'pocket'
      ? { ...params, pocket: { ...params.pocket, toolDiameter } }
      : { ...params, outline: { ...params.outline, toolDiameter } }
  const polygonArea = (polygon: { x: number; y: number }[]) => ringArea(polygon.map((p) => [p.x, p.y] as [number, number]))

  it('roundedOffsetLoop grows a square by r with round corners', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]
    const area = polygonArea(roundedOffsetLoop(square, 2))
    expect(Math.abs(area - (100 + 4 * 10 * 2 + Math.PI * 4))).toBeLessThan(TOLERANCE)
  })

  it('rounds a rectangular pocket to the tool radius', () => {
    const preset = withTool(pocket(40, 20, 6), 6)
    const exact = 800 - (4 - Math.PI) * 9
    const model = stockModel([preset], sheet, true)!
    expect(Math.abs(area(model.floors[0].region) - exact)).toBeLessThan(TOLERANCE)
    expect(Math.abs(area(model.top) - (SHEET_AREA - exact))).toBeLessThan(TOLERANCE)
    // Off: the nominal rectangle, as before.
    expect(area(stockModel([preset], sheet)!.floors[0].region)).toBeCloseTo(800)
  })

  it('rounds Outline Inside, leaves Outside sharp', () => {
    const inside = stockModel([withTool(outline('inside', 40, 20, 5), 6)], sheet, true)!
    expect(Math.abs(area(inside.top) - (SHEET_AREA - 800 + (4 - Math.PI) * 9))).toBeLessThan(TOLERANCE)
    const outside = stockModel([withTool(outline('outside', 40, 20, 5), 6)], sheet, true)!
    expect(area(outside.top)).toBeCloseTo(800)
  })

  it("rounds On-line's outer edge and keeps the island sharp", () => {
    const model = stockModel([withTool(outline('onLine', 40, 20, 5), 4)], sheet, true)!
    // Outer edge: 40×20 grown by 2 with round corners; island 36×16.
    const outer = 44 * 24 - (4 - Math.PI) * 4
    expect(Math.abs(area(model.top) - (SHEET_AREA - outer + 36 * 16))).toBeLessThan(TOLERANCE)
  })

  it('rounds every Lightened cell between its tool wall and its nominal outline', () => {
    const preset: WizardParams = {
      ...DEFAULT_WIZARD_PARAMS,
      operation: 'pocket',
      pocket: { ...DEFAULT_WIZARD_PARAMS.pocket, shape: 'rectLightened', width: 120, height: 80, toolDiameter: 4, ribWidth: 4, offsetX: 0, offsetY: 0 },
    }
    const nominal = pocketVoids(preset.pocket).reduce((sum, v) => sum + ('polygon' in v ? polygonArea(v.polygon) : 0), 0)
    const cut = cutContours(preset).reduce((sum, polygon) => sum + polygonArea(polygon), 0)
    expect(cutContours(preset)).toHaveLength(pocketVoids(preset.pocket).length)
    expect(cut).toBeLessThan(nominal)
    expect(cut).toBeGreaterThan(nominal * 0.8)
  })

  it('falls back to the nominal shape when the tool does not fit', () => {
    const model = stockModel([withTool(pocket(4, 4, 6), 6)], sheet, true)!
    expect(area(model.floors[0].region)).toBeCloseTo(16)
    expect(cutContours(withTool(outline('inside', 4, 4, 5), 6))).toEqual([])
  })

  it('has no cut contour where the shape is already what the tool leaves', () => {
    expect(cutContours(hole(0, 0, 10, 5))).toEqual([])
    expect(cutContours(outline('outside', 40, 20, 5))).toEqual([])
    expect(cutContours({ ...pocket(40, 20, 6), pocket: { ...pocket(40, 20, 6).pocket, shape: 'circle' } })).toEqual([])
  })
})

describe('Lobed Circle (OP-8)', () => {
  const lobed = (offsetMode: 'inside' | 'outside' | 'onLine'): WizardParams => ({
    ...DEFAULT_WIZARD_PARAMS,
    operation: 'outline',
    outline: { ...DEFAULT_WIZARD_PARAMS.outline, shape: 'lobedCircle', offsetMode, toolDiameter: 6, totalDepth: 4 },
  })
  // Main circle ⌀60 alone; the five ⌀16 lobes add less than their own area.
  const MAIN = Math.PI * 30 * 30
  const LOBES = 5 * Math.PI * 8 * 8

  it('Outside: the part is the merged outline; the cut shape adds the rounded notches', () => {
    const nominal = stockModel([lobed('outside')], sheet)!
    expect(nominal.solid).toBe(true)
    expect(area(nominal.top)).toBeGreaterThan(MAIN)
    expect(area(nominal.top)).toBeLessThan(MAIN + LOBES)
    const cut = stockModel([lobed('outside')], sheet, true)!
    expect(area(cut.top)).toBeGreaterThan(area(nominal.top))
    expect(area(cut.top) - area(nominal.top)).toBeLessThan(60)
    expect(cutContours(lobed('outside'))).toHaveLength(1)
    expect(cutContours(lobed('inside'))).toHaveLength(0)
  })

  it('Inside: a through void of the outline in the sheet', () => {
    const model = stockModel([lobed('inside')], sheet)!
    expect(model.solid).toBe(false)
    expect(SHEET_AREA - area(model.top)).toBeGreaterThan(MAIN)
    expect(SHEET_AREA - area(model.top)).toBeLessThan(MAIN + LOBES)
    expect(model.floors).toHaveLength(0)
  })

  it('On-line: a tool-wide band, with the island inside it', () => {
    const model = stockModel([lobed('onLine')], sheet)!
    const removed = SHEET_AREA - area(model.top)
    // Roughly the perimeter (> 2π·30) times the tool diameter.
    expect(removed).toBeGreaterThan(2 * Math.PI * 30 * 6)
    expect(removed).toBeLessThan(MAIN)
  })

  it('pairs with N-Holes on the pitch circle: a hole in every lobe', () => {
    const holes: WizardParams = {
      ...DEFAULT_WIZARD_PARAMS,
      operation: 'holes',
      geometry: { ...DEFAULT_WIZARD_PARAMS.geometry, positioning: 'circle', circleHoleCount: 5, circleDiameter: 70, circleStartAngle: 90, holeDiameter: 6, totalDepth: 4 },
    }
    const part = stockModel([lobed('outside')], sheet)!
    const drilled = stockModel([lobed('outside'), holes], sheet)!
    expect(area(part.top) - area(drilled.top)).toBeCloseTo(5 * circleArea(3), 1)
  })
})

describe('Lobed Circle — Subtract (BL-106)', () => {
  const notched = (offsetMode: 'inside' | 'outside' | 'onLine'): WizardParams => ({
    ...DEFAULT_WIZARD_PARAMS,
    operation: 'outline',
    outline: { ...DEFAULT_WIZARD_PARAMS.outline, shape: 'lobedCircle', lobeMode: 'subtract', lobePitchDiameter: 60, offsetMode, toolDiameter: 6, totalDepth: 4 },
  })
  const MAIN = Math.PI * 30 * 30

  it('Outside: the part is the main circle with the notches cut out, sharp either way', () => {
    const nominal = stockModel([notched('outside')], sheet)!
    expect(nominal.solid).toBe(true)
    expect(area(nominal.top)).toBeLessThan(MAIN)
    expect(area(nominal.top)).toBeGreaterThan(MAIN - 5 * Math.PI * 8 * 8)
    expect(area(stockModel([notched('outside')], sheet, true)!.top)).toBeCloseTo(area(nominal.top), 6)
    expect(cutContours(notched('outside'))).toHaveLength(0)
  })

  it('Inside: the cut shape rounds the teeth — a slightly smaller hole', () => {
    const nominal = SHEET_AREA - area(stockModel([notched('inside')], sheet)!.top)
    const cut = SHEET_AREA - area(stockModel([notched('inside')], sheet, true)!.top)
    expect(cut).toBeLessThan(nominal)
    expect(nominal - cut).toBeLessThan(30)
    expect(cutContours(notched('inside'))).toHaveLength(1)
  })

  it('On-line: a band around the notched outline with the island inside', () => {
    const model = stockModel([notched('onLine')], sheet)!
    const removed = SHEET_AREA - area(model.top)
    expect(removed).toBeGreaterThan(2 * Math.PI * 30 * 6)
    expect(removed).toBeLessThan(MAIN)
  })
})
