import type { WizardParams } from '../types/wizard'
import { fmt } from './format'
import { resolvePoints } from './positioning'

export function buildHeader(params: WizardParams): string[] {
  const { feeds, output } = params
  const lines = ['G21 G90 G17']

  if (output.spindleStart) {
    lines.push(`M3 S${fmt(output.spindleSpeed)}`)
    if (output.dwellSeconds > 0) {
      // GRBL/Mach3 read G4 P as seconds; Marlin reads P as milliseconds
      // (its S word means seconds but isn't supported by GRBL/Mach3), so no
      // single P value is correct on all three. We follow the GRBL/Mach3
      // convention — on Marlin this dwells for milliseconds instead of
      // seconds, i.e. a shorter pause than intended, not a longer one.
      lines.push(`G4 P${fmt(output.dwellSeconds)}`)
    }
  }

  lines.push(`G0 Z${fmt(feeds.safeZ)}`)
  return lines
}

export function buildFooter(params: WizardParams): string[] {
  const { feeds, output } = params
  const lines: string[] = []

  if (output.returnSafeZEnd) {
    lines.push(`G0 Z${fmt(feeds.safeZ)}`)
    lines.push('M5')
  }

  if (output.returnOriginEnd) {
    lines.push('G0 X0 Y0')
  }

  return lines
}

// Shared assembly: header, then for each resolved point a rapid move to its
// XY followed by the operation-specific toolpath and a retract to Safe Z,
// then footer. `toolpathForPoint` only needs to know about depth/feeds —
// positioning and Safe-Z bookkeeping are handled once, here.
export function assembleProgram(
  params: WizardParams,
  toolpathForPoint: (cx: number, cy: number, params: WizardParams) => string[],
): string[] {
  const { geometry, feeds } = params
  const points = resolvePoints(geometry)
  const lines: string[] = [...buildHeader(params)]

  for (const point of points) {
    lines.push(`G0 X${fmt(point.x)} Y${fmt(point.y)}`)
    lines.push(...toolpathForPoint(point.x, point.y, params))
    lines.push(`G0 Z${fmt(feeds.safeZ)}`)
  }

  lines.push(...buildFooter(params))
  return lines
}
