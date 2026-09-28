import { fmt } from './format'
import type { InterpolationMode, Point2D } from '../types/wizard'

// Structured toolpath shared by an engine's G-code output and both previews
// (BL-61): the engine builds ONE move list, toolpathToGcode() formats it
// and the previews draw it, so what is drawn can never drift from what is
// cut. Pocket Adaptive was the first engine built this way.

// rapid  — G0, drawn dashed in 3D
// cut    — G1/G2/G3 at Feedrate XY, solid
// plunge — straight vertical G1 at Plunge Rate, dotted
// link   — G1 through already-cleared area at the linking feed (Adaptive)
// finish — G1/G2/G3 at the finishing feed (Pocket finishing pass), drawn
//          like cut
export type MoveKind = 'rapid' | 'cut' | 'plunge' | 'link' | 'finish'
export type ArcDirection = 'cw' | 'ccw'

export interface Point3D {
  x: number
  y: number
  z: number
}

// `axes` fixes which words a straight move prints: 'xy' (`G0 X… Y…`) or
// 'z' (`G0 Z…`, `G1 Z… F…`); omitted, a G0 prints the axes that change and
// a G1 prints X, Y and Z.
export type Move =
  | { type: 'line'; kind: MoveKind; to: Point3D; axes?: 'xy' | 'z' }
  | {
      type: 'arc'
      kind: MoveKind
      to: Point3D
      center: Point2D
      direction: ArcDirection
      sweep: number
      // Optional exact geometry for arcs whose start point is derived from
      // an angle rather than from wherever the previous move ended (Pocket
      // Spiral rings): `from` is the arc's own start in XY, `radius` its
      // exact radius. Used for I/J and G1 sampling so the output matches
      // the pre-toolpath engines digit for digit.
      from?: Point2D
      radius?: number
    }

export interface Toolpath {
  start: Point3D
  moves: Move[]
}

const FULL_TURN = 2 * Math.PI
// 5° per segment — every G1-approximated curve in the app uses this density
// (72 segments per full turn).
const SEGMENT_RAD = (5 * Math.PI) / 180
const EPS = 1e-6

function arcEndPoint(from: Point3D, center: Point2D, direction: ArcDirection, sweep: number, z: number): Point3D {
  // A full turn ends exactly where it started — no trig round trip, so the
  // formatted end point matches the start to the last digit.
  if (sweep === FULL_TURN) return { x: from.x, y: from.y, z }
  const r = Math.hypot(from.x - center.x, from.y - center.y)
  const a = Math.atan2(from.y - center.y, from.x - center.x) + (direction === 'ccw' ? sweep : -sweep)
  return { x: center.x + r * Math.cos(a), y: center.y + r * Math.sin(a), z }
}

// Points along one move, excluding its start (the previous move's end).
// Arcs are sampled at SEGMENT_RAD with Z interpolated linearly (helix
// turns), last point snapped exactly onto `to`. The expressions follow the
// pre-toolpath engines' full-circle loop term for term, so a full turn
// samples to the same numbers they emitted.
export function movePoints(from: Point3D, move: Move): Point3D[] {
  if (move.type === 'line') return [move.to]
  const segments = Math.max(1, Math.round(move.sweep / SEGMENT_RAD))
  const start = move.from ?? from
  const r = move.radius ?? Math.hypot(start.x - move.center.x, start.y - move.center.y)
  const a0 = Math.atan2(start.y - move.center.y, start.x - move.center.x)
  const sign = move.direction === 'ccw' ? 1 : -1
  const points: Point3D[] = []
  for (let i = 1; i < segments; i++) {
    const a = a0 + (sign * move.sweep * i) / segments
    points.push({
      x: move.center.x + r * Math.cos(a),
      y: move.center.y + r * Math.sin(a),
      z: from.z + ((move.to.z - from.z) * i) / segments,
    })
  }
  points.push(move.to)
  return points
}

export class ToolpathBuilder {
  readonly moves: Move[] = []
  current: Point3D

  // skipZeroLength: drop straight moves that don't go anywhere (Adaptive's
  // phase joins). Off by default — other engines emit some on purpose
  // (e.g. `G0 Z<Start Z>` when Start Z equals Safe Z), and their output
  // must stay line-for-line what it was.
  readonly start: Point3D
  private readonly skipZeroLength: boolean

  constructor(start: Point3D, skipZeroLength = false) {
    this.start = start
    this.current = start
    this.skipZeroLength = skipZeroLength
  }

  lineTo(kind: MoveKind, x: number, y: number, z = this.current.z) {
    const c = this.current
    if (this.skipZeroLength && Math.abs(x - c.x) < EPS && Math.abs(y - c.y) < EPS && Math.abs(z - c.z) < EPS) return
    const to = { x, y, z }
    this.moves.push({ type: 'line', kind, to })
    this.current = to
  }

  // G0 in XY only, at the current Z.
  rapidXY(x: number, y: number) {
    this.push({ type: 'line', kind: 'rapid', to: { x, y, z: this.current.z }, axes: 'xy' })
  }

  // Vertical move at the current XY: `G0 Z…` (rapid) or `G1 Z… F<plunge>`.
  zTo(kind: 'rapid' | 'plunge', z: number) {
    this.push({ type: 'line', kind, to: { x: this.current.x, y: this.current.y, z }, axes: 'z' })
  }

  private push(move: Move) {
    this.moves.push(move)
    this.current = move.to
  }

  arc(
    kind: MoveKind,
    center: Point2D,
    direction: ArcDirection,
    sweep: number,
    z = this.current.z,
    exact?: { from: Point2D; radius: number },
  ) {
    const from = exact ? { ...exact.from, z: this.current.z } : this.current
    const to = arcEndPoint(from, center, direction, sweep, z)
    this.moves.push({ type: 'arc', kind, to, center, direction, sweep, ...exact })
    this.current = to
  }

  build(): Toolpath {
    return { start: this.start, moves: this.moves }
  }
}

export const fullTurn = FULL_TURN

export interface GcodeFeeds {
  cut: number
  plunge?: number
  link?: number
  finish?: number
}

// G-code for a toolpath. The first line rapids to `start` in XY (callers
// start every toolpath at Safe Z, where assembleProgram() left the tool);
// after that:
//   rapid          → `G0` with only the axes that change
//   plunge         → `G1 Z… F<plunge>`
//   cut/link/finish → `G1 X… Y… Z… F…`
//   arc            → `G2/G3 X… Y… Z… I… J… F…`, or its G1 polygon when
//                    interpolation is 'linear'
export function toolpathToGcode(
  toolpath: Toolpath,
  opts: { feeds: GcodeFeeds; interpolation: InterpolationMode; leadInRapid?: boolean },
): string[] {
  const lines: string[] = []
  if (opts.leadInRapid ?? true) lines.push(`G0 X${fmt(toolpath.start.x)} Y${fmt(toolpath.start.y)}`)
  const feedFor = (kind: MoveKind) =>
    kind === 'plunge'
      ? (opts.feeds.plunge ?? opts.feeds.cut)
      : kind === 'link'
        ? (opts.feeds.link ?? opts.feeds.cut)
        : kind === 'finish'
          ? (opts.feeds.finish ?? opts.feeds.cut)
          : opts.feeds.cut
  let current = toolpath.start
  for (const move of toolpath.moves) {
    const { to } = move
    if (move.type === 'arc') {
      const feed = feedFor(move.kind)
      if (opts.interpolation === 'arc') {
        const code = move.direction === 'cw' ? 'G2' : 'G3'
        const arcStart = move.from ?? current
        const i = move.center.x - arcStart.x
        const j = move.center.y - arcStart.y
        lines.push(`${code} X${fmt(to.x)} Y${fmt(to.y)} Z${fmt(to.z)} I${fmt(i)} J${fmt(j)} F${fmt(feed)}`)
      } else {
        for (const p of movePoints(current, move)) {
          lines.push(`G1 X${fmt(p.x)} Y${fmt(p.y)} Z${fmt(p.z)} F${fmt(feed)}`)
        }
      }
    } else if (move.axes === 'xy') {
      lines.push(`G0 X${fmt(to.x)} Y${fmt(to.y)}`)
    } else if (move.axes === 'z') {
      lines.push(move.kind === 'plunge' ? `G1 Z${fmt(to.z)} F${fmt(feedFor('plunge'))}` : `G0 Z${fmt(to.z)}`)
    } else if (move.kind === 'rapid') {
      const xyChanged = Math.abs(to.x - current.x) > EPS || Math.abs(to.y - current.y) > EPS
      const zChanged = Math.abs(to.z - current.z) > EPS
      const words = [
        ...(xyChanged ? [`X${fmt(to.x)}`, `Y${fmt(to.y)}`] : []),
        ...(zChanged || !xyChanged ? [`Z${fmt(to.z)}`] : []),
      ]
      lines.push(`G0 ${words.join(' ')}`)
    } else if (move.kind === 'plunge') {
      lines.push(`G1 Z${fmt(to.z)} F${fmt(feedFor('plunge'))}`)
    } else {
      lines.push(`G1 X${fmt(to.x)} Y${fmt(to.y)} Z${fmt(to.z)} F${fmt(feedFor(move.kind))}`)
    }
    current = to
  }
  return lines
}
