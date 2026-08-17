import { describe, expect, it } from 'vitest'
import { resolvePoints } from './positioning'
import type { GeometryParams } from '../types/wizard'

const base: GeometryParams = {
  toolDiameter: 3.175,
  holeDiameter: 8,
  totalDepth: 4,
  positioning: 'single',
  gridX: 50,
  gridY: 30,
  customPoints: [],
  offsetX: 0,
  offsetY: 0,
}

describe('resolvePoints', () => {
  it('single returns exactly (0,0)', () => {
    expect(resolvePoints({ ...base, positioning: 'single' })).toEqual([{ x: 0, y: 0 }])
  })

  it('grid returns the 4 corners in order', () => {
    expect(resolvePoints({ ...base, positioning: 'grid' })).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 30 },
      { x: 0, y: 30 },
    ])
  })

  it('gridCentered returns the 4 corners centered on (0,0), same order as grid', () => {
    expect(resolvePoints({ ...base, positioning: 'gridCentered' })).toEqual([
      { x: -25, y: -15 },
      { x: 25, y: -15 },
      { x: 25, y: 15 },
      { x: -25, y: 15 },
    ])
  })

  it('custom returns the provided points as-is', () => {
    const customPoints = [
      { x: 10, y: 10 },
      { x: -5, y: 20 },
    ]
    expect(resolvePoints({ ...base, positioning: 'custom', customPoints })).toEqual(customPoints)
  })

  it('offset shifts single', () => {
    expect(resolvePoints({ ...base, positioning: 'single', offsetX: 2, offsetY: -1.5 })).toEqual([
      { x: 2, y: -1.5 },
    ])
  })

  it('offset shifts every grid corner uniformly', () => {
    expect(resolvePoints({ ...base, positioning: 'grid', offsetX: 5, offsetY: 10 })).toEqual([
      { x: 5, y: 10 },
      { x: 55, y: 10 },
      { x: 55, y: 40 },
      { x: 5, y: 40 },
    ])
  })

  it('offset shifts every gridCentered corner uniformly', () => {
    expect(
      resolvePoints({ ...base, positioning: 'gridCentered', offsetX: 5, offsetY: 10 }),
    ).toEqual([
      { x: -20, y: -5 },
      { x: 30, y: -5 },
      { x: 30, y: 25 },
      { x: -20, y: 25 },
    ])
  })

  it('offset shifts every custom point uniformly', () => {
    const customPoints = [
      { x: 10, y: 10 },
      { x: -5, y: 20 },
    ]
    expect(
      resolvePoints({ ...base, positioning: 'custom', customPoints, offsetX: 1, offsetY: 1 }),
    ).toEqual([
      { x: 11, y: 11 },
      { x: -4, y: 21 },
    ])
  })
})
