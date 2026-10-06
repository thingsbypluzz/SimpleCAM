import { describe, expect, it } from 'vitest'
import { DEFAULT_MACHINE_SETTINGS } from '../types/machine'
import { DEFAULT_WIZARD_PARAMS, type OutlineParams, type WizardParams } from '../types/wizard'
import { arcRadiusMismatches } from './gcodeTestUtils'
import { generateOutline } from './outline'
import { buildLobedToolpath, lobedOutlineOptions } from './outlineLobed'
import { lobedNominalLoop, lobedUnionLoop, distanceToLoop, loopLength } from './outlineLobedGeometry'
import { movePoints, type Point3D } from './toolpath'

const params = (outline: Partial<OutlineParams> = {}, feeds: Partial<WizardParams['feeds']> = {}): WizardParams => ({
  ...DEFAULT_WIZARD_PARAMS,
  operation: 'outline',
  outline: {
    ...DEFAULT_WIZARD_PARAMS.outline,
    shape: 'lobedCircle',
    offsetMode: 'outside',
    method: 'standard',
    toolDiameter: 6,
    totalDepth: 4,
    ...outline,
  },
  feeds: { ...DEFAULT_WIZARD_PARAMS.feeds, stepdown: 2, startZ: 0, safeZ: 5, ...feeds },
  output: { ...DEFAULT_WIZARD_PARAMS.output, interpolation: 'arc' },
})

function trace(p: WizardParams): Point3D[] {
  const toolpath = buildLobedToolpath(p)
  const points: Point3D[] = [toolpath.start]
  let current = toolpath.start
  for (const move of toolpath.moves) {
    points.push(...movePoints(current, move))
    current = move.to
  }
  return points
}

describe('Lobed Circle toolpath', () => {
  it('Standard, Outside: plunge and one flat lap per level, a tool radius off the outline', () => {
    const p = params()
    const toolpath = buildLobedToolpath(p)
    expect(toolpath.moves.filter((m) => m.kind === 'plunge').map((m) => m.to.z)).toEqual([-2, -4])
    // 10 arcs per lap, the lap start splits one of them.
    expect(toolpath.moves.filter((m) => m.type === 'arc')).toHaveLength(22)
    const nominal = lobedUnionLoop(p.outline)
    for (const pt of trace(p).filter((q) => q.z < 0)) expect(distanceToLoop(nominal, pt)).toBeGreaterThan(3 - 1e-6)
    // Starts over the tip of the first lobe (90°): 35 + 8 + 3.
    expect(toolpath.start).toMatchObject({ x: expect.closeTo(0, 6), y: expect.closeTo(46, 6), z: 5 })
    // Every lap closes on its start.
    expect(toolpath.moves.at(-1)!.to).toMatchObject({ x: expect.closeTo(0, 6), y: expect.closeTo(46, 6), z: -4 })
  })

  it('applies Offset X/Y', () => {
    expect(buildLobedToolpath(params({ offsetX: 10, offsetY: -5 })).start).toMatchObject({ x: expect.closeTo(10, 6), y: expect.closeTo(41, 6) })
  })

  it('travels clockwise Outside and On-line, counter-clockwise Inside', () => {
    const turn = (offsetMode: OutlineParams['offsetMode']) => lobedOutlineOptions(params({ offsetMode })).loop.filter((arc) => arc.circle >= 0).every((arc) => arc.ccw)
    expect(turn('outside')).toBe(false)
    expect(turn('onLine')).toBe(false)
    expect(turn('inside')).toBe(true)
  })

  it('Ramp: descends evenly along the loop, never steeper than the Ramp Angle, then a flat lap', () => {
    const p = params({ method: 'ramp', rampAngleDeg: 2 }, { stepdown: 2 })
    const opts = lobedOutlineOptions(p)
    expect(opts.rampPitch).toBe(2) // the loop is long: Stepdown is the limit
    const points = trace(p)
    expect(Math.min(...points.map((q) => q.z))).toBeCloseTo(-4, 9)
    // Z never rises while cutting.
    const cutting = points.slice(2)
    for (let i = 1; i < cutting.length; i++) expect(cutting[i].z).toBeLessThanOrEqual(cutting[i - 1].z + 1e-9)
    // The last lap is flat at full depth.
    const lap = Math.round(points.length / 3)
    expect(points.slice(-lap + 2).every((q) => Math.abs(q.z + 4) < 1e-9)).toBe(true)

    const steep = lobedOutlineOptions(params({ method: 'ramp', rampAngleDeg: 0.5 }, { stepdown: 5 }))
    expect(steep.rampPitch).toBeCloseTo(loopLength(steep.loop) * Math.tan((0.5 * Math.PI) / 180), 9)
  })

  it('emits consistent G2/G3 arcs, and G1 only when the toggle says so', () => {
    for (const method of ['standard', 'ramp'] as const) {
      for (const offsetMode of ['outside', 'inside', 'onLine'] as const) {
        const lines = generateOutline(params({ method, offsetMode }), DEFAULT_MACHINE_SETTINGS)
        expect(lines.some((l) => /^G[23] /.test(l))).toBe(true)
        expect(arcRadiusMismatches(lines)).toEqual([])
      }
    }
    const linear = { ...params(), output: { ...params().output, interpolation: 'linear' as const } }
    expect(generateOutline(linear, DEFAULT_MACHINE_SETTINGS).some((l) => /^G[23] /.test(l))).toBe(false)
  })

  it('an Inside tool that does not fit cuts nothing', () => {
    const toolpath = buildLobedToolpath(params({ offsetMode: 'inside', toolDiameter: 20 }))
    expect(toolpath.moves.filter((m) => m.kind === 'cut')).toHaveLength(0)
  })
})

describe('Lobed Circle tabs', () => {
  const tabbed = (patch: Partial<OutlineParams> = {}) =>
    params({ tabsEnabled: true, tabHeight: 1, tabWidth: 4, tabCount: 5, tabStartAngle: 90, ...patch }, { stepdown: 1 })

  it('spreads the tabs evenly, the first one on Tab Start, the lap start between two tabs', () => {
    const opts = lobedOutlineOptions(tabbed())
    const length = loopLength(opts.loop)
    expect(opts.tabs!.ranges).toHaveLength(5)
    opts.tabs!.ranges.forEach((range, k) => {
      expect(range.end - range.start).toBeCloseTo(4, 9)
      expect((range.start + range.end) / 2).toBeCloseTo((length / 5) * (k + 0.5), 9)
    })
    expect(opts.tabs!.ranges[0].start).toBeGreaterThan(0)
  })

  it('lifts over every tab to the top of the tab band, and forces G1', () => {
    const p = tabbed()
    const points = trace(p)
    // Lifted points sit at the tab band top while the lap is cutting below it.
    const bandTop = -3
    const lifted = points.filter((q, i) => i > 0 && Math.abs(q.z - bandTop) < 1e-9 && points[i - 1].z < bandTop - 1e-9)
    expect(lifted).toHaveLength(5)
    // With 5 tabs from 90° on a 5-lobe shape, every tab is on a lobe tip:
    // 46 mm from the center.
    const crossings = points.filter((q, i) => i > 0 && Math.abs(q.z - bandTop) < 1e-9 && Math.abs(points[i - 1].z - bandTop) < 1e-9 && points[i - 2]?.z < bandTop)
    expect(crossings.length).toBeGreaterThan(0)
    for (const q of crossings) expect(Math.hypot(q.x, q.y)).toBeGreaterThan(45.5)
    expect(Math.min(...points.map((q) => q.z))).toBeCloseTo(-4, 9)
    expect(generateOutline(p, DEFAULT_MACHINE_SETTINGS).some((l) => /^G[23] /.test(l))).toBe(false)
  })
})

describe('Lobed Circle — Subtract (BL-106)', () => {
  const notched = (outline: Partial<OutlineParams> = {}, feeds: Partial<WizardParams['feeds']> = {}) =>
    params({ lobeMode: 'subtract', lobePitchDiameter: 60, ...outline }, feeds)

  it('keeps the tool a radius off the notched outline in every mode, with consistent arcs', () => {
    for (const method of ['standard', 'ramp'] as const) {
      for (const offsetMode of ['outside', 'inside'] as const) {
        const p = notched({ method, offsetMode })
        const nominal = lobedNominalLoop(p.outline)
        const cutting = trace(p).filter((q) => q.z < 0)
        expect(cutting.length).toBeGreaterThan(10)
        for (const pt of cutting) expect(distanceToLoop(nominal, pt)).toBeGreaterThan(3 - 1e-6)
        const lines = generateOutline(p, DEFAULT_MACHINE_SETTINGS)
        expect(lines.some((l) => /^G[23] /.test(l))).toBe(true)
        expect(arcRadiusMismatches(lines)).toEqual([])
      }
    }
    expect(arcRadiusMismatches(generateOutline(notched({ offsetMode: 'onLine' }), DEFAULT_MACHINE_SETTINGS))).toEqual([])
  })

  it('starts on the main circle half-way between two notches', () => {
    // First notch at 90°, five of them: start at 126°, radius 30 + 3.
    const { start } = buildLobedToolpath(notched())
    expect(start.x).toBeCloseTo(33 * Math.cos((126 * Math.PI) / 180), 6)
    expect(start.y).toBeCloseTo(33 * Math.sin((126 * Math.PI) / 180), 6)
  })

  it('cuts nothing Outside when the tool does not fit the notches', () => {
    expect(buildLobedToolpath(notched({ toolDiameter: 16 })).moves.filter((m) => m.kind === 'cut')).toHaveLength(0)
  })

  it('takes tabs along the notched path', () => {
    const opts = lobedOutlineOptions(notched({ tabsEnabled: true, tabHeight: 1, tabWidth: 4, tabCount: 5, tabStartAngle: 126 }, { stepdown: 1 }))
    expect(opts.tabs!.ranges).toHaveLength(5)
    const points = trace(notched({ tabsEnabled: true, tabHeight: 1, tabWidth: 4, tabCount: 5, tabStartAngle: 126 }, { stepdown: 1 }))
    expect(Math.min(...points.map((q) => q.z))).toBeCloseTo(-4, 9)
  })
})
