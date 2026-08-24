import { describe, expect, it } from 'vitest'
import { patternLabel, patternSlug } from './positioningMeta'
import { DEFAULT_WIZARD_PARAMS } from '../types/wizard'

const geometry = DEFAULT_WIZARD_PARAMS.geometry

describe('patternLabel', () => {
  it('labels single', () => {
    expect(patternLabel({ ...geometry, positioning: 'single' })).toBe('Single Hole')
  })

  it('labels grid with dimensions', () => {
    expect(patternLabel({ ...geometry, positioning: 'grid', gridX: 50, gridY: 30 })).toBe(
      'Rectangle 50×30',
    )
  })

  it('labels gridCentered with dimensions', () => {
    expect(
      patternLabel({ ...geometry, positioning: 'gridCentered', gridX: 50, gridY: 30 }),
    ).toBe('Rectangle Centered 50×30')
  })

  it('labels grid as 2 holes when gridX is 0', () => {
    expect(patternLabel({ ...geometry, positioning: 'grid', gridX: 0, gridY: 30 })).toBe(
      '2 Holes (30mm apart)',
    )
  })

  it('labels grid as 2 holes when gridY is 0', () => {
    expect(patternLabel({ ...geometry, positioning: 'grid', gridX: 50, gridY: 0 })).toBe(
      '2 Holes (50mm apart)',
    )
  })

  it('falls back to plain dimensions when grid gridX and gridY are both 0', () => {
    expect(patternLabel({ ...geometry, positioning: 'grid', gridX: 0, gridY: 0 })).toBe(
      'Rectangle 0×0',
    )
  })

  it('labels gridCentered as 2 holes when gridX is 0', () => {
    expect(
      patternLabel({ ...geometry, positioning: 'gridCentered', gridX: 0, gridY: 30 }),
    ).toBe('2 Holes (30mm apart)')
  })

  it('labels circle with hole count', () => {
    expect(patternLabel({ ...geometry, positioning: 'circle', circleHoleCount: 5 })).toBe(
      '5-Holes Circle',
    )
  })

  it('labels custom with point count', () => {
    expect(
      patternLabel({
        ...geometry,
        positioning: 'custom',
        customPoints: [
          { x: 1, y: 1 },
          { x: 2, y: 2 },
          { x: 3, y: 3 },
        ],
      }),
    ).toBe('Custom (3)')
  })
})

describe('patternSlug', () => {
  it('slugs each positioning mode, filename-safe', () => {
    expect(patternSlug({ ...geometry, positioning: 'single' })).toBe('single')
    expect(patternSlug({ ...geometry, positioning: 'grid' })).toBe('grid')
    expect(patternSlug({ ...geometry, positioning: 'gridCentered' })).toBe('grid-centered')
    expect(patternSlug({ ...geometry, positioning: 'circle', circleHoleCount: 5 })).toBe(
      '5holes-circle',
    )
    expect(patternSlug({ ...geometry, positioning: 'custom' })).toBe('custom')
  })
})
