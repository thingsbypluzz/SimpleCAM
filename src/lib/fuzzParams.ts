// Test-only (like pocketAdaptiveSim.ts / gcodeTestUtils.ts): seeded random
// WizardParams per operation for property tests — gcodeInvariants.test.ts,
// and one-off equivalence checks when refactoring an engine (BL-61).
import { DEFAULT_MACHINE_SETTINGS, type Dialect, type MachineSettings } from '../types/machine'
import { DEFAULT_WIZARD_PARAMS, type Point2D, type WizardParams } from '../types/wizard'
import { formatCustomPoints } from './customPoints'
import { pocketMaxHelixRadius } from './validation'

// ---------- deterministic random source ----------

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Rng = ReturnType<typeof makeRng>

export function makeRng(seed: number) {
  const next = mulberry32(seed)
  const round = (v: number, digits: number) => Number(v.toFixed(digits))
  return {
    range: (min: number, max: number, digits = 2) => round(min + (max - min) * next(), digits),
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(values: readonly T[]): T => values[Math.floor(next() * values.length)],
    chance: (p: number) => next() < p,
  }
}

const TOOLS = [1, 2, 3.175, 4, 6, 6.35, 8] as const
const DIALECTS: readonly Dialect[] = ['grbl', 'marlin', 'mach3']

function randomCommon(rng: Rng, totalDepthMax: number): Pick<WizardParams, 'feeds' | 'output'> {
  const safeZ = rng.range(1, 10, 1)
  const startZ = rng.chance(0.6) ? 0 : rng.chance(0.7) ? rng.range(0, Math.min(2, safeZ), 1) : rng.range(-0.5, 0, 1)
  return {
    feeds: {
      stepdown: rng.range(0.2, Math.max(0.3, totalDepthMax), 2),
      feedrateXY: rng.int(100, 2000),
      plungeRate: rng.int(50, 800),
      safeZ,
      startZ,
    },
    output: {
      interpolation: rng.pick(['arc', 'linear'] as const),
      spindleStart: rng.chance(0.8),
      spindleStopEnd: rng.chance(0.8),
      returnOriginEnd: rng.chance(0.5),
    },
  }
}

export function randomMachine(rng: Rng): MachineSettings {
  return {
    ...DEFAULT_MACHINE_SETTINGS,
    dialect: rng.pick(DIALECTS),
    spindleSpeed: rng.int(1000, 24000),
    dwellSeconds: rng.pick([0, 1, 3]),
  }
}

function randomTabs(rng: Rng, totalDepth: number) {
  if (!rng.chance(0.3)) return { tabsEnabled: false }
  return {
    tabsEnabled: true,
    tabHeight: rng.range(0.1, Math.max(0.2, totalDepth * 0.8), 2),
    tabWidth: rng.range(0.5, 5, 1),
    tabCount: rng.int(1, 6),
  }
}

export function randomHoles(rng: Rng, method: 'helix' | 'standard'): WizardParams {
  const toolDiameter = rng.pick(TOOLS)
  const totalDepth = rng.range(0.5, 15, 1)
  const positioning = rng.pick(['single', 'grid', 'gridCentered', 'circle', 'custom'] as const)
  const customPoints: Point2D[] = Array.from({ length: rng.int(1, 5) }, () => ({
    x: rng.range(-50, 50, 1),
    y: rng.range(-50, 50, 1),
  }))
  return {
    ...DEFAULT_WIZARD_PARAMS,
    ...randomCommon(rng, totalDepth),
    operation: 'holes',
    method,
    geometry: {
      ...DEFAULT_WIZARD_PARAMS.geometry,
      toolDiameter,
      holeDiameter: Number((toolDiameter + rng.range(0.2, 20, 2)).toFixed(3)),
      totalDepth,
      positioning,
      gridX: rng.chance(0.2) ? 0 : rng.range(5, 60, 1),
      gridY: rng.chance(0.2) ? 0 : rng.range(5, 60, 1),
      circleHoleCount: rng.int(1, 12),
      circleDiameter: rng.range(10, 80, 1),
      circleStartAngle: rng.int(0, 359),
      customPoints,
      customPointsText: formatCustomPoints(customPoints),
      offsetX: rng.range(-20, 20, 1),
      offsetY: rng.range(-20, 20, 1),
      rampAngleDeg: rng.range(1, 15, 1),
      ...randomTabs(rng, totalDepth),
    },
  }
}

export function randomOutline(rng: Rng): WizardParams {
  const totalDepth = rng.range(0.5, 12, 1)
  const shape = rng.pick(['rectCornered', 'rectCentered', 'circle', 'lobedCircle'] as const)
  const method = shape === 'circle' ? rng.pick(['helix', 'standard'] as const) : rng.pick(['ramp', 'standard'] as const)
  // Lobed Circle (OP-8): lobes crossing the main circle on most samples.
  const lobeMainDiameter = rng.range(5, 80, 1)
  const lobeDiameter = rng.range(4, 40, 1)
  return {
    ...DEFAULT_WIZARD_PARAMS,
    ...randomCommon(rng, totalDepth),
    operation: 'outline',
    outline: {
      ...DEFAULT_WIZARD_PARAMS.outline,
      shape,
      method,
      offsetMode: rng.pick(['inside', 'outside', 'onLine'] as const),
      toolDiameter: rng.pick(TOOLS),
      totalDepth,
      width: rng.range(5, 80, 1),
      height: rng.range(5, 80, 1),
      diameter: rng.range(5, 80, 1),
      lobeMainDiameter,
      lobeMode: rng.pick(['add', 'add', 'subtract'] as const),
      lobeCount: rng.int(1, 9),
      lobeDiameter,
      lobePitchDiameter: Math.max(0.1, Number((lobeMainDiameter + lobeDiameter * rng.range(-0.8, 0.9, 2)).toFixed(1))),
      lobeStartAngle: rng.int(0, 359),
      tabStartAngle: rng.int(0, 359),
      offsetX: rng.range(-20, 20, 1),
      offsetY: rng.range(-20, 20, 1),
      rampAngleDeg: rng.range(1, 15, 1),
      ...randomTabs(rng, totalDepth),
    },
  }
}

export function randomSurface(rng: Rng, method: 'zigzag' | 'unidirectional'): WizardParams {
  const totalDepth = rng.range(0.2, 5, 1)
  const toolDiameter = rng.pick(TOOLS)
  const stepoverPercent = rng.int(10, 100)
  return {
    ...DEFAULT_WIZARD_PARAMS,
    ...randomCommon(rng, totalDepth),
    operation: 'surface',
    surface: {
      ...DEFAULT_WIZARD_PARAMS.surface,
      shape: rng.pick(['rectCornered', 'rectCentered'] as const),
      method,
      toolDiameter,
      totalDepth,
      width: rng.range(5, 120, 1),
      height: rng.range(5, 120, 1),
      offsetX: rng.range(-20, 20, 1),
      offsetY: rng.range(-20, 20, 1),
      rasterDirection: rng.pick(['x', 'y'] as const),
      stepoverPercent,
      zTransitionMode: rng.pick(['plunge', 'helix'] as const),
      helixRadius: rng.range(0.05, (toolDiameter * stepoverPercent) / 100, 2),
      rampAngleDeg: rng.range(1, 10, 1),
    },
  }
}

export function randomFacing(rng: Rng): WizardParams {
  const totalDepth = rng.range(0.5, 20, 1)
  const toolDiameter = rng.pick(TOOLS)
  return {
    ...DEFAULT_WIZARD_PARAMS,
    ...randomCommon(rng, totalDepth),
    operation: 'facing',
    facing: {
      ...DEFAULT_WIZARD_PARAMS.facing,
      side: rng.pick(['bottom', 'top', 'left', 'right'] as const),
      toolDiameter,
      totalDepth,
      length: rng.range(5, 150, 1),
      removal: rng.range(0.1, 8, 2),
      originAlong: rng.pick(['start', 'center', 'end'] as const),
      originAcross: rng.pick(['raw', 'finished'] as const),
      offsetX: rng.range(-20, 20, 1),
      offsetY: rng.range(-20, 20, 1),
      stepover: rng.range(0.05, toolDiameter, 2),
      cutDirection: rng.pick(['climb', 'conventional'] as const),
      lead: rng.range(0, 5, 1),
      clearance: rng.range(0.5, 5, 1),
      linkingFeed: rng.int(500, 3000),
    },
  }
}

export function randomPocket(rng: Rng, method: 'spiral' | 'adaptive'): WizardParams {
  const totalDepth = rng.range(0.5, 12, 1)
  const shape = rng.pick(['rectCornered', 'rectCentered', 'circle'] as const)
  const pocket = {
    ...DEFAULT_WIZARD_PARAMS.pocket,
    shape,
    method,
    toolDiameter: rng.pick(TOOLS),
    totalDepth,
    width: rng.range(8, 80, 1),
    height: rng.range(8, 80, 1),
    diameter: rng.range(8, 80, 1),
    offsetX: rng.range(-20, 20, 1),
    offsetY: rng.range(-20, 20, 1),
    stepoverPercent: rng.int(20, 90),
    rampLengthFactor: rng.range(1, 10, 1),
    zTransitionMode: rng.pick(['plunge', 'helix'] as const),
    optimalLoadPercent: rng.int(5, 30),
    rampAngleDeg: rng.range(1, 10, 1),
    cutDirection: rng.pick(['climb', 'conventional'] as const),
    linkingFeed: rng.int(500, 3000),
    finishingEnabled: false,
    stockToLeave: DEFAULT_WIZARD_PARAMS.pocket.stockToLeave,
    finishFeed: DEFAULT_WIZARD_PARAMS.pocket.finishFeed,
  }
  // Finishing pass (BL-42) on about half the samples, drawn before the
  // helix radius: its ceiling is the roughing wall, which stock narrows.
  if (rng.pick([false, true])) {
    pocket.finishingEnabled = true
    pocket.stockToLeave = rng.range(0.05, pocket.toolDiameter / 2, 2)
    pocket.finishFeed = rng.int(200, 3000)
  }
  // Helix radius as a fraction of its own ceiling, so most samples are valid.
  const helixRadius = Number((pocketMaxHelixRadius(pocket) * rng.range(0.2, 1, 2)).toFixed(3))
  return {
    ...DEFAULT_WIZARD_PARAMS,
    ...randomCommon(rng, totalDepth),
    operation: 'pocket',
    pocket: { ...pocket, helixRadius },
  }
}

// Pocket Donut (BL-108) — Spiral only. The island is drawn as a share of
// the room the tool leaves, so most samples have a ring it fits in.
export function randomPocketDonut(rng: Rng): WizardParams {
  const base = randomPocket(rng, 'spiral')
  const diameter = rng.range(20, 120, 1)
  const room = diameter - 2 * base.pocket.toolDiameter
  const islandDiameter = Number(Math.max(0.5, room * rng.range(0.05, 1.05, 2)).toFixed(2))
  return { ...base, pocket: { ...base.pocket, shape: 'donut', diameter, islandDiameter } }
}

// Lightened Pocket shapes (OP-6) — Spiral only. Sizes and counts kept so a
// fair share of samples have cells the tool fits.
export function randomPocketLightened(rng: Rng): WizardParams {
  const base = randomPocket(rng, 'spiral')
  const pocket = {
    ...base.pocket,
    shape: rng.pick(['rectLightened', 'circleLightened'] as const),
    width: rng.range(40, 150, 1),
    height: rng.range(20, 80, 1),
    diameter: rng.range(40, 120, 1),
    lightLayout: rng.pick(['xgrid', 'triangles'] as const),
    lightCountX: rng.int(1, 6),
    lightCountY: rng.int(1, 3),
    ribWidth: rng.range(1, 6, 1),
    spokeCount: rng.int(3, 8),
    hubDiameter: rng.range(0, 20, 1),
    spokeStartAngle: rng.int(0, 359),
  }
  const helixRadius = Number((Math.max(0, pocketMaxHelixRadius(pocket)) * rng.range(0.2, 1, 2)).toFixed(3))
  return { ...base, pocket: { ...pocket, helixRadius } }
}

// Lightened shapes with Adaptive (BL-83 triangles, BL-85 sectors).
// Tools 3–6 mm and shallow depths: a 1 mm tool through dozens of cells at
// 20 levels is a legitimate multi-million-line job, but it only slows the
// suite without exercising anything new.
export function randomPocketLightenedAdaptive(rng: Rng): WizardParams {
  const base = randomPocketLightened(rng)
  const totalDepth = rng.range(0.5, 3, 1)
  const pocket = {
    ...base.pocket,
    method: 'adaptive' as const,
    zTransitionMode: 'helix' as const,
    toolDiameter: rng.pick([3, 3.175, 4, 6]),
    totalDepth,
  }
  base.feeds = { ...base.feeds, stepdown: rng.range(0.5, Math.max(0.6, totalDepth), 2) }
  const helixRadius = Number((Math.max(0, pocketMaxHelixRadius(pocket)) * rng.range(0.3, 1, 2)).toFixed(3))
  return { ...base, pocket: { ...pocket, helixRadius } }
}
