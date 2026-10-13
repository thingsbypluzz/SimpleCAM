// Camera math of the simplified 3D preview (LitePreview3D.tsx) — an
// orthographic view of CNC space, pure functions, no rendering library.
//
// The view is two angles: `yaw` turns the world about the Z axis, `pitch`
// is how far the camera is raised above the table (0 — looking along the
// table, π/2 — straight down). `cx`/`cy` is the point of the view plane at
// the middle of the canvas, `scale` is px per mm.

export interface LiteCamera {
  yaw: number
  pitch: number
  scale: number
  cx: number
  cy: number
}

export interface Box3 {
  min: readonly [number, number, number]
  max: readonly [number, number, number]
}

export type LiteViewName = 'top' | 'isometric' | 'front' | 'side'

// The same four views as the full 3D preview: Front looks along +Y from a
// little above, Side along -X, Isometric from quadrant III.
export const LITE_VIEWS: Record<LiteViewName, { yaw: number; pitch: number }> = {
  top: { yaw: 0, pitch: Math.PI / 2 },
  isometric: { yaw: -Math.PI / 4, pitch: Math.atan(1 / Math.SQRT2) },
  front: { yaw: 0, pitch: Math.PI / 12 },
  side: { yaw: Math.PI / 2, pitch: Math.PI / 12 },
}

export const MIN_ZOOM_FACTOR = 0.2
export const MAX_ZOOM_FACTOR = 20
const DEFAULT_PADDING = 56

// A world point in the view plane: u to the right, v up (mm).
export function viewPoint(camera: Pick<LiteCamera, 'yaw' | 'pitch'>, x: number, y: number, z: number): [number, number] {
  const c = Math.cos(camera.yaw)
  const s = Math.sin(camera.yaw)
  const depth = -x * s + y * c
  return [x * c + y * s, depth * Math.sin(camera.pitch) + z * Math.cos(camera.pitch)]
}

export function project(camera: LiteCamera, width: number, height: number, x: number, y: number, z: number): [number, number] {
  const [u, v] = viewPoint(camera, x, y, z)
  return [width / 2 + (u - camera.cx) * camera.scale, height / 2 - (v - camera.cy) * camera.scale]
}

// Frames `box` at the given angles: all eight corners inside the canvas,
// `padding` px clear on every side.
export function fitCamera(
  view: Pick<LiteCamera, 'yaw' | 'pitch'>,
  box: Box3,
  width: number,
  height: number,
  padding = DEFAULT_PADDING,
): LiteCamera {
  let minU = Infinity
  let maxU = -Infinity
  let minV = Infinity
  let maxV = -Infinity
  for (const x of [box.min[0], box.max[0]]) {
    for (const y of [box.min[1], box.max[1]]) {
      for (const z of [box.min[2], box.max[2]]) {
        const [u, v] = viewPoint(view, x, y, z)
        minU = Math.min(minU, u)
        maxU = Math.max(maxU, u)
        minV = Math.min(minV, v)
        maxV = Math.max(maxV, v)
      }
    }
  }
  const spanU = Math.max(maxU - minU, 1)
  const spanV = Math.max(maxV - minV, 1)
  const scale = Math.min(Math.max(width - 2 * padding, 1) / spanU, Math.max(height - 2 * padding, 1) / spanV)
  return { yaw: view.yaw, pitch: view.pitch, scale, cx: (minU + maxU) / 2, cy: (minV + maxV) / 2 }
}

export function clampScale(scale: number, fitScale: number): number {
  return Math.min(Math.max(scale, fitScale * MIN_ZOOM_FACTOR), fitScale * MAX_ZOOM_FACTOR)
}

// Turns the view by the given angles about `pivot` — the pivot stays where
// it is on screen. The pitch stops at the table and at straight down.
export function orbitBy(camera: LiteCamera, dYaw: number, dPitch: number, pivot: readonly [number, number, number]): LiteCamera {
  const [u0, v0] = viewPoint(camera, pivot[0], pivot[1], pivot[2])
  const turned = { yaw: camera.yaw + dYaw, pitch: Math.min(Math.max(camera.pitch + dPitch, 0), Math.PI / 2) }
  const [u1, v1] = viewPoint(turned, pivot[0], pivot[1], pivot[2])
  return { ...turned, scale: camera.scale, cx: u1 - (u0 - camera.cx), cy: v1 - (v0 - camera.cy) }
}

// Pans by a screen-space delta: the content follows the pointer.
export function panBy(camera: LiteCamera, dx: number, dy: number): LiteCamera {
  return { ...camera, cx: camera.cx - dx / camera.scale, cy: camera.cy + dy / camera.scale }
}

// Scales by `factor` keeping what is under screen point (px, py) in place.
export function zoomAt(
  camera: LiteCamera,
  width: number,
  height: number,
  px: number,
  py: number,
  factor: number,
  fitScale: number,
): LiteCamera {
  const u = camera.cx + (px - width / 2) / camera.scale
  const v = camera.cy - (py - height / 2) / camera.scale
  const scale = clampScale(camera.scale * factor, fitScale)
  return { ...camera, scale, cx: u - (px - width / 2) / scale, cy: v + (py - height / 2) / scale }
}

// Two fingers: a pinch about the point between them plus a drag of that
// point, from the camera at the gesture's start (see camera2d.ts).
export function pinchCamera(
  start: LiteCamera,
  width: number,
  height: number,
  startMid: readonly [number, number],
  mid: readonly [number, number],
  spread: number,
  fitScale: number,
): LiteCamera {
  return panBy(zoomAt(start, width, height, startMid[0], startMid[1], spread, fitScale), mid[0] - startMid[0], mid[1] - startMid[1])
}
