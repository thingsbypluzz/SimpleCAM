import { fmt } from './format'
import type { Point2D } from '../types/wizard'

export interface SideTabRange {
  startFrac: number
  endFrac: number
}

// Rectangle analog of tabs.ts's computeTabRanges, but along a straight
// side instead of around a circle: tabs are evenly spaced and
// phase-shifted by half a step so the FIRST tab is centered at
// `step/2`, not at fraction 0 — fraction 0/1 are corners (where every
// edge starts/ends), so this phase shift guarantees a corner is never
// inside a tab, giving automatic breathing room with no extra parameter.
// Called once per side with that side's own length — `tabCountPerSide`
// is per side (not total around the perimeter, unlike circle outline's
// tabCount), per the Outline design (CLAUDE.md).
export function computeRectTabRanges(
  tabCountPerSide: number,
  tabWidth: number,
  sideLength: number,
): SideTabRange[] {
  if (tabCountPerSide <= 0 || sideLength <= 0) return []
  const widthFrac = tabWidth / sideLength
  const step = 1 / tabCountPerSide
  const ranges: SideTabRange[] = []
  for (let k = 0; k < tabCountPerSide; k++) {
    const center = step * (k + 0.5)
    ranges.push({ startFrac: center - widthFrac / 2, endFrac: center + widthFrac / 2 })
  }
  return ranges
}

// Per-edge tab ranges for a 4-corner rectangle path, measured from each
// edge's own actual length — robust to rotation/winding direction (unlike
// inferring length from width/height parity), since it just reads the
// corner points directly. Shared by the engine (outlineRectangle.ts) and
// both previews (drawToolpath.ts, buildScene.ts).
export function sideRangesFor(corners: Point2D[], tabCount: number, tabWidth: number): SideTabRange[][] {
  return [0, 1, 2, 3].map((i) => {
    const p0 = corners[i]
    const p1 = corners[(i + 1) % 4]
    const length = Math.hypot(p1.x - p0.x, p1.y - p0.y)
    return computeRectTabRanges(tabCount, tabWidth, length)
  })
}

function isInsideRange(frac: number, ranges: SideTabRange[]): boolean {
  return ranges.some((r) => frac > r.startFrac && frac < r.endFrac)
}

export interface TabbedRectanglePassParams {
  corners: Point2D[] // exactly 4, in traversal order (see outlineRectangleGeometry.ts's rectCorners)
  sideRanges: SideTabRange[][] // exactly 4 arrays, sideRanges[i] applies to the edge corners[i] -> corners[(i+1)%4]
  cutZ: number
  liftZ: number
  feed: number
}

// One full flat pass around the 4-corner perimeter at `cutZ`, skipping
// each tab in `sideRanges[edge]` per edge — same lift-at-entry/plunge-at-
// exit strategy as tabs.ts's tabbedCirclePass, but simpler: a straight G1
// edge needs no angular-sampling resolution, only each tab's exact
// start/end fraction as a breakpoint (no equivalent of
// SEGMENTS_PER_TURN — the line between two corners is already exact).
// Degrades to a plain 4-line perimeter walk when every side's
// `sideRanges` entry is empty (no tabs on that side).
export function tabbedRectanglePass(p: TabbedRectanglePassParams): string[] {
  const { corners, sideRanges, cutZ, liftZ, feed } = p
  const lines: string[] = []
  let prevX = corners[0].x
  let prevY = corners[0].y
  let inTab = false // corners are guaranteed outside any tab, see computeRectTabRanges

  for (let edge = 0; edge < 4; edge++) {
    const p0 = corners[edge]
    const p1 = corners[(edge + 1) % 4]
    const ranges = sideRanges[edge]

    const fracs = new Set<number>([0, 1])
    for (const r of ranges) {
      fracs.add(r.startFrac)
      fracs.add(r.endFrac)
    }
    const sortedFracs = [...fracs].sort((a, b) => a - b)

    for (let idx = 1; idx < sortedFracs.length; idx++) {
      const frac = sortedFracs[idx]
      const midFrac = (sortedFracs[idx - 1] + frac) / 2
      const nextInTab = isInsideRange(midFrac, ranges)
      const x = p0.x + (p1.x - p0.x) * frac
      const y = p0.y + (p1.y - p0.y) * frac

      if (nextInTab && !inTab) {
        lines.push(`G1 X${fmt(prevX)} Y${fmt(prevY)} Z${fmt(liftZ)} F${fmt(feed)}`)
        lines.push(`G1 X${fmt(x)} Y${fmt(y)} Z${fmt(liftZ)} F${fmt(feed)}`)
      } else if (!nextInTab && inTab) {
        lines.push(`G1 X${fmt(prevX)} Y${fmt(prevY)} Z${fmt(cutZ)} F${fmt(feed)}`)
        lines.push(`G1 X${fmt(x)} Y${fmt(y)} Z${fmt(cutZ)} F${fmt(feed)}`)
      } else {
        lines.push(`G1 X${fmt(x)} Y${fmt(y)} Z${fmt(nextInTab ? liftZ : cutZ)} F${fmt(feed)}`)
      }

      prevX = x
      prevY = y
      inTab = nextInTab
    }
  }

  // Snap the last point onto the exact start corner, matching
  // tabbedCirclePass/fullCircleMove's convention (avoids float drift).
  lines[lines.length - 1] = `G1 X${fmt(corners[0].x)} Y${fmt(corners[0].y)} Z${fmt(cutZ)} F${fmt(feed)}`
  return lines
}
