import { beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_WIZARD_PARAMS, type WizardParams } from '../types/wizard'
import {
  makeRng,
  randomFacing,
  randomHoles,
  randomOutline,
  randomPocket,
  randomPocketDonut,
  randomPocketDonutAdaptive,
  randomPocketLightened,
  randomPocketLightenedAdaptive,
  randomSurface,
  randomText,
} from './fuzzParams'
import { defaultFacingLead, defaultPocketHelixRadius, defaultSurfaceHelixRadius, isSimplified, simplifyParams } from './simpleMode'
import { loadTestFont } from './textTestUtils'
import { isWizardParamsValid, pocketMaxHelixRadius } from './validation'
import { surfaceStepoverMm } from './surfaceGeometry'

const D = DEFAULT_WIZARD_PARAMS

describe('simplifyParams', () => {
  beforeAll(() => loadTestFont())

  it('leaves the defaults as they are — they follow the same rules', () => {
    expect(isSimplified(D)).toBe(true)
  })

  it('maps Lobed Circle to a Circle of its main diameter, Ramp to Helix', () => {
    const p = simplifyParams({ ...D, operation: 'outline', outline: { ...D.outline, shape: 'lobedCircle', method: 'ramp', lobeMainDiameter: 72 } })
    expect(p.outline).toMatchObject({ shape: 'circle', diameter: 72, method: 'helix' })
  })

  it('maps the Pocket shapes Simple hides to the nearest one, keeping the size', () => {
    const shape = (s: WizardParams['pocket']['shape']) => simplifyParams({ ...D, pocket: { ...D.pocket, shape: s, diameter: 33, width: 41 } }).pocket
    expect(shape('donut')).toMatchObject({ shape: 'circle', diameter: 33 })
    expect(shape('circleLightened')).toMatchObject({ shape: 'circle', diameter: 33 })
    expect(shape('rectLightened')).toMatchObject({ shape: 'rectCentered', width: 41 })
  })

  it('turns Adaptive into Spiral and switches off what Simple hides', () => {
    const p = simplifyParams({
      ...D,
      pocket: { ...D.pocket, method: 'adaptive', zTransitionMode: 'helix', finishingEnabled: true, rampLengthFactor: 7, chipThinningBaseFeed: 900 },
      feeds: { ...D.feeds, feedrateXY: 1234, startZ: 2 },
    })
    expect(p.pocket).toMatchObject({ method: 'spiral', zTransitionMode: 'plunge', finishingEnabled: false, rampLengthFactor: 3, chipThinningBaseFeed: null, linkingFeed: 1234 })
    expect(p.feeds.startZ).toBe(0)
  })

  it('puts a Text On Circle in a straight line centered on the circle', () => {
    const p = simplifyParams({ ...D, text: { ...D.text, layout: 'circle', mirror: true, angleDeg: 30, letterSpacingPercent: 20 } })
    expect(p.text).toMatchObject({ layout: 'straight', originX: 'center', originY: 'middle', angleDeg: 0, mirror: false, letterSpacingPercent: 0 })
  })

  it('works out the tool-dependent defaults from the visible fields', () => {
    const surface = { ...D.surface, toolDiameter: 2, stepoverPercent: 40 }
    expect(defaultSurfaceHelixRadius(surface)).toBe(0.5)
    expect(defaultSurfaceHelixRadius({ ...surface, stepoverPercent: 10 })).toBeLessThanOrEqual(surfaceStepoverMm({ ...surface, stepoverPercent: 10 }))
    const pocket = { ...D.pocket, toolDiameter: 6, shape: 'circle' as const, diameter: 7 }
    expect(defaultPocketHelixRadius(pocket)).toBeLessThanOrEqual(pocketMaxHelixRadius(pocket))
    expect(defaultFacingLead({ ...D.facing, toolDiameter: 6 })).toBe(3)
  })

  it('is idempotent, and a valid Advanced preset stays valid in Simple', () => {
    const rng = makeRng(20261018)
    const makers: ((r: typeof rng) => WizardParams)[] = [
      (r) => randomHoles(r, 'helix'),
      (r) => randomHoles(r, 'standard'),
      (r) => randomHoles(r, 'drill'),
      randomOutline,
      (r) => randomSurface(r, 'zigzag'),
      (r) => randomSurface(r, 'unidirectional'),
      (r) => randomPocket(r, 'spiral'),
      (r) => randomPocket(r, 'adaptive'),
      randomPocketDonut,
      randomPocketDonutAdaptive,
      randomPocketLightened,
      randomPocketLightenedAdaptive,
      randomFacing,
      randomText,
    ]
    let checked = 0
    for (const make of makers) {
      for (let i = 0; i < 15; i++) {
        const params = make(rng)
        const simple = simplifyParams(params)
        expect(simplifyParams(simple)).toEqual(simple)
        if (!isWizardParamsValid(params)) continue
        expect(isWizardParamsValid(simple), JSON.stringify(params)).toBe(true)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(50)
  }, 60_000)
})
