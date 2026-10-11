import { describe, expect, it } from 'vitest'
import { applyKey } from './keypadInput'

describe('applyKey', () => {
  it('extends the text with a digit', () => {
    expect(applyKey('47', '1', false)).toBe('471')
    expect(applyKey('', '0', false)).toBe('0')
  })

  it('starts a new number on the first key after entering a field', () => {
    expect(applyKey('47.1', '5', true)).toBe('5')
    expect(applyKey('47.1', '.', true)).toBe('0.')
    expect(applyKey('47.1', 'back', true)).toBe('')
  })

  it('accepts one decimal point', () => {
    expect(applyKey('47', '.', false)).toBe('47.')
    expect(applyKey('47.', '.', false)).toBe('47.')
    expect(applyKey('4.7', '.', false)).toBe('4.7')
    expect(applyKey('', '.', false)).toBe('0.')
    expect(applyKey('-', '.', false)).toBe('-0.')
  })

  it('deletes the last character', () => {
    expect(applyKey('47.1', 'back', false)).toBe('47.')
    expect(applyKey('', 'back', false)).toBe('')
  })

  it('flips the sign of what is there, also right after entering a field', () => {
    expect(applyKey('12', 'sign', false)).toBe('-12')
    expect(applyKey('-12', 'sign', false)).toBe('12')
    expect(applyKey('12', 'sign', true)).toBe('-12')
    expect(applyKey('', 'sign', false)).toBe('-')
  })

  it('builds numbers the fields can parse', () => {
    const typed = (['sign', '1', '2', '.', '5'] as const).reduce((text, key) => applyKey(text, key, false), '')
    expect(Number(typed)).toBe(-12.5)
  })
})
