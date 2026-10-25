import { describe, expect, it } from 'vitest'
import { DEFAULT_WIZARD_PARAMS, type WizardParams } from '../types/wizard'
import { isWizardParamsValid } from './validation'
import { operationToolpaths, previewPolylines } from './previewPaths'

const base = DEFAULT_WIZARD_PARAMS
const cases: [string, WizardParams][] = [
  ['Hole(s) single', { ...base, operation: 'holes', geometry: { ...base.geometry, positioning: 'single' } }],
  ['Hole(s) grid', { ...base, operation: 'holes', geometry: { ...base.geometry, positioning: 'grid' } }],
  ['Outline rectangle', { ...base, operation: 'outline', outline: { ...base.outline, shape: 'rectCornered' } }],
  ['Outline circle', { ...base, operation: 'outline', outline: { ...base.outline, shape: 'circle', method: 'helix' } }],
  ['Outline lobed circle', { ...base, operation: 'outline', outline: { ...base.outline, shape: 'lobedCircle' } }],
  ['Surface', { ...base, operation: 'surface' }],
  ['Pocket', { ...base, operation: 'pocket' }],
  ['Facing', { ...base, operation: 'facing' }],
]

describe('previewPolylines', () => {
  it.each(cases)('%s: finite points, ending in a retract to Safe Z', (_, params) => {
    expect(isWizardParamsValid(params)).toBe(true)
    const lines = previewPolylines(params)
    expect(lines.length).toBeGreaterThan(1)
    for (const { points } of lines) {
      expect(points.length % 3).toBe(0)
      expect(points.length).toBeGreaterThanOrEqual(6)
      expect(points.every(Number.isFinite)).toBe(true)
    }
    const last = lines[lines.length - 1]
    expect(last.kind).toBe('rapid')
    expect(last.points[last.points.length - 1]).toBeCloseTo(params.feeds.safeZ)
    // Something is actually cut, below the surface.
    const cut = lines.filter((l) => l.kind === 'cut')
    expect(cut.length).toBeGreaterThan(0)
    expect(Math.min(...cut.flatMap((l) => Array.from(l.points).filter((_, i) => i % 3 === 2)))).toBeLessThan(0)
  })

  it('Hole(s): one toolpath per hole, joined by rapids at Safe Z', () => {
    const params: WizardParams = {
      ...base,
      operation: 'holes',
      geometry: { ...base.geometry, positioning: 'grid', gridCountX: 3, gridCountY: 2 },
    }
    expect(operationToolpaths(params)).toHaveLength(6)
    // Five hole-to-hole moves: rapid steps that stay at Safe Z and go
    // somewhere in XY (consecutive rapids share one polyline).
    const safeZ = Math.fround(params.feeds.safeZ)
    let moving = 0
    for (const l of previewPolylines(params)) {
      if (l.kind !== 'rapid') continue
      for (let i = 3; i < l.points.length; i += 3) {
        const p = l.points
        const atSafeZ = p[i - 1] === safeZ && p[i + 2] === safeZ
        if (atSafeZ && (p[i - 3] !== p[i] || p[i - 2] !== p[i + 1])) moving++
      }
    }
    expect(moving).toBe(5)
  })

  it('a continuous path: every polyline starts where the previous one ended', () => {
    const lines = previewPolylines({ ...base, operation: 'pocket' })
    for (let i = 1; i < lines.length; i++) {
      const prev = lines[i - 1].points
      const next = lines[i].points
      expect(next[0]).toBeCloseTo(prev[prev.length - 3], 4)
      expect(next[1]).toBeCloseTo(prev[prev.length - 2], 4)
      expect(next[2]).toBeCloseTo(prev[prev.length - 1], 4)
    }
  })
})
