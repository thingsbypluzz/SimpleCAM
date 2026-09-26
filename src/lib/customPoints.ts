import type { Point2D } from '../types/wizard'

export interface ParsedCustomPoints {
  points: Point2D[]
  // 1-based line numbers (counting blank lines too, so they match what the
  // user sees in the textarea) of every non-blank line that isn't exactly
  // two finite numbers.
  invalidLines: number[]
}

// BL-48: a line is valid only if it's exactly two finite numbers separated
// by a comma, semicolon or whitespace — anything else is reported instead
// of silently becoming a hole at (0,0)/(x,0). Decimal commas ("10,5, 20,5")
// split into four tokens and are rejected rather than guessed at. Invalid
// lines are left out of `points`, so the preview only ever shows real ones.
export function parseCustomPointsText(text: string): ParsedCustomPoints {
  const points: Point2D[] = []
  const invalidLines: number[] = []
  text.split('\n').forEach((raw, index) => {
    const line = raw.trim()
    if (!line) return
    const tokens = line.split(/[\s,;]+/)
    const [x, y] = tokens.map(Number)
    // Empty tokens ("10," / ",10") must fail explicitly — Number('') is 0.
    if (tokens.length === 2 && tokens.every(Boolean) && Number.isFinite(x) && Number.isFinite(y)) {
      points.push({ x, y })
    } else {
      invalidLines.push(index + 1)
    }
  })
  return { points, invalidLines }
}

export function formatCustomPoints(points: Point2D[]): string {
  return points.map((p) => `${p.x},${p.y}`).join('\n')
}
