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
import {
  makeRng,
  randomHoles,
  randomMachine,
  randomOutline,
  randomPocket,
  randomText,
  randomPocketDonut,
  randomPocketDonutAdaptive,
  randomPocketLightened,
  randomPocketLightenedAdaptive,
  randomFacing,
  randomSurface,
  type Rng,
} from './fuzzParams'
import { cellWallDistance, isLightenedShape, lightenedCells } from './pocketLightened'
import { pocketStockToLeave } from './pocketGeometry'
import { arcRadiusMismatches } from './gcodeTestUtils'
import { generateHelix } from './helix'
import { forcedLinearReason } from './interpolation'
import { generateOutline } from './outline'
import { buildPocketToolpath, generatePocketAdaptive, generatePocketSpiral } from './pocket'
import {
  pocketCenter,
  pocketCircleWallRadius,
  pocketDonutWalls,
  pocketRectWallHalfDims,
  pocketRoughCircleWallRadius,
  pocketRoughDonutWalls,
  pocketRoughRectWallHalfDims,
} from './pocketGeometry'
import { endOfProgramCode } from './program'
import { generateStandardHole } from './standardHole'
import { generateFacing } from './facing'
import { generateText } from './text'
import { layoutText } from './textLayout'
import { loadTestFont } from './textTestUtils'
import { distanceToLoop, lobedNominalLoop, translateLoop } from './outlineLobedGeometry'
import { facingAxes, facingClearV, facingFinalV, facingPoint, facingTravel } from './facingGeometry'
import { generateSurfaceUnidirectional, generateSurfaceZigzag } from './surface'
import { surfaceToolBounds } from './surfaceGeometry'
import { movePoints, type Point3D } from './toolpath'
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
// Rounding of the G-code's coordinates, seen through an arc's radius.
const LOBED_TOLERANCE = 2e-3

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
  if (params.operation === 'outline' && params.outline.shape === 'lobedCircle' && params.outline.offsetMode !== 'onLine') {
    // Lobed Circle (OP-8): the tool center keeps at least its radius from
    // the outline, Inside and Outside alike. The traced points come from
    // G-code rounded to 4 decimals, arcs rebuilt from their rounded ends.
    const { outline } = params
    const nominal = translateLoop(lobedNominalLoop(outline), outline.offsetX, outline.offsetY)
    const r = outline.toolDiameter / 2
    return outside('closer to the Lobed Circle outline than the tool radius', (p) => distanceToLoop(nominal, p) >= r - LOBED_TOLERANCE)
  }
  if (params.operation === 'text') {
    // The tool never leaves the extent of the written strokes.
    const b = layoutText(params.text).bounds
    if (!b) return []
    return outside('outside the text', (p) => p.x >= b.minX - 1e-3 && p.x <= b.maxX + 1e-3 && p.y >= b.minY - 1e-3 && p.y <= b.maxY + 1e-3)
  }
  if (params.operation === 'facing') {
    // In the side's own frame: never deeper into the part than the last
    // pass, never further out than the return line, never past the ends
    // of its travel.
    const { facing } = params
    const { u, v } = facingAxes(facing.side)
    const o = facingPoint(facing, 0, 0)
    const { from, to } = facingTravel(facing)
    const lo = Math.min(from, to) - EPS
    const hi = Math.max(from, to) + EPS
    return outside('outside the Facing travel', (p) => {
      const pu = (p.x - o.x) * u.x + (p.y - o.y) * u.y
      const pv = (p.x - o.x) * v.x + (p.y - o.y) * v.y
      return pu >= lo && pu <= hi && pv <= facingFinalV(facing) + EPS && pv >= facingClearV(facing) - EPS
    })
  }
  if (params.operation === 'pocket') {
    if (isLightenedShape(params.pocket.shape)) {
      // Inside some cell's final tool-center wall (tool radius in from it).
      const cells = lightenedCells(params.pocket)
      const r = params.pocket.toolDiameter / 2
      return outside('past a Lightened cell wall', (p) => cells.some((cell) => cellWallDistance(cell, p) >= r - EPS))
    }
    const c = pocketCenter(params.pocket)
    if (params.pocket.shape === 'donut') {
      const { inner, outer } = pocketDonutWalls(params.pocket)
      return outside('past a Donut wall', (p) => {
        const rho = Math.hypot(p.x - c.x, p.y - c.y)
        return rho <= outer + EPS && rho >= inner - EPS
      })
    }
    if (params.pocket.shape === 'circle') {
      const r = pocketCircleWallRadius(params.pocket)
      return outside('past the Pocket wall', (p) => Math.hypot(p.x - c.x, p.y - c.y) <= r + EPS)
    }
    const { halfWidth, halfHeight } = pocketRectWallHalfDims(params.pocket)
    return outside('past the Pocket wall', (p) => Math.abs(p.x - c.x) <= halfWidth + EPS && Math.abs(p.y - c.y) <= halfHeight + EPS)
  }
  return []
}

// Pocket finishing pass (BL-42): roughing (every non-finish move below Z0)
// stays inside the roughing wall, and with finishing on the finish laps
// actually reach the final wall — checked on the engine's move list, which
// tells the two apart (the G-code only differs by feed).
function pocketFinishProblems(params: WizardParams): string[] {
  if (params.operation !== 'pocket') return []
  const { pocket } = params
  const c = pocketCenter(pocket)
  const isCircle = pocket.shape === 'circle'
  const lightened = isLightenedShape(pocket.shape)
  const cells = lightened ? lightenedCells(pocket) : []
  const toolR = pocket.toolDiameter / 2
  const cellDepth = (p: Point3D) => Math.max(...cells.map((cell) => cellWallDistance(cell, p)))
  const rough = isCircle ? pocketRoughCircleWallRadius(pocket) : pocketRoughRectWallHalfDims(pocket)
  const donut = pocket.shape === 'donut' ? { final: pocketDonutWalls(pocket), rough: pocketRoughDonutWalls(pocket) } : null
  const rho = (p: Point3D) => Math.hypot(p.x - c.x, p.y - c.y)
  const inRough = (p: Point3D) =>
    donut
      ? rho(p) <= donut.rough.outer + EPS && rho(p) >= donut.rough.inner - EPS
      : lightened
      ? cellDepth(p) >= toolR + pocketStockToLeave(pocket) - EPS
      : typeof rough === 'number'
        ? Math.hypot(p.x - c.x, p.y - c.y) <= rough + EPS
        : Math.abs(p.x - c.x) <= rough.halfWidth + EPS && Math.abs(p.y - c.y) <= rough.halfHeight + EPS
  // Distance from the final wall (0 = on it).
  const wallGap = (p: Point3D) => {
    if (donut) return Math.min(donut.final.outer - rho(p), rho(p) - donut.final.inner)
    if (lightened) return cellDepth(p) - toolR
    if (isCircle) return pocketCircleWallRadius(pocket) - Math.hypot(p.x - c.x, p.y - c.y)
    const { halfWidth, halfHeight } = pocketRectWallHalfDims(pocket)
    return Math.min(halfWidth - Math.abs(p.x - c.x), halfHeight - Math.abs(p.y - c.y))
  }
  const toolpath = buildPocketToolpath(params)
  let current = toolpath.start
  let finishOnWall = 0
  for (const move of toolpath.moves) {
    for (const p of movePoints(current, move)) {
      if (move.kind === 'finish') {
        if (Math.abs(wallGap(p)) < 1e-3) finishOnWall++
      } else if (move.kind !== 'rapid' && p.z < -EPS && !inRough(p)) {
        return [`${move.kind} move past the roughing wall at (${p.x.toFixed(4)}, ${p.y.toFixed(4)}, ${p.z.toFixed(4)})`]
      }
    }
    current = move.to
  }
  if (pocket.finishingEnabled && finishOnWall === 0) return ['finishing pass never reaches the final wall']
  if (!pocket.finishingEnabled && toolpath.moves.some((m) => m.kind === 'finish')) return ['finish moves with finishing off']
  return []
}

// Text reads its font from the registry the app fills on demand.
loadTestFont('relief')

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
  { name: 'Facing', samples: 60, build: randomFacing, generate: generateFacing },
  { name: 'Text', samples: 60, build: randomText, generate: generateText },
  { name: 'Pocket Spiral', samples: 40, build: (r) => randomPocket(r, 'spiral'), generate: generatePocketSpiral },
  { name: 'Pocket Adaptive', samples: 25, build: (r) => randomPocket(r, 'adaptive'), generate: generatePocketAdaptive },
  { name: 'Pocket Donut', samples: 40, build: randomPocketDonut, generate: generatePocketSpiral },
  { name: 'Pocket Donut Adaptive', samples: 25, build: randomPocketDonutAdaptive, generate: generatePocketAdaptive },
  { name: 'Pocket Lightened', samples: 30, build: randomPocketLightened, generate: generatePocketSpiral },
  { name: 'Pocket Lightened Adaptive', samples: 10, build: randomPocketLightenedAdaptive, generate: generatePocketAdaptive },
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
        problems.push(...containmentProblems(params, below), ...pocketFinishProblems(params))
        if (problems.length > 0) failures.push(`${problems.join('; ')}\n  params: ${JSON.stringify(params)}`)
      }
      // A generator that rejects almost everything would make the suite
      // silently test nothing.
      expect(checked, `only ${checked} valid samples in ${attempts} attempts`).toBe(target)
      expect(failures.slice(0, 3)).toEqual([])
    }, 60_000 * SCALE) // Pocket Adaptive alone takes seconds; vitest's 5 s default is too tight
  })
})
