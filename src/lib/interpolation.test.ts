import { describe, expect, it } from 'vitest'
import { DEFAULT_WIZARD_PARAMS, type WizardParams } from '../types/wizard'
import { forcedLinearReason } from './interpolation'

const withOp = (operation: WizardParams['operation'], patch: Partial<WizardParams> = {}): WizardParams => ({
  ...DEFAULT_WIZARD_PARAMS,
  operation,
  ...patch,
})

describe('forcedLinearReason', () => {
  it('forces G1 for every Rectangle Outline, tabs or not', () => {
    expect(forcedLinearReason(withOp('outline'))).toBe('rectOutline')
  })

  it('forces G1 for tabs on Hole(s) and Circle Outline only', () => {
    const tabbedGeometry = { ...DEFAULT_WIZARD_PARAMS.geometry, tabsEnabled: true }
    expect(forcedLinearReason(withOp('holes', { geometry: tabbedGeometry }))).toBe('tabs')
    const circle = { ...DEFAULT_WIZARD_PARAMS.outline, shape: 'circle' as const }
    expect(forcedLinearReason(withOp('outline', { outline: circle }))).toBeNull()
    expect(forcedLinearReason(withOp('outline', { outline: { ...circle, tabsEnabled: true } }))).toBe('tabs')
  })

  it("ignores Hole(s)' tab flag for Surface and Pocket (BL-51)", () => {
    const tabbedGeometry = { ...DEFAULT_WIZARD_PARAMS.geometry, tabsEnabled: true }
    expect(forcedLinearReason(withOp('surface', { geometry: tabbedGeometry }))).toBeNull()
    expect(forcedLinearReason(withOp('pocket', { geometry: tabbedGeometry }))).toBeNull()
  })

  it('locks Facing on G1 — straight lines only (OP-7)', () => {
    expect(forcedLinearReason(withOp('facing'))).toBe('facing')
  })
})

describe('Lobed Circle (OP-8)', () => {
  it('follows the toggle like Circle Outline; tabs force G1', () => {
    const lobed = { ...DEFAULT_WIZARD_PARAMS.outline, shape: 'lobedCircle' as const }
    expect(forcedLinearReason(withOp('outline', { outline: lobed }))).toBeNull()
    expect(forcedLinearReason(withOp('outline', { outline: { ...lobed, tabsEnabled: true } }))).toBe('tabs')
  })
})
