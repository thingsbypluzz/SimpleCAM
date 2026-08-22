import type { MachineSettings } from '../types/machine'
import type { FeedsParams, GeometryParams, WizardParams } from '../types/wizard'
import { resolvePoints } from './positioning'

export function isToolDiameterValid(geometry: GeometryParams): boolean {
  return geometry.toolDiameter <= geometry.holeDiameter
}

export function isStepdownValid(feeds: FeedsParams): boolean {
  return feeds.stepdown > 0
}

export function isStartZValid(feeds: FeedsParams): boolean {
  return feeds.startZ <= feeds.safeZ
}

// X/Y extent of the resolved pattern, hole footprint included (radius, not
// just center points) — the same bounding-box math buildScene.ts uses for
// 3D Preview framing, computed fresh in CNC space rather than reusing its
// THREE.Box3 (that one needs the three dependency and lives in Three's
// Y-up, Z-negated coordinate space — not worth adapting for this).
export function patternSpan(geometry: GeometryParams): { x: number; y: number } {
  const points = resolvePoints(geometry)
  if (points.length === 0) return { x: 0, y: 0 }
  const holeRadius = geometry.holeDiameter / 2
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return {
    x: Math.max(...xs) - Math.min(...xs) + 2 * holeRadius,
    y: Math.max(...ys) - Math.min(...ys) + 2 * holeRadius,
  }
}

// Vertical excursion the program actually needs, top to bottom. safeZ is
// always >= startZ (isStartZValid), so safeZ is the effective top
// regardless of startZ.
export function zSpan(geometry: GeometryParams, feeds: FeedsParams): number {
  return feeds.safeZ + geometry.totalDepth
}

// Span-based fit check — independent of where the operator zeroes the
// machine on the table (see CLAUDE.md, BL-9): a pattern whose span on some
// axis exceeds that axis's total travel can never fit, no matter where
// it's clamped, so this is the only thing worth flagging. One message per
// axis that actually fails; empty array once everything fits.
export function machineFitWarnings(params: WizardParams, machine: MachineSettings): string[] {
  const span = patternSpan(params.geometry)
  const warnings: string[] = []
  if (span.x > machine.travelX) {
    warnings.push(
      `X span ${span.x.toFixed(1)}mm exceeds the machine's X travel (${machine.travelX}mm).`,
    )
  }
  if (span.y > machine.travelY) {
    warnings.push(
      `Y span ${span.y.toFixed(1)}mm exceeds the machine's Y travel (${machine.travelY}mm).`,
    )
  }
  const totalZ = zSpan(params.geometry, params.feeds)
  if (totalZ > machine.travelZ) {
    warnings.push(
      `Z span ${totalZ.toFixed(1)}mm exceeds the machine's Z travel (${machine.travelZ}mm).`,
    )
  }
  return warnings
}
