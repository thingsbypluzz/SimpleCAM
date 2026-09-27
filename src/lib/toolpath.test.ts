import { describe, expect, it } from 'vitest'
import { fullTurn, toolpathToGcode, ToolpathBuilder } from './toolpath'

const feeds = { cut: 800, plunge: 300, link: 1500 }

describe('toolpathToGcode', () => {
  it('prints each move kind in the form the engines have always used', () => {
    const b = new ToolpathBuilder({ x: 1, y: 2, z: 5 })
    b.zTo('rapid', 0)
    b.zTo('plunge', -1)
    b.lineTo('cut', 10, 2, -1)
    b.lineTo('link', 10, 5, -1)
    b.zTo('rapid', 5)
    b.rapidXY(0, 0)
    expect(toolpathToGcode(b.build(), { feeds, interpolation: 'arc' })).toEqual([
      'G0 X1 Y2',
      'G0 Z0',
      'G1 Z-1 F300',
      'G1 X10 Y2 Z-1 F800',
      'G1 X10 Y5 Z-1 F1500',
      'G0 Z5',
      'G0 X0 Y0',
    ])
  })

  it('keeps a zero-length rapid unless the builder is told to skip them', () => {
    const keep = new ToolpathBuilder({ x: 0, y: 0, z: 5 })
    keep.zTo('rapid', 5)
    expect(toolpathToGcode(keep.build(), { feeds, interpolation: 'arc', leadInRapid: false })).toEqual(['G0 Z5'])
    const skip = new ToolpathBuilder({ x: 0, y: 0, z: 5 }, true)
    skip.lineTo('cut', 0, 0, 5)
    expect(skip.build().moves).toEqual([])
  })

  it('formats a full helical turn as one G2/G3, or 72 G1 segments landing back on the start', () => {
    for (const direction of ['cw', 'ccw'] as const) {
      const b = new ToolpathBuilder({ x: 3.175, y: -1.2, z: 0.4 })
      b.arc('cut', { x: 1.1, y: -1.2 }, direction, fullTurn, -0.85)
      const code = direction === 'cw' ? 'G2' : 'G3'
      expect(toolpathToGcode(b.build(), { feeds, interpolation: 'arc', leadInRapid: false })).toEqual([
        `${code} X3.175 Y-1.2 Z-0.85 I-2.075 J0 F800`,
      ])
      const linear = toolpathToGcode(b.build(), { feeds, interpolation: 'linear', leadInRapid: false })
      expect(linear).toHaveLength(72)
      expect(linear[71]).toBe('G1 X3.175 Y-1.2 Z-0.85 F800')
    }
  })
})
