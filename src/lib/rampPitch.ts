// Depth a ramp/helix descends over `pathLength` of travel at `rampAngleDeg`
// — the path length × tan(angle). Shared by every angle-driven descent:
// Surface/Pocket entry helixes (helixPitchForRampAngle) and the Hole(s)/
// Outline helix and rectangle ramp (cappedRampPitch below).
export function pitchForRampAngle(pathLength: number, rampAngleDeg: number): number {
  return pathLength * Math.tan((rampAngleDeg * Math.PI) / 180)
}

// BL-80: the Hole(s)/Outline helix and rectangle ramp descend at most one
// Stepdown per turn/lap, and never steeper than the Ramp Angle — whichever
// gives the smaller pitch. A zero-length path (transient preview states;
// validation blocks it for Generate) has no angle to honor and falls back
// to Stepdown.
export function cappedRampPitch(pathLength: number, stepdown: number, rampAngleDeg: number): number {
  if (!(pathLength > 0)) return stepdown
  return Math.min(stepdown, pitchForRampAngle(pathLength, rampAngleDeg))
}
