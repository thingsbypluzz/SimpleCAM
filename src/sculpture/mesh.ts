import { STLLoader } from 'three/addons/loaders/STLLoader.js'

export type UpAxis = 'x' | 'y' | 'z'

// Which file axis points up in the 3D preview; 'same' = the cut axis.
export type ViewUp = 'same' | UpAxis

// A triangle soup (9 numbers per triangle) in sculpture coordinates: Z along
// the cut axis (layers stack up Z), standing on Z = 0, centered on X = Y = 0.
export interface Mesh {
  positions: Float32Array
  width: number
  depth: number
  // Extent along the cut axis: the stack's length.
  height: number
  // The direction, in these coordinates, that the 3D preview shows as up.
  viewUp: [number, number, number]
}

// Cosine and sine of a plate turn in degrees, exact on the quarter turns so a
// 90° turn swaps the axes without rounding noise.
function turnTrig(degrees: number): [number, number] {
  const a = (degrees * Math.PI) / 180
  if (degrees % 90 === 0) return [Math.round(Math.cos(a)), Math.round(Math.sin(a))]
  return [Math.cos(a), Math.sin(a)]
}

// File axes → sculpture axes: the up axis becomes Z, then a turn about it by
// `turn` degrees CCW (every plate turned on the table). Rotations only (never
// a mirror), so the sculpture keeps its handedness.
function orient(x: number, y: number, z: number, up: UpAxis, flip: boolean, [cos, sin]: [number, number]): [number, number, number] {
  if (up === 'y') [y, z] = [-z, y]
  else if (up === 'x') [x, z] = [-z, x]
  if (flip) [y, z] = [-y, -z]
  if (sin !== 0 || cos !== 1) [x, y] = [x * cos - y * sin, x * sin + y * cos]
  return [x, y, z]
}

const AXIS_INDEX: Record<UpAxis, number> = { x: 0, y: 1, z: 2 }

export function parseStl(buffer: ArrayBuffer): Float32Array {
  const geometry = new STLLoader().parse(buffer)
  const attribute = geometry.getAttribute('position')
  const positions = new Float32Array(attribute.count * 3)
  for (let i = 0; i < attribute.count; i++) {
    positions[i * 3] = attribute.getX(i)
    positions[i * 3 + 1] = attribute.getY(i)
    positions[i * 3 + 2] = attribute.getZ(i)
  }
  geometry.dispose()
  if (positions.length === 0) throw new Error('The file has no triangles.')
  return positions
}

function signedVolume(p: Float32Array): number {
  let sum = 0
  for (let o = 0; o < p.length; o += 9) {
    sum +=
      p[o] * (p[o + 4] * p[o + 8] - p[o + 5] * p[o + 7]) -
      p[o + 1] * (p[o + 3] * p[o + 8] - p[o + 5] * p[o + 6]) +
      p[o + 2] * (p[o + 3] * p[o + 7] - p[o + 4] * p[o + 6])
  }
  return sum / 6
}

// Triangles repeated with the same three corners (a common STL defect) give
// the slicer doubled and reversed segments, which break the contour chains.
// Copies facing opposite ways cancel each other; what remains of a group
// keeps one triangle facing the majority's way, or none on a tie.
export function dropDuplicateTriangles(positions: Float32Array): Float32Array {
  const count = positions.length / 9
  const corner = (t: number, k: number) => `${positions[t * 9 + k * 3]},${positions[t * 9 + k * 3 + 1]},${positions[t * 9 + k * 3 + 2]}`
  const groups = new Map<string, { first: number; net: number; reversed: number }>()
  for (let t = 0; t < count; t++) {
    const corners = [corner(t, 0), corner(t, 1), corner(t, 2)]
    const key = [...corners].sort().join('|')
    const group = groups.get(key)
    if (!group) {
      groups.set(key, { first: t, net: 1, reversed: -1 })
      continue
    }
    // Same orientation = the corners in the same cyclic order.
    const firstCorners = [corner(group.first, 0), corner(group.first, 1), corner(group.first, 2)]
    const shift = firstCorners.indexOf(corners[0])
    const same = firstCorners[(shift + 1) % 3] === corners[1]
    if (same) group.net++
    else {
      group.net--
      if (group.reversed < 0) group.reversed = t
    }
  }
  if (groups.size === count) return positions
  const out = new Float32Array(groups.size * 9)
  let n = 0
  for (const group of groups.values()) {
    if (group.net === 0) continue
    const t = group.net > 0 ? group.first : group.reversed
    out.set(positions.subarray(t * 9, t * 9 + 9), n * 9)
    n++
  }
  return out.subarray(0, n * 9)
}

// `height` is the sculpture's height along the axis shown as up (the cut axis
// unless `viewUp` names another), so the scale follows what the preview shows.
export function normalizeMesh(
  source: Float32Array,
  up: UpAxis,
  flip: boolean,
  height: number,
  viewUp: ViewUp = 'same',
  viewFlip = false,
  turn = 0,
): Mesh {
  const raw = dropDuplicateTriangles(source)
  const trig = turnTrig(turn)
  // The model is centered before the turn, so the turn is about X0 Y0 and
  // holes placed on one turn can be turned along with it.
  const out = new Float32Array(raw.length)
  for (let i = 0; i < raw.length; i += 3) {
    const [x, y, z] = orient(raw[i], raw[i + 1], raw[i + 2], up, flip, [1, 0])
    out[i] = x
    out[i + 1] = y
    out[i + 2] = z
  }

  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < out.length; i++) {
    const axis = i % 3
    if (out[i] < min[axis]) min[axis] = out[i]
    if (out[i] > max[axis]) max[axis] = out[i]
  }
  if (!(max[2] - min[2] > 0)) throw new Error('The model is flat along the chosen up axis.')
  const shownUp: UpAxis = viewUp === 'same' ? up : viewUp
  let sourceHeight = max[2] - min[2]
  if (viewUp !== 'same') {
    const k = AXIS_INDEX[shownUp]
    let lo = Infinity
    let hi = -Infinity
    for (let i = k; i < raw.length; i += 3) {
      if (raw[i] < lo) lo = raw[i]
      if (raw[i] > hi) hi = raw[i]
    }
    sourceHeight = hi - lo
    if (!(sourceHeight > 0)) throw new Error('The model is flat along the view up axis.')
  }
  const scale = height / sourceHeight
  const unit: [number, number, number] = [0, 0, 0]
  unit[AXIS_INDEX[shownUp]] = viewFlip && viewUp !== 'same' ? -1 : 1
  const sameUp = viewUp === 'same'
  const viewUpVector: [number, number, number] = sameUp ? [0, 0, 1] : orient(unit[0], unit[1], unit[2], up, flip, trig)
  const cx = (min[0] + max[0]) / 2
  const cy = (min[1] + max[1]) / 2
  const [cos, sin] = trig
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (let i = 0; i < out.length; i += 3) {
    const x = (out[i] - cx) * scale
    const y = (out[i + 1] - cy) * scale
    out[i] = x * cos - y * sin
    out[i + 1] = x * sin + y * cos
    out[i + 2] = (out[i + 2] - min[2]) * scale
    minX = Math.min(minX, out[i])
    maxX = Math.max(maxX, out[i])
    minY = Math.min(minY, out[i + 1])
    maxY = Math.max(maxY, out[i + 1])
  }

  // An inside-out mesh would slice to nothing but holes.
  if (signedVolume(out) < 0) {
    for (let o = 0; o < out.length; o += 9) {
      for (let k = 0; k < 3; k++) {
        const swap = out[o + 3 + k]
        out[o + 3 + k] = out[o + 6 + k]
        out[o + 6 + k] = swap
      }
    }
  }

  return {
    positions: out,
    width: maxX - minX,
    depth: maxY - minY,
    height: (max[2] - min[2]) * scale,
    viewUp: viewUpVector,
  }
}
