import { SIM_KINDS, type Simulation, type SimulationPosition } from '../../lib/simulation'
import type { MoveKind } from '../../lib/toolpath'
import type { SimTool } from '../simulation/simTool'
import { project, type LiteCamera } from './camera3d'
import { LITE_MOVE_DASH, LITE_MOVING_POINT_BUDGET, type LiteTheme } from './drawLiteScene'

// BL-100: Simulate in the simplified 3D preview — drawn over
// drawLiteScene() (which leaves the live toolpath out meanwhile): the
// timeline's path split at the tool, travelled stretch dimmed, and the
// tool's outline.

// How much of the toolpath color a travelled stretch keeps — the same mix
// as the full 3D preview (SIM_DONE_COLOR_SHARE there).
const DONE_COLOR_SHARE = 0.3
const TOOL_SAMPLES = 24

// `a` mixed with `b`, `share` of `a` (both #rrggbb).
export function mixHex(a: string, b: string, share: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
  const out = [0, 1, 2].map((i) => Math.round(channel(a, i) * share + channel(b, i) * (1 - share)))
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

// The convex hull of points (monotone chain) — a cylinder's or a cone's
// outline in an orthographic view is exactly the hull of its rims.
function convexHull(points: [number, number][]): [number, number][] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: [number, number][] = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: [number, number][] = []
  for (const p of sorted.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

export function drawLiteSimulation(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  camera: LiteCamera,
  sim: Simulation,
  position: SimulationPosition,
  tool: SimTool,
  theme: LiteTheme,
  showToolpath: boolean,
  moving: boolean,
) {
  const at = (x: number, y: number, z: number) => project(camera, width, height, x, y, z)
  const { points, kinds } = sim
  const segmentCount = kinds.length
  const { segment, point } = position

  if (showToolpath && segmentCount > 0) {
    const stride = moving ? Math.max(1, Math.ceil(segmentCount / LITE_MOVING_POINT_BUDGET)) : 1
    const colorOf = (kind: MoveKind) => (kind === 'rapid' ? theme.rapid : kind === 'link' ? theme.linking : theme.toolpath)
    // One path per kind and side of the tool; each continues from where
    // its last segment ended.
    const paths = new Map<string, { path: Path2D; end: number }>()
    const add = (kind: MoveKind, done: boolean, ax: number, ay: number, az: number, bx: number, by: number, bz: number, from: number, to: number) => {
      const key = `${kind}:${done ? 1 : 0}`
      let entry = paths.get(key)
      if (!entry) {
        entry = { path: new Path2D(), end: -1 }
        paths.set(key, entry)
      }
      if (entry.end !== from) {
        const [x, y] = at(ax, ay, az)
        entry.path.moveTo(x, y)
      }
      const [x, y] = at(bx, by, bz)
      entry.path.lineTo(x, y)
      entry.end = to
    }
    const v = (i: number) => [points[i * 3], points[i * 3 + 1], points[i * 3 + 2]] as const
    // Thinned out, runs of `stride` segments of one kind become one step;
    // the segment under the tool is always split exactly.
    let i = 0
    while (i < segmentCount) {
      if (i === segment) {
        const kind = SIM_KINDS[kinds[i]]
        const [ax, ay, az] = v(i)
        const [bx, by, bz] = v(i + 1)
        add(kind, true, ax, ay, az, point.x, point.y, point.z, i, -2)
        add(kind, false, point.x, point.y, point.z, bx, by, bz, -2, i + 1)
        i++
        continue
      }
      const kind = kinds[i]
      let j = i + 1
      while (j < segmentCount && j - i < stride && kinds[j] === kind && j !== segment) j++
      const [ax, ay, az] = v(i)
      const [bx, by, bz] = v(j)
      add(SIM_KINDS[kind], i < segment, ax, ay, az, bx, by, bz, i, j)
      i = j
    }
    ctx.lineWidth = 1.25
    ctx.lineJoin = 'round'
    for (const [key, { path }] of paths) {
      const [kind, done] = key.split(':') as [MoveKind, string]
      const color = colorOf(kind)
      ctx.setLineDash(LITE_MOVE_DASH[kind])
      ctx.strokeStyle = done === '1' ? mixHex(color, theme.background, DONE_COLOR_SHARE) : color
      ctx.stroke(path)
    }
    ctx.setLineDash([])
  }

  // The tool: the hull of its bottom (or tip) and top rims.
  const rim = (z: number, r: number): [number, number][] =>
    Array.from({ length: TOOL_SAMPLES }, (_, k) => {
      const a = (k / TOOL_SAMPLES) * 2 * Math.PI
      return at(point.x + r * Math.cos(a), point.y + r * Math.sin(a), z)
    })
  const outline = (parts: [number, number][]) => {
    const hull = convexHull(parts)
    if (hull.length < 2) return
    ctx.beginPath()
    hull.forEach(([x, y], k) => (k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
    ctx.closePath()
    ctx.globalAlpha = 0.35
    ctx.fillStyle = theme.toolpath
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.strokeStyle = theme.toolpath
    ctx.lineWidth = 1
    ctx.stroke()
  }
  const bottom = tool.coneHeight > 0 ? [at(point.x, point.y, point.z)] : rim(point.z, tool.radius)
  outline([...bottom, ...rim(point.z + tool.length, tool.radius)])
  outline([...rim(point.z + tool.length, tool.shankRadius), ...rim(point.z + tool.length + tool.shankLength, tool.shankRadius)])
}
