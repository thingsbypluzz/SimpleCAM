import { cellLoop, cellWallDistance, type LightCell } from './pocketLightened'
import { movePoints, type Point3D, type Toolpath } from './toolpath'
import type { Point2D } from '../types/wizard'

// Test-only helpers for Lightened Adaptive cells (BL-83, BL-85).

// The toolpath split at its rapids: one run of moves per cell (rapids hop
// between cells above the stock, which the XY-only simulator can't tell).
export function cellRuns(tp: Toolpath): Toolpath[] {
  const runs: Toolpath[] = []
  let current: Point3D = tp.start
  let run: Toolpath | null = null
  for (const move of tp.moves) {
    if (move.kind === 'rapid') {
      run = null
    } else {
      if (!run) {
        run = { start: current, moves: [] }
        runs.push(run)
      }
      run.moves.push(move)
    }
    current = move.to
  }
  return runs
}

export function distanceToPolygon(p: Point2D, v: Point2D[]): number {
  let best = Infinity
  for (let i = 0; i < v.length; i++) {
    const a = v[i]
    const b = v[(i + 1) % v.length]
    const ex = b.x - a.x
    const ey = b.y - a.y
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / (ex * ex + ey * ey)))
    best = Math.min(best, Math.hypot(p.x - a.x - ex * t, p.y - a.y - ey * t))
  }
  return best
}

// Area (mm²) of cell material a run's LINK moves remove that no cutting
// move had removed before them — links must only travel through cleared
// area. (The simulator's link reading counts edge contact with the uncut
// boundary; returning along a peel arc's chord touches it at sharp corners
// without removing anything, so the removed area is the honest measure.)
export function linkRemovedArea(run: Toolpath, cell: LightCell, R: number, grid: number, onlyLink?: (i: number) => boolean): number {
  const tc = cellLoop(cell, R)
  const minX = Math.min(...tc.map((q) => q.x)) - R - 1
  const minY = Math.min(...tc.map((q) => q.y)) - R - 1
  const nx = Math.ceil((Math.max(...tc.map((q) => q.x)) + R + 1 - minX) / grid)
  const ny = Math.ceil((Math.max(...tc.map((q) => q.y)) + R + 1 - minY) / grid)
  const material = new Uint8Array(nx * ny)
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) material[j * nx + i] = cellWallDistance(cell, { x: minX + i * grid, y: minY + j * grid }) >= 0 ? 1 : 0
  const cleared = new Uint8Array(nx * ny)
  let byLinks = 0
  // Row spans of the tool disk: cuts just fill them, links count what they
  // newly clear.
  const stamp = (x: number, y: number, count: boolean) => {
    const j0 = Math.max(0, Math.ceil((y - R - minY) / grid))
    const j1 = Math.min(ny - 1, Math.floor((y + R - minY) / grid))
    for (let j = j0; j <= j1; j++) {
      const dy = minY + j * grid - y
      const half = Math.sqrt(Math.max(0, R * R - dy * dy))
      const i0 = Math.max(0, Math.ceil((x - half - minX) / grid))
      const i1 = Math.min(nx - 1, Math.floor((x + half - minX) / grid))
      if (i1 < i0) continue
      if (count) for (let k = j * nx + i0; k <= j * nx + i1; k++) if (material[k] && !cleared[k]) byLinks++
      cleared.fill(1, j * nx + i0, j * nx + i1 + 1)
    }
  }
  let cur: Point3D = run.start
  run.moves.forEach((m, idx) => {
    const count = m.kind === 'link' && (onlyLink ? onlyLink(idx) : true)
    let prev = cur
    for (const q of movePoints(cur, m)) {
      const n = Math.max(1, Math.ceil(Math.hypot(q.x - prev.x, q.y - prev.y) / (grid / 2)))
      for (let t = 1; t <= n; t++) stamp(prev.x + ((q.x - prev.x) * t) / n, prev.y + ((q.y - prev.y) * t) / n, count)
      prev = q
    }
    cur = m.to
  })
  return byLinks * grid * grid
}

export function cellOf(cells: LightCell[], p: Point2D): LightCell {
  return cells.reduce((best, c) => (cellWallDistance(c, p) > cellWallDistance(best, p) ? c : best))
}

