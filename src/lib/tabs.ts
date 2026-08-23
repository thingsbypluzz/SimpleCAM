import { fmt } from './format'

// Matches circle.ts's LINEAR_SEGMENTS — same resolution for the cutting
// motion between tabs, so a tabbed pass looks like the same polygon
// approximation as an untabbed one away from the gaps.
const SEGMENTS_PER_TURN = 72

export interface TabRange {
  startAngle: number
  endAngle: number
}

// Tabs are evenly spaced, but phase-shifted by half a step so the FIRST
// tab is centered at `step/2`, not at angle 0 — angle 0 is where every
// pass starts/ends (see fullCircleMove/tabbedCirclePass), so this
// guarantees the start point never lands inside a tab.
//
// Given the validation rule enforced elsewhere (tabCount * tabWidth <
// circumference, i.e. angularWidth < step), this phase shift also
// guarantees every tab range stays fully within [0, 2π] — the first
// tab's start (`step/2 - angularWidth/2`) is always > 0, and the last
// tab's end (`2π - step/2 + angularWidth/2`) is always < 2π. No
// angle-wraparound handling is needed anywhere as a result.
export function computeTabRanges(tabCount: number, tabWidth: number, radius: number): TabRange[] {
  if (tabCount <= 0 || radius <= 0) return []
  const angularWidth = tabWidth / radius
  const step = (2 * Math.PI) / tabCount
  const ranges: TabRange[] = []
  for (let k = 0; k < tabCount; k++) {
    const center = step * (k + 0.5)
    ranges.push({ startAngle: center - angularWidth / 2, endAngle: center + angularWidth / 2 })
  }
  return ranges
}

function isInsideTab(angle: number, ranges: TabRange[]): boolean {
  return ranges.some((r) => angle > r.startAngle && angle < r.endAngle)
}

interface TabbedCirclePassParams {
  centerX: number
  centerY: number
  radius: number
  startX: number
  startY: number
  cutZ: number
  liftZ: number
  feed: number
  tabRanges: TabRange[]
}

// One full 360° flat pass around (centerX, centerY) at `cutZ`, skipping
// each tab in `tabRanges` — the tool rapids/feeds up to `liftZ` (the
// tab-band top) before a tab's arc, traverses it there, then plunges back
// to `cutZ` to resume. G1-only: tabs force segmented interpolation for
// the whole program (see helix.ts/standardHole.ts), so this never needs
// to emit G2/G3.
//
// Unlike a plain fixed-resolution walk, the angle list is the union of
// the uniform SEGMENTS_PER_TURN sweep AND every tab's exact start/end
// angle, sorted — forcing tab boundaries to always be explicit
// breakpoints. A plain sample-only walk can miss a tab entirely (if it's
// narrower than one sample) or cut it wider than requested (lift/plunge
// snapping to the nearest sample instead of the true boundary); forcing
// the boundaries in as breakpoints makes every tab detected and sized
// exactly, regardless of the cutting resolution.
export function tabbedCirclePass(p: TabbedCirclePassParams): string[] {
  const twoPi = 2 * Math.PI
  const angles = new Set<number>([0, twoPi])
  for (let step = 1; step < SEGMENTS_PER_TURN; step++) {
    angles.add((twoPi * step) / SEGMENTS_PER_TURN)
  }
  for (const r of p.tabRanges) {
    angles.add(r.startAngle)
    angles.add(r.endAngle)
  }
  const sortedAngles = [...angles].sort((a, b) => a - b)

  const lines: string[] = []
  let prevX = p.startX
  let prevY = p.startY
  let inTab = false // angle 0 is guaranteed outside any tab, see computeTabRanges

  for (let idx = 1; idx < sortedAngles.length; idx++) {
    const angle = sortedAngles[idx]
    const midAngle = (sortedAngles[idx - 1] + angle) / 2
    const nextInTab = isInsideTab(midAngle, p.tabRanges)
    const x = p.centerX + p.radius * Math.cos(angle)
    const y = p.centerY + p.radius * Math.sin(angle)

    if (nextInTab && !inTab) {
      // Entering a tab: retract straight up where we already are, then
      // move across to this breakpoint at liftZ.
      lines.push(`G1 X${fmt(prevX)} Y${fmt(prevY)} Z${fmt(p.liftZ)} F${fmt(p.feed)}`)
      lines.push(`G1 X${fmt(x)} Y${fmt(y)} Z${fmt(p.liftZ)} F${fmt(p.feed)}`)
    } else if (!nextInTab && inTab) {
      // Leaving a tab: arrive at this breakpoint still lifted, then
      // plunge straight down to resume cutting.
      lines.push(`G1 X${fmt(x)} Y${fmt(y)} Z${fmt(p.liftZ)} F${fmt(p.feed)}`)
      lines.push(`G1 X${fmt(x)} Y${fmt(y)} Z${fmt(p.cutZ)} F${fmt(p.feed)}`)
    } else {
      lines.push(`G1 X${fmt(x)} Y${fmt(y)} Z${fmt(nextInTab ? p.liftZ : p.cutZ)} F${fmt(p.feed)}`)
    }

    prevX = x
    prevY = y
    inTab = nextInTab
  }

  // Snap the last point onto the exact start, matching fullCircleMove's
  // G1 branch (avoids float drift).
  lines[lines.length - 1] = `G1 X${fmt(p.startX)} Y${fmt(p.startY)} Z${fmt(p.cutZ)} F${fmt(p.feed)}`
  return lines
}
