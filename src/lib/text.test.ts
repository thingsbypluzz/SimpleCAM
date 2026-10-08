import { describe, expect, it } from 'vitest'
import { DEFAULT_WIZARD_PARAMS, type TextParams, type WizardParams } from '../types/wizard'
import { DEFAULT_MACHINE_SETTINGS } from '../types/machine'
import { flattenCubic, getLoadedFont, parsePathData, parseSvgFont } from './textFont'
import { layoutText, textGrooveWidth, textLines } from './textLayout'
import { buildTextToolpath, generateText } from './text'
import { loadTestFont } from './textTestUtils'
import { isWizardParamsValid, textMissingCharacters, OPERATION_RULES, isTextBitValid, isTextContentValid } from './validation'
import { forcedLinearReason } from './interpolation'
import { presetLabel } from './presetLabel'
import { buildFilename } from './download'

const font = loadTestFont('relief')

const text = (patch: Partial<TextParams> = {}): TextParams => ({ ...DEFAULT_WIZARD_PARAMS.text, ...patch })
const params = (patch: Partial<TextParams> = {}, feeds: Partial<WizardParams['feeds']> = {}): WizardParams => ({
  ...DEFAULT_WIZARD_PARAMS,
  operation: 'text',
  text: text(patch),
  feeds: { ...DEFAULT_WIZARD_PARAMS.feeds, ...feeds },
})

describe('SVG path data', () => {
  it('reads absolute and relative lines', () => {
    expect(parsePathData('M155 213h367M606 0l-264 675h-4l-268 -675')).toEqual([
      { start: [155, 213], segments: [[522, 213]] },
      { start: [606, 0], segments: [[342, 675], [338, 675], [70, 0]] },
    ])
  })

  it('reads cubics, smooth cubics and vertical moves', () => {
    const [path] = parsePathData('M0 0c10 0 20 10 20 20s10 20 20 20v-5')
    expect(path.segments).toEqual([
      [10, 0, 20, 10, 20, 20],
      // Smooth: the first control point mirrors the previous second one.
      [20, 30, 30, 40, 40, 40],
      [40, 35],
    ])
  })

  it('raises quadratics to cubics and closes paths with a line', () => {
    const [path] = parsePathData('M0 0Q30 60 60 0z')
    expect(path.segments[0]).toEqual([20, 40, 40, 40, 60, 0])
    expect(path.segments[1]).toEqual([0, 0])
  })

  it('drops a move with nothing drawn', () => {
    expect(parsePathData('M5 5')).toEqual([])
  })
})

describe('flattenCubic', () => {
  it('stays within the tolerance of the curve and ends on its end point', () => {
    const p = [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 0 }]
    const coarse = flattenCubic(p[0], p[1], p[2], p[3], 0.5)
    const fine = flattenCubic(p[0], p[1], p[2], p[3], 0.005)
    expect(fine.length).toBeGreaterThan(coarse.length)
    expect(fine[fine.length - 1]).toEqual({ x: 10, y: 0 })
    // The curve's top is at t = 0.5: (5, 7.5).
    const top = Math.max(...fine.map((q) => q.y))
    expect(top).toBeGreaterThan(7.5 - 0.005)
    expect(top).toBeLessThanOrEqual(7.5 + 1e-9)
  })

  it('needs one piece for a straight "curve"', () => {
    expect(flattenCubic({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, 0.01)).toHaveLength(1)
  })
})

describe('Relief SingleLine', () => {
  it('has the Polish alphabet, digits and punctuation, all as open strokes', () => {
    for (const c of 'AĄBCĆDEĘFGHIJKLŁMNŃOÓPRSŚTUWYZŹŻaąbcćdeęfghijklłmnńoóprsśtuwyzźż0123456789.,:;!?-+()/') {
      const glyph = font.glyphs.get(c)
      expect(glyph, c).toBeDefined()
      expect(glyph!.paths.length, c).toBeGreaterThan(0)
    }
    expect(font.glyphs.get(' ')!.paths).toHaveLength(0)
    expect(font.capHeight).toBe(680)
    expect(font.unitsPerEm).toBe(1000)
  })

  it('carries kerning pairs', () => {
    expect(font.kerning.size).toBeGreaterThan(100)
    expect(font.kerning.get('AV')).toBeGreaterThan(0)
  })

  it('reads a minimal font: default advance, entities, missing cap height', () => {
    const tiny = parseSvgFont(
      '<font horiz-adv-x="500"><font-face units-per-em="1000"/><glyph glyph-name="H" unicode="H" d="M0 0v700"/><glyph unicode="&#x105;" horiz-adv-x="300" d="M0 0h10"/><glyph unicode="fi" d="M0 0h1"/><hkern u1="H" u2="&#x105;" k="40"/></font>',
    )
    expect(tiny.glyphs.get('H')!.advance).toBe(500)
    expect(tiny.glyphs.get('ą')!.advance).toBe(300)
    expect(tiny.glyphs.has('fi')).toBe(false)
    expect(tiny.capHeight).toBe(700)
    expect(tiny.kerning.get('Hą')).toBe(40)
  })
})

describe('text layout — Straight', () => {
  it('scales capitals to the Height and starts at the origin', () => {
    const layout = layoutText(text({ text: 'H', height: 10 }))
    expect(layout.fontReady).toBe(true)
    expect(layout.bounds!.minY).toBeCloseTo(0, 6)
    expect(layout.bounds!.maxY).toBeCloseTo(10, 6)
    expect(layout.bounds!.minX).toBeGreaterThanOrEqual(0)
    expect(layout.width).toBeCloseTo((font.glyphs.get('H')!.advance * 10) / 680, 6)
  })

  it('is twice as wide at twice the height', () => {
    const a = layoutText(text({ text: 'Kraków', height: 10 }))
    const b = layoutText(text({ text: 'Kraków', height: 20 }))
    expect(b.width).toBeCloseTo(a.width * 2, 6)
  })

  it('adds Letter Spacing between letters, not after the last', () => {
    const tight = layoutText(text({ text: 'HHH', letterSpacingPercent: 0 }))
    const loose = layoutText(text({ text: 'HHH', letterSpacingPercent: 20 }))
    expect(loose.width - tight.width).toBeCloseTo(2 * 0.2 * 10, 6)
  })

  it('applies kerning', () => {
    const av = layoutText(text({ text: 'AV' })).width
    const a = layoutText(text({ text: 'A' })).width
    const v = layoutText(text({ text: 'V' })).width
    expect(av).toBeLessThan(a + v)
  })

  it('stacks lines downward by Line Spacing × Height and aligns them', () => {
    const layout = layoutText(text({ text: 'HHHH\nH', height: 10, lineSpacing: 2, align: 'right' }))
    expect(layout.blockHeight).toBeCloseTo(30, 6)
    expect(layout.bounds!.minY).toBeCloseTo(-20, 6)
    expect(layout.bounds!.maxY).toBeCloseTo(10, 6)
    // The single H of the second line sits at the right end.
    const lower = layout.strokes.filter((s) => s.every((p) => p.y < 0 - 1e-9 || p.y <= -10 + 1e-9)).flat()
    expect(Math.min(...lower.map((p) => p.x))).toBeGreaterThan(layout.width / 2)
  })

  it('puts the origin where asked', () => {
    const centered = layoutText(text({ text: 'HH', originX: 'center', originY: 'middle', height: 10 }))
    expect(centered.bounds!.minY).toBeCloseTo(-5, 6)
    expect(centered.bounds!.maxY).toBeCloseTo(5, 6)
    expect((centered.bounds!.minX + centered.bounds!.maxX) / 2).toBeCloseTo(0, 6)
    const right = layoutText(text({ text: 'HH', originX: 'right' }))
    expect(right.bounds!.maxX).toBeLessThanOrEqual(1e-9)
  })

  it('turns the block about the origin and moves it by the offset', () => {
    const flat = layoutText(text({ text: 'H', height: 10 }))
    const turned = layoutText(text({ text: 'H', height: 10, angleDeg: 90, offsetX: 5, offsetY: 7 }))
    // +X of the text now runs along +Y; its height runs toward −X.
    expect(turned.bounds!.maxX).toBeCloseTo(5, 6)
    expect(turned.bounds!.minX).toBeCloseTo(5 - 10, 6)
    expect(turned.bounds!.minY).toBeCloseTo(7 + flat.bounds!.minX, 6)
  })

  it('mirrors about the vertical axis through the origin', () => {
    const plain = layoutText(text({ text: 'F', height: 10 }))
    const mirrored = layoutText(text({ text: 'F', height: 10, mirror: true }))
    expect(mirrored.strokes).toEqual(plain.strokes.map((s) => s.map((p) => ({ x: -p.x + 0, y: p.y }))))
  })

  it('reports characters the font cannot write, once each, and lays out the rest', () => {
    const layout = layoutText(text({ text: 'A☃B☃€я' }))
    expect(layout.missing).toEqual(['☃', 'я'])
    expect(layout.strokes.length).toBeGreaterThan(2)
    expect(textMissingCharacters(text({ text: 'ok' }))).toEqual([])
  })

  it('has nothing to draw before the font is loaded', () => {
    const layout = layoutText(text({ fontId: 'not-loaded' }))
    expect(layout).toMatchObject({ fontReady: false, strokes: [], bounds: null })
    expect(getLoadedFont('not-loaded')).toBeNull()
  })
})

describe('text layout — On Circle', () => {
  const circle = (patch: Partial<TextParams> = {}) => text({ layout: 'circle', text: 'HHHHH', height: 5, circleDiameter: 60, ...patch })
  const radii = (t: TextParams) => layoutText(t).strokes.flat().map((p) => Math.hypot(p.x - t.offsetX, p.y - t.offsetY))

  it('reads the text as one line', () => {
    expect(textLines(circle({ text: 'AB\nCD' }))).toEqual(['AB CD'])
    expect(textLines(text({ text: 'AB\nCD' }))).toEqual(['AB', 'CD'])
  })

  it('stands the letters on the circle, heads outward', () => {
    const r = radii(circle())
    expect(Math.min(...r)).toBeGreaterThanOrEqual(30 - 1e-6)
    // The far corners of a rigid letter sit a hair beyond baseline + height.
    expect(Math.max(...r)).toBeGreaterThan(35 - 1e-6)
    expect(Math.max(...r)).toBeLessThan(35.3)
  })

  it('or heads inward', () => {
    const r = radii(circle({ circleSide: 'inside' }))
    expect(Math.max(...r)).toBeLessThanOrEqual(30 + 0.3)
    expect(Math.min(...r)).toBeGreaterThan(25 - 1e-6)
  })

  it('centers the text on the given angle', () => {
    const top = layoutText(circle({ circleAngleDeg: 90 })).bounds!
    expect((top.minX + top.maxX) / 2).toBeCloseTo(0, 3)
    expect(top.minY).toBeGreaterThan(0)
    const right = layoutText(circle({ circleAngleDeg: 0 })).bounds!
    expect((right.minY + right.maxY) / 2).toBeCloseTo(0, 3)
    expect(right.minX).toBeGreaterThan(0)
  })

  it('reads clockwise outside and counter-clockwise inside', () => {
    const firstStrokeAngle = (t: TextParams) => {
      const p = layoutText(t).strokes[0][0]
      return Math.atan2(p.y, p.x)
    }
    // Outside, centered at the top: the first letter is on the left (angle > 90°).
    expect(firstStrokeAngle(circle({ text: 'AB' }))).toBeGreaterThan(Math.PI / 2)
    // Inside, centered at the bottom: the first letter is on the left too (angle < −90°).
    expect(firstStrokeAngle(circle({ text: 'AB', circleSide: 'inside', circleAngleDeg: 270 }))).toBeLessThan(-Math.PI / 2)
  })

  it('mirrored is the reflection across the axis through the text center', () => {
    const plain = layoutText(circle({ text: 'FR' }))
    const mirrored = layoutText(circle({ text: 'FR', mirror: true }))
    // Centered at 90°: the axis is the Y axis.
    plain.strokes.forEach((stroke, i) =>
      stroke.forEach((p, j) => {
        expect(mirrored.strokes[i][j].x).toBeCloseTo(-p.x, 9)
        expect(mirrored.strokes[i][j].y).toBeCloseTo(p.y, 9)
      }),
    )
  })
})

describe('groove width', () => {
  it('grows with depth for a V-bit and is the diameter of an end mill', () => {
    expect(textGrooveWidth(text({ bit: 'vbit', vbitAngleDeg: 90, totalDepth: 0.5 }))).toBeCloseTo(1, 9)
    expect(textGrooveWidth(text({ bit: 'vbit', vbitAngleDeg: 60, totalDepth: 0.5 }))).toBeCloseTo(2 * 0.5 * Math.tan(Math.PI / 6), 9)
    expect(textGrooveWidth(text({ bit: 'endmill', toolDiameter: 2 }))).toBe(2)
  })
})

describe('Text toolpath', () => {
  it('cuts every stroke at depth, rapids only at Safe Z', () => {
    const p = params({ text: 'Hi', totalDepth: 0.3 }, { stepdown: 1, safeZ: 3 })
    const strokes = layoutText(p.text).strokes
    const toolpath = buildTextToolpath(p)
    expect(toolpath.start).toEqual({ x: strokes[0][0].x, y: strokes[0][0].y, z: 3 })
    const plunges = toolpath.moves.filter((m) => m.kind === 'plunge')
    expect(plunges).toHaveLength(strokes.length)
    for (const m of plunges) expect(m.to.z).toBeCloseTo(-0.3, 9)
    for (const m of toolpath.moves.filter((m) => m.kind === 'cut')) expect(m.to.z).toBeCloseTo(-0.3, 9)
    // Every XY rapid happens at Safe Z.
    let z = toolpath.start.z
    let xy = { x: toolpath.start.x, y: toolpath.start.y }
    for (const m of toolpath.moves) {
      if (m.kind === 'rapid' && (m.to.x !== xy.x || m.to.y !== xy.y)) expect(z).toBe(3)
      z = m.to.z
      xy = { x: m.to.x, y: m.to.y }
    }
  })

  it('deepens a stroke back and forth without lifting', () => {
    const p = params({ text: 'l', totalDepth: 0.9 }, { stepdown: 0.3 })
    const strokes = layoutText(p.text).strokes
    expect(strokes).toHaveLength(1)
    const toolpath = buildTextToolpath(p)
    expect(toolpath.moves.filter((m) => m.kind === 'plunge').map((m) => Number(m.to.z.toFixed(6)))).toEqual([-0.3, -0.6, -0.9])
    // No retract between the three passes: one rapid (down to Start Z).
    expect(toolpath.moves.filter((m) => m.kind === 'rapid')).toHaveLength(1)
    // Ends where it started after an odd number of passes? It ends at the far end.
    const last = toolpath.moves[toolpath.moves.length - 1].to
    const end = strokes[0][strokes[0].length - 1]
    expect(last.x).toBeCloseTo(end.x, 9)
    expect(last.y).toBeCloseTo(end.y, 9)
  })

  it('writes G1 only, whatever the interpolation setting', () => {
    const p = { ...params({ text: 'Só' }), output: { ...DEFAULT_WIZARD_PARAMS.output, interpolation: 'arc' as const } }
    const gcode = generateText(p, DEFAULT_MACHINE_SETTINGS)
    expect(gcode.some((l) => /^G[23]\b/.test(l))).toBe(false)
    expect(gcode.filter((l) => l.startsWith('G1')).length).toBeGreaterThan(20)
    expect(forcedLinearReason(p)).toBe('text')
  })

  it('is empty until the font is there', () => {
    const p = params({ fontId: 'not-loaded' })
    expect(buildTextToolpath(p).moves).toHaveLength(0)
    expect(isWizardParamsValid(p)).toBe(false)
  })
})

describe('Text validation and labels', () => {
  it('accepts the default text', () => {
    expect(isWizardParamsValid(params())).toBe(true)
  })

  it('rejects empty text, unknown characters and bad sizes', () => {
    expect(isTextContentValid(text({ text: '   ' }))).toBe(false)
    expect(isTextContentValid(text({ text: 'ok ☃' }))).toBe(false)
    expect(isWizardParamsValid(params({ height: 0 }))).toBe(false)
    expect(isWizardParamsValid(params({ totalDepth: 0 }))).toBe(false)
    expect(isWizardParamsValid(params({ layout: 'circle', circleDiameter: 0 }))).toBe(false)
    expect(isWizardParamsValid(params({ letterSpacingPercent: 1000 }))).toBe(false)
  })

  it('checks the bit that is in use', () => {
    expect(isTextBitValid(text({ bit: 'vbit', vbitAngleDeg: 5 }))).toBe(false)
    expect(isTextBitValid(text({ bit: 'vbit', vbitAngleDeg: 60, toolDiameter: 0 }))).toBe(true)
    expect(isTextBitValid(text({ bit: 'endmill', toolDiameter: 0 }))).toBe(false)
  })

  it('reports the extent of the strokes as its footprint', () => {
    const p = params({ text: 'HH', height: 10 })
    const b = layoutText(p.text).bounds!
    expect(OPERATION_RULES.text.footprint(p)).toEqual({ x: b.maxX - b.minX, y: b.maxY - b.minY })
  })

  it('names presets and files after the text', () => {
    expect(presetLabel(params({ text: 'NEMA23' }))).toBe('Text “NEMA23” • Relief SingleLine')
    expect(presetLabel(params({ text: 'A very long line of text', layout: 'circle', circleDiameter: 60 }))).toBe(
      'Text “A very long l…” on ⌀60 • Relief SingleLine',
    )
    expect(buildFilename(params())).toMatch(/^op-text-\d{4}-\d{2}-\d{2}\.gcode$/)
  })
})
