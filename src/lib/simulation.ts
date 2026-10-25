import type { WizardParams } from '../types/wizard'
import { walkProgram } from './previewPaths'
import type { MoveKind, Point3D } from './toolpath'
import { OPERATION_RULES } from './validation'

// BL-100: the program as a timeline for the 3D preview's Simulate mode —
// the same walk the previews draw (walkProgram(), the engines' own move
// lists), each step timed by its length over the feed the G-code gives it.

// G0 has no feed in the program. The simulation runs it at the machine's
// Max Feed, capped here: the default Max Feed (50 000 mm/min) means "no
// limit", while a hobby GRBL machine rapids at around 3000–5000 mm/min.
export const SIM_MAX_RAPID_FEED = 5000

export function simulationRapidFeed(maxFeed: number): number {
  return Math.min(maxFeed, SIM_MAX_RAPID_FEED)
}

// Kinds as stored in `Simulation.kinds` (one byte per segment).
export const SIM_KINDS: readonly MoveKind[] = ['rapid', 'cut', 'plunge', 'link', 'finish']

export interface Simulation {
  // One continuous polyline, x, y, z per vertex: segment i runs from
  // vertex i to vertex i + 1.
  points: Float32Array
  // Seconds from the start to each vertex (times[0] = 0).
  times: Float64Array
  // Index into SIM_KINDS, per segment.
  kinds: Uint8Array
  // Seconds for the whole program.
  total: number
}

export interface SimulationPosition {
  // The segment the tool is on (the last one at the very end).
  segment: number
  // Where the tool is, CNC coordinates.
  point: Point3D
}

// The whole program — every toolpath, the retracts and hole-to-hole rapids
// between them, and the final G0 X0 Y0 when the program returns to the
// origin — at the feeds of OPERATION_RULES[op].moveFeeds() and `rapidFeed`
// for G0. Zero-length steps keep their place with no duration.
export function buildSimulation(params: WizardParams, rapidFeed: number): Simulation {
  const feeds = OPERATION_RULES[params.operation].moveFeeds(params)
  const feedOf: Record<MoveKind, number> = {
    rapid: rapidFeed,
    cut: feeds.cut,
    plunge: feeds.plunge ?? feeds.cut,
    link: feeds.link ?? feeds.cut,
    finish: feeds.finish ?? feeds.cut,
  }
  const points: number[] = []
  const times: number[] = []
  const kinds: number[] = []
  let last: Point3D = { x: 0, y: 0, z: 0 }
  let t = 0
  const step = (kind: MoveKind, p: Point3D) => {
    const length = Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z)
    const feed = feedOf[kind]
    // Feeds are mm/min; a feed that isn't positive (invalid parameters)
    // would stall the timeline, so such a step takes no time.
    t += feed > 0 ? (length / feed) * 60 : 0
    points.push(p.x, p.y, p.z)
    times.push(t)
    kinds.push(SIM_KINDS.indexOf(kind))
    last = p
  }
  walkProgram(params, {
    start: (p) => {
      points.push(p.x, p.y, p.z)
      times.push(0)
      last = p
    },
    point: step,
  })
  if (points.length > 0 && params.output.returnOriginEnd) step('rapid', { x: 0, y: 0, z: last.z })
  return {
    points: new Float32Array(points),
    times: Float64Array.from(times),
    kinds: Uint8Array.from(kinds),
    total: t,
  }
}

// The tool's place at `t` seconds (clamped to the program): the segment
// found by binary search over the vertex times, the point interpolated
// along it.
export function simulationAt(sim: Simulation, t: number): SimulationPosition {
  const { points, times } = sim
  const vertexCount = times.length
  if (vertexCount === 0) return { segment: 0, point: { x: 0, y: 0, z: 0 } }
  if (vertexCount === 1 || t <= 0) return { segment: 0, point: vertexAt(points, 0) }
  if (t >= sim.total) return { segment: vertexCount - 2, point: vertexAt(points, vertexCount - 1) }
  // The last vertex whose time is <= t.
  let lo = 0
  let hi = vertexCount - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (times[mid] <= t) lo = mid
    else hi = mid
  }
  const span = times[lo + 1] - times[lo]
  const f = span > 0 ? (t - times[lo]) / span : 1
  const a = vertexAt(points, lo)
  const b = vertexAt(points, lo + 1)
  return { segment: lo, point: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f } }
}

function vertexAt(points: Float32Array, i: number): Point3D {
  return { x: points[i * 3], y: points[i * 3 + 1], z: points[i * 3 + 2] }
}

// h:mm:ss from an hour on, mm:ss below.
export function formatSimTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${String(m).padStart(2, '0')}:${sec}`
}
