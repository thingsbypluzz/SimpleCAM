import { describe, expect, it } from 'vitest'
import { MAX_ZOOM_FACTOR, MIN_ZOOM_FACTOR, clampScale, computeFitCamera, gestureCamera, panBy, screenToWorld, worldToScreen, zoomAt } from './camera2d'

describe('computeFitCamera', () => {
  it('centers on the bounds midpoint and picks the tighter of the two axis scales', () => {
    const bounds = { dataMinX: 0, dataMaxX: 100, dataMinY: 0, dataMaxY: 50 }
    const camera = computeFitCamera(bounds, 400, 300, 40)
    expect(camera.centerX).toBe(50)
    expect(camera.centerY).toBe(25)
    // availW = 400-80=320 -> 320/100=3.2; availH = 300-80=220 -> 220/50=4.4
    expect(camera.scale).toBeCloseTo(3.2)
  })
})

describe('clampScale', () => {
  it('clamps to [fitScale * MIN_ZOOM_FACTOR, fitScale * MAX_ZOOM_FACTOR]', () => {
    const fitScale = 5
    expect(clampScale(0.0001, fitScale)).toBeCloseTo(fitScale * MIN_ZOOM_FACTOR)
    expect(clampScale(1e9, fitScale)).toBeCloseTo(fitScale * MAX_ZOOM_FACTOR)
    expect(clampScale(fitScale * 2, fitScale)).toBeCloseTo(fitScale * 2)
  })
})

describe('worldToScreen / screenToWorld', () => {
  const camera = { scale: 2, centerX: 10, centerY: -5 }
  const width = 400
  const height = 300

  it('round-trips a world point through screen space', () => {
    const [px, py] = worldToScreen(camera, width, height, 12, -2)
    const [x, y] = screenToWorld(camera, width, height, px, py)
    expect(x).toBeCloseTo(12)
    expect(y).toBeCloseTo(-2)
  })

  it('places the camera center at the canvas center', () => {
    expect(worldToScreen(camera, width, height, camera.centerX, camera.centerY)).toEqual([
      width / 2,
      height / 2,
    ])
  })

  it('flips Y so world-up renders screen-up', () => {
    const [, pyUp] = worldToScreen(camera, width, height, camera.centerX, camera.centerY + 10)
    const [, pyDown] = worldToScreen(camera, width, height, camera.centerX, camera.centerY - 10)
    expect(pyUp).toBeLessThan(pyDown)
  })
})

describe('zoomAt', () => {
  it('keeps the world point under the cursor fixed on screen', () => {
    const camera = { scale: 2, centerX: 0, centerY: 0 }
    const width = 400
    const height = 300
    const px = 260
    const py = 90
    const [worldBefore] = [screenToWorld(camera, width, height, px, py)]

    const next = zoomAt(camera, width, height, px, py, 3, /* fitScale */ 2)

    const worldAfter = screenToWorld(next, width, height, px, py)
    expect(worldAfter[0]).toBeCloseTo(worldBefore[0])
    expect(worldAfter[1]).toBeCloseTo(worldBefore[1])
    expect(next.scale).toBeCloseTo(6)
  })

  it('clamps the resulting scale relative to fitScale', () => {
    const camera = { scale: 2, centerX: 0, centerY: 0 }
    const next = zoomAt(camera, 400, 300, 200, 150, 1000, /* fitScale */ 2)
    expect(next.scale).toBeCloseTo(2 * MAX_ZOOM_FACTOR)
  })
})

describe('panBy', () => {
  it('moves world content in the same screen direction as the drag', () => {
    const camera = { scale: 2, centerX: 0, centerY: 0 }
    const width = 400
    const height = 300
    const worldPoint = { x: 5, y: 5 }
    const before = worldToScreen(camera, width, height, worldPoint.x, worldPoint.y)

    const dragged = panBy(camera, 20, 30)
    const after = worldToScreen(dragged, width, height, worldPoint.x, worldPoint.y)

    expect(after[0] - before[0]).toBeCloseTo(20)
    expect(after[1] - before[1]).toBeCloseTo(30)
  })

  it('leaves scale untouched', () => {
    const camera = { scale: 3.5, centerX: 1, centerY: 1 }
    expect(panBy(camera, 10, -10).scale).toBe(3.5)
  })
})

describe('gestureCamera', () => {
  const start = { scale: 2, centerX: 10, centerY: 5 }
  const W = 800
  const H = 600

  it('a one-finger drag pans: the point under the finger follows it', () => {
    const under = screenToWorld(start, W, H, 300, 200)
    const next = gestureCamera(start, W, H, [300, 200], [360, 150], 1, 1)
    expect(next.scale).toBe(2)
    const after = screenToWorld(next, W, H, 360, 150)
    expect(after[0]).toBeCloseTo(under[0])
    expect(after[1]).toBeCloseTo(under[1])
  })

  it('a pinch zooms about the fingers and keeps the point between them in place', () => {
    const under = screenToWorld(start, W, H, 500, 400)
    const next = gestureCamera(start, W, H, [500, 400], [520, 380], 1.5, 1)
    expect(next.scale).toBeCloseTo(3)
    const after = screenToWorld(next, W, H, 520, 380)
    expect(after[0]).toBeCloseTo(under[0])
    expect(after[1]).toBeCloseTo(under[1])
  })

  it('keeps the zoom within the limits', () => {
    expect(gestureCamera(start, W, H, [400, 300], [400, 300], 1000, 1).scale).toBe(20)
    expect(gestureCamera(start, W, H, [400, 300], [400, 300], 0.0001, 1).scale).toBe(0.2)
  })
})
