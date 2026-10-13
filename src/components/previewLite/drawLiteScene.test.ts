import { describe, expect, it } from 'vitest'
import { DEFAULT_WIZARD_PARAMS, type WizardParams } from '../../types/wizard'
import { LITE_VIEWS, fitCamera } from './camera3d'
import { buildLiteScene, drawLiteScene, liteTheme } from './drawLiteScene'

// A canvas context that only records what was asked of it.
function recordingContext() {
  const calls: Record<string, number> = {}
  const coords: number[] = []
  const count = (name: string) => () => {
    calls[name] = (calls[name] ?? 0) + 1
  }
  const point = (name: string) => (x: number, y: number) => {
    calls[name] = (calls[name] ?? 0) + 1
    coords.push(x, y)
  }
  const ctx = {
    beginPath: count('beginPath'),
    closePath: count('closePath'),
    moveTo: point('moveTo'),
    lineTo: point('lineTo'),
    stroke: count('stroke'),
    fill: count('fill'),
    fillRect: count('fillRect'),
    fillText: count('fillText'),
    setLineDash: count('setLineDash'),
  } as unknown as CanvasRenderingContext2D
  return { ctx, calls, coords }
}

const base = DEFAULT_WIZARD_PARAMS
const W = 800
const H = 600
const theme = liteTheme('default', true, 'sloppy-indigo')

describe('simplified 3D preview', () => {
  it.each<[string, WizardParams]>([
    ['Hole(s)', { ...base, operation: 'holes' }],
    ['Outline', { ...base, operation: 'outline' }],
    ['Surface', { ...base, operation: 'surface' }],
    ['Pocket', { ...base, operation: 'pocket' }],
    ['Facing', { ...base, operation: 'facing' }],
  ])('%s: draws stock and toolpath inside the fitted view', (_, params) => {
    const scene = buildLiteScene(params, [], true, false, true, true)
    expect(scene.pointCount).toBeGreaterThan(0)
    expect(scene.box.min[2]).toBeLessThan(0)
    expect(scene.box.max[2]).toBeCloseTo(params.feeds.safeZ)

    const camera = fitCamera(LITE_VIEWS.isometric, scene.box, W, H)
    const { ctx, calls, coords } = recordingContext()
    drawLiteScene(ctx, W, H, camera, scene, theme, true, true, false)
    expect(calls.stroke).toBeGreaterThan(3)
    expect(calls.lineTo).toBeGreaterThan(scene.pointCount / 2)
    expect(coords.every(Number.isFinite)).toBe(true)
  })

  it('draws far fewer toolpath points while the view is being moved', () => {
    const scene = buildLiteScene({ ...base, operation: 'pocket', pocket: { ...base.pocket, method: 'adaptive' } }, [], true, false, true, true)
    const camera = fitCamera(LITE_VIEWS.isometric, scene.box, W, H)
    const still = recordingContext()
    drawLiteScene(still.ctx, W, H, camera, scene, theme, false, true, false)
    const moving = recordingContext()
    drawLiteScene(moving.ctx, W, H, camera, scene, theme, false, true, true)
    expect(scene.pointCount).toBeGreaterThan(12000)
    expect(moving.calls.lineTo).toBeLessThan(still.calls.lineTo / 2)
  })

  it('leaves the toolpath out when it is hidden or blocked, and overlay toolpaths while editing', () => {
    const pocket: WizardParams = { ...base, operation: 'pocket' }
    expect(buildLiteScene(pocket, [], true, false, false, true).pointCount).toBe(0)
    const holes: WizardParams = { ...base, operation: 'holes' }
    const both = buildLiteScene(pocket, [holes], true, false, true, true).pointCount
    const dimmed = buildLiteScene(pocket, [holes], true, true, true, true).pointCount
    expect(dimmed).toBeLessThan(both)
    expect(dimmed).toBe(buildLiteScene(pocket, [], true, false, true, true).pointCount)
  })
})
