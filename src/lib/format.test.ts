import { describe, expect, it } from 'vitest'
import { fmt } from './format'

describe('fmt', () => {
  it('rounds to 4 decimals', () => {
    expect(fmt(3.14159265)).toBe('3.1416')
  })

  it('strips trailing zeros', () => {
    expect(fmt(3.175)).toBe('3.175')
    expect(fmt(800)).toBe('800')
    expect(fmt(0)).toBe('0')
  })

  it('normalizes negative zero to "0"', () => {
    expect(fmt(-0.00001)).toBe('0')
  })

  it('preserves negative values', () => {
    expect(fmt(-4)).toBe('-4')
    expect(fmt(-1.5)).toBe('-1.5')
  })
})
