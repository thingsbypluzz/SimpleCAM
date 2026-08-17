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

  it('custom returns the provided points as-is', () => {
    const customPoints = [
      { x: 10, y: 10 },
      { x: -5, y: 20 },
    ]
    expect(resolvePoints({ ...base, positioning: 'custom', customPoints })).toEqual(customPoints)
  })
})
