import { describe, expect, it } from 'vitest'
import { DEFAULT_MACHINE_SETTINGS } from '../types/machine'
import { DEFAULT_WIZARD_PARAMS, type OperationType, type WizardParams } from '../types/wizard'
import { generateHelix } from '../lib/helix'
import { generateOutline } from '../lib/outline'
import { generatePocketSpiral } from '../lib/pocket'
import { generateSurfaceZigzag } from '../lib/surface'
import { OPERATION_META } from './operationMeta'

const params = (operation: OperationType, patch: Partial<WizardParams> = {}): WizardParams => ({
  ...DEFAULT_WIZARD_PARAMS,
  operation,
  ...patch,
})

describe('OPERATION_META (BL-61)', () => {
  it('dispatches generate to the same engine as before the registry', () => {
    const m = DEFAULT_MACHINE_SETTINGS
    expect(OPERATION_META.holes.generate(params('holes'), m)).toEqual(generateHelix(params('holes'), m))
    expect(OPERATION_META.outline.generate(params('outline'), m)).toEqual(generateOutline(params('outline'), m))
    expect(OPERATION_META.surface.generate(params('surface'), m)).toEqual(generateSurfaceZigzag(params('surface'), m))
    expect(OPERATION_META.pocket.generate(params('pocket'), m)).toEqual(generatePocketSpiral(params('pocket'), m))
  })

  it('keeps the Step 2 Summary stat order per operation', () => {
    const labels = (op: OperationType, patch: Partial<WizardParams> = {}) =>
      OPERATION_META[op].geometryStats(params(op, patch)).map((s) => s.label)
    expect(labels('holes')).toEqual(['BIT', 'HOLE', 'DEPTH'])
    expect(
      labels('holes', { geometry: { ...DEFAULT_WIZARD_PARAMS.geometry, offsetX: 5, tabsEnabled: true } }),
    ).toEqual(['OFFSET', 'BIT', 'HOLE', 'DEPTH', 'TABS'])
    expect(labels('outline', { outline: { ...DEFAULT_WIZARD_PARAMS.outline, offsetY: 2, tabsEnabled: true } })).toEqual([
      'SIZE',
      'OFFSET',
      'BIT',
      'DEPTH',
      'TABS',
    ])
    expect(labels('surface')).toEqual(['SIZE', 'BIT', 'DEPTH'])
    expect(labels('pocket')).toEqual(['SIZE', 'BIT', 'DEPTH'])
  })

  it('builds the collapsed Step 2 title and filename slug per operation', () => {
    expect(OPERATION_META.holes.geometryTitle(params('holes'))).toBe(
      'Tool ⌀3.175mm, Hole ⌀8mm, Depth 4mm — Method: Helix Hole',
    )
    expect(OPERATION_META.outline.geometryTitle(params('outline'))).toContain('(Inside)')
    for (const op of ['holes', 'outline', 'surface', 'pocket', 'facing'] as const) {
      expect(OPERATION_META[op].filenameSlug(params(op))).toMatch(/^[a-z0-9-]+$/)
    }
  })
})

describe('OPERATION_META calculator hooks (BL-68)', () => {
  const p = DEFAULT_WIZARD_PARAMS

  it('offers the same methods as Step 2 for the current shape', () => {
    expect(OPERATION_META.holes.calcMethods(p).map((m) => m.value)).toEqual(['helix', 'standard'])
    const circlePocket = { ...p, pocket: { ...p.pocket, shape: 'circle' as const } }
    expect(OPERATION_META.pocket.calcMethods(circlePocket).map((m) => m.value)).toEqual(['spiral', 'adaptive'])
    const rectOutline = { ...p, outline: { ...p.outline, shape: 'rectCornered' as const } }
    expect(OPERATION_META.outline.calcMethods(rectOutline).map((m) => m.value)).toEqual(['ramp', 'standard'])
  })

  it('writes method and tool into the operation section', () => {
    expect(OPERATION_META.holes.withCalc(p, { method: 'standard', toolDiameter: 4 })).toMatchObject({
      method: 'standard',
      geometry: { toolDiameter: 4 },
    })
    expect(OPERATION_META.surface.withCalc(p, { method: 'zigzag', toolDiameter: 8, widthPercent: 45 })).toMatchObject({
      surface: { method: 'zigzag', toolDiameter: 8, stepoverPercent: 45 },
    })
  })

  it('routes Pocket width to optimal load for Adaptive and to stepover otherwise', () => {
    const adaptive = OPERATION_META.pocket.withCalc(p, {
      method: 'adaptive',
      toolDiameter: 6,
      widthPercent: 8,
      linkingFeed: 4000,
      chipThinningBaseFeed: 1200,
    })
    expect(adaptive.pocket).toMatchObject({
      method: 'adaptive',
      optimalLoadPercent: 8,
      linkingFeed: 4000,
      chipThinningBaseFeed: 1200,
      stepoverPercent: p.pocket.stepoverPercent,
    })
    const spiral = OPERATION_META.pocket.withCalc(p, { method: 'spiral', toolDiameter: 6, widthPercent: 40 })
    expect(spiral.pocket).toMatchObject({ stepoverPercent: 40, optimalLoadPercent: p.pocket.optimalLoadPercent })
  })

  it('writes the Finishing Pass Stock to Leave and Finish Feed for any Pocket method (BL-78)', () => {
    const spiral = OPERATION_META.pocket.withCalc(p, { method: 'spiral', toolDiameter: 6, stockToLeave: 0.3, finishFeed: 2500 })
    expect(spiral.pocket).toMatchObject({ stockToLeave: 0.3, finishFeed: 2500 })
    const untouched = OPERATION_META.pocket.withCalc(p, { method: 'adaptive', toolDiameter: 6 })
    expect(untouched.pocket).toMatchObject({ stockToLeave: p.pocket.stockToLeave, finishFeed: p.pocket.finishFeed })
  })

  it('Facing: one method, stepover written in mm, width capped by the removal (OP-7)', () => {
    const p = { ...DEFAULT_WIZARD_PARAMS, operation: 'facing' as const }
    expect(OPERATION_META.facing.calcMethods(p)).toEqual([{ value: 'sideMilling', label: 'Side Milling' }])
    expect(OPERATION_META.facing.withCalc(p, { method: 'sideMilling', toolDiameter: 6, widthPercent: 25 })).toMatchObject({
      facing: { toolDiameter: 6, stepover: 1.5 },
    })
    const narrow = { ...p, facing: { ...p.facing, toolDiameter: 6, removal: 0.9 } }
    expect(OPERATION_META.facing.maxCalcWidthPercent!(narrow)).toBe(15)
    expect(OPERATION_META.facing.filenameSlug(p)).toBe('facing-bottom')
  })
})
