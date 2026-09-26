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
    for (const op of ['holes', 'outline', 'surface', 'pocket'] as const) {
      expect(OPERATION_META[op].filenameSlug(params(op))).toMatch(/^[a-z0-9-]+$/)
    }
  })
})
