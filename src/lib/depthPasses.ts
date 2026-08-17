// Hard ceiling on the number of depth passes/turns a toolpath can produce.
// stepdown <= 0 is invalid (it should be blocked by validation before
// Generate), but the 2D/3D previews recompute the toolpath live on every
// keystroke — including transient states while typing (e.g. clearing the
// field, or "0" on the way to "0.1") — so this is the actual safety net
// against an infinite loop freezing the tab, not just a nice-to-have.
const MAX_PASSES = 5000

// Splits `totalDepth` into a sequence of positive per-pass depth
// increments of at most `stepdown` each (the last one may be smaller).
// Falls back to a single full-depth pass when stepdown isn't a valid
// positive number, instead of looping forever.
export function computeDepthPasses(totalDepth: number, stepdown: number): number[] {
  if (totalDepth <= 0) return []
  if (!(stepdown > 0)) return [totalDepth]

  const passes: number[] = []
  let remaining = totalDepth
  while (remaining > 1e-9 && passes.length < MAX_PASSES) {
    const passDepth = Math.min(stepdown, remaining)
    passes.push(passDepth)
    remaining -= passDepth
  }
  return passes
}
