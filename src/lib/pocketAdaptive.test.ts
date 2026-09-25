import { describe, expect, it } from 'vitest'
import { generatePocketAdaptive } from './pocket'
import { buildAdaptiveToolpath, type AdaptiveMove, type AdaptiveToolpath, type Point3D } from './pocketAdaptive'
import { arcEngagement, engagementAngleFor, nextConstantEngagementRadius } from './pocketAdaptiveMath'
import { simulateEngagement } from './pocketAdaptiveSim'
import { pocketCenter } from './pocketGeometry'
import { arcRadiusMismatches } from './gcodeTestUtils'
import { DEFAULT_MACHINE_SETTINGS } from '../types/machine'
import { DEFAULT_WIZARD_PARAMS, type PocketParams, type Point2D, type WizardParams } from '../types/wizard'

function params(pocket: Partial<PocketParams>, feeds: Partial<WizardParams['feeds']> = {}, output: Partial<WizardParams['output']> = {}): WizardParams {
  return {
    ...DEFAULT_WIZARD_PARAMS,
    operation: 'pocket',
    pocket: { ...DEFAULT_WIZARD_PARAMS.pocket, method: 'adaptive', toolDiameter: 6, totalDepth: 1, helixRadius: 1.5, ...pocket },
    feeds: { ...DEFAULT_WIZARD_PARAMS.feeds, startZ: 0, stepdown: 1, ...feeds },
    output: { ...DEFAULT_WIZARD_PARAMS.output, ...output },
  }
}

// Grid simulation of one level (see pocketAdaptiveSim.ts): coverage, walls
// and linking moves only — the engagement bound is checked analytically
// below, since a grid this coarse inflates tight-corner readings.
const CELL = 0.05
const WALL_SCALLOP_TOLERANCE = 0.1

const SCENARIOS = [
  ['Circle ⌀20, 10%, conventional', { shape: 'circle', diameter: 20 }],
  ['Circle ⌀20, 10%, climb', { shape: 'circle', diameter: 20, cutDirection: 'climb' }],
  ['square 20×20, 10%', { shape: 'rectCentered', width: 20, height: 20 }],
  ['wide 30×16, 10%', { shape: 'rectCentered', width: 30, height: 16 }],
  ['tall 14×26 (rotated frame), 10%, climb', { shape: 'rectCornered', width: 14, height: 26, cutDirection: 'climb' }],
  ['wide 26×14, 5%', { shape: 'rectCentered', width: 26, height: 14, optimalLoadPercent: 5 }],
  ['wide 30×16, 20%', { shape: 'rectCentered', width: 30, height: 16, optimalLoadPercent: 20 }],
  ['narrow 40×8, 10%', { shape: 'rectCentered', width: 40, height: 8, helixRadius: 0.5 }],
  ['Circle ⌀20, helix at the ceiling (radius = tool radius)', { shape: 'circle', diameter: 20, helixRadius: 3 }],
] as [string, Partial<PocketParams>][]

function helixMoveIndices(tp: AdaptiveToolpath, c: Point2D, helixRadius: number): Set<number> {
  const set = new Set<number>()
  let cur = tp.start
  tp.moves.forEach((m, i) => {
    if (m.type === 'arc' && Math.hypot(m.center.x - c.x, m.center.y - c.y) < 1e-9 && Math.abs(Math.hypot(cur.x - c.x, cur.y - c.y) - helixRadius) < 1e-6) {
      set.add(i)
    }
    cur = m.to
  })
  return set
}

describe('Pocket Adaptive — simulated coverage and walls', () => {
  it.each(SCENARIOS)('%s', (_label, over) => {
    const pocket = params(over).pocket
    const tp = buildAdaptiveToolpath(params(over))
    const c = pocketCenter(pocket)
    const R = pocket.toolDiameter / 2
    const isCircle = pocket.shape === 'circle'
    const hw = isCircle ? pocket.diameter / 2 : pocket.width / 2
    const hh = isCircle ? pocket.diameter / 2 : pocket.height / 2
    // Distance outside the pocket as a round tool can reach it (sharp
    // corners rounded by R); ≤ 0 means inside.
    const outside = (x: number, y: number) => {
      if (isCircle) return Math.hypot(x - c.x, y - c.y) - hw
      const dx = Math.max(0, Math.abs(x - c.x) - (hw - R))
      const dy = Math.max(0, Math.abs(y - c.y) - (hh - R))
      return Math.hypot(dx, dy) - R
    }
    const helix = helixMoveIndices(tp, c, pocket.helixRadius)
    const r = simulateEngagement(tp, {
      toolRadius: R,
      cell: CELL,
      minChip: 0.1,
      trueArcs: true,
      bounds: { minX: c.x - hw - 1, maxX: c.x + hw + 1, minY: c.y - hh - 1, maxY: c.y + hh + 1 },
      isMaterial: (x, y) => outside(x, y) <= 0,
      isInterior: (x, y) => outside(x, y) <= -WALL_SCALLOP_TOLERANCE,
      toolCenterOvershoot: (x, y) =>
        isCircle ? Math.hypot(x - c.x, y - c.y) - (hw - R) : Math.max(Math.abs(x - c.x) - (hw - R), Math.abs(y - c.y) - (hh - R)),
      isUnmeasured: (i) => helix.has(i),
    })
    expect(r.uncutInteriorCells).toBe(0)
    expect(r.maxWallViolation).toBeLessThan(1e-6)
    // Linking moves run through already-cleared area — only wall slivers.
    expect(r.maxLinkEngagementDeg).toBeLessThan(15)
  })
})

// Independent re-derivation of the engagement bound from the EMITTED moves
// only (arc centers/radii, ramp polylines) — not from the generator's own
// step choices. For each cutting arc/ramp, the previously cleared boundary
// is rebuilt from the neighbouring moves, and engagement is evaluated along
// the whole move as tangential-pass angle + outward tilt of the motion.
// A 0.002 mm grid simulation measured the worst corners at θ* + 2–3° at
// the tool edge itself (CHANGELOG, OP-5) — this model is what the
// generator targets; phase-A ramp chords add ≤ 1° by construction.
function engagementAlongArc(from: Point3D, m: Extract<AdaptiveMove, { type: 'arc' }>, prev: Point2D, clearedRadius: number, R: number): number {
  const r = Math.hypot(from.x - m.center.x, from.y - m.center.y)
  const a0 = Math.atan2(from.y - m.center.y, from.x - m.center.x)
  const sign = m.direction === 'ccw' ? 1 : -1
  let max = 0
  for (let i = 0; i <= 64; i++) {
    const a = a0 + (sign * m.sweep * i) / 64
    const px = m.center.x + r * Math.cos(a)
    const py = m.center.y + r * Math.sin(a)
    const dx = px - prev.x
    const dy = py - prev.y
    const d = Math.hypot(dx, dy)
    const outward = (sign * (-Math.sin(a) * dx + Math.cos(a) * dy)) / d
    max = Math.max(max, arcEngagement(d, clearedRadius, R) + Math.asin(Math.min(1, Math.max(-1, outward))))
  }
  return max
}

describe('Pocket Adaptive — engagement bound, re-derived from the emitted moves', () => {
  it.each(SCENARIOS)('%s', (_label, over) => {
    const p = params(over)
    const pocket = p.pocket
    const tp = buildAdaptiveToolpath(p)
    const c = pocketCenter(pocket)
    const R = pocket.toolDiameter / 2
    const theta = engagementAngleFor(pocket.optimalLoadPercent)
    const helix = helixMoveIndices(tp, c, pocket.helixRadius)
    const isCircle = pocket.shape === 'circle'
    const halfW = pocket.width / 2 - R
    const halfH = pocket.height / 2 - R
    const hu = Math.max(halfW, halfH)
    const hv = Math.min(halfW, halfH)
    const caps: Point2D[] = isCircle
      ? [c]
      : halfW >= halfH
        ? [{ x: c.x + (hu - hv), y: c.y }, { x: c.x - (hu - hv), y: c.y }]
        : [{ x: c.x, y: c.y + (hu - hv) }, { x: c.x, y: c.y - (hu - hv) }]

    let worstRing = 0
    let worstRamp = 0
    let worstArc = 0
    let worstInfo = ''
    let ringRadius = pocket.helixRadius
    let prevOffset: { center: Point2D; r: number; sweep: number } | null = null
    let cur = tp.start
    tp.moves.forEach((m, i) => {
      const from = cur
      cur = m.to
      if (helix.has(i) || m.kind !== 'cut') return
      if (m.type === 'line') {
        // Phase-A ramp segment: previous boundary = the last full ring.
        const dFrom = Math.hypot(from.x - c.x, from.y - c.y)
        const dTo = Math.hypot(m.to.x - c.x, m.to.y - c.y)
        if (dTo > dFrom + 1e-9 && dTo <= ringRadius + (nextConstantEngagementRadius(ringRadius, R, theta) - ringRadius) * 1.0001 + 1e-9 && prevOffset === null) {
          const len = Math.hypot(m.to.x - from.x, m.to.y - from.y)
          const outward = ((m.to.x - from.x) * (m.to.x - c.x) + (m.to.y - from.y) * (m.to.y - c.y)) / (len * dTo)
          worstRamp = Math.max(worstRamp, arcEngagement(dTo, ringRadius + R, R) + Math.asin(Math.min(1, outward)))
        }
        return
      }
      const r = Math.hypot(from.x - m.center.x, from.y - m.center.y)
      if (Math.abs(m.sweep - 2 * Math.PI) < 1e-9 && Math.hypot(m.center.x - c.x, m.center.y - c.y) < 1e-9) {
        // Phase-A full ring around the pocket center.
        worstRing = Math.max(worstRing, arcEngagement(r, ringRadius + R, R))
        ringRadius = r
        return
      }
      // Phase B (half-arcs) / C (quarter-arcs): previous boundary = the
      // previous arc of the same kind if adjacent, else the cap circle.
      // Same corner: the next quarter-arc's center moves diagonally by
      // exactly the radius step. Same end: equal radius, further out along
      // the same side of the pocket center.
      const po = prevOffset as { center: Point2D; r: number; sweep: number } | null
      const adjacent =
        po !== null &&
        Math.abs(po.sweep - m.sweep) < 1e-9 &&
        (m.sweep < Math.PI - 1e-9
          ? po.r > r &&
            Math.abs(Math.abs(po.center.x - m.center.x) - (po.r - r)) < 1e-6 &&
            Math.abs(Math.abs(po.center.y - m.center.y) - (po.r - r)) < 1e-6
          : Math.abs(po.r - r) < 1e-6 &&
            (po.center.x - c.x) * (m.center.x - c.x) + (po.center.y - c.y) * (m.center.y - c.y) > 0 &&
            Math.hypot(m.center.x - c.x, m.center.y - c.y) > Math.hypot(po.center.x - c.x, po.center.y - c.y))
      const prev = adjacent
        ? prevOffset!
        : m.sweep > Math.PI / 2 + 1e-9
          ? { center: c, r: ringRadius }
          : { center: caps.reduce((a, b) => (Math.hypot(b.x - m.center.x, b.y - m.center.y) < Math.hypot(a.x - m.center.x, a.y - m.center.y) ? b : a)), r: hv }
      const e = engagementAlongArc(from, m, prev.center, prev.r + R, R)
      if (e > worstArc) {
        worstArc = e
        worstInfo = `move ${i} sweep ${((m.sweep * 180) / Math.PI).toFixed(0)} center (${m.center.x.toFixed(2)},${m.center.y.toFixed(2)}) r ${r.toFixed(3)} from (${from.x.toFixed(2)},${from.y.toFixed(2)}) prev ${adjacent ? 'adjacent' : 'cap/ring'} (${prev.center.x.toFixed(2)},${prev.center.y.toFixed(2)}) r ${prev.r.toFixed(3)}`
      }
      prevOffset = { center: m.center, r, sweep: m.sweep }
    })
    const deg = (x: number) => (x * 180) / Math.PI
    expect(deg(worstRing)).toBeLessThanOrEqual(deg(theta) + 1e-6)
    expect(deg(worstRamp)).toBeLessThanOrEqual(deg(theta) + 1.01)
    expect(deg(worstArc), worstInfo).toBeLessThanOrEqual(deg(theta) + 0.1)
    expect(worstRing).toBeGreaterThan(0)
  })
})

describe('Pocket Adaptive — G-code', () => {
  it('every G2/G3 starts on its own circle (Circle and Rectangle, both directions)', () => {
    for (const pocket of [
      { shape: 'circle', diameter: 20 },
      { shape: 'rectCentered', width: 30, height: 16, cutDirection: 'climb' },
      { shape: 'rectCornered', width: 14, height: 26 },
    ] as Partial<PocketParams>[]) {
      const lines = generatePocketAdaptive(params(pocket, { stepdown: 0.5 }, { interpolation: 'arc' }), DEFAULT_MACHINE_SETTINGS)
      expect(lines.some((l) => /^G[23] /.test(l))).toBe(true)
      expect(arcRadiusMismatches(lines)).toEqual([])
    }
  })

  it('conventional cuts CCW (G3), climb cuts CW (G2)', () => {
    const conv = generatePocketAdaptive(params({ shape: 'circle', diameter: 20 }, {}, { interpolation: 'arc' }), DEFAULT_MACHINE_SETTINGS)
    const climb = generatePocketAdaptive(params({ shape: 'circle', diameter: 20, cutDirection: 'climb' }, {}, { interpolation: 'arc' }), DEFAULT_MACHINE_SETTINGS)
    expect(conv.some((l) => l.startsWith('G2 '))).toBe(false)
    expect(climb.some((l) => l.startsWith('G3 '))).toBe(false)
  })

  it('G1 mode emits no arcs at all', () => {
    const lines = generatePocketAdaptive(params({ shape: 'rectCentered', width: 30, height: 16 }, {}, { interpolation: 'linear' }), DEFAULT_MACHINE_SETTINGS)
    expect(lines.some((l) => /^G[23] /.test(l))).toBe(false)
  })

  it('helix pitch comes from the ramp angle, not the stepdown', () => {
    const p = params({ shape: 'circle', diameter: 20, rampAngleDeg: 2, helixRadius: 1.5 }, { stepdown: 3 }, { interpolation: 'arc' })
    p.pocket.totalDepth = 3
    const lines = generatePocketAdaptive(p, DEFAULT_MACHINE_SETTINGS)
    const pitch = 2 * Math.PI * 1.5 * Math.tan((2 * Math.PI) / 180)
    const helixTurns = lines.filter((l) => /^G3 X1\.5 Y0 Z-[\d.]+ I-1\.5 J0 /.test(l))
    // Descending turns + one flat pass at the bottom.
    expect(helixTurns.length).toBe(Math.ceil(3 / pitch) + 1)
  })

  it('stays down between Z levels — one rapid descent, one retract to Safe Z at the very end', () => {
    const p = params({ shape: 'rectCentered', width: 30, height: 16 }, { stepdown: 1, safeZ: 5 })
    p.pocket.totalDepth = 3
    const lines = generatePocketAdaptive(p, DEFAULT_MACHINE_SETTINGS)
    expect(lines.filter((l) => l === 'G0 Z5')).toHaveLength(2) // header approach + final retract
    const firstCut = lines.findIndex((l) => /^G[123] /.test(l))
    const lastCut = lines.length - 1 - [...lines].reverse().findIndex((l) => /^G[123] /.test(l))
    expect(lines.slice(firstCut, lastCut).some((l) => l.startsWith('G0 '))).toBe(false)
  })

  it('linking moves use Linking Feed, cutting moves Feed XY', () => {
    const p = params({ shape: 'rectCentered', width: 30, height: 16, linkingFeed: 1600 }, { feedrateXY: 700 })
    const lines = generatePocketAdaptive(p, DEFAULT_MACHINE_SETTINGS)
    expect(lines.some((l) => l.endsWith('F1600'))).toBe(true)
    expect(lines.some((l) => l.endsWith('F700'))).toBe(true)
  })
})

describe('buildAdaptiveToolpath — invalid transient input', () => {
  it('returns no moves instead of looping when load, tool or helix radius are zero', () => {
    for (const pocket of [{ optimalLoadPercent: 0 }, { toolDiameter: 0 }, { helixRadius: 0 }] as Partial<PocketParams>[]) {
      expect(buildAdaptiveToolpath(params({ shape: 'circle', diameter: 20, ...pocket })).moves).toEqual([])
    }
  })
})
