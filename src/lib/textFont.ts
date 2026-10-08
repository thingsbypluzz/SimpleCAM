import type { Point2D } from '../types/wizard'

// Single-line ("stroke") fonts for the Text operation (OP-4): every glyph is
// a set of open paths — the line the tool follows — not an outline. They
// come as SVG 1.1 fonts (the format the open single-line fonts are
// distributed in) and are read by the small parser below: no font library,
// no DOM, so it runs the same in the browser, in tests and in Node.
//
// Coordinates are font units, Y up, the baseline at 0.

// One piece of a glyph path after its start point: a straight line to
// [x, y] or a cubic Bézier [x1, y1, x2, y2, x, y].
export type FontSegment = [number, number] | [number, number, number, number, number, number]

export interface FontPath {
  start: [number, number]
  segments: FontSegment[]
}

export interface FontGlyph {
  advance: number
  paths: FontPath[]
}

export interface StrokeFont {
  unitsPerEm: number
  // Height of a capital letter — what the Text operation's Height sets.
  capHeight: number
  glyphs: Map<string, FontGlyph>
  // Kerning adjustment (font units, positive = closer) for a pair of
  // characters, keyed by the two characters joined.
  kerning: Map<string, number>
}

const NUMBER = /[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/g

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*"([^"]*)"`).exec(tag)
  return match ? decodeEntities(match[1]) : null
}

// SVG path data → absolute lines and cubics. Handles every command a font
// uses (M L H V C S Q T Z, either case); quadratics are raised to cubics. An
// arc (A) — which no stroke font here uses — ends the path at that point.
export function parsePathData(d: string): FontPath[] {
  const paths: FontPath[] = []
  let current: FontPath | null = null
  let x = 0
  let y = 0
  let startX = 0
  let startY = 0
  // Last control point, for the smooth commands (S, T).
  let lastCubic: [number, number] | null = null
  let lastQuad: [number, number] | null = null

  const lineTo = (nx: number, ny: number) => {
    current?.segments.push([nx, ny])
    x = nx
    y = ny
  }
  const cubicTo = (x1: number, y1: number, x2: number, y2: number, nx: number, ny: number) => {
    current?.segments.push([x1, y1, x2, y2, nx, ny])
    x = nx
    y = ny
  }
  const quadTo = (qx: number, qy: number, nx: number, ny: number) => {
    cubicTo(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), nx + (2 / 3) * (qx - nx), ny + (2 / 3) * (qy - ny), nx, ny)
  }

  for (const match of d.matchAll(/([a-zA-Z])([^a-zA-Z]*)/g)) {
    const command = match[1]
    const args = (match[2].match(NUMBER) ?? []).map(Number)
    const relative = command === command.toLowerCase()
    const kind = command.toUpperCase()
    const take = (count: number, each: (values: number[], index: number) => void) => {
      for (let i = 0; i + count <= args.length; i += count) each(args.slice(i, i + count), i / count)
    }
    if (kind === 'Z') {
      if (current && (x !== startX || y !== startY)) lineTo(startX, startY)
      lastCubic = lastQuad = null
      continue
    }
    if (kind === 'M') {
      take(2, ([ax, ay], index) => {
        const nx = relative ? x + ax : ax
        const ny = relative ? y + ay : ay
        if (index === 0) {
          current = { start: [nx, ny], segments: [] }
          paths.push(current)
          x = startX = nx
          y = startY = ny
        } else {
          lineTo(nx, ny)
        }
      })
      lastCubic = lastQuad = null
    } else if (kind === 'L') {
      take(2, ([ax, ay]) => lineTo(relative ? x + ax : ax, relative ? y + ay : ay))
      lastCubic = lastQuad = null
    } else if (kind === 'H') {
      take(1, ([ax]) => lineTo(relative ? x + ax : ax, y))
      lastCubic = lastQuad = null
    } else if (kind === 'V') {
      take(1, ([ay]) => lineTo(x, relative ? y + ay : ay))
      lastCubic = lastQuad = null
    } else if (kind === 'C') {
      take(6, (v) => {
        const [x1, y1, x2, y2, nx, ny] = relative ? [x + v[0], y + v[1], x + v[2], y + v[3], x + v[4], y + v[5]] : v
        cubicTo(x1, y1, x2, y2, nx, ny)
        lastCubic = [x2, y2]
      })
      lastQuad = null
    } else if (kind === 'S') {
      take(4, (v) => {
        const [x2, y2, nx, ny] = relative ? [x + v[0], y + v[1], x + v[2], y + v[3]] : v
        const x1: number = lastCubic ? 2 * x - lastCubic[0] : x
        const y1: number = lastCubic ? 2 * y - lastCubic[1] : y
        cubicTo(x1, y1, x2, y2, nx, ny)
        lastCubic = [x2, y2]
      })
      lastQuad = null
    } else if (kind === 'Q') {
      take(4, (v) => {
        const [qx, qy, nx, ny] = relative ? [x + v[0], y + v[1], x + v[2], y + v[3]] : v
        quadTo(qx, qy, nx, ny)
        lastQuad = [qx, qy]
      })
      lastCubic = null
    } else if (kind === 'T') {
      take(2, (v) => {
        const [nx, ny] = relative ? [x + v[0], y + v[1]] : v
        const qx: number = lastQuad ? 2 * x - lastQuad[0] : x
        const qy: number = lastQuad ? 2 * y - lastQuad[1] : y
        quadTo(qx, qy, nx, ny)
        lastQuad = [qx, qy]
      })
      lastCubic = null
    } else {
      break
    }
  }
  return paths.filter((p) => p.segments.length > 0)
}

// Reads an SVG font. Only single-character glyphs are kept (ligatures and
// alternates are not used); kerning pairs given by glyph name or by
// character are both understood.
export function parseSvgFont(svg: string): StrokeFont {
  const fontTag = /<font\b[^>]*>/.exec(svg)?.[0] ?? ''
  const faceTag = /<font-face\b[^>]*>/.exec(svg)?.[0] ?? ''
  const defaultAdvance = Number(attribute(fontTag, 'horiz-adv-x') ?? 0)
  const unitsPerEm = Number(attribute(faceTag, 'units-per-em') ?? 1000)
  const glyphs = new Map<string, FontGlyph>()
  const charByName = new Map<string, string>()
  for (const match of svg.matchAll(/<glyph\b[^>]*>/g)) {
    const tag = match[0]
    const unicode = attribute(tag, 'unicode')
    if (unicode === null || [...unicode].length !== 1) continue
    const advance = attribute(tag, 'horiz-adv-x')
    glyphs.set(unicode, {
      advance: advance === null ? defaultAdvance : Number(advance),
      paths: parsePathData(attribute(tag, 'd') ?? ''),
    })
    const name = attribute(tag, 'glyph-name')
    if (name !== null) charByName.set(name, unicode)
  }

  const kerning = new Map<string, number>()
  const list = (tag: string, byName: string, byChar: string): string[] => {
    const names = attribute(tag, byName)
    const chars = attribute(tag, byChar)
    return [
      ...(names ? names.split(',').flatMap((n) => charByName.get(n.trim()) ?? []) : []),
      ...(chars ? chars.split(',').filter((c) => [...c].length === 1) : []),
    ]
  }
  for (const match of svg.matchAll(/<hkern\b[^>]*>/g)) {
    const tag = match[0]
    const k = Number(attribute(tag, 'k'))
    if (!Number.isFinite(k) || k === 0) continue
    for (const first of list(tag, 'g1', 'u1')) {
      for (const second of list(tag, 'g2', 'u2')) kerning.set(first + second, k)
    }
  }

  // Cap height: the font's own figure, or the top of "H" when it gives none.
  let capHeight = Number(attribute(faceTag, 'cap-height'))
  if (!(capHeight > 0)) {
    const ys = (glyphs.get('H')?.paths ?? []).flatMap((p) => [p.start[1], ...p.segments.map((s) => s[s.length - 1])])
    capHeight = ys.length > 0 ? Math.max(...ys) : unitsPerEm * 0.7
  }
  return { unitsPerEm, capHeight, glyphs, kerning }
}

// A cubic sampled into straight pieces no further than `tolerance` from the
// curve (same units as the points). The bound is the classic one: n pieces
// leave an error of at most 0.75·M/n², M being the largest second
// difference of the control points.
export function flattenCubic(p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D, tolerance: number): Point2D[] {
  const dd = Math.max(
    Math.hypot(p0.x - 2 * p1.x + p2.x, p0.y - 2 * p1.y + p2.y),
    Math.hypot(p1.x - 2 * p2.x + p3.x, p1.y - 2 * p2.y + p3.y),
  )
  const n = Math.min(64, Math.max(1, Math.ceil(Math.sqrt((0.75 * dd) / Math.max(tolerance, 1e-9)))))
  const points: Point2D[] = []
  for (let i = 1; i <= n; i++) {
    const t = i / n
    const u = 1 - t
    const a = u * u * u
    const b = 3 * u * u * t
    const c = 3 * u * t * t
    const d = t * t * t
    points.push({ x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y })
  }
  points[points.length - 1] = { x: p3.x, y: p3.y }
  return points
}

// Fonts that are ready to use. The engine and the previews are synchronous
// and read from here; the font files themselves are fetched on first use
// (config/textFonts.ts) and registered once parsed.
const loadedFonts = new Map<string, StrokeFont>()

export function registerFont(id: string, font: StrokeFont): void {
  loadedFonts.set(id, font)
}

export function getLoadedFont(id: string): StrokeFont | null {
  return loadedFonts.get(id) ?? null
}
