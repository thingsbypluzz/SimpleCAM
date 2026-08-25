import { fmt } from './format'
import type { InterpolationMode } from '../types/wizard'

// 5° per segment — a reasonable polygon approximation for typical hobby
// hole sizes without producing excessively long G-code files.
const LINEAR_SEGMENTS = 72

interface FullCircleMoveParams {
  centerX: number
  centerY: number
  radius: number
  startX: number
  startY: number
  zStart: number
  zEnd: number
  feed: number
  interpolation: InterpolationMode
  direction: 'cw' | 'ccw'
}

// One full 360° turn around (centerX, centerY), starting and ending at
// (startX, startY). zEnd === zStart for a flat pass; zEnd < zStart makes it
// a single helical turn. Hole(s) (helix.ts/standardHole.ts) always passes
// 'ccw', matching climb milling convention for boring under M3 (CW spindle
// rotation) — unchanged from before `direction` existed. Outline cutting
// (outlineCircle.ts) needs both directions, since conventional-milling
// winding flips between Inside/Outside cuts (see CLAUDE.md's Outline
// design notes).
export function fullCircleMove(p: FullCircleMoveParams): string[] {
  if (p.interpolation === 'arc') {
    const i = p.centerX - p.startX
    const j = p.centerY - p.startY
    // Start XY === end XY (I/J define the circle) is the standard
    // full-circle convention accepted by GRBL/Marlin/Mach3 without a P
    // word; stricter interpreters (e.g. LinuxCNC) would need P here, but
    // that's outside our target dialect subset.
    const code = p.direction === 'cw' ? 'G2' : 'G3'
    return [
      `${code} X${fmt(p.startX)} Y${fmt(p.startY)} Z${fmt(p.zEnd)} I${fmt(i)} J${fmt(j)} F${fmt(p.feed)}`,
    ]
  }

  const sign = p.direction === 'cw' ? -1 : 1
  const lines: string[] = []
  const startAngle = Math.atan2(p.startY - p.centerY, p.startX - p.centerX)
  for (let step = 1; step <= LINEAR_SEGMENTS; step++) {
    const angle = startAngle + (sign * 2 * Math.PI * step) / LINEAR_SEGMENTS
    const x = p.centerX + p.radius * Math.cos(angle)
    const y = p.centerY + p.radius * Math.sin(angle)
    const z = p.zStart + ((p.zEnd - p.zStart) * step) / LINEAR_SEGMENTS
    lines.push(`G1 X${fmt(x)} Y${fmt(y)} Z${fmt(z)} F${fmt(p.feed)}`)
  }
  // Snap the last segment onto the exact target to avoid float drift.
  lines[lines.length - 1] = `G1 X${fmt(p.startX)} Y${fmt(p.startY)} Z${fmt(p.zEnd)} F${fmt(p.feed)}`
  return lines
}
