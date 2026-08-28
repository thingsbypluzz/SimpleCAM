import type { MachineSettings } from '../types/machine'
import type { OutlineParams, WizardParams } from '../types/wizard'
import { assembleProgram } from './program'
import { helixCircleToolpath, type CircleTabsOptions } from './helix'
import { standardCircleToolpath } from './standardHole'

// Circle Outline reuses the exact Helix/Standard math from Hole(s)
// (helixCircleToolpath/standardCircleToolpath in helix.ts/standardHole.ts) —
// same shape family, just a different radius/direction derivation and a
// different WizardParams section to read from. See CLAUDE.md's Outline
// design notes for the offset-mode → radius/direction table below.
//
// Inside = cut a round hole/pocket, keep the surrounding material — same
// math as Hole(s) today (tool center inset by toolRadius, CCW/conventional
// for an internal cut). Outside = cut out a round disc/plug, discard the
// surroundings — tool center offset out by toolRadius, CW/conventional for
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

function outlineTabs(outline: OutlineParams): CircleTabsOptions | null {
  return outline.tabsEnabled
    ? { tabHeight: outline.tabHeight, tabWidth: outline.tabWidth, tabCount: outline.tabCount }
    : null
}

function circleOutlinePoint(outline: OutlineParams) {
  return [{ x: outline.offsetX, y: outline.offsetY }]
}

function circleOutlineHelixToolpath(cx: number, cy: number, params: WizardParams): string[] {
  const { outline, feeds, output } = params
  const { radius, direction } = circleOutlineRadiusAndDirection(outline)
  return helixCircleToolpath(cx, cy, {
    radius,
    totalDepth: outline.totalDepth,
    stepdown: feeds.stepdown,
    startZ: feeds.startZ,
    feedrateXY: feeds.feedrateXY,
    plungeRate: feeds.plungeRate,
    interpolation: output.interpolation,
    direction,
    tabs: outlineTabs(outline),
  })
}

function circleOutlineStandardToolpath(cx: number, cy: number, params: WizardParams): string[] {
  const { outline, feeds, output } = params
  const { radius, direction } = circleOutlineRadiusAndDirection(outline)
  return standardCircleToolpath(cx, cy, {
    radius,
    totalDepth: outline.totalDepth,
    stepdown: feeds.stepdown,
    startZ: feeds.startZ,
    feedrateXY: feeds.feedrateXY,
    plungeRate: feeds.plungeRate,
    interpolation: output.interpolation,
    direction,
    tabs: outlineTabs(outline),
  })
}

export function generateCircleOutlineHelix(params: WizardParams, machine: MachineSettings): string[] {
  return assembleProgram(params, machine, circleOutlineHelixToolpath, circleOutlinePoint(params.outline))
}

export function generateCircleOutlineStandard(params: WizardParams, machine: MachineSettings): string[] {
  return assembleProgram(params, machine, circleOutlineStandardToolpath, circleOutlinePoint(params.outline))
}
