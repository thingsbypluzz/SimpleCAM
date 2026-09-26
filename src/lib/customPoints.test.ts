import { describe, expect, it } from 'vitest'
import { formatCustomPoints, parseCustomPointsText } from './customPoints'

describe('parseCustomPointsText', () => {
  it('accepts comma, semicolon and whitespace separators', () => {
    expect(parseCustomPointsText('10,20\n30;40\n50 60\n-1.5 , 2e1')).toEqual({
      points: [
        { x: 10, y: 20 },
        { x: 30, y: 40 },
        { x: 50, y: 60 },
        { x: -1.5, y: 20 },
      ],
      invalidLines: [],
    })
  })

  it('skips blank lines but keeps real line numbers for errors', () => {
    const result = parseCustomPointsText('10,10\n\n  \nabc\n20,20\n')
    expect(result.points).toEqual([
      { x: 10, y: 10 },
      { x: 20, y: 20 },
    ])
    expect(result.invalidLines).toEqual([4])
  })

  it('reports lines that are not exactly two numbers instead of defaulting to 0', () => {
    const result = parseCustomPointsText('abc\n10\n10 20 30\n10,\n,10\n10,x')
    expect(result.points).toEqual([])
    expect(result.invalidLines).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('rejects decimal commas rather than guessing', () => {
    expect(parseCustomPointsText('10,5, 20,5').invalidLines).toEqual([1])
  })

  it('returns an empty result for empty text', () => {
    expect(parseCustomPointsText('')).toEqual({ points: [], invalidLines: [] })
  })
})

describe('formatCustomPoints', () => {
  it('round-trips through parseCustomPointsText', () => {
    const points = [
      { x: 10, y: 10 },
      { x: -2.5, y: 0 },
    ]
    expect(formatCustomPoints(points)).toBe('10,10\n-2.5,0')
    expect(parseCustomPointsText(formatCustomPoints(points)).points).toEqual(points)
  })
})
