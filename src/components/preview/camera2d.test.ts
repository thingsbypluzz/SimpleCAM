import { describe, expect, it } from 'vitest'
import {
  clampScale,
  computeFitCamera,
  MAX_ZOOM_FACTOR,
  MIN_ZOOM_FACTOR,
  panBy,
  screenToWorld,
  worldToScreen,
  zoomAt,
} from './camera2d'

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
