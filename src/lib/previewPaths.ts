import type { WizardParams } from '../types/wizard'
import { buildDrillToolpath, drillOptions } from './drill'
import { buildFacingToolpath } from './facing'
import { buildHelixCircleToolpath, holeCircleOptions } from './helix'
import { circleOutlineOptions } from './outlineCircle'
import { buildLobedToolpath } from './outlineLobed'
import { buildRectRampToolpath, buildRectStandardToolpath, rectOutlineOptions } from './outlineRectangle'
import { buildPocketToolpath } from './pocket'
import { resolvePoints } from './positioning'
import { buildStandardCircleToolpath } from './standardHole'
import { buildSurfaceToolpath } from './surface'
import { buildTextToolpath } from './text'
import { movePoints, type MoveKind, type Point3D, type Toolpath } from './toolpath'

// The engines' own move lists for one set of parameters — what the G-code
// is formatted from — for whoever draws them: the 3D scene and the
// simplified 3D preview. One toolpath per operation, one per hole for
// Hole(s) (in machining order).
export function operationToolpaths(params: WizardParams): Toolpath[] {
  switch (params.operation) {
    case 'holes': {
      if (params.method === 'drill') {
        const opts = drillOptions(params)
        return resolvePoints(params.geometry).map((p) => buildDrillToolpath(p.x, p.y, opts))
      }
      const opts = holeCircleOptions(params)
      const build = params.method === 'helix' ? buildHelixCircleToolpath : buildStandardCircleToolpath
      return resolvePoints(params.geometry).map((p) => build(p.x, p.y, opts))
    }
    case 'outline': {
      const { outline } = params
      if (outline.shape === 'lobedCircle') return [buildLobedToolpath(params)]
      if (outline.shape === 'circle') {
        const build = outline.method === 'helix' ? buildHelixCircleToolpath : buildStandardCircleToolpath
        return [build(outline.offsetX, outline.offsetY, circleOutlineOptions(params))]
      }
      const build = outline.method === 'ramp' ? buildRectRampToolpath : buildRectStandardToolpath
      return [build(outline.offsetX, outline.offsetY, rectOutlineOptions(params))]
    }
    case 'surface':
      return [buildSurfaceToolpath(params)]
    case 'pocket':
      return [buildPocketToolpath(params)]
    case 'facing':
      return [buildFacingToolpath(params)]
    case 'text':
      return [buildTextToolpath(params)]
  }
}

export interface ProgramVisitor {
  // Where the tool is when the program's first toolpath begins.
  start: (p: Point3D) => void
  // Each next point, with the kind of the move that reaches it.
  point: (kind: MoveKind, p: Point3D) => void
}

// The whole program as the tool moves through it, point by point: every
// toolpath with its arcs sampled as the G1 output samples them
// (movePoints()), the retract to Safe Z the program appends after each one,
// and the rapid at Safe Z from one toolpath to the next (hole to hole).
// The one walk behind previewPolylines() and the simulation's timeline
// (lib/simulation.ts), so the two can't drift apart.
export function walkProgram(params: WizardParams, visit: ProgramVisitor): void {
  const { safeZ } = params.feeds
  let current: Point3D | null = null
  for (const toolpath of operationToolpaths(params)) {
    if (current) visit.point('rapid', { x: toolpath.start.x, y: toolpath.start.y, z: safeZ })
    else visit.start(toolpath.start)
    current = toolpath.start
    for (const move of toolpath.moves) {
      for (const p of movePoints(current, move)) visit.point(move.kind, p)
      current = move.to
    }
    current = { x: current.x, y: current.y, z: safeZ }
    visit.point('rapid', current)
  }
}

// A run of consecutive moves of one kind, as points: x, y, z, x, y, z, …
export interface PreviewPolyline {
  kind: MoveKind
  points: Float32Array
}

// Everything the tool does for `params` (walkProgram()), as polylines —
// one per run of moves of one kind, each starting where the previous ended.
export function previewPolylines(params: WizardParams): PreviewPolyline[] {
  const lines: PreviewPolyline[] = []
  let kind: MoveKind | null = null
  let run: number[] = []
  let last: Point3D = { x: 0, y: 0, z: 0 }
  const flush = () => {
    if (kind !== null && run.length > 3) lines.push({ kind, points: new Float32Array(run) })
  }
  walkProgram(params, {
    start: (p) => {
      last = p
    },
    point: (k, p) => {
      if (k !== kind) {
        flush()
        kind = k
        run = [last.x, last.y, last.z]
      }
      run.push(p.x, p.y, p.z)
      last = p
    },
  })
  flush()
  return lines
}
