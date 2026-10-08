import type { Point2D, TextParams } from '../types/wizard'
import { flattenCubic, getLoadedFont, type StrokeFont } from './textFont'

// Where the Text operation's strokes go (OP-4): the written text laid out in
// program coordinates, as polylines the tool follows. Pure — the engine,
// validation and both previews all read this one layout.

// Curves are sampled so no point is further than this from the true curve.
const CURVE_TOLERANCE_MM = 0.01
// A stroke shorter than this is a dot: one plunge, no travel.
const MIN_STROKE_MM = 1e-6

export interface TextLayoutResult {
  // false while the font is still being fetched — nothing can be drawn yet.
  fontReady: boolean
  strokes: Point2D[][]
  // Characters the font has no glyph for, each once, in order of appearance.
  missing: string[]
  // Extent of the strokes (tool-center path); null when there are none.
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null
  // Width of the widest line and height of the block, before turning — the
  // Step 2 readout.
  width: number
  blockHeight: number
}

const EMPTY: Omit<TextLayoutResult, 'fontReady'> = { strokes: [], missing: [], bounds: null, width: 0, blockHeight: 0 }

// The lines to write: Straight keeps the user's line breaks; On Circle is a
// single line (a break reads as a space). Trailing spaces are kept — they
// are part of the spacing the user typed.
export function textLines(text: Pick<TextParams, 'layout' | 'text'>): string[] {
  const lines = text.text.replace(/\r\n?/g, '\n').split('\n')
  return text.layout === 'circle' ? [lines.join(' ')] : lines
}

interface PlacedGlyph {
  char: string
  x: number // start of the glyph's advance, mm
  advance: number // mm
}

interface LineLayout {
  glyphs: PlacedGlyph[]
  width: number
}

function layoutLine(line: string, font: StrokeFont, scale: number, extra: number, missing: Set<string>): LineLayout {
  const glyphs: PlacedGlyph[] = []
  let x = 0
  let previous: string | null = null
  for (const char of line) {
    const glyph = font.glyphs.get(char)
    if (!glyph) {
      missing.add(char)
      previous = null
      continue
    }
    if (previous !== null) x -= (font.kerning.get(previous + char) ?? 0) * scale
    if (glyphs.length > 0) x += extra
    const advance = glyph.advance * scale
    glyphs.push({ char, x, advance })
    x += advance
    previous = char
  }
  return { glyphs, width: x }
}

// A glyph's strokes in mm, relative to the start of its advance on the
// baseline.
function glyphStrokes(font: StrokeFont, char: string, scale: number): Point2D[][] {
  const glyph = font.glyphs.get(char)
  if (!glyph) return []
  return glyph.paths.map((path) => {
    const points: Point2D[] = [{ x: path.start[0] * scale, y: path.start[1] * scale }]
    for (const s of path.segments) {
      const from = points[points.length - 1]
      if (s.length === 2) {
        points.push({ x: s[0] * scale, y: s[1] * scale })
      } else {
        points.push(
          ...flattenCubic(
            from,
            { x: s[0] * scale, y: s[1] * scale },
            { x: s[2] * scale, y: s[3] * scale },
            { x: s[4] * scale, y: s[5] * scale },
            CURVE_TOLERANCE_MM,
          ),
        )
      }
    }
    return points
  })
}

// Drops repeated points; a stroke that never leaves its start is one point.
function tidy(stroke: Point2D[]): Point2D[] {
  const out: Point2D[] = [stroke[0]]
  for (const p of stroke) {
    const last = out[out.length - 1]
    if (Math.hypot(p.x - last.x, p.y - last.y) > MIN_STROKE_MM) out.push(p)
  }
  return out
}

// Validation, the engine and both previews all ask for the same layout on
// every render — one result per params object and font.
const layoutCache = new WeakMap<TextParams, { font: StrokeFont | null; result: TextLayoutResult }>()

export function layoutText(text: TextParams, font: StrokeFont | null = getLoadedFont(text.fontId)): TextLayoutResult {
  const cached = layoutCache.get(text)
  if (cached && cached.font === font) return cached.result
  const result = computeLayout(text, font)
  layoutCache.set(text, { font, result })
  return result
}

function computeLayout(text: TextParams, font: StrokeFont | null): TextLayoutResult {
  if (!font) return { fontReady: false, ...EMPTY }
  if (!(text.height > 0) || !(font.capHeight > 0)) return { fontReady: true, ...EMPTY }
  const scale = text.height / font.capHeight
  const extra = (text.height * text.letterSpacingPercent) / 100
  const missing = new Set<string>()
  const lines = textLines(text).map((line) => layoutLine(line, font, scale, extra, missing))
  const width = Math.max(0, ...lines.map((l) => l.width))
  const strokes: Point2D[][] = []
  let blockHeight = 0

  if (text.layout === 'circle') {
    const line = lines[0]
    const r = text.circleDiameter / 2
    blockHeight = text.height
    if (r > 0) {
      const center = (text.circleAngleDeg * Math.PI) / 180
      // Outside: heads away from the center, reading clockwise. Inside:
      // heads toward it, reading counter-clockwise. Mirrored writing runs
      // the other way round — the glyph's own +X follows `run`, so every
      // glyph comes out flipped with it.
      const outside = text.circleSide === 'outside'
      const run = (outside ? -1 : 1) * (text.mirror ? -1 : 1)
      for (const g of line.glyphs) {
        const along = g.x + g.advance / 2 - line.width / 2
        const theta = center + (run * along) / r
        const radial = { x: Math.cos(theta), y: Math.sin(theta) }
        const up = outside ? radial : { x: -radial.x, y: -radial.y }
        // The glyph's own +X: the reading direction along the circle.
        const tangent = { x: -Math.sin(theta) * run, y: Math.cos(theta) * run }
        for (const stroke of glyphStrokes(font, g.char, scale)) {
          strokes.push(
            stroke.map((p) => {
              const lx = p.x - g.advance / 2
              return {
                x: text.offsetX + radial.x * r + tangent.x * lx + up.x * p.y,
                y: text.offsetY + radial.y * r + tangent.y * lx + up.y * p.y,
              }
            }),
          )
        }
      }
    }
  } else {
    const pitch = text.height * text.lineSpacing
    blockHeight = text.height + pitch * (lines.length - 1)
    const originX = text.originX === 'left' ? 0 : text.originX === 'center' ? width / 2 : width
    // Baseline of the first line sits at 0; lines go down from there.
    const originY = text.originY === 'baseline' ? 0 : text.height - blockHeight / 2
    const angle = (text.angleDeg * Math.PI) / 180
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    lines.forEach((line, index) => {
      const lineX = text.align === 'left' ? 0 : text.align === 'center' ? (width - line.width) / 2 : width - line.width
      const lineY = -pitch * index
      for (const g of line.glyphs) {
        for (const stroke of glyphStrokes(font, g.char, scale)) {
          strokes.push(
            stroke.map((p) => {
              let x = lineX + g.x + p.x - originX
              const y = lineY + p.y - originY
              if (text.mirror) x = -x
              return { x: text.offsetX + x * cos - y * sin, y: text.offsetY + x * sin + y * cos }
            }),
          )
        }
      }
    })
  }

  const tidied = strokes.map(tidy)
  let bounds: TextLayoutResult['bounds'] = null
  for (const stroke of tidied) {
    for (const p of stroke) {
      bounds = bounds
        ? { minX: Math.min(bounds.minX, p.x), minY: Math.min(bounds.minY, p.y), maxX: Math.max(bounds.maxX, p.x), maxY: Math.max(bounds.maxY, p.y) }
        : { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y }
    }
  }
  return { fontReady: true, strokes: tidied, missing: [...missing], bounds, width, blockHeight }
}

// Width of the groove at the surface: a V-bit's grows with depth, an end
// mill's is its diameter. Previews only — the toolpath is the same.
export function textGrooveWidth(text: Pick<TextParams, 'bit' | 'vbitAngleDeg' | 'toolDiameter' | 'totalDepth'>): number {
  if (text.bit === 'endmill') return Math.max(0, text.toolDiameter)
  const half = (Math.min(179, Math.max(1, text.vbitAngleDeg)) * Math.PI) / 360
  return 2 * Math.max(0, text.totalDepth) * Math.tan(half)
}
