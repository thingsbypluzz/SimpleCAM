// Test-only material simulation for Pocket Adaptive: sweeps the tool disk
// along a move list over a pixel grid — checks that the whole pocket gets
// cleared, that the tool never crosses the wall, and (coarsely) how much
// linking moves touch. A 0.002 mm version of the same idea was used once to
// validate the engagement model itself (see CHANGELOG, OP-5).
import { adaptiveMovePoints, type AdaptiveMove, type AdaptiveToolpath, type Point3D } from './pocketAdaptive'

export interface SimResult {
  maxCutEngagementDeg: number
  maxLinkEngagementDeg: number
  // Material cells deeper than `wallTolerance` inside the reachable pocket
  // still uncut after the whole toolpath (scallops thinner than that on
  // the walls are accepted by design — no finishing pass, BL-42).
  uncutInteriorCells: number
  // Largest distance a tool-center sample strayed outside the allowed
  // tool-center region.
  maxWallViolation: number
  // Where the worst cutting engagement happened (debugging aid).
  maxCutAt: { moveIndex: number; x: number; y: number } | null
  uncutAt: { x: number; y: number } | null
}

export interface SimOptions {
  toolRadius: number
  cell: number
  // Material region test (the pocket as a round tool can reach it), a
  // stricter "deeper than the wall tolerance" variant used only for the
  // coverage count, and the tool-center overshoot measure.
  isMaterial: (x: number, y: number) => boolean
  isInterior: (x: number, y: number) => boolean
  toolCenterOvershoot: (x: number, y: number) => number
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
  // Moves to clear without measuring (helix entry: a full-width bore by
  // design, its load is controlled axially by the ramp angle, not radially).
  isUnmeasured: (moveIndex: number) => boolean
  // Minimum stock thickness behind the tool edge for a contact to count
  // (see engagementDeg below).
  minChip: number
  // Follow arcs as true arcs (G2/G3 output) instead of the 5° G1 polygon.
  trueArcs?: boolean
  // Probe cutting moves too (slow); by default only linking moves are.
  measureCuts?: boolean
}

function finePoints(from: Point3D, move: AdaptiveMove): Point3D[] {
  if (move.type === 'line') return [move.to]
  const n = Math.max(1, Math.ceil(move.sweep / ((0.5 * Math.PI) / 180)))
  const r = Math.hypot(from.x - move.center.x, from.y - move.center.y)
  const a0 = Math.atan2(from.y - move.center.y, from.x - move.center.x)
  const sign = move.direction === 'ccw' ? 1 : -1
  const pts: Point3D[] = []
  for (let i = 1; i <= n; i++) {
    const t = i / n
    const a = a0 + sign * move.sweep * t
    pts.push({ x: move.center.x + r * Math.cos(a), y: move.center.y + r * Math.sin(a), z: from.z + (move.to.z - from.z) * t })
  }
  return pts
}

export function simulateEngagement(toolpath: AdaptiveToolpath, o: SimOptions): SimResult {
  const { cell, toolRadius: R } = o
  const nx = Math.ceil((o.bounds.maxX - o.bounds.minX) / cell) + 1
  const ny = Math.ceil((o.bounds.maxY - o.bounds.minY) / cell) + 1
  const cleared = new Uint8Array(nx * ny)
  const idx = (x: number, y: number) => {
    const i = Math.round((x - o.bounds.minX) / cell)
    const j = Math.round((y - o.bounds.minY) / cell)
    return i < 0 || j < 0 || i >= nx || j >= ny ? -1 : j * nx + i
  }
  const isUncut = (x: number, y: number) => {
    if (!o.isMaterial(x, y)) return false
    const k = idx(x, y)
    return k >= 0 && cleared[k] === 0
  }
  // Row-wise span fill — fast enough for a fine grid (a per-cell loop over
  // the disk's bounding box is ~100× slower at cell = 0.02 mm).
  const clearDisk = (cx: number, cy: number) => {
    const j0 = Math.max(0, Math.ceil((cy - R - o.bounds.minY) / cell))
    const j1 = Math.min(ny - 1, Math.floor((cy + R - o.bounds.minY) / cell))
    for (let j = j0; j <= j1; j++) {
      const dy = o.bounds.minY + j * cell - cy
      const half = Math.sqrt(Math.max(0, R * R - dy * dy))
      const i0 = Math.max(0, Math.ceil((cx - half - o.bounds.minX) / cell))
      const i1 = Math.min(nx - 1, Math.floor((cx + half - o.bounds.minX) / cell))
      if (i1 >= i0) cleared.fill(1, j * nx + i0, j * nx + i1 + 1)
    }
  }
  const PROBES = 90
  // Contact probed just outside the tool edge (inside it, the previous
  // sample of this same move has already cleared the cells). Coarse by
  // design: where the cleared boundary nearly coincides with the tool
  // circle (tight corner arcs) grid rounding inflates the angle, so this is
  // a sanity measure, not a precision one — the engagement bound itself is
  // checked analytically in pocketAdaptive.test.ts. Contacts count only
  // where at least `minChip` of stock sits behind the probe.
  const engagementDeg = (x: number, y: number, dx: number, dy: number) => {
    const heading = Math.atan2(dy, dx)
    const r0 = R + cell
    let hits = 0
    for (let p = 0; p < PROBES; p++) {
      const a = heading - Math.PI / 2 + (Math.PI * (p + 0.5)) / PROBES
      const c = Math.cos(a)
      const sn = Math.sin(a)
      if (isUncut(x + r0 * c, y + r0 * sn) && isUncut(x + (r0 + o.minChip) * c, y + (r0 + o.minChip) * sn)) hits++
    }
    return (hits * 180) / PROBES
  }

  let maxCut = 0
  let maxLink = 0
  let maxViolation = 0
  let maxCutAt: SimResult['maxCutAt'] = null
  let current: Point3D = toolpath.start
  toolpath.moves.forEach((move, m) => {
    const measured = !o.isUnmeasured(m) && (move.kind === 'link' || o.measureCuts === true)
    let prev = current
    for (const p of o.trueArcs ? finePoints(current, move) : adaptiveMovePoints(current, move)) {
      const len = Math.hypot(p.x - prev.x, p.y - prev.y)
      const n = Math.max(1, Math.ceil(len / (cell / 2)))
      for (let s = 1; s <= n; s++) {
        const x = prev.x + ((p.x - prev.x) * s) / n
        const y = prev.y + ((p.y - prev.y) * s) / n
        maxViolation = Math.max(maxViolation, o.toolCenterOvershoot(x, y))
        if (measured) {
          const e = engagementDeg(x, y, p.x - prev.x, p.y - prev.y)
          if (move.kind === 'link') {
            maxLink = Math.max(maxLink, e)
          } else if (e > maxCut) {
            maxCut = e
            maxCutAt = { moveIndex: m, x, y }
          }
        }
        clearDisk(x, y)
      }
      prev = p
    }
    current = move.to
  })

  let uncut = 0
  let uncutAt: { x: number; y: number } | null = null
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = o.bounds.minX + i * cell
      const y = o.bounds.minY + j * cell
      if (cleared[j * nx + i] === 0 && o.isInterior(x, y)) {
        uncut++
        uncutAt ??= { x, y }
      }
    }
  }
  return { maxCutEngagementDeg: maxCut, maxLinkEngagementDeg: maxLink, uncutInteriorCells: uncut, maxWallViolation: maxViolation, maxCutAt, uncutAt }
}
