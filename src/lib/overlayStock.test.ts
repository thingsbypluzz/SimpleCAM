import { describe, expect, it } from 'vitest'
import type { MultiPolygon, Ring } from 'polygon-clipping'
import { overlaySheetVoids, sheetMinusVoids, stockVoids } from './overlayStock'
import { DEFAULT_WIZARD_PARAMS, type WizardParams } from '../types/wizard'

const holes = (holeDiameter = 6): WizardParams => ({
  ...DEFAULT_WIZARD_PARAMS,
  operation: 'holes',
  geometry: { ...DEFAULT_WIZARD_PARAMS.geometry, positioning: 'single', holeDiameter, offsetX: 0, offsetY: 0 },
})
const outline = (offsetMode: WizardParams['outline']['offsetMode']): WizardParams => ({
  ...DEFAULT_WIZARD_PARAMS,
  operation: 'outline',
  outline: { ...DEFAULT_WIZARD_PARAMS.outline, shape: 'circle', offsetMode, diameter: 20 },
})
const pocket: WizardParams = { ...DEFAULT_WIZARD_PARAMS, operation: 'pocket' }
const surface: WizardParams = { ...DEFAULT_WIZARD_PARAMS, operation: 'surface' }

const ringArea = (ring: Ring) =>
  Math.abs(ring.reduce((sum, [x, y], i) => {
    const [nx, ny] = ring[(i + 1) % ring.length]
    return sum + x * ny - nx * y
  }, 0)) / 2
const area = (mp: MultiPolygon) =>
  mp.reduce((sum, [outer, ...holesRings]) => sum + ringArea(outer) - holesRings.reduce((s, h) => s + ringArea(h), 0), 0)

describe('stockVoids (BL-75)', () => {
  it('is null for solids: Outline Outside/On-line and Surface', () => {
    expect(stockVoids(outline('outside'))).toBeNull()
    expect(stockVoids(outline('onLine'))).toBeNull()
    expect(stockVoids(surface)).toBeNull()
  })

  it('lists the voids of Hole(s), Pocket and Outline Inside', () => {
    expect(stockVoids(holes())).toEqual([{ circle: { x: 0, y: 0 }, radius: 3 }])
    expect(stockVoids(outline('inside'))).toEqual([{ circle: { x: 0, y: 0 }, radius: 10 }])
    // Default Pocket: Rectangle Cornered 50×30 at the origin.
    expect(stockVoids(pocket)).toEqual([
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

  it('drops the shared sheet as soon as one overlaid preset is a solid', () => {
    expect(overlaySheetVoids([holes(), pocket])).toHaveLength(2)
    expect(overlaySheetVoids([holes(), outline('outside')])).toBeNull()
  })
})

describe('sheetMinusVoids', () => {
  const sheet = { minX: -50, minY: -50, maxX: 50, maxY: 50 }

  it('cuts separate voids as separate holes', () => {
    const result = sheetMinusVoids(sheet, [
      { circle: { x: -20, y: 0 }, radius: 5 },
      { circle: { x: 20, y: 0 }, radius: 5 },
    ])
    expect(result).toHaveLength(1)
    expect(result[0]).toHaveLength(3)
  })

  it('merges overlapping voids into one hole', () => {
    const result = sheetMinusVoids(sheet, [
      { circle: { x: -3, y: 0 }, radius: 5 },
      { circle: { x: 3, y: 0 }, radius: 5 },
      {
        polygon: [
          { x: 0, y: -2 },
          { x: 20, y: -2 },
          { x: 20, y: 2 },
          { x: 0, y: 2 },
        ],
      },
    ])
    expect(result).toHaveLength(1)
    expect(result[0]).toHaveLength(2)
    // Sheet minus the union: less than one full circle's worth removed twice.
    expect(area(result)).toBeGreaterThan(100 * 100 - 2 * Math.PI * 25 - 80)
    expect(area(result)).toBeLessThan(100 * 100 - Math.PI * 25)
  })

  it('keeps material enclosed by a ring of voids as its own island', () => {
    const ring = Array.from({ length: 12 }, (_, i) => {
      const a = (2 * Math.PI * i) / 12
      return { circle: { x: 20 * Math.cos(a), y: 20 * Math.sin(a) }, radius: 6 }
    })
    expect(sheetMinusVoids(sheet, ring)).toHaveLength(2)
  })

  it('returns the whole sheet without voids', () => {
    expect(area(sheetMinusVoids(sheet, []))).toBeCloseTo(100 * 100)
  })
})
