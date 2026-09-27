import type { Point3D, ToolpathBuilder } from './toolpath'

// Matches a full turn's 72 G1 segments (toolpath.ts) — same resolution for the cutting
// motion between tabs, so a tabbed pass looks like the same polygon
// approximation as an untabbed one away from the gaps.
const SEGMENTS_PER_TURN = 72

export interface TabRange {
  startAngle: number
  endAngle: number
}

// Tabs are evenly spaced, but phase-shifted by half a step so the FIRST
// tab is centered at `step/2`, not at angle 0 — angle 0 is where every
// pass starts/ends (see appendFullTurn/appendTabbedCirclePass), so this
// guarantees the start point never lands inside a tab.
//
// Given the validation rule enforced elsewhere (tabCount * tabWidth <
// circumference, i.e. angularWidth < step), this phase shift also
// guarantees every tab range stays fully within [0, 2π] — the first
// tab's start (`step/2 - angularWidth/2`) is always > 0, and the last
// tab's end (`2π - step/2 + angularWidth/2`) is always < 2π. No
// angle-wraparound handling is needed anywhere as a result.
//
// Validation also requires a whole tabCount (BL-45); the floor and the
// clamp to [0, 2π] below are only a defensive backstop so an unvalidated
// value (preview renders before Generate is gated) can never push a range
// past the pass's own start/end.
export function computeTabRanges(tabCount: number, tabWidth: number, radius: number): TabRange[] {
  const count = Math.floor(tabCount)
  if (count <= 0 || radius <= 0) return []
  const twoPi = 2 * Math.PI
  const angularWidth = tabWidth / radius
  const step = twoPi / count
  const ranges: TabRange[] = []
  for (let k = 0; k < count; k++) {
    const center = step * (k + 0.5)
    ranges.push({
      startAngle: Math.max(0, center - angularWidth / 2),
      endAngle: Math.min(twoPi, center + angularWidth / 2),
    })
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
  tabRanges: TabRange[]
  direction: 'cw' | 'ccw'
}

// One full 360° flat pass around (centerX, centerY) at `cutZ`, skipping
// each tab in `tabRanges` — the tool feeds up to `liftZ` (the tab-band
// top) before a tab's arc, traverses it there, then feeds back down to
// `cutZ` to resume. Straight 'cut' moves only (G1 at Feedrate XY): tabs
// force segmented interpolation for the whole program (see
// helix.ts/standardHole.ts), so this never needs G2/G3.
//
// Unlike a plain fixed-resolution walk, the angle list is the union of
// the uniform SEGMENTS_PER_TURN sweep AND every tab's exact start/end
// angle, sorted — forcing tab boundaries to always be explicit
// breakpoints. A plain sample-only walk can miss a tab entirely (if it's
// narrower than one sample) or cut it wider than requested (lift/plunge
// snapping to the nearest sample instead of the true boundary); forcing
// the boundaries in as breakpoints makes every tab detected and sized
// exactly, regardless of the cutting resolution.
export function appendTabbedCirclePass(b: ToolpathBuilder, p: TabbedCirclePassParams): void {
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
  // Tab ranges (from computeTabRanges) and the breakpoint sweep above are
  // always defined as an ascending-angle walk from 0 to 2π, independent of
  // cutting direction — only the physical XY position each angle maps to
  // flips sign for 'cw', mirroring a full turn's direction.
  const sign = p.direction === 'cw' ? -1 : 1

  const points: Point3D[] = []
  let prevX = p.startX
  let prevY = p.startY
  let inTab = false // angle 0 is guaranteed outside any tab, see computeTabRanges

  for (let idx = 1; idx < sortedAngles.length; idx++) {
    const angle = sortedAngles[idx]
    const midAngle = (sortedAngles[idx - 1] + angle) / 2
    const nextInTab = isInsideTab(midAngle, p.tabRanges)
    const x = p.centerX + p.radius * Math.cos(sign * angle)
    const y = p.centerY + p.radius * Math.sin(sign * angle)

    if (nextInTab && !inTab) {
      // Entering a tab: rise straight up where we already are, then move
      // across to this breakpoint at liftZ.
      points.push({ x: prevX, y: prevY, z: p.liftZ }, { x, y, z: p.liftZ })
    } else if (!nextInTab && inTab) {
      // Leaving a tab: feed straight down where we already are (the tab's
      // own end boundary), then move across to this breakpoint at cutZ,
      // resuming normal cutting immediately instead of only after reaching
      // the next breakpoint.
      points.push({ x: prevX, y: prevY, z: p.cutZ }, { x, y, z: p.cutZ })
    } else {
      points.push({ x, y, z: nextInTab ? p.liftZ : p.cutZ })
    }

    prevX = x
    prevY = y
    inTab = nextInTab
  }

  // Snap the last point onto the exact start, matching a full turn's own
  // end point (avoids float drift).
  points[points.length - 1] = { x: p.startX, y: p.startY, z: p.cutZ }
  for (const pt of points) b.lineTo('cut', pt.x, pt.y, pt.z)
}
