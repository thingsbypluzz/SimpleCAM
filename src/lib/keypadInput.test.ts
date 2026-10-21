import { describe, expect, it } from 'vitest'
import { applyKey, stepText } from './keypadInput'

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

describe('stepText', () => {
  it('moves the number by the step, both ways', () => {
    expect(stepText('10', 1)).toBe('11')
    expect(stepText('10', -0.5)).toBe('9.5')
    expect(stepText('0', -1)).toBe('-1')
  })

  it('steps from a number still being typed', () => {
    expect(stepText('4.', 0.1)).toBe('4.1')
    expect(stepText('-2', 1)).toBe('-1')
  })

  it('rounds away floating-point noise, keeping the step’s decimals', () => {
    expect(stepText('0.2', 0.1)).toBe('0.3')
    expect(stepText('0.1', 0.005)).toBe('0.105')
  })

  it('does nothing while the text is not a number', () => {
    expect(stepText('', 1)).toBeNull()
    expect(stepText('-', 1)).toBeNull()
  })
})
