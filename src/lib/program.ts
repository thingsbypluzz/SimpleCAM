import type { Dialect, MachineSettings } from '../types/machine'
import type { Point2D, WizardParams } from '../types/wizard'
import { fmt } from './format'
import { resolvePoints } from './positioning'

// `startZ` treats the material as taller than nominal Z0 by that amount —
// the actual top of stock sits at +startZ, cutting still ends at the usual
// -totalDepth. Above +startZ is open air, so a rapid straight there is
// always safe (and at the default startZ=0 this is exactly the original
// `G0 Z0`, i.e. no behavior change at all). Shared by every toolpath
// generator (helix.ts/standardHole.ts for Hole(s), outlineCircle.ts/
// outlineRectangle.ts for Outline), which would otherwise each duplicate
// this as a hardcoded format string.
export function rapidToTop(startZ: number): string {
  return `G0 Z${fmt(startZ)}`
}

export function buildHeader(params: WizardParams, dialect: Dialect): string[] {
  const { feeds, output } = params
  const lines = ['G21 G90 G17']

  if (output.spindleStart) {
    lines.push(`M3 S${fmt(output.spindleSpeed)}`)
    if (output.dwellSeconds > 0) {
      // GRBL/Mach3 read G4 P as seconds; Marlin reads P as milliseconds
      // (its S word means seconds but isn't supported by GRBL/Mach3), so no
      // single P value is correct on all three — convert to keep the real
      // dwell time correct regardless of dialect.
      const dwellValue = dialect === 'marlin' ? output.dwellSeconds * 1000 : output.dwellSeconds
      lines.push(`G4 P${fmt(dwellValue)}`)
    }
  }

  lines.push(`G0 Z${fmt(feeds.safeZ)}`)
  return lines
}

// M2 also works on GRBL, but M30 (rewind) is the conventional GRBL/Mach3
// choice; Marlin only supports M2. Always the true last line of the
// program — nothing after it is guaranteed to run on most controllers.
export function endOfProgramCode(dialect: Dialect): string {
  return dialect === 'marlin' ? 'M2' : 'M30'
}

export function buildFooter(params: WizardParams): string[] {
  const { output } = params
  const lines: string[] = []

  // No Safe Z retract here on purpose: assembleProgram() below already
  // retracts after *every* point, the last one included, so the tool is
  // guaranteed to be at Safe Z by the time we get here. Emitting another
  // `G0 Z<safeZ>` would just repeat the previous line verbatim.
  if (output.spindleStopEnd) {
    lines.push('M5')
  }

  if (output.returnOriginEnd) {
    lines.push('G0 X0 Y0')
  }

  return lines
}

// Shared assembly: user header, app header, then for each resolved point a
// rapid move to its XY followed by the method-specific toolpath and a
// retract to Safe Z, then app footer, user footer, and the dialect-forced
// end-of-program code. `toolpathForPoint` only needs to know about
// depth/feeds — positioning and Safe-Z bookkeeping are handled once, here.
//
// `points` defaults to Hole(s)' pattern resolution (`resolvePoints`) — every
// existing Hole(s) call site omits it and is unaffected. Outline cutting
// (a single shape, not a repeated pattern) passes its own one-element array
// explicitly instead, reusing this same header/footer/retract wrapping.
export function assembleProgram(
  params: WizardParams,
  machine: MachineSettings,
  toolpathForPoint: (cx: number, cy: number, params: WizardParams) => string[],
  points: Point2D[] = resolvePoints(params.geometry),
): string[] {
  const { feeds } = params
  const lines: string[] = []

  // Markers only appear around non-empty content — someone who never
  // touches Start/End G-Code in Settings gets output identical to before
  // this feature existed, aside from the new trailing end-of-program line.
  const header = machine.headerText.trim()
  if (header) {
    lines.push('; --- User header ---')
    lines.push(...machine.headerText.split('\n'))
    lines.push('; --- Application code ---')
  }

  lines.push(...buildHeader(params, machine.dialect))

  for (const point of points) {
    lines.push(`G0 X${fmt(point.x)} Y${fmt(point.y)}`)
    lines.push(...toolpathForPoint(point.x, point.y, params))
    lines.push(`G0 Z${fmt(feeds.safeZ)}`)
  }

  lines.push(...buildFooter(params))

  const footer = machine.footerText.trim()
  if (footer) {
    lines.push('; --- User footer ---')
    lines.push(...machine.footerText.split('\n'))
  }

  lines.push(endOfProgramCode(machine.dialect))
  return lines
}
