// Pure camera math for the 2D toolpath preview (BL-11) — the 2D
// counterpart of preview3d/cameraPresets.ts, but simpler: 2D has no
// rotation, so a "camera" here is just a center point in world/mm space
// plus a scale (screen px per mm).

export interface DataBounds {
  dataMinX: number
  dataMaxX: number
  dataMinY: number
  dataMaxY: number
}

export interface Camera2D {
  scale: number
  centerX: number
  centerY: number
}

const DEFAULT_PADDING = 40

// Fit-to-data: the same math the 2D preview always used before BL-11
// introduced a persistent camera — scale/center chosen so `bounds` fills
// the canvas with `padding` px of margin on every side.
export function computeFitCamera(
  bounds: DataBounds,
  width: number,
  height: number,
  padding = DEFAULT_PADDING,
): Camera2D {
  const dataWidth = Math.max(bounds.dataMaxX - bounds.dataMinX, 1)
  const dataHeight = Math.max(bounds.dataMaxY - bounds.dataMinY, 1)
  const availW = Math.max(width - padding * 2, 1)
  const availH = Math.max(height - padding * 2, 1)
  const scale = Math.min(availW / dataWidth, availH / dataHeight)
  return {
    scale,
    centerX: (bounds.dataMinX + bounds.dataMaxX) / 2,
    centerY: (bounds.dataMinY + bounds.dataMaxY) / 2,
  }
}

// Zoom is clamped relative to the fit-to-data scale rather than an
// absolute px/mm constant, so the range self-adjusts to pattern size
// (a tiny single hole and a huge grid both get a sensible zoom range) —
// /grill-me decision.
export const MIN_ZOOM_FACTOR = 0.2
export const MAX_ZOOM_FACTOR = 20

export function clampScale(scale: number, fitScale: number): number {
  return Math.min(Math.max(scale, fitScale * MIN_ZOOM_FACTOR), fitScale * MAX_ZOOM_FACTOR)
}

// Screen <-> world conversions. Consistent with the rest of the app's
// convention (world +Y = screen up): px = width/2 + (x-centerX)*scale,
// py = height/2 - (y-centerY)*scale.
export function worldToScreen(
  camera: Camera2D,
  width: number,
  height: number,
  x: number,
  y: number,
): [number, number] {
  return [width / 2 + (x - camera.centerX) * camera.scale, height / 2 - (y - camera.centerY) * camera.scale]
}

export function screenToWorld(
  camera: Camera2D,
  width: number,
  height: number,
  px: number,
  py: number,
): [number, number] {
  return [camera.centerX + (px - width / 2) / camera.scale, camera.centerY - (py - height / 2) / camera.scale]
}

// Scales by `factor` (>1 zooms in) while keeping the world point currently
// under screen position (px, py) fixed on screen — standard "zoom to
// cursor" behavior.
export function zoomAt(
  camera: Camera2D,
  width: number,
  height: number,
  px: number,
  py: number,
  factor: number,
  fitScale: number,
): Camera2D {
  const [worldX, worldY] = screenToWorld(camera, width, height, px, py)
  const newScale = clampScale(camera.scale * factor, fitScale)
  return {
    scale: newScale,
    centerX: worldX - (px - width / 2) / newScale,
    centerY: worldY + (py - height / 2) / newScale,
  }
}

// Pans by a screen-space delta (dx, dy in px) — dragging right/down moves
// the visible content right/down, following the cursor (a "grab and drag"
// pan, not a camera-move-in-the-opposite-direction pan).
export function panBy(camera: Camera2D, dx: number, dy: number): Camera2D {
  return {
    scale: camera.scale,
    centerX: camera.centerX - dx / camera.scale,
    centerY: camera.centerY + dy / camera.scale,
  }
}
