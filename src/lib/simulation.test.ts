import { describe, expect, it } from 'vitest'
import { OPERATION_META } from '../config/operationMeta'
import { DEFAULT_MACHINE_SETTINGS } from '../types/machine'
import { DEFAULT_WIZARD_PARAMS, type WizardParams } from '../types/wizard'
import {
  makeRng,
  randomFacing,
  randomHoles,
  randomOutline,
  randomPocket,
  randomPocketContour,
  randomPocketDonut,
  randomPocketLightened,
  randomSurface,
  randomText,
  type Rng,
} from './fuzzParams'
import { buildSimulation, formatSimTime, SIM_MAX_RAPID_FEED, simulationAt, simulationRapidFeed } from './simulation'
import { loadTestFont } from './textTestUtils'
import { isWizardParamsValid } from './validation'

loadTestFont('relief')

const RAPID = 3000

function word(line: string, letter: string): number | undefined {
  const m = line.match(new RegExp(`(?:^|\\s)${letter}(-?[\\d.]+)`))
  return m ? Number(m[1]) : undefined
}

// The program's duration read back from its G-code (G1 output only): G0 at
// `rapid`, G1 at its own F, counted from the first move that starts at a
// fully known position — where the simulation starts too.
function gcodeSeconds(lines: string[], rapid: number): number {
  let x: number | undefined
  let y: number | undefined
  let z: number | undefined
  let feed = 0
  let seconds = 0
  for (const line of lines) {
    if (!/^G[01](\s|$)/.test(line)) continue
    feed = word(line, 'F') ?? feed
    const nx = word(line, 'X') ?? x
    const ny = word(line, 'Y') ?? y
    const nz = word(line, 'Z') ?? z
    if (x !== undefined && y !== undefined && z !== undefined && nx !== undefined && ny !== undefined && nz !== undefined) {
      const length = Math.hypot(nx - x, ny - y, nz - z)
      seconds += (length / (line.startsWith('G0') ? rapid : feed)) * 60
    }
    x = nx
    y = ny
    z = nz
  }
  return seconds
}

const linear = (p: WizardParams): WizardParams => ({ ...p, output: { ...p.output, interpolation: 'linear' } })

const generators: [string, (rng: Rng) => WizardParams][] = [
  ['Hole(s) Helix', (rng) => randomHoles(rng, 'helix')],
  ['Hole(s) Standard', (rng) => randomHoles(rng, 'standard')],
  ['Hole(s) Drill', (rng) => randomHoles(rng, 'drill')],
  ['Outline', randomOutline],
  ['Surface Zigzag', (rng) => randomSurface(rng, 'zigzag')],
  ['Surface Unidirectional', (rng) => randomSurface(rng, 'unidirectional')],
  ['Pocket Spiral', (rng) => randomPocket(rng, 'spiral')],
  ['Pocket Adaptive', (rng) => randomPocket(rng, 'adaptive')],
  ['Pocket Donut', randomPocketDonut],
  ['Pocket Lightened', randomPocketLightened],
  ['Pocket Contour', randomPocketContour],
  ['Facing', randomFacing],
  ['Text', randomText],
]

describe('buildSimulation', () => {
  it.each(generators)('%s: the timeline lasts exactly as long as the G-code', (_, random) => {
    const rng = makeRng(20261025)
    let checked = 0
    for (let i = 0; i < 40 && checked < 8; i++) {
      const params = linear(random(rng))
      if (!isWizardParamsValid(params)) continue
      checked++
      const lines = OPERATION_META[params.operation].generate(params, DEFAULT_MACHINE_SETTINGS)
      const expected = gcodeSeconds(lines, RAPID)
      const sim = buildSimulation(params, RAPID)
      // Output rounds coordinates to 4 decimals.
      expect(Math.abs(sim.total - expected)).toBeLessThanOrEqual(Math.max(1e-3, expected * 1e-4))
    }
    expect(checked).toBeGreaterThan(0)
  }, 60_000) // Pocket Adaptive alone takes seconds; vitest's 5 s default is too tight

  it('starts at the program start and ends at the origin when it returns there', () => {
    const params: WizardParams = { ...DEFAULT_WIZARD_PARAMS, operation: 'pocket' }
    const sim = buildSimulation(params, RAPID)
    expect(sim.times[0]).toBe(0)
    expect(sim.kinds.length).toBe(sim.times.length - 1)
    expect(sim.points.length).toBe(sim.times.length * 3)
    const end = simulationAt(sim, sim.total)
    expect(params.output.returnOriginEnd).toBe(true)
    expect(end.point.x).toBeCloseTo(0)
    expect(end.point.y).toBeCloseTo(0)
    expect(end.point.z).toBeCloseTo(params.feeds.safeZ)
  })

  it('times never go backwards', () => {
    const sim = buildSimulation({ ...DEFAULT_WIZARD_PARAMS, operation: 'surface' }, RAPID)
    for (let i = 1; i < sim.times.length; i++) expect(sim.times[i]).toBeGreaterThanOrEqual(sim.times[i - 1])
  })
})

describe('simulationAt', () => {
  const sim = buildSimulation({ ...DEFAULT_WIZARD_PARAMS, operation: 'outline' }, RAPID)

  it('clamps to the first and last vertex', () => {
    expect(simulationAt(sim, -5).point).toEqual(simulationAt(sim, 0).point)
    expect(simulationAt(sim, 0).point.x).toBeCloseTo(sim.points[0])
    const last = sim.times.length - 1
    expect(simulationAt(sim, sim.total + 5).point.z).toBeCloseTo(sim.points[last * 3 + 2])
  })

  it('lands on the vertex at its time and between vertices in between', () => {
    const i = Math.floor(sim.times.length / 2)
    const at = simulationAt(sim, sim.times[i])
    expect(at.point.x).toBeCloseTo(sim.points[i * 3], 4)
    expect(at.point.y).toBeCloseTo(sim.points[i * 3 + 1], 4)
    const mid = simulationAt(sim, (sim.times[i] + sim.times[i + 1]) / 2)
    expect(mid.segment).toBe(i)
  })
})

describe('simulationRapidFeed', () => {
  it('uses Max Feed, capped', () => {
    expect(simulationRapidFeed(2000)).toBe(2000)
    expect(simulationRapidFeed(50000)).toBe(SIM_MAX_RAPID_FEED)
  })
})

describe('formatSimTime', () => {
  it('mm:ss below an hour, h:mm:ss from one', () => {
    expect(formatSimTime(0)).toBe('00:00')
    expect(formatSimTime(75.9)).toBe('01:15')
    expect(formatSimTime(3725)).toBe('1:02:05')
  })
})
