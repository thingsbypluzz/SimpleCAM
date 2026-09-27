import { describe, expect, it } from 'vitest'
import { appendFullTurn } from './helix'
import { ToolpathBuilder, toolpathToGcode } from './toolpath'
import type { InterpolationMode } from '../types/wizard'

// One full turn on its own, formatted as G-code at F800 — the tool starts
// on the circle at (centerX + radius, centerY).
function fullTurn(p: {
  centerX: number
  centerY: number
  radius: number
  zStart: number
  zEnd: number
  interpolation: InterpolationMode
  direction: 'cw' | 'ccw'
}): string[] {
  const b = new ToolpathBuilder({ x: p.centerX + p.radius, y: p.centerY, z: p.zStart })
  appendFullTurn(b, p.centerX, p.centerY, p.radius, p.direction, p.zEnd)
  return toolpathToGcode(b.build(), { feeds: { cut: 800 }, interpolation: p.interpolation, leadInRapid: false })
}

describe('appendFullTurn — arc interpolation', () => {
  it('emits a single G3 command with correct I/J and Z', () => {
    const lines = fullTurn({
      centerX: 10,
      centerY: 5,
      radius: 4,
      zStart: -1,
      zEnd: -2,
      interpolation: 'arc',
      direction: 'ccw',
    })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toBe('G3 X14 Y5 Z-2 I-4 J0 F800')
  })

  it('flat pass keeps zStart === zEnd', () => {
    const lines = fullTurn({
      centerX: 0,
      centerY: 0,
      radius: 4,
      zStart: -3,
      zEnd: -3,
      interpolation: 'arc',
      direction: 'ccw',
    })
    expect(lines[0]).toContain('Z-3')
  })
})

describe('appendFullTurn — linear interpolation', () => {
  it('emits 72 G1 segments', () => {
    const lines = fullTurn({
      centerX: 0,
      centerY: 0,
      radius: 4,
      zStart: -1,
      zEnd: -2,
      interpolation: 'linear',
      direction: 'ccw',
    })
    expect(lines).toHaveLength(72)
    expect(lines.every((l) => l.startsWith('G1 '))).toBe(true)
  })

  it('lands exactly on the start XY and target Z at the end', () => {
    const lines = fullTurn({
      centerX: 0,
      centerY: 0,
      radius: 4,
      zStart: -1,
      zEnd: -2,
      interpolation: 'linear',
      direction: 'ccw',
    })
    expect(lines[lines.length - 1]).toBe('G1 X4 Y0 Z-2 F800')
  })

  it('interpolates Z monotonically from zStart to zEnd', () => {
    const lines = fullTurn({
      centerX: 0,
      centerY: 0,
      radius: 4,
      zStart: 0,
      zEnd: -1,
      interpolation: 'linear',
      direction: 'ccw',
    })
    const zValues = lines.map((l) => Number(l.match(/Z(-?[\d.]+)/)?.[1]))
    for (let i = 1; i < zValues.length; i++) {
      expect(zValues[i]).toBeLessThanOrEqual(zValues[i - 1])
    }
    expect(zValues[zValues.length - 1]).toBe(-1)
  })

  it('flat pass (zStart === zEnd) keeps Z constant across all segments', () => {
    const lines = fullTurn({
      centerX: 0,
      centerY: 0,
      radius: 4,
      zStart: -3,
      zEnd: -3,
      interpolation: 'linear',
      direction: 'ccw',
    })
    expect(lines.every((l) => l.includes('Z-3'))).toBe(true)
  })
})

describe('appendFullTurn — direction', () => {
  it('cw arc interpolation emits G2 instead of G3', () => {
    const lines = fullTurn({
      centerX: 10,
      centerY: 5,
      radius: 4,
      zStart: -1,
      zEnd: -2,
      interpolation: 'arc',
      direction: 'cw',
    })
    expect(lines[0]).toBe('G2 X14 Y5 Z-2 I-4 J0 F800')
  })

  it('cw linear interpolation sweeps the opposite way but still lands on the start XY', () => {
    const ccw = fullTurn({
      centerX: 0,
      centerY: 0,
      radius: 4,
      zStart: -1,
      zEnd: -2,
      interpolation: 'linear',
      direction: 'ccw',
    })
    const cw = fullTurn({
      centerX: 0,
      centerY: 0,
      radius: 4,
      zStart: -1,
      zEnd: -2,
      interpolation: 'linear',
      direction: 'cw',
    })
    expect(cw).toHaveLength(72)
    expect(cw[cw.length - 1]).toBe('G1 X4 Y0 Z-2 F800')
    // First segment off the start point goes the opposite way from ccw's.
    expect(cw[0]).not.toBe(ccw[0])
  })
})
