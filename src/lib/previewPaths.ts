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

// A run of consecutive moves of one kind, as points: x, y, z, x, y, z, …
export interface PreviewPolyline {
  kind: MoveKind
  points: Float32Array
}

function pushPoint(out: number[], p: Point3D) {
  out.push(p.x, p.y, p.z)
}

// Everything the tool does for `params`, as polylines: every toolpath with
// its arcs sampled as the G1 output samples them (movePoints()), the
// retract to Safe Z the program appends after each one, and the rapid at
// Safe Z from one toolpath to the next (hole to hole).
export function previewPolylines(params: WizardParams): PreviewPolyline[] {
  const { safeZ } = params.feeds
  const lines: PreviewPolyline[] = []
  let previousEnd: Point3D | null = null

  for (const toolpath of operationToolpaths(params)) {
    if (previousEnd) {
      lines.push({
        kind: 'rapid',
        points: new Float32Array([previousEnd.x, previousEnd.y, safeZ, toolpath.start.x, toolpath.start.y, safeZ]),
      })
    }

    let current = toolpath.start
    let kind: MoveKind | null = null
    let run: number[] = []
    const flush = () => {
      if (kind !== null && run.length > 3) lines.push({ kind, points: new Float32Array(run) })
    }
    for (const move of toolpath.moves) {
      if (move.kind !== kind) {
        flush()
        kind = move.kind
        run = []
        pushPoint(run, current)
      }
      for (const p of movePoints(current, move)) pushPoint(run, p)
      current = move.to
    }
    flush()

    lines.push({ kind: 'rapid', points: new Float32Array([current.x, current.y, current.z, current.x, current.y, safeZ]) })
    previousEnd = current
  }
  return lines
}
