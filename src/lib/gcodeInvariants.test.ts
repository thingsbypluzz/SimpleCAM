// BL-62: property test across every operation and method. Random parameter
// sets that pass isWizardParamsValid() (the exact rule that gates Generate)
// must always produce G-code that satisfies the invariants below — the same
// fuzzing that found most of the 2026-09-26 code review's bugs, kept in the
// repo. Deterministic: a fixed seed per suite. Scale it up locally with
// GCODE_FUZZ_SCALE=10 (runs 10x as many samples per suite) and change the
// base with GCODE_FUZZ_SEED.
import { describe, expect, it } from 'vitest'
import type { MachineSettings } from '../types/machine'
import type { WizardParams } from '../types/wizard'
import { makeRng, randomHoles, randomMachine, randomOutline, randomPocket, randomSurface, type Rng } from './fuzzParams'
import { arcRadiusMismatches } from './gcodeTestUtils'
import { generateHelix } from './helix'
import { forcedLinearReason } from './interpolation'
import { generateOutline } from './outline'
import { generatePocketAdaptive, generatePocketSpiral } from './pocket'
import { pocketCenter, pocketCircleWallRadius, pocketRectWallHalfDims } from './pocketGeometry'
import { endOfProgramCode } from './program'
import { generateStandardHole } from './standardHole'
import { generateSurfaceUnidirectional, generateSurfaceZigzag } from './surface'
import { surfaceToolBounds } from './surfaceGeometry'
import { activeTotalDepth, isWizardParamsValid } from './validation'

// The app's tsconfig has no Node types; vitest runs under Node regardless.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}
const SCALE = Number(env.GCODE_FUZZ_SCALE ?? '1')
const BASE_SEED = Number(env.GCODE_FUZZ_SEED ?? '20260926')
// Output is formatted to 4 decimals (format.ts), so every comparison
// against a computed value allows for that rounding.
const EPS = 1e-3

// ---------- G-code tracing ----------

interface TracedPoint {
  x: number
  y: number
  z: number
}

function word(line: string, letter: string): number | undefined {
  const m = line.match(new RegExp(`(?:^|\\s)${letter}(-?[\\d.]+)`))
  return m ? Number(m[1]) : undefined
}

// Walks the program keeping the modal position, and returns every point the
// tool passes through below Z0 (arcs sampled), plus the problems found.
function checkProgram(lines: string[], params: WizardParams, machine: MachineSettings) {
  const problems: string[] = []
  const below: TracedPoint[] = []
  const { safeZ } = params.feeds
  const totalDepth = activeTotalDepth(params)
  let x: number | undefined
  let y: number | undefined
  let z: number | undefined
  let minZ = Infinity

  const record = (p: TracedPoint) => {
    minZ = Math.min(minZ, p.z)
    if (p.z < -EPS) below.push(p)
  }

  lines.forEach((line, index) => {
    const where = `line ${index + 1} "${line}"`
    if (/NaN|Infinity/.test(line)) problems.push(`non-finite number at ${where}`)
    const f = word(line, 'F')
    if (f !== undefined && !(f > 0)) problems.push(`feed not > 0 at ${where}`)
    if (!/^G[0-3](\s|$)/.test(line)) return

    const nx = word(line, 'X') ?? x
    const ny = word(line, 'Y') ?? y
    const nz = word(line, 'Z') ?? z
    const movesXY = word(line, 'X') !== undefined || word(line, 'Y') !== undefined

    if (line.startsWith('G0') && movesXY && !(z !== undefined && z >= safeZ - EPS)) {
      problems.push(`XY rapid below Safe Z (${z}) at ${where}`)
    }
    if (nz === undefined) {
      if (movesXY) problems.push(`XY move before any Z is known at ${where}`)
      return
    }

    if (/^G[23]/.test(line) && x !== undefined && y !== undefined && nx !== undefined && ny !== undefined && z !== undefined) {
      const cx = x + (word(line, 'I') ?? 0)
      const cy = y + (word(line, 'J') ?? 0)
      const r = Math.hypot(x - cx, y - cy)
      const a0 = Math.atan2(y - cy, x - cx)
      let sweep = Math.atan2(ny - cy, nx - cx) - a0
      const ccw = line.startsWith('G3')
      if (ccw && sweep <= 1e-9) sweep += 2 * Math.PI
      if (!ccw && sweep >= -1e-9) sweep -= 2 * Math.PI
      for (let i = 1; i <= 24; i++) {
        const t = i / 24
        record({ x: cx + r * Math.cos(a0 + sweep * t), y: cy + r * Math.sin(a0 + sweep * t), z: z + (nz - z) * t })
      }
    } else if (nx !== undefined && ny !== undefined) {
      record({ x: nx, y: ny, z: nz })
    }
    x = nx
    y = ny
    z = nz
  })

  if (Math.abs(minZ - -totalDepth) > EPS) problems.push(`deepest Z ${minZ} is not -totalDepth (${-totalDepth})`)
  const mismatched = arcRadiusMismatches(lines)
  if (mismatched.length > 0) problems.push(`G2/G3 start/end radius mismatch: ${mismatched[0]}`)
  // Step 4 shows G1 when the toggle is forced or set to linear — the file
  // must match (BL-62: the toggle's logic was untested UI code).
  const showsLinear = forcedLinearReason(params) !== null || params.output.interpolation === 'linear'
  const arc = lines.find((l) => /^G[23] /.test(l))
  if (showsLinear && arc) problems.push(`Step 4 shows G1 but the program has an arc: ${arc}`)
  if (lines[lines.length - 1] !== endOfProgramCode(machine.dialect)) {
    problems.push(`last line is "${lines[lines.length - 1]}", not ${endOfProgramCode(machine.dialect)}`)
  }
  return { problems, below }
}

// Tool-center containment below Z0: Surface stays within its overtravel
// box, Pocket never crosses its wall (tool radius already inset). Surface's
// Helix entry is deliberately placed outside the material, off the start
// corner (helixCenterFor(), surfaceZTransition.ts), so in that mode the box
// grows by the helix's own diameter.
function containmentProblems(params: WizardParams, below: TracedPoint[]): string[] {
  const outside = (label: string, test: (p: TracedPoint) => boolean) => {
    const bad = below.find((p) => !test(p))
    return bad ? [`${label}: tool center at (${bad.x.toFixed(4)}, ${bad.y.toFixed(4)}, ${bad.z.toFixed(4)})`] : []
  }
  if (params.operation === 'surface') {
    const b = surfaceToolBounds(params.surface)
    const m = EPS + (params.surface.zTransitionMode === 'helix' ? 2 * params.surface.helixRadius : 0)
    return outside('outside the Surface bounds', (p) => p.x >= b.minX - m && p.x <= b.maxX + m && p.y >= b.minY - m && p.y <= b.maxY + m)
  }
  if (params.operation === 'pocket') {
    const c = pocketCenter(params.pocket)
    if (params.pocket.shape === 'circle') {
      const r = pocketCircleWallRadius(params.pocket)
      return outside('past the Pocket wall', (p) => Math.hypot(p.x - c.x, p.y - c.y) <= r + EPS)
    }
    const { halfWidth, halfHeight } = pocketRectWallHalfDims(params.pocket)
    return outside('past the Pocket wall', (p) => Math.abs(p.x - c.x) <= halfWidth + EPS && Math.abs(p.y - c.y) <= halfHeight + EPS)
  }
  return []
}

// ---------- suites ----------

interface Suite {
  name: string
  samples: number
  build: (rng: Rng) => WizardParams
  generate: (params: WizardParams, machine: MachineSettings) => string[]
}

const SUITES: Suite[] = [
  { name: 'Hole(s) Helix', samples: 60, build: (r) => randomHoles(r, 'helix'), generate: generateHelix },
  { name: 'Hole(s) Standard', samples: 60, build: (r) => randomHoles(r, 'standard'), generate: generateStandardHole },
  { name: 'Outline', samples: 120, build: randomOutline, generate: generateOutline },
  { name: 'Surface Zigzag', samples: 40, build: (r) => randomSurface(r, 'zigzag'), generate: generateSurfaceZigzag },
  { name: 'Surface Unidirectional', samples: 40, build: (r) => randomSurface(r, 'unidirectional'), generate: generateSurfaceUnidirectional },
  { name: 'Pocket Spiral', samples: 40, build: (r) => randomPocket(r, 'spiral'), generate: generatePocketSpiral },
  { name: 'Pocket Adaptive', samples: 25, build: (r) => randomPocket(r, 'adaptive'), generate: generatePocketAdaptive },
]

describe('G-code invariants for every valid parameter set (BL-62)', () => {
  SUITES.forEach((suite, suiteIndex) => {
    it(suite.name, () => {
      const rng = makeRng(BASE_SEED + suiteIndex * 7919)
      const target = Math.max(1, Math.round(suite.samples * SCALE))
      let checked = 0
      let attempts = 0
      const failures: string[] = []
      while (checked < target && attempts < target * 50) {
        attempts++
        const params = suite.build(rng)
        if (!isWizardParamsValid(params)) continue
        checked++
        const machine = randomMachine(rng)
        const lines = suite.generate(params, machine)
        const { problems, below } = checkProgram(lines, params, machine)
        problems.push(...containmentProblems(params, below))
        if (problems.length > 0) failures.push(`${problems.join('; ')}\n  params: ${JSON.stringify(params)}`)
      }
      // A generator that rejects almost everything would make the suite
      // silently test nothing.
      expect(checked, `only ${checked} valid samples in ${attempts} attempts`).toBe(target)
      expect(failures.slice(0, 3)).toEqual([])
    }, 60_000 * SCALE) // Pocket Adaptive alone takes seconds; vitest's 5 s default is too tight
  })
})
