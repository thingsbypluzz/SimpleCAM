import { OPERATION_META } from '../../config/operationMeta'
import { OPERATION_RULES } from '../../lib/validation'
import type { WizardParams } from '../../types/wizard'

// BL-100: the tool as both 3D previews draw it in Simulate mode — its
// bottom (or tip) on the toolpath point. Sizes in mm.
export interface SimTool {
  // The cutting part: a cylinder of `radius`, or a V-bit's cone that
  // widens from the tip to `radius` over `coneHeight`.
  radius: number
  coneHeight: number // 0 = flat-bottomed end mill (or drill)
  // Cutter length from the tip — always out of the stock with a margin.
  length: number
  // The thinner shank above the cutter.
  shankRadius: number
  shankLength: number
}

// How far the cutter reaches above the deepest cut — so it always shows
// above the stock's top face.
const CUTTER_MARGIN = 10
// A V-bit drawn with a 6 mm body.
const VBIT_RADIUS = 3

export function simulationTool(params: WizardParams): SimTool {
  const depth = OPERATION_RULES[params.operation].totalDepth(params)
  const length = depth + CUTTER_MARGIN
  if (params.operation === 'text' && params.text.bit === 'vbit') {
    const half = (params.text.vbitAngleDeg / 2) * (Math.PI / 180)
    const coneHeight = Math.min(VBIT_RADIUS / Math.tan(half), length)
    return { radius: VBIT_RADIUS, coneHeight, length, shankRadius: VBIT_RADIUS, shankLength: length }
  }
  const radius = Math.max(OPERATION_META[params.operation].toolDiameter(params) / 2, 0.05)
  return { radius, coneHeight: 0, length, shankRadius: radius * 0.7, shankLength: length * 0.8 }
}
