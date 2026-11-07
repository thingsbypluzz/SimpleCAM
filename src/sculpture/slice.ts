import type { Ring } from './geometry'

// Cross-sections of a triangle soup (9 numbers per triangle, outward normals)
// at a sorted list of heights.

export interface SliceResult {
  rings: Ring[]
  // Chains that never closed into a ring: holes in the mesh.
  openChains: number
}

// Chain ends this close are joined, so a crack in the mesh (vertices of
// neighbouring triangles a hair apart) does not lose the contour; a wider gap
// is a real hole and the chain is dropped.
const CLOSE_GAP = 1

function pointKey(x: number, y: number): string {
  return `${Math.round(x * 1000)},${Math.round(y * 1000)}`
}

function firstAbove(heights: number[], value: number): number {
  let lo = 0
  let hi = heights.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (heights[mid] > value) hi = mid
    else lo = mid + 1
  }
  return lo
}

function chainRings(segments: number[]): SliceResult {
  const count = segments.length / 4
  const byStart = new Map<string, number[]>()
  const endKeys = new Set<string>()
  for (let i = 0; i < count; i++) {
    const key = pointKey(segments[i * 4], segments[i * 4 + 1])
    const list = byStart.get(key)
    if (list) list.push(i)
    else byStart.set(key, [i])
    endKeys.add(pointKey(segments[i * 4 + 2], segments[i * 4 + 3]))
  }

  // Walks from segments nothing leads into go first: a contour broken by a
  // crack in the mesh then comes out as one whole open piece, not as several
  // fragments depending on where the walk happened to start.
  const order: number[] = []
  for (let i = 0; i < count; i++) if (!endKeys.has(pointKey(segments[i * 4], segments[i * 4 + 1]))) order.push(i)
  for (let i = 0; i < count; i++) order.push(i)

  const used = new Uint8Array(count)
  const rings: Ring[] = []
  const open: Ring[] = []
  for (const i of order) {
    if (used[i]) continue
    used[i] = 1
    const startKey = pointKey(segments[i * 4], segments[i * 4 + 1])
    const ring: Ring = [{ x: segments[i * 4], y: segments[i * 4 + 1] }]
    let current = i
    let closed = false
    for (;;) {
      const x = segments[current * 4 + 2]
      const y = segments[current * 4 + 3]
      const key = pointKey(x, y)
      if (key === startKey) {
        closed = true
        break
      }
      ring.push({ x, y })
      const candidates = byStart.get(key)
      let next = -1
      while (candidates && candidates.length > 0) {
        const candidate = candidates.pop() as number
        if (!used[candidate]) {
          next = candidate
          break
        }
      }
      if (next < 0) break
      used[next] = 1
      current = next
    }
    if (closed) {
      if (ring.length >= 3) rings.push(ring)
    } else {
      open.push(ring)
    }
  }

  // Open pieces are joined end to nearest start (their own start closes the
  // ring) while the gap stays under CLOSE_GAP; whatever remains is a real hole.
  let openChains = 0
  while (open.length > 0) {
    let piece = open.pop() as Ring
    for (;;) {
      const end = piece[piece.length - 1]
      let best = Math.hypot(end.x - piece[0].x, end.y - piece[0].y)
      let bestIndex = -1
      open.forEach((other, index) => {
        const d = Math.hypot(end.x - other[0].x, end.y - other[0].y)
        if (d < best) {
          best = d
          bestIndex = index
        }
      })
      if (best > CLOSE_GAP) {
        openChains++
        break
      }
      if (bestIndex < 0) {
        if (piece.length >= 3) rings.push(piece)
        break
      }
      piece = [...piece, ...open[bestIndex]]
      open.splice(bestIndex, 1)
    }
  }
  return { rings, openChains }
}

// A vertex exactly on a plane counts as above it, so a plane through a vertex
// or a flat face needs no special case. Interpolation always runs from the
// lower to the upper vertex: both triangles sharing an edge then get the same
// number to the last bit, which is what lets the chains link up.
export function sliceMesh(positions: Float32Array, heights: number[]): SliceResult[] {
  const segments: number[][] = heights.map(() => [])
  const triangles = positions.length / 9
  for (let t = 0; t < triangles; t++) {
    const o = t * 9
    const za = positions[o + 2]
    const zb = positions[o + 5]
    const zc = positions[o + 8]
    const zMin = Math.min(za, zb, zc)
    const zMax = Math.max(za, zb, zc)
    for (let h = firstAbove(heights, zMin); h < heights.length && heights[h] <= zMax; h++) {
      const height = heights[h]
      let sx = 0
      let sy = 0
      let ex = 0
      let ey = 0
      for (let edge = 0; edge < 3; edge++) {
        const i = o + edge * 3
        const j = o + ((edge + 1) % 3) * 3
        const aboveI = positions[i + 2] >= height
        const aboveJ = positions[j + 2] >= height
        if (aboveI === aboveJ) continue
        const low = aboveI ? j : i
        const high = aboveI ? i : j
        const k = (height - positions[low + 2]) / (positions[high + 2] - positions[low + 2])
        const x = positions[low] + k * (positions[high] - positions[low])
        const y = positions[low + 1] + k * (positions[high + 1] - positions[low + 1])
        // Going down an edge starts the segment, going up ends it: with an
        // outward normal this keeps the material on the left, outer rings CCW.
        if (aboveI) {
          sx = x
          sy = y
        } else {
          ex = x
          ey = y
        }
      }
      if (pointKey(sx, sy) !== pointKey(ex, ey)) segments[h].push(sx, sy, ex, ey)
    }
  }
  return segments.map(chainRings)
}
