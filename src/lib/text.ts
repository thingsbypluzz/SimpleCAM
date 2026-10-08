import type { MachineSettings } from '../types/machine'
import type { Point2D, WizardParams } from '../types/wizard'
import { computeDepthPasses } from './depthPasses'
import { assembleProgram } from './program'
import { layoutText } from './textLayout'
import { ToolpathBuilder, toolpathToGcode, type Toolpath } from './toolpath'

// Text (OP-4): the tool follows every stroke of the written text
// (lib/textLayout.ts). One move list for the G-code and both previews.
//
// Stroke by stroke: rapid over its start at Safe Z, down to Start Z, plunge
// and cut along it; when the depth takes several passes the tool goes back
// and forth along the same stroke, one level deeper each way, without
// lifting. Then up to Safe Z and on to the next stroke — never a G0 below
// Safe Z. A dot (a stroke with no length) is a single plunge.
export function buildTextToolpath(params: WizardParams): Toolpath {
  const { text, feeds } = params
  const { strokes } = layoutText(text)
  const first = strokes[0]?.[0] ?? { x: text.offsetX, y: text.offsetY }
  const b = new ToolpathBuilder({ x: first.x, y: first.y, z: feeds.safeZ })
  const levels: number[] = []
  let z = 0
  for (const pass of computeDepthPasses(text.totalDepth, feeds.stepdown)) {
    z -= pass
    levels.push(z)
  }
  if (levels.length === 0) return b.build()

  strokes.forEach((stroke, index) => {
    if (index > 0) {
      b.zTo('rapid', feeds.safeZ)
      b.rapidXY(stroke[0].x, stroke[0].y)
    }
    b.zTo('rapid', feeds.startZ)
    let forward = true
    for (const level of levels) {
      b.zTo('plunge', level)
      const points = forward ? stroke.slice(1) : stroke.slice(0, -1).reverse()
      for (const p of points) b.lineTo('cut', p.x, p.y)
      forward = !forward
    }
  })
  return b.build()
}

function textStartPoint(params: WizardParams): Point2D {
  const start = buildTextToolpath(params).start
  return { x: start.x, y: start.y }
}

export function generateText(params: WizardParams, machine: MachineSettings): string[] {
  return assembleProgram(
    params,
    machine,
    (_cx, _cy, p) =>
      toolpathToGcode(buildTextToolpath(p), {
        feeds: { cut: p.feeds.feedrateXY, plunge: p.feeds.plungeRate },
        interpolation: 'linear',
      }),
    [textStartPoint(params)],
  )
}
