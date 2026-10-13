import { describe, expect, it } from 'vitest'
import { LITE_VIEWS, fitCamera, orbitBy, panBy, pinchCamera, project, viewPoint, zoomAt, type Box3, type LiteCamera } from './camera3d'

const W = 800
const H = 600
const cam = (view: { yaw: number; pitch: number }): LiteCamera => ({ ...view, scale: 2, cx: 0, cy: 0 })

describe('views', () => {
  it('Top shows X to the right and Y up, ignoring Z', () => {
    expect(viewPoint(LITE_VIEWS.top, 10, 0, 0)[0]).toBeCloseTo(10)
    expect(viewPoint(LITE_VIEWS.top, 0, 10, 0)[1]).toBeCloseTo(10)
    expect(viewPoint(LITE_VIEWS.top, 3, 4, -50)).toEqual(viewPoint(LITE_VIEWS.top, 3, 4, 0).map((n) => expect.closeTo(n)))
  })

  it('a view along the table shows Z up', () => {
    const level = { yaw: 0, pitch: 0 }
    expect(viewPoint(level, 0, 0, 10)[1]).toBeCloseTo(10)
    expect(viewPoint(level, 0, 25, 0)[1]).toBeCloseTo(0)
  })

  it('Side shows Y to the right', () => {
    expect(viewPoint(LITE_VIEWS.side, 0, 10, 0)[0]).toBeCloseTo(10)
  })

  it('Isometric shows X to the right, Y to the left, both away from the viewer', () => {
    const [ux, vx] = viewPoint(LITE_VIEWS.isometric, 10, 0, 0)
    const [uy, vy] = viewPoint(LITE_VIEWS.isometric, 0, 10, 0)
    expect(ux).toBeGreaterThan(0)
    expect(uy).toBeLessThan(0)
    expect(vx).toBeGreaterThan(0)
    expect(vy).toBeCloseTo(vx)
    // The three axes come out equally long.
    const [uz, vz] = viewPoint(LITE_VIEWS.isometric, 0, 0, 10)
    expect(Math.hypot(uz, vz)).toBeCloseTo(Math.hypot(ux, vx))
  })
})

describe('fitCamera', () => {
  const box: Box3 = { min: [-20, 0, -10], max: [100, 60, 5] }

  it.each(Object.entries(LITE_VIEWS))('%s: every corner lands inside the padded canvas', (_, view) => {
    const camera = fitCamera(view, box, W, H, 40)
    for (const x of [box.min[0], box.max[0]]) {
      for (const y of [box.min[1], box.max[1]]) {
        for (const z of [box.min[2], box.max[2]]) {
          const [px, py] = project(camera, W, H, x, y, z)
          expect(px).toBeGreaterThanOrEqual(40 - 1e-6)
          expect(px).toBeLessThanOrEqual(W - 40 + 1e-6)
          expect(py).toBeGreaterThanOrEqual(40 - 1e-6)
          expect(py).toBeLessThanOrEqual(H - 40 + 1e-6)
        }
      }
    }
  })

  it('survives a flat or empty box', () => {
    const camera = fitCamera(LITE_VIEWS.top, { min: [5, 5, 0], max: [5, 5, 0] }, W, H)
    expect(Number.isFinite(camera.scale)).toBe(true)
    expect(camera.scale).toBeGreaterThan(0)
  })
})

describe('orbitBy', () => {
  it('keeps the pivot where it is on screen', () => {
    const start = { ...cam(LITE_VIEWS.isometric), cx: 12, cy: -7 }
    const pivot = [30, 40, -5] as const
    const before = project(start, W, H, ...pivot)
    const after = project(orbitBy(start, 0.6, -0.2, pivot), W, H, ...pivot)
    expect(after[0]).toBeCloseTo(before[0])
    expect(after[1]).toBeCloseTo(before[1])
  })

  it('stops at the table and at straight down', () => {
    const start = cam(LITE_VIEWS.isometric)
    expect(orbitBy(start, 0, 10, [0, 0, 0]).pitch).toBeCloseTo(Math.PI / 2)
    expect(orbitBy(start, 0, -10, [0, 0, 0]).pitch).toBe(0)
  })
})

describe('pan, zoom, pinch', () => {
  const start = { ...cam(LITE_VIEWS.isometric), cx: 5, cy: 3 }

  it('pan moves the content with the pointer', () => {
    const before = project(start, W, H, 10, 20, 0)
    const after = project(panBy(start, 30, -12), W, H, 10, 20, 0)
    expect(after[0] - before[0]).toBeCloseTo(30)
    expect(after[1] - before[1]).toBeCloseTo(-12)
  })

  it('zoom keeps the point under the cursor and respects the limits', () => {
    const next = zoomAt(start, W, H, 250, 180, 1.5, 2)
    expect(next.scale).toBeCloseTo(3)
    // The view-plane point under (250, 180) is the same before and after.
    const under = (c: LiteCamera) => [c.cx + (250 - W / 2) / c.scale, c.cy - (180 - H / 2) / c.scale]
    expect(under(next)[0]).toBeCloseTo(under(start)[0])
    expect(under(next)[1]).toBeCloseTo(under(start)[1])
    expect(zoomAt(start, W, H, 0, 0, 1e6, 2).scale).toBe(40)
    expect(zoomAt(start, W, H, 0, 0, 1e-6, 2).scale).toBeCloseTo(0.4)
  })

  it('a pinch zooms about the fingers and drags along', () => {
    const before = project(start, W, H, 0, 0, 0)
    const startMid = [before[0], before[1]] as const
    const next = pinchCamera(start, W, H, startMid, [startMid[0] + 25, startMid[1] + 10], 2, 2)
    const after = project(next, W, H, 0, 0, 0)
    expect(next.scale).toBeCloseTo(4)
    expect(after[0]).toBeCloseTo(startMid[0] + 25)
    expect(after[1]).toBeCloseTo(startMid[1] + 10)
  })
})
