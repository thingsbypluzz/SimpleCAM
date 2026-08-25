import { describe, expect, it } from 'vitest'
import { offsetModeLabel, outlineMethodFamily, outlineShapeLabel, outlineShapeSlug } from './outlineMeta'
import { DEFAULT_WIZARD_PARAMS } from '../types/wizard'

const outline = DEFAULT_WIZARD_PARAMS.outline

describe('offsetModeLabel', () => {
  it('labels each offset mode', () => {
    expect(offsetModeLabel('inside')).toBe('Inside')
    expect(offsetModeLabel('outside')).toBe('Outside')
    expect(offsetModeLabel('onLine')).toBe('On-line')
  })
})

describe('outlineMethodFamily', () => {
  it('maps both rectangle shapes to "rect" and circle to "circle"', () => {
    expect(outlineMethodFamily('rectCornered')).toBe('rect')
    expect(outlineMethodFamily('rectCentered')).toBe('rect')
    expect(outlineMethodFamily('circle')).toBe('circle')
  })
})

describe('outlineShapeLabel', () => {
  it('labels rectCornered with dimensions and offset mode', () => {
    expect(
      outlineShapeLabel({ ...outline, shape: 'rectCornered', width: 50, height: 30, offsetMode: 'inside' }),
    ).toBe('Rectangle 50×30 (Inside)')
  })

  it('labels rectCentered with dimensions and offset mode', () => {
    expect(
      outlineShapeLabel({ ...outline, shape: 'rectCentered', width: 50, height: 30, offsetMode: 'outside' }),
    ).toBe('Rectangle Centered 50×30 (Outside)')
  })

  it('labels circle with diameter and offset mode', () => {
    expect(outlineShapeLabel({ ...outline, shape: 'circle', diameter: 45, offsetMode: 'onLine' })).toBe(
      'Circle ⌀45 (On-line)',
    )
  })
})

describe('outlineShapeSlug', () => {
  it('slugs each shape, filename-safe', () => {
    expect(outlineShapeSlug({ ...outline, shape: 'rectCornered' })).toBe('rectangle')
    expect(outlineShapeSlug({ ...outline, shape: 'rectCentered' })).toBe('rectangle-centered')
    expect(outlineShapeSlug({ ...outline, shape: 'circle' })).toBe('circle-outline')
  })
})
