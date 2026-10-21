import { describe, expect, it } from 'vitest'
import { applyKey, stepText } from './keypadInput'

describe('applyKey', () => {
  it('extends the text with a digit', () => {
    expect(applyKey('47', '1')).toBe('471')
    expect(applyKey('', '0')).toBe('0')
  })

  it('keeps the value when a field is entered — the first key extends it', () => {
    expect(applyKey('12.5', '6')).toBe('12.56')
    expect(applyKey('12.5', 'back')).toBe('12.')
  })

  it('clears the field', () => {
    expect(applyKey('47.1', 'clear')).toBe('')
    expect(applyKey('', 'clear')).toBe('')
  })

  it('accepts one decimal point', () => {
    expect(applyKey('47', '.')).toBe('47.')
    expect(applyKey('47.', '.')).toBe('47.')
    expect(applyKey('4.7', '.')).toBe('4.7')
    expect(applyKey('', '.')).toBe('0.')
    expect(applyKey('-', '.')).toBe('-0.')
  })

  it('deletes the last character', () => {
    expect(applyKey('47.1', 'back')).toBe('47.')
    expect(applyKey('', 'back')).toBe('')
  })

  it('flips the sign of what is there', () => {
    expect(applyKey('12', 'sign')).toBe('-12')
    expect(applyKey('-12', 'sign')).toBe('12')
    expect(applyKey('', 'sign')).toBe('-')
  })

  it('builds numbers the fields can parse', () => {
    const typed = (['sign', '1', '2', '.', '5'] as const).reduce((text, key) => applyKey(text, key), '')
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
