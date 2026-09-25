// Engagement math for Pocket Adaptive. "Engagement angle" = the arc of the
// tool's circumference in contact with uncut material, measured at the
// tool center, on the tool's leading half. Everything here is closed-form
// — no material simulation (see CLAUDE.md's Pocket Adaptive notes).

export const MIN_OPTIMAL_LOAD_PERCENT = 1
export const MAX_OPTIMAL_LOAD_PERCENT = 30

// Straight-cut engagement for a radial depth of cut (optimal load) given as
// a percentage of the tool DIAMETER: ae = D·p/100 = 2R·p/100, and
// cos θ = 1 − ae/R. Independent of the tool size — which is why % is the
// stored value and mm is derived.
export function engagementAngleFor(optimalLoadPercent: number): number {
  const cosTheta = 1 - (2 * optimalLoadPercent) / 100
  return Math.acos(Math.min(1, Math.max(-1, cosTheta)))
}

export function optimalLoadMm(toolDiameter: number, optimalLoadPercent: number): number {
  return (toolDiameter * optimalLoadPercent) / 100
}

export function optimalLoadPercentFromMm(toolDiameter: number, mm: number): number {
  return toolDiameter > 0 ? (mm / toolDiameter) * 100 : 0
}

// Radial chip thinning: the thickest chip a tooth takes is fz·sin θ, so the
// feed must rise by 1/sin θ to get back to the chip load fz was chosen for.
// Used only as a read-only hint — never applied to the G-code.
export function chipThinningFactor(optimalLoadPercent: number): number {
  const s = Math.sin(engagementAngleFor(optimalLoadPercent))
  return s > 0 ? 1 / s : Infinity
}

// Feed XY that restores the chip load `baseFeed` was chosen for, at this
// optimal load. Suggested, never applied automatically.
export function chipThinnedFeed(baseFeed: number, optimalLoadPercent: number): number {
  return Math.round(baseFeed * chipThinningFactor(optimalLoadPercent))
}

// Chip load charts are ±10–20% themselves — a feed within 5% of the
// compensated value counts as compensated (e.g. nudging Optimal Load from
// 10% to 10.5% after applying moves the factor only ~2%).
export const CHIP_THINNING_TOLERANCE = 0.05

export function isFeedChipThinningCompensated(feed: number, baseFeed: number | null, optimalLoadPercent: number): boolean {
  if (baseFeed === null || !(baseFeed > 0)) return false
  const target = baseFeed * chipThinningFactor(optimalLoadPercent)
  return Number.isFinite(target) && Math.abs(feed - target) <= CHIP_THINNING_TOLERANCE * target
}

// Engagement of a tool whose center sits at distance `rho` from a center O,
// moving tangentially around O, when everything within `clearedRadius`
// (a MATERIAL radius, i.e. tool-center radius + R of the previous pass) of O
// is already cut. Law of cosines on triangle O–tool center–contact point:
// cos θ = (Rm² − ρ² − R²) / (2ρR). ρ → ∞ reduces to the straight-cut
// formula. Clamped to [0, π].
export function arcEngagement(rho: number, clearedRadius: number, toolRadius: number): number {
  if (rho <= 0) return Math.PI
  const cosTheta = (clearedRadius * clearedRadius - rho * rho - toolRadius * toolRadius) / (2 * rho * toolRadius)
  return Math.acos(Math.min(1, Math.max(-1, cosTheta)))
}

// Inverse of arcEngagement(): the tool-center radius ρ at which a
// tangential pass around the same center engages exactly `theta`, when the
// previous pass ran at tool-center radius `prevRho` (so Rm = prevRho + R).
// Solves ρ² + 2Rcosθ·ρ + R² − (prevRho + R)² = 0 for the positive root.
// Growth near 0 is geometric (≈ prevRho / cos θ), so it can never grow out
// of prevRho = 0 — a helix bore (prevRho > 0) is required to start from.
export function nextConstantEngagementRadius(prevRho: number, toolRadius: number, theta: number): number {
  const c = Math.cos(theta)
  const rm = prevRho + toolRadius
  const disc = toolRadius * toolRadius * c * c - toolRadius * toolRadius + rm * rm
  return -toolRadius * c + Math.sqrt(Math.max(0, disc))
}

// Engagement along a whole constant-radius arc (radius `r`, centered at the
// origin, traversed CCW from angle a0 to a1), when the previously cleared
// material boundary is a circle of radius `clearedRadius` centered at
// `prevCenter` (relative to this arc's center). At each sampled point the
// engagement is the tangential-pass angle (arcEngagement, from the distance
// to the previous center) PLUS the tilt of the direction of motion away from
// the previous center: moving partly outward rotates the tool's leading half
// toward the uncut side by exactly that angle. The tilt vanishes when both
// arcs share a center (phase A rings) and at the apex of an offset arc, but
// not at its ends — which is why the apex alone isn't a safe bound.
// The CW (climb) mirror image has the same maximum.
export function maxArcEngagement(
  r: number,
  a0: number,
  a1: number,
  prevCenter: { x: number; y: number },
  clearedRadius: number,
  toolRadius: number,
  samples = 48,
): number {
  let max = 0
  for (let i = 0; i <= samples; i++) {
    const a = a0 + ((a1 - a0) * i) / samples
    const dx = r * Math.cos(a) - prevCenter.x
    const dy = r * Math.sin(a) - prevCenter.y
    const d = Math.hypot(dx, dy)
    if (d <= 0) continue
    const outward = (-Math.sin(a) * dx + Math.cos(a) * dy) / d
    const tilt = Math.asin(Math.min(1, Math.max(-1, outward)))
    max = Math.max(max, arcEngagement(d, clearedRadius, toolRadius) + tilt)
  }
  return max
}

// Largest step in (0, hi] whose engagement (given as a function of the
// step, assumed non-decreasing in it) stays within `theta` — bisection, so
// it works for any of the offset-arc geometries without a closed form.
export function largestStepWithin(engagementForStep: (step: number) => number, theta: number, hi: number): number {
  if (engagementForStep(hi) <= theta) return hi
  let lo = 0
  let top = hi
  for (let i = 0; i < 40; i++) {
    const mid = (lo + top) / 2
    if (engagementForStep(mid) <= theta) lo = mid
    else top = mid
  }
  return lo
}
