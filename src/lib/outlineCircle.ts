import type { MachineSettings } from '../types/machine'
import type { OutlineParams, WizardParams } from '../types/wizard'
import { assembleProgram } from './program'
import { helixCircleToolpath, type CircleToolpathOptions } from './helix'
import { standardCircleToolpath } from './standardHole'

// Circle Outline reuses the exact Helix/Standard math from Hole(s)
// (helixCircleToolpath/standardCircleToolpath in helix.ts/standardHole.ts) —
// same shape family, just a different radius/direction derivation and a
// different WizardParams section to read from. See CLAUDE.md's Outline
// design notes for the offset-mode → radius/direction table below.
//
// Inside = cut a round hole/pocket, keep the surrounding material — same
// math as Hole(s) today (tool center inset by toolRadius, CCW = climb for
// an internal cut under M3). Outside = cut out a round disc/plug, discard
// the surroundings — tool center offset out by toolRadius, CW = climb for
// an external cut. On-line = nominal diameter, no radius correction; CW is
// arbitrary here since climb/conventional isn't physically meaningful at
// zero offset.
export function circleOutlineRadiusAndDirection(outline: OutlineParams): { radius: number; direction: 'cw' | 'ccw' } {
  switch (outline.offsetMode) {
    case 'inside':
      return { radius: (outline.diameter - outline.toolDiameter) / 2, direction: 'ccw' }
    case 'outside':
      return { radius: (outline.diameter + outline.toolDiameter) / 2, direction: 'cw' }
    case 'onLine':
      return { radius: outline.diameter / 2, direction: 'cw' }
  }
}

// On-line leaves two real physical edges (BL-28), not one — the tool
// travels centered on the nominal line, removing a band from
// (nominal - toolRadius) to (nominal + toolRadius). Same delta as
// Inside/Outside's own radius formulas above, just both applied together
// instead of picking one — display-only (3D preview), the real toolpath
// still runs at the single nominal radius (circleOutlineRadiusAndDirection
// above, unchanged).
export function onLineCircleEdges(outline: OutlineParams): { innerRadius: number; outerRadius: number } {
  const toolR = outline.toolDiameter / 2
  return {
    innerRadius: Math.max(0, outline.diameter / 2 - toolR),
    outerRadius: outline.diameter / 2 + toolR,
  }
}

// Circle Outline's options — shared by both methods and the 3D preview.
export function circleOutlineOptions(params: WizardParams): CircleToolpathOptions {
  const { outline, feeds, output } = params
  const { radius, direction } = circleOutlineRadiusAndDirection(outline)
  return {
    radius,
    totalDepth: outline.totalDepth,
    stepdown: feeds.stepdown,
    safeZ: feeds.safeZ,
    startZ: feeds.startZ,
    feedrateXY: feeds.feedrateXY,
    plungeRate: feeds.plungeRate,
    interpolation: output.interpolation,
    direction,
    tabs: outline.tabsEnabled
      ? { tabHeight: outline.tabHeight, tabWidth: outline.tabWidth, tabCount: outline.tabCount }
      : null,
  }
}

function circleOutlinePoint(outline: OutlineParams) {
  return [{ x: outline.offsetX, y: outline.offsetY }]
}

export function generateCircleOutlineHelix(params: WizardParams, machine: MachineSettings): string[] {
  const opts = circleOutlineOptions(params)
  return assembleProgram(params, machine, (cx, cy) => helixCircleToolpath(cx, cy, opts), circleOutlinePoint(params.outline))
}

export function generateCircleOutlineStandard(params: WizardParams, machine: MachineSettings): string[] {
  const opts = circleOutlineOptions(params)
  return assembleProgram(params, machine, (cx, cy) => standardCircleToolpath(cx, cy, opts), circleOutlinePoint(params.outline))
}
