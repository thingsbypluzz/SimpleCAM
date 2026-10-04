import type { MachineSettings } from '../types/machine'
import type { Point2D, WizardParams } from '../types/wizard'
import { facingClearV, facingPassEdges, facingPoint, facingTravel } from './facingGeometry'
import { assembleProgram } from './program'
import { buildLevelDescents } from './surfaceZTransition'
import { ToolpathBuilder, toolpathToGcode, type Toolpath } from './toolpath'

function facingStartPoint(facing: WizardParams['facing']): Point2D {
  return facingPoint(facing, facingTravel(facing).from, facingClearV(facing))
}

// One move list for the G-code and both previews. Starts beyond the end of
// the side, clear of the raw edge, at Safe Z. Per Z level: plunge (in the
// air), then for every sideways pass feed in to the pass position, cut
// along the side, back away from the material and return to the start —
// the last two on the linking feed, never a G0 below Safe Z. The very last
// pass only backs away; the final retract is assembleProgram()'s.
export function buildFacingToolpath(params: WizardParams): Toolpath {
  const { facing, feeds } = params
  const r = facing.toolDiameter / 2
  const { from, to } = facingTravel(facing)
  const clear = facingClearV(facing)
  const edges = facingPassEdges(facing)
  const levels = buildLevelDescents(feeds.startZ, facing.totalDepth, feeds.stepdown)
  const at = (u: number, v: number) => facingPoint(facing, u, v)

  const start = at(from, clear)
  const b = new ToolpathBuilder({ x: start.x, y: start.y, z: feeds.safeZ })
  b.zTo('rapid', feeds.startZ)

  levels.forEach(({ toZ }, levelIdx) => {
    b.zTo('plunge', toZ)
    edges.forEach((edge, passIdx) => {
      const entry = at(from, edge - r)
      const exit = at(to, edge - r)
      const away = at(to, clear)
      b.lineTo('cut', entry.x, entry.y)
      b.lineTo('cut', exit.x, exit.y)
      b.lineTo('link', away.x, away.y)
      if (levelIdx === levels.length - 1 && passIdx === edges.length - 1) return
      b.lineTo('link', start.x, start.y)
    })
  })

  return b.build()
}

function facingGcode(params: WizardParams): string[] {
  return toolpathToGcode(buildFacingToolpath(params), {
    feeds: { cut: params.feeds.feedrateXY, plunge: params.feeds.plungeRate, link: params.facing.linkingFeed },
    interpolation: params.output.interpolation,
  })
}

export function generateFacing(params: WizardParams, machine: MachineSettings): string[] {
  return assembleProgram(params, machine, (_cx, _cy, p) => facingGcode(p), [facingStartPoint(params.facing)])
}
