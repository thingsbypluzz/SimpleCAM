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

// `height` is the sculpture's height along the axis shown as up (the cut axis
// unless `viewUp` names another), so the scale follows what the preview shows.
export function normalizeMesh(
  raw: Float32Array,
  up: UpAxis,
  flip: boolean,
  height: number,
  viewUp: ViewUp = 'same',
  viewFlip = false,
  turn = 0,
): Mesh {
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

interface Section {
  z: number
  cx: number
  rx: number
  ry: number
}

function loft(sections: Section[], out: number[]) {
  const n = 48
  const point = (s: Section, i: number) => {
    const a = (2 * Math.PI * i) / n
    return [s.cx + s.rx * Math.cos(a), s.ry * Math.sin(a), s.z]
  }
  for (let k = 0; k + 1 < sections.length; k++) {
    for (let i = 0; i < n; i++) {
      const a = point(sections[k], i)
      const b = point(sections[k], i + 1)
      const c = point(sections[k + 1], i + 1)
      const d = point(sections[k + 1], i)
      out.push(...a, ...b, ...c, ...a, ...c, ...d)
    }
  }
  const bottom = sections[0]
  const top = sections[sections.length - 1]
  for (let i = 0; i < n; i++) {
    out.push(bottom.cx, 0, bottom.z, ...point(bottom, i + 1), ...point(bottom, i))
    out.push(top.cx, 0, top.z, ...point(top, i), ...point(top, i + 1))
  }
}

function interpolated(keys: number[][], steps: number, section: (k: number[]) => Section): Section[] {
  const sections: Section[] = []
  const lerp = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t)
  for (let i = 0; i + 1 < keys.length; i++) {
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      sections.push(section(lerp(keys[i], keys[i + 1], (1 - Math.cos(t * Math.PI)) / 2)))
    }
  }
  sections.push(section(keys[keys.length - 1]))
  return sections
}

// A stand-in torso, in the same units as a loaded file: one body and two arms
// that leave it at the shoulder and come back at the hip, so the page can be
// tried without a file and islands show up between the two.
export function demoTorso(): Float32Array {
  const out: number[] = []
  // height, half width, half depth
  const body = [
    [0, 0.26, 0.16],
    [0.2, 0.3, 0.18],
    [0.45, 0.21, 0.13],
    [0.72, 0.3, 0.17],
    [0.85, 0.32, 0.14],
    [0.92, 0.11, 0.1],
    [1, 0.09, 0.09],
  ]
  loft(
    interpolated(body, 6, ([z, rx, ry]) => ({ z, cx: 0, rx, ry })),
    out,
  )
  // height, center x
  const arm = [
    [0.3, 0.27],
    [0.55, 0.42],
    [0.84, 0.3],
  ]
  for (const side of [-1, 1]) {
    loft(
      interpolated(arm, 6, ([z, cx]) => ({ z, cx: side * cx, rx: 0.045, ry: 0.045 })),
      out,
    )
  }
  return Float32Array.from(out)
}
