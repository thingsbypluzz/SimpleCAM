import type { Dialect, MachineSettings } from '../types/machine'
import type { Point2D, WizardParams } from '../types/wizard'
import { fmt } from './format'
import { resolvePoints } from './positioning'

// `startZ` is the approach margin above the stock top (Z0): the rapid stops
// there and the rest of the way down runs at feed, in case Z zeroing is a
// little off. It's only guaranteed to be air for startZ >= 0 — a negative
// Start Z is allowed (resuming a partly cut job) but flagged as a warning
// in Steps 3/4 (feedsWarnings(), validation.ts). Shared by every toolpath
// generator (helix.ts/standardHole.ts for Hole(s), outlineCircle.ts/
// outlineRectangle.ts for Outline), which would otherwise each duplicate
// this as a hardcoded format string.
export function rapidToTop(startZ: number): string {
  return `G0 Z${fmt(startZ)}`
}

// BL-54: every arc uses incremental I/J, so the arc-center mode must be
// pinned — Mach3's "IJ Mode" is configurable and in absolute mode would
// swing every G2/G3 around the wrong center. G94 (units/min feed), G40 (no
// cutter compensation) and G49 (no tool length offset) clear modal state a
// previous job may have left. GRBL 1.1 and Mach3 accept all four; Marlin
// implements none of them (its I/J are always incremental), so it keeps
// only the shared line.
export function modalPreamble(dialect: Dialect): string[] {
  const base = 'G21 G90 G17'
  return dialect === 'marlin' ? [base] : [base, 'G91.1 G94 G40 G49']
}

export function buildHeader(params: WizardParams, machine: MachineSettings): string[] {
  const { feeds, output } = params
  const { dialect, spindleSpeed, dwellSeconds } = machine
  const lines = modalPreamble(dialect)

  if (output.spindleStart) {
    lines.push(`M3 S${fmt(spindleSpeed)}`)
    if (dwellSeconds > 0) {
      // GRBL/Mach3 read G4 P as seconds; Marlin reads P as milliseconds
      // (its S word means seconds but isn't supported by GRBL/Mach3), so no
      // single P value is correct on all three — convert to keep the real
      // dwell time correct regardless of dialect.
      const dwellValue = dialect === 'marlin' ? dwellSeconds * 1000 : dwellSeconds
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

// Shared assembly: user header, app header, then for each resolved point the
// method-specific toolpath followed by a retract to Safe Z, then app
// footer, user footer, and the dialect-forced end-of-program code.
//
// This loop does NOT itself rapid to `point`'s raw XY before calling
// `toolpathForPoint` — every real toolpath function already emits its own
// leading `G0 X.. Y..` line to its actual cutting-start point. For a
// circle/rectangle toolpath that start is offset from `point` (the
// hole/shape center) by the tool radius, so an extra rapid here would
// briefly visit the center first, then hop again to the real start — a
// physically wasteful move a previous version of this function used to
// emit, confirmed on a real machine. `toolpathForPoint` owns its own entry
// rapid because only it knows where the real start is relative to the
// point it's given; this loop only owns the Safe-Z retract between points.
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

  lines.push(...buildHeader(params, machine))

  for (const point of points) {
    // Not `lines.push(...toolpath)`: spreading a very long program (Pocket
    // Adaptive in G1 mode reaches hundreds of thousands of lines) into
    // call arguments overflows the call stack.
    for (const line of toolpathForPoint(point.x, point.y, params)) lines.push(line)
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
