import * as THREE from 'three'
import { getFixedColors, getPaletteAccents, hexToThreeColor, type PaletteId } from '../../config/palettes'
import { resolvePoints } from '../../lib/positioning'
import { computeDepthPasses } from '../../lib/depthPasses'
import { computeTabRanges, type TabRange } from '../../lib/tabs'
import { circleOutlineRadiusAndDirection, onLineCircleEdges } from '../../lib/outlineCircle'
import {
  longerEdgeIndex,
  onLineRectDimensions,
  rectCorners,
  rectToolDimensions,
} from '../../lib/outlineRectangleGeometry'
import { sideRangesFor, type SideTabRange } from '../../lib/outlineRectangleTabs'
import { outlineDirectionForOffsetMode } from '../../lib/outlineRectangle'
import { surfaceNominalBounds, surfaceStartCorner, surfaceStepoverMm, surfaceToolBounds, type SurfaceBounds } from '../../lib/surfaceGeometry'
import { computeRasterLines, zigzagWaypoints } from '../../lib/surfaceRaster'
import { buildLevelDescents, helixCenterFor, helixDirectionFor } from '../../lib/surfaceZTransition'
import {
  pocketCenter,
  pocketCircleWallRadius,
  pocketRectRasterBounds,
  pocketRectWallHalfDims,
  pocketStepoverMm,
} from '../../lib/pocketGeometry'
import { pocketEntryPoint } from '../../lib/pocketZTransition'
import {
  circleRingRampPoints,
  rampSweepDegFor,
  pocketCircleRingRadii,
  pocketRectRingDims,
  RECT_HELIX_ENTRY_FRACTION,
  rectFullLapPoints,
  rectRampSweepFor,
  rectRingRampPoints,
  type RectRingDims,
} from '../../lib/pocketSpiral'
import { niceStep } from '../preview/drawToolpath'
import type { Point2D, PocketShape, RasterDirection, WizardParams } from '../../types/wizard'
import type { ThemeId } from '../../types/theme'
import type { Grid3DLabelSize } from '../../types/appearance'

// CNC (x, y, z) -> Three.js (x, z, -y): CNC Z (up/down into material) becomes
// the Three.js Y (vertical) axis, so an orbit camera gives an intuitive
// "looking at the material from above/around" view without any rotation.
//
// The Y is negated (not just moved into the Z slot) on purpose: swapping two
// axes without a sign flip reverses handedness (an odd permutation, det -1),
// and Three.js's camera basis math (lookAt's cross products) is always
// right-handed. A handedness-reversing map means, for every camera preset,
// one screen axis renders mirrored relative to plain CNC-space expectations
// (see the "Top"/"Isometric" postmortem in CHANGELOG 0.6.7) — negating one
// component restores a proper (handedness-preserving) map, so lookAt-derived
// cameras "just work" without per-preset mirror workarounds. `cameraPresets.ts`
// is written in terms of this fixed mapping.
function toThree(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, z, -y)
}

const SEGMENTS_PER_TURN = 48
// Passes accumulate Z via repeated float subtraction — matches the
// tolerance used for the same comparison in standardHole.ts/helix.ts.
const TAB_BAND_EPSILON = 1e-9
// Lifts any flat, solid "cap" surface a hair above its nominal startZ
// height so it never renders exactly coplanar with the material plane
// (fixed at world Y=0) or the grid (world Y=0.01, see the GridHelper
// below) — both are semi-transparent flat surfaces, so an exact Y match
// z-fights (visible as a moire/interpolation flicker), most commonly hit
// at the default Start Z = 0. Bigger than the grid's own 0.01 offset so
// one lift clears both possible collisions at once. Purely cosmetic —
// 0.02mm is invisible at any real part scale.
//
// Two different kinds of object need this, not just the stock cap
// (buildStockCapObject) the name once implied: any *closed* Outline wall
// — a closed CylinderGeometry (Circle, Outside or On-line's inner island)
// or a closed BoxGeometry (Rectangle, same two cases, see
// buildRectWallMesh) — has its own real top face at world Y = startZ,
// from its geometry, not from a separate cap object. An *open* wall (no
// visible top/bottom faces) has nothing at that height to collide with,
// so it's left alone.
const SOLID_CAP_Z_LIFT = 0.02

// Side/wall surfaces (bore cylinders, Outline walls) are drawn at this
// fraction of theme.hole's brightness — always darker than any cap/top
// surface next to them, including the separate flat stock cap object
// (buildStockCapObject), which stays at full theme.hole. MeshBasicMaterial
// has no real lighting model, so this flat-shaded-sprite-style contrast is
// the only cue that a wall is a distinct vertical surface and not just
// part of the same flat tint as the cap sitting at its rim — previously
// applied only to *closed* walls (open ones were assumed to already read
// as 3D via their visible missing cap, but that assumption breaks once a
// same-colored external stock cap sits right at the opening). 0.5, not the
// original 0.6, after user feedback that 0.6 read as too subtle against
// the dark theme background.
const WALL_SHADE_FACTOR = 0.5

// Desired on-screen size (CSS px) of EVERY text sprite in the scene — the
// origin "0,0", the axis-end "X"/"Y", and the grid coordinate ticks all
// share this one setting (Settings > Appearance > Grid Labels), held
// constant regardless of camera zoom/distance — see
// rescaleLabelForConstantScreenSize below. Kept as pixel sizes, not
// world-unit sizes, specifically so a heavily zoomed-out or zoomed-in view
// never turns these into unreadable dots or oversized blobs (the bug this
// fixes). Named sizes only, not a raw pixel input — see the
// Grid3DLabelSize comment in types/appearance.ts for why. 'medium' is the
// shipped default, deliberately higher than this feature's original flat
// 13px default, which user testing found too small even once the
// constant-screen-size fix made it consistently legible. The "Show grid
// coordinate labels" checkbox this same Settings block offers only
// controls whether the grid ticks are built at all (see gridLabelsEnabled
// below) — origin/"X"/"Y" always render regardless of that checkbox, they
// just resize along with it.
const GRID_LABEL_SIZE_PX: Record<Grid3DLabelSize, number> = {
  small: 15,
  medium: 19,
  large: 25,
}

interface TabsConfig3D {
  tabHeight: number
  tabRanges: TabRange[]
}

// Mirrors tabs.ts's tabbedCirclePass, but emits Vector3 samples instead of
// G-code lines (BL-14) — same "breakpoint union" approach (uniform
// SEGMENTS_PER_TURN sweep plus every tab's exact start/end angle forced in
// as a breakpoint), so a tab is never missed or drawn wider than requested
// regardless of this file's own sampling resolution. Unlike
// tabbedCirclePass, the caller is expected to have already pushed the
// arrival point at (cx+radius, cy, cutZ) — mirrors how
// standardHolePoints3D/helixPoints3D already push their own "start of this
// pass" point before sweeping. `direction`: same sign-flip treatment as
// circle.ts/tabs.ts — Hole(s) always passes 'ccw' (unchanged behavior);
// Circle Outline needs both (see lib/outlineCircle.ts).
function tabbedCirclePoints3D(
  cx: number,
  cy: number,
  radius: number,
  cutZ: number,
  liftZ: number,
  tabRanges: TabRange[],
  direction: 'cw' | 'ccw',
): THREE.Vector3[] {
  const sign = direction === 'cw' ? -1 : 1
  const twoPi = 2 * Math.PI
  const angleSet = new Set<number>([0, twoPi])
  for (let step = 1; step < SEGMENTS_PER_TURN; step++) {
    angleSet.add((twoPi * step) / SEGMENTS_PER_TURN)
  }
  for (const r of tabRanges) {
    angleSet.add(r.startAngle)
    angleSet.add(r.endAngle)
  }
  const angles = [...angleSet].sort((a, b) => a - b)

  const points: THREE.Vector3[] = []
  let prevX = cx + radius
  let prevY = cy
  let inTab = false

  for (let idx = 1; idx < angles.length; idx++) {
    const angle = angles[idx]
    const midAngle = (angles[idx - 1] + angle) / 2
    const nextInTab = tabRanges.some((r) => midAngle > r.startAngle && midAngle < r.endAngle)
    const x = cx + radius * Math.cos(sign * angle)
    const y = cy + radius * Math.sin(sign * angle)

    if (nextInTab && !inTab) {
      points.push(toThree(prevX, prevY, liftZ))
      points.push(toThree(x, y, liftZ))
    } else if (!nextInTab && inTab) {
      points.push(toThree(prevX, prevY, cutZ))
      points.push(toThree(x, y, cutZ))
    } else {
      points.push(toThree(x, y, nextInTab ? liftZ : cutZ))
    }

    prevX = x
    prevY = y
    inTab = nextInTab
  }

  return points
}

// Mirrors the descent loop in src/lib/helix.ts, but emits Vector3 samples
// instead of G-code lines — kept separate from the engine on purpose, since
// entangling tested G-code text generation with rendering-only geometry
// isn't worth it for a ~10-line loop. Shares `computeDepthPasses()` though,
// since that's where the actual infinite-loop guard (stepdown <= 0) lives.
// `tabs`: when set (BL-14), mirrors helix.ts's two-phase split — spiral
// turns stop exactly at the tab-band top, then flat tabbed passes take
// over for the remainder, replacing the plain flat finishing pass below.
// `direction`: Hole(s) always passes 'ccw'; Circle Outline needs both.
function helixPoints3D(
  cx: number,
  cy: number,
  radius: number,
  totalDepth: number,
  stepdown: number,
  startZ: number,
  tabs: TabsConfig3D | null,
  direction: 'cw' | 'ccw',
): ToolpathSegment3D[] {
  const sign = direction === 'cw' ? -1 : 1
  const builder = createSegmentBuilder3D(toThree(cx + radius, cy, startZ))
  let currentZ = startZ

  if (tabs) {
    const tabBandTopZ = -(totalDepth - tabs.tabHeight)
    const spiralDepth = totalDepth + startZ - tabs.tabHeight
    let angle = 0
    const spiralPoints: THREE.Vector3[] = []

    for (const turnDepth of computeDepthPasses(spiralDepth, stepdown)) {
      for (let i = 1; i <= SEGMENTS_PER_TURN; i++) {
        const a = angle + (2 * Math.PI * i) / SEGMENTS_PER_TURN
        const z = currentZ - (turnDepth * i) / SEGMENTS_PER_TURN
        spiralPoints.push(toThree(cx + radius * Math.cos(sign * a), cy + radius * Math.sin(sign * a), z))
      }
      angle += 2 * Math.PI
      currentZ -= turnDepth
    }

    // Square off the helical ledge the spiral leaves behind at the tab-band
    // top before descending into the tabbed passes — mirrors the fix in
    // helix.ts (see its comment for the full explanation). Still part of
    // the same continuous, real cutting motion as the spiral above it.
    for (let i = 1; i <= SEGMENTS_PER_TURN; i++) {
      const a = (2 * Math.PI * i) / SEGMENTS_PER_TURN
      spiralPoints.push(toThree(cx + radius * Math.cos(sign * a), cy + radius * Math.sin(sign * a), currentZ))
    }
    builder.add('solid', spiralPoints)

    for (const passDepth of computeDepthPasses(tabs.tabHeight, stepdown)) {
      currentZ -= passDepth
      // Straight step-down between tabbed passes — same non-cutting
      // vertical G1 move as Standard Hole's between-pass step, once tabs
      // switch Helix over to flat stepdown-incremented passes.
      builder.add('dotted', [toThree(cx + radius, cy, currentZ)])
      builder.add('solid', tabbedCirclePoints3D(cx, cy, radius, currentZ, tabBandTopZ, tabs.tabRanges, direction))
    }

    return builder.segments
  }

  let angle = 0
  const spiralPoints: THREE.Vector3[] = []
  for (const turnDepth of computeDepthPasses(totalDepth + startZ, stepdown)) {
    for (let i = 1; i <= SEGMENTS_PER_TURN; i++) {
      const a = angle + (2 * Math.PI * i) / SEGMENTS_PER_TURN
      const z = currentZ - (turnDepth * i) / SEGMENTS_PER_TURN
      spiralPoints.push(toThree(cx + radius * Math.cos(sign * a), cy + radius * Math.sin(sign * a), z))
    }
    angle += 2 * Math.PI
    currentZ -= turnDepth
  }

  for (let i = 1; i <= SEGMENTS_PER_TURN; i++) {
    const a = angle + (2 * Math.PI * i) / SEGMENTS_PER_TURN
    spiralPoints.push(toThree(cx + radius * Math.cos(sign * a), cy + radius * Math.sin(sign * a), currentZ))
  }
  builder.add('solid', spiralPoints)
  return builder.segments
}

// Mirrors src/lib/standardHole.ts. `tabs`: when set (BL-14), passes at or
// below the tab-band top skip the tab arcs — an atomic per-pass choice,
// same as the engine, since every pass here is already flat. `direction`:
// Hole(s) always passes 'ccw'; Circle Outline needs both.
function standardHolePoints3D(
  cx: number,
  cy: number,
  radius: number,
  totalDepth: number,
  stepdown: number,
  startZ: number,
  tabs: TabsConfig3D | null,
  direction: 'cw' | 'ccw',
): ToolpathSegment3D[] {
  const sign = direction === 'cw' ? -1 : 1
  const builder = createSegmentBuilder3D(toThree(cx + radius, cy, startZ))
  let currentZ = startZ
  const tabBandTopZ = tabs ? -(totalDepth - tabs.tabHeight) : 0

  for (const passDepth of computeDepthPasses(totalDepth + startZ, stepdown)) {
    currentZ -= passDepth
    // Straight step-down between full-circle passes — a non-cutting
    // vertical G1 move, not part of the flat pass it leads into.
    builder.add('dotted', [toThree(cx + radius, cy, currentZ)])
    if (tabs && currentZ <= tabBandTopZ + TAB_BAND_EPSILON) {
      builder.add('solid', tabbedCirclePoints3D(cx, cy, radius, currentZ, tabBandTopZ, tabs.tabRanges, direction))
    } else {
      const passPoints: THREE.Vector3[] = []
      for (let i = 1; i <= SEGMENTS_PER_TURN; i++) {
        const a = (2 * Math.PI * i) / SEGMENTS_PER_TURN
        passPoints.push(toThree(cx + radius * Math.cos(sign * a), cy + radius * Math.sin(sign * a), currentZ))
      }
      builder.add('solid', passPoints)
    }
  }
  return builder.segments
}

// Rectangle analog of tabbedCirclePoints3D — walks the 4-corner perimeter,
// skipping tabs per edge (BL-14 for Outline). Same lift/plunge
// point-doubling at transitions, same "caller already pushed the arrival
// point" contract.
function tabbedRectanglePoints3D(
  corners: Point2D[],
  sideRanges: SideTabRange[][],
  cutZ: number,
  liftZ: number,
): THREE.Vector3[] {
  const points: THREE.Vector3[] = []
  let prevX = corners[0].x
  let prevY = corners[0].y
  let inTab = false

  for (let edge = 0; edge < 4; edge++) {
    const p0 = corners[edge]
    const p1 = corners[(edge + 1) % 4]
    const ranges = sideRanges[edge]
    const fracs = new Set<number>([0, 1])
    for (const r of ranges) {
      fracs.add(r.startFrac)
      fracs.add(r.endFrac)
    }
    const sorted = [...fracs].sort((a, b) => a - b)

    for (let idx = 1; idx < sorted.length; idx++) {
      const frac = sorted[idx]
      const midFrac = (sorted[idx - 1] + frac) / 2
      const nextInTab = ranges.some((r) => midFrac > r.startFrac && midFrac < r.endFrac)
      const x = p0.x + (p1.x - p0.x) * frac
      const y = p0.y + (p1.y - p0.y) * frac

      if (nextInTab && !inTab) {
        points.push(toThree(prevX, prevY, liftZ))
        points.push(toThree(x, y, liftZ))
      } else if (!nextInTab && inTab) {
        points.push(toThree(prevX, prevY, cutZ))
        points.push(toThree(x, y, cutZ))
      } else {
        points.push(toThree(x, y, nextInTab ? liftZ : cutZ))
      }

      prevX = x
      prevY = y
      inTab = nextInTab
    }
  }

  return points
}

interface RectTabsConfig3D {
  tabHeight: number
  tabCount: number
  tabWidth: number
}

// Mirrors lib/outlineRectangle.ts's rectStandardToolpath.
function rectStandardPoints3D(
  corners: Point2D[],
  totalDepth: number,
  stepdown: number,
  startZ: number,
  tabs: RectTabsConfig3D | null,
): ToolpathSegment3D[] {
  const builder = createSegmentBuilder3D(toThree(corners[0].x, corners[0].y, startZ))
  const tabBandTopZ = tabs ? -(totalDepth - tabs.tabHeight) : 0
  const sideRanges = tabs ? sideRangesFor(corners, tabs.tabCount, tabs.tabWidth) : [[], [], [], []]

  let currentZ = startZ
  for (const passDepth of computeDepthPasses(totalDepth + startZ, stepdown)) {
    currentZ -= passDepth
    // Straight step-down between passes — non-cutting vertical G1 move.
    builder.add('dotted', [toThree(corners[0].x, corners[0].y, currentZ)])
    if (tabs && currentZ <= tabBandTopZ + TAB_BAND_EPSILON) {
      builder.add('solid', tabbedRectanglePoints3D(corners, sideRanges, currentZ, tabBandTopZ))
    } else {
      builder.add('solid', tabbedRectanglePoints3D(corners, [[], [], [], []], currentZ, currentZ))
    }
  }
  return builder.segments
}

// Mirrors lib/outlineRectangle.ts's rectRampToolpath — same ramp-edge
// rotation (`ordered`), same "single lap = 4 lines, ramp edge carries the
// Z drop" structure, same cleanup-lap reasoning (see the engine's own
// comments for the full explanation of why only the ramp edge needs it).
function rectRampPoints3D(
  corners: Point2D[],
  rampEdge: 0 | 1,
  totalDepth: number,
  stepdown: number,
  startZ: number,
  tabs: RectTabsConfig3D | null,
): ToolpathSegment3D[] {
  const ordered = [0, 1, 2, 3].map((i) => corners[(i + rampEdge) % 4])
  const builder = createSegmentBuilder3D(toThree(ordered[0].x, ordered[0].y, startZ))
  let currentZ = startZ

  const lapPoints = (nextZ: number): THREE.Vector3[] => {
    const pts: THREE.Vector3[] = [toThree(ordered[1].x, ordered[1].y, nextZ)]
    for (let i = 1; i < 4; i++) {
      const p = ordered[(i + 1) % 4]
      pts.push(toThree(p.x, p.y, nextZ))
    }
    return pts
  }

  if (tabs) {
    const tabBandTopZ = -(totalDepth - tabs.tabHeight)
    const rampDepth = totalDepth + startZ - tabs.tabHeight
    const sideRanges = sideRangesFor(ordered, tabs.tabCount, tabs.tabWidth)
    const rampPoints: THREE.Vector3[] = []

    for (const turnDepth of computeDepthPasses(rampDepth, stepdown)) {
      const nextZ = currentZ - turnDepth
      rampPoints.push(...lapPoints(nextZ))
      currentZ = nextZ
    }
    rampPoints.push(...lapPoints(currentZ))
    builder.add('solid', rampPoints)

    for (const passDepth of computeDepthPasses(tabs.tabHeight, stepdown)) {
      currentZ -= passDepth
      // Straight step-down between tabbed passes — non-cutting vertical G1
      // move, once tabs switch Ramp over to flat stepdown-incremented passes.
      builder.add('dotted', [toThree(ordered[0].x, ordered[0].y, currentZ)])
      builder.add('solid', tabbedRectanglePoints3D(ordered, sideRanges, currentZ, tabBandTopZ))
    }
  } else {
    const rampPoints: THREE.Vector3[] = []
    for (const turnDepth of computeDepthPasses(totalDepth + startZ, stepdown)) {
      const nextZ = currentZ - turnDepth
      rampPoints.push(...lapPoints(nextZ))
      currentZ = nextZ
    }
    rampPoints.push(...lapPoints(currentZ))
    builder.add('solid', rampPoints)
  }

  return builder.segments
}

// Mirrors lib/surfaceZTransition.ts's zTransitionMoves Helix branch, but
// emits Vector3 samples instead of G-code lines — same reasoning as
// helixPoints3D above. Always renders as a segmented polygon regardless of
// the output.interpolation toggle (matching helixPoints3D's own precedent,
// which doesn't thread interpolation through either — only the real G-code
// engine needs to care about G2/G3 vs G1).
//
// Unlike helixPoints3D (Hole(s)), which can hardcode "start angle = 0"
// because its center is always offset -X of the start point by construction,
// this one can't: helixCenterFor() puts the center on a DIFFERENT axis
// depending on rasterDirection (see its own comment), so the start point
// sits at a different angle relative to the center each time (0° for
// direction 'y', -90° for 'x'). startAngle must be computed from the actual
// center, exactly like fullCircleMove's own linear-interpolation branch
// does — hardcoding 0 here silently drew the circle starting from the wrong
// point on the direction-'x' path (visible as a circle floating away from
// the corner, joined to the raster by a long diagonal jump instead of
// closing back onto it).
//
// The sweep SIGN must also track helixDirectionFor() — direction 'x' turns
// CW (decreasing angle), matching fullCircleMove's own `sign` for its
// linear-interpolation branch (lib/circle.ts). Getting this wrong wouldn't
// break the loop's start/end point (still closes by symmetry either way),
// but would draw it going the wrong way around, and CW is specifically what
// keeps the loop outside the material for direction 'x' (see
// surfaceZTransition.ts's helixDirectionFor/helixCenterFor comments).
function surfaceHelixPoints3D(
  cx: number,
  cy: number,
  radius: number,
  fromZ: number,
  toZ: number,
  stepdown: number,
  rasterDirection: RasterDirection,
): THREE.Vector3[] {
  const { x: centerX, y: centerY } = helixCenterFor(cx, cy, radius, rasterDirection)
  const startAngle = Math.atan2(cy - centerY, cx - centerX)
  const sign = helixDirectionFor(rasterDirection) === 'cw' ? -1 : 1
  const points: THREE.Vector3[] = []
  let z = fromZ
  for (const turnDepth of computeDepthPasses(fromZ - toZ, stepdown)) {
    for (let i = 1; i <= SEGMENTS_PER_TURN; i++) {
      const a = startAngle + (sign * 2 * Math.PI * i) / SEGMENTS_PER_TURN
      const x = centerX + radius * Math.cos(a)
      const y = centerY + radius * Math.sin(a)
      const zz = z - (turnDepth * i) / SEGMENTS_PER_TURN
      points.push(toThree(x, y, zz))
    }
    z -= turnDepth
  }
  return points
}

// Mirrors lib/surface.ts's zigzagSurfaceToolpath/unidirectionalSurfaceToolpath
// exactly, but emits styled segments instead of G-code lines: the
// between-level retract+reposition and (for Unidirectional) the
// between-line Safe-Z retract are 'dashed' (real G0 rapids — previously
// merged into the same solid line as actual cutting, indistinguishable
// from it), the Plunge-mode Z-transition is 'dotted' (non-cutting vertical
// G1, same category as Standard Hole/Outline's between-pass step), the
// Helix-mode Z-transition and every raster cutting line stay 'solid'.
function buildSurfaceToolpathPoints3D(surface: WizardParams['surface'], feeds: WizardParams['feeds']): ToolpathSegment3D[] {
  const bounds = surfaceToolBounds(surface)
  const corner = surfaceStartCorner(surface)
  const stepoverMm = surfaceStepoverMm(surface)
  const descents = buildLevelDescents(feeds.startZ, surface.totalDepth, feeds.stepdown)
  const builder = createSegmentBuilder3D(toThree(corner.x, corner.y, feeds.startZ))
  let currentX = corner.x
  let currentY = corner.y

  const pushZTransition = (toZ: number) => {
    if (surface.zTransitionMode === 'plunge') {
      builder.add('dotted', [toThree(currentX, currentY, toZ)])
      return
    }
    builder.add(
      'solid',
      surfaceHelixPoints3D(currentX, currentY, surface.helixRadius, feeds.startZ, toZ, feeds.stepdown, surface.rasterDirection),
    )
  }

  const addLevelRetract = () => {
    builder.add('dashed', [
      toThree(currentX, currentY, feeds.safeZ),
      toThree(corner.x, corner.y, feeds.safeZ),
      toThree(corner.x, corner.y, feeds.startZ),
    ])
    currentX = corner.x
    currentY = corner.y
  }

  if (surface.method === 'zigzag') {
    const waypoints = zigzagWaypoints(computeRasterLines(bounds, surface.rasterDirection, stepoverMm))
    descents.forEach(({ toZ }, idx) => {
      if (idx > 0) addLevelRetract()
      pushZTransition(toZ)
      const rasterPoints: THREE.Vector3[] = []
      for (let i = 1; i < waypoints.length; i++) {
        rasterPoints.push(toThree(waypoints[i].x, waypoints[i].y, toZ))
      }
      builder.add('solid', rasterPoints)
      currentX = waypoints[waypoints.length - 1].x
      currentY = waypoints[waypoints.length - 1].y
    })
  } else {
    const rasterLines = computeRasterLines(bounds, surface.rasterDirection, stepoverMm)
    descents.forEach(({ toZ }, idx) => {
      if (idx > 0) addLevelRetract()
      pushZTransition(toZ)
      rasterLines.forEach((line, i) => {
        builder.add('solid', [toThree(line.to.x, line.to.y, toZ)])
        if (i < rasterLines.length - 1) {
          // BL-35: retract + reposition + rapid down to one stepdown above
          // the next line's target (all real G0, dashed), then plunge only
          // that last stepdown (G1, dotted) — mirrors lib/surface.ts's
          // fixed unidirectionalSurfaceToolpath() sequence exactly.
          builder.add('dashed', [
            toThree(line.to.x, line.to.y, feeds.safeZ),
            toThree(rasterLines[i + 1].from.x, rasterLines[i + 1].from.y, feeds.safeZ),
            toThree(rasterLines[i + 1].from.x, rasterLines[i + 1].from.y, toZ + feeds.stepdown),
          ])
          builder.add('dotted', [toThree(rasterLines[i + 1].from.x, rasterLines[i + 1].from.y, toZ)])
        }
      })
      currentX = rasterLines[rasterLines.length - 1].to.x
      currentY = rasterLines[rasterLines.length - 1].to.y
    })
  }

  return builder.segments
}

// Pocket ring loops — mirrors pocketSpiral.ts's ring generation
// (pocketCircleRingRadii/pocketRectRingDims). Each loop is one complete,
// closed ring at a fixed radius/size (the "flat pass" of circleRingMoves/
// rectRingMoves); buildPocketToolpathObjects3D() below chains these
// together with the real ramp (circleRingRampPoints() for Circle, an
// implicit straight leg via createSegmentBuilder3D for Rectangle) into
// one continuous polyline, same as preview/drawToolpath.ts's 2D
// drawPocketGeometry.
// startAngleDeg matters here, unlike a bare full circle: this loop's
// output goes through createSegmentBuilder3D, which always prepends the
// builder's current cursor (wherever the preceding ramp actually ended)
// to these points — if this loop started at a fixed angle instead of
// that same end angle, the builder would draw a spurious chord connecting
// the two, growing longer each ring as the mismatch compounds (caught via
// visual QA, 3D-only: 2D's ctx.arc() has no such forced connector between
// separate strokes, so it never showed this).
function pocketCircleRingLoopPoints3D(centerX: number, centerY: number, radius: number, z: number, startAngleDeg: number): THREE.Vector3[] {
  const startRad = (startAngleDeg * Math.PI) / 180
  const points: THREE.Vector3[] = []
  for (let i = 0; i <= SEGMENTS_PER_TURN; i++) {
    const a = startRad + (2 * Math.PI * i) / SEGMENTS_PER_TURN
    points.push(toThree(centerX + radius * Math.cos(a), centerY + radius * Math.sin(a), z))
  }
  return points
}

// Centered Z-entry helix — mirrors lib/pocketZTransition.ts's
// pocketZTransitionMoves exactly (Vector3 samples instead of G-code
// lines, same convention as surfaceHelixPoints3D above), but always
// centered directly on the pocket's own center, no corner-offset math.
function pocketHelixEntryPoints3D(
  centerX: number,
  centerY: number,
  radius: number,
  fromZ: number,
  toZ: number,
  stepdown: number,
): THREE.Vector3[] {
  const points: THREE.Vector3[] = []
  let z = fromZ
  for (const turnDepth of computeDepthPasses(fromZ - toZ, stepdown)) {
    for (let i = 1; i <= SEGMENTS_PER_TURN; i++) {
      const a = (2 * Math.PI * i) / SEGMENTS_PER_TURN
      const x = centerX + radius * Math.cos(a)
      const y = centerY + radius * Math.sin(a)
      const zz = z - (turnDepth * i) / SEGMENTS_PER_TURN
      points.push(toThree(x, y, zz))
    }
    z -= turnDepth
  }
  return points
}

// Builds Pocket's full toolpath: the Z-transition/retract chain (styled
// via createSegmentBuilder3D, mirroring lib/pocket.ts's pocketToolpath()/
// pocketZTransitionMoves() exactly — level 0 no retract, later levels
// dashed retract to Safe Z and back down centered, same as Surface) plus,
// per level, either the exact raster zigzag chain (Raster method, same
// treatment as Surface's Zigzag) or the exact ramp+flat ring sequence
// (Spiral method — ramp and flat pass both chained through the same
// builder as one continuous 'solid' polyline, mirroring
// lib/pocketSpiral.ts's circleRingMoves()/rectRingMoves() exactly, not a
// simplified set of disconnected rings).
function buildPocketToolpathObjects3D(
  pocket: WizardParams['pocket'],
  feeds: WizardParams['feeds'],
  theme: Theme,
  span: number,
): THREE.Object3D[] {
  const center = pocketCenter(pocket)
  const entry = pocketEntryPoint(center.x, center.y, pocket.zTransitionMode, pocket.helixRadius)
  const descents = buildLevelDescents(feeds.startZ, pocket.totalDepth, feeds.stepdown)
  const builder = createSegmentBuilder3D(toThree(entry.x, entry.y, feeds.startZ))
  const objects: THREE.Object3D[] = []

  const pushZTransition = (toZ: number) => {
    if (pocket.zTransitionMode === 'plunge') {
      builder.add('dotted', [toThree(center.x, center.y, toZ)])
      return
    }
    builder.add('solid', pocketHelixEntryPoints3D(center.x, center.y, pocket.helixRadius, feeds.startZ, toZ, feeds.stepdown))
    // Flat finishing pass — mirrors pocketZTransitionMoves()'s own addition
    // (lib/pocketZTransition.ts): a spiral turn descends continuously as it
    // sweeps, so the descent above leaves a helical ledge, not a flat
    // surface, at `toZ`. Starts at angle 0 — where pocketHelixEntryPoints3D
    // always ends — so this collapses to a zero-length connector, no jump.
    builder.add('solid', pocketCircleRingLoopPoints3D(center.x, center.y, pocket.helixRadius, toZ, 0))
  }

  const addLevelRetract = () => {
    builder.add('dashed', [toThree(entry.x, entry.y, feeds.safeZ), toThree(entry.x, entry.y, feeds.startZ)])
  }

  if (pocket.method === 'raster') {
    const bounds = pocketRectRasterBounds(pocket)
    const stepoverMm = pocketStepoverMm(pocket)
    const waypoints = zigzagWaypoints(computeRasterLines(bounds, pocket.rasterDirection, stepoverMm))
    descents.forEach(({ toZ }, idx) => {
      if (idx > 0) addLevelRetract()
      pushZTransition(toZ)
      builder.add('solid', waypoints.map((p) => toThree(p.x, p.y, toZ)))
    })
  } else if (pocket.shape === 'circle') {
    const wallRadius = pocketCircleWallRadius(pocket)
    const stepoverMm = pocketStepoverMm(pocket)
    const startRadius = pocket.zTransitionMode === 'helix' ? pocket.helixRadius : 0
    const radii = pocketCircleRingRadii(startRadius, wallRadius, stepoverMm)
    descents.forEach(({ toZ }, idx) => {
      if (idx > 0) addLevelRetract()
      pushZTransition(toZ)
      // Ramp (curved, radius+angle together) + flat ring loop, chained
      // through the same builder as the Z-transition/retract above — one
      // continuous 'solid' polyline per level, exactly mirroring the real
      // toolpath (lib/pocketSpiral.ts's circleRingMoves()) instead of
      // drawing each ring as a disconnected standalone Line.
      let angleDeg = 0
      for (let i = 1; i < radii.length; i++) {
        builder.add(
          'solid',
          circleRingRampPoints(radii[i - 1], radii[i], angleDeg, center.x, center.y).map((p) => toThree(p.x, p.y, toZ)),
        )
        angleDeg += rampSweepDegFor(radii[i - 1], radii[i])
        builder.add('solid', pocketCircleRingLoopPoints3D(center.x, center.y, radii[i], toZ, angleDeg))
      }
    })
  } else {
    const { halfWidth, halfHeight } = pocketRectWallHalfDims(pocket)
    const stepoverMm = pocketStepoverMm(pocket)
    const rings = pocketRectRingDims(halfWidth, halfHeight, stepoverMm)
    descents.forEach(({ toZ }, idx) => {
      if (idx > 0) addLevelRetract()
      pushZTransition(toZ)
      // Gradual ramp (halfWidth/halfHeight + perimeter fraction together,
      // rectRingRampPoints()) + full lap starting wherever the ramp left
      // off, not always the corner (rectFullLapPoints()) — chained through
      // the same builder as one continuous 'solid' polyline, exactly
      // mirroring lib/pocketSpiral.ts's rectRingMoves(), same pattern as
      // Circle above. Bootstrapped from the Z-entry exactly like the
      // engine — see RECT_HELIX_ENTRY_FRACTION's doc comment.
      let prevDims: RectRingDims =
        pocket.zTransitionMode === 'helix' ? { halfWidth: pocket.helixRadius, halfHeight: pocket.helixRadius } : { halfWidth: 0, halfHeight: 0 }
      let fraction = pocket.zTransitionMode === 'helix' ? RECT_HELIX_ENTRY_FRACTION : 0
      for (const dims of rings) {
        builder.add('solid', rectRingRampPoints(prevDims, dims, fraction, center.x, center.y).map((p) => toThree(p.x, p.y, toZ)))
        const nextFraction = fraction + rectRampSweepFor(prevDims, dims)
        builder.add('solid', rectFullLapPoints(center.x, center.y, dims, nextFraction).map((p) => toThree(p.x, p.y, toZ)))
        prevDims = dims
        fraction = nextFraction
      }
    })
  }

  objects.push(...buildToolpathLines3D(builder.segments, theme, span))
  return objects
}

interface Theme {
  material: number
  materialOpacity: number
  grid: number
  // No separate "rapid" color in 3D — every tool-motion line shares this
  // one color, told apart by dash pattern instead (see ToolpathLineStyle).
  // 2D Preview still has its own separate rapid accent (drawToolpath.ts).
  toolpath: number
  origin: number
  hole: number
  axisX: number
  axisY: number
  offset: number
  // Muted, neutral color for the grid's coordinate-number labels — same
  // role as drawToolpath.ts's theme.text, deliberately NOT an axis color
  // so the ticks read as secondary/reference, not competing with the
  // axis lines or the origin label.
  text: number
}

// materialOpacity isn't a color and stays fixed per light/dark mode
// (unrelated to the BL-12 palette choice) — the plane's own accent color
// still comes from the selected palette.
const MATERIAL_OPACITY_LIGHT = 0.5
const MATERIAL_OPACITY_DARK = 0.6

// Merges the palette-selectable accents (material/grid/toolpath/rapid/hole)
// with the fixed CNC-convention colors (axes/origin/offset) — see
// config/palettes.ts (BL-12). Mirrors preview/drawToolpath.ts's buildTheme,
// just in Three.js's numeric 0xrrggbb color format instead of CSS hex
// strings.
function buildTheme(paletteId: PaletteId, isDark: boolean, themeId: ThemeId): Theme {
  const fixed = getFixedColors(themeId, isDark)
  const accents = getPaletteAccents(paletteId, isDark, themeId)
  return {
    material: hexToThreeColor(fixed.background),
    materialOpacity: isDark ? MATERIAL_OPACITY_DARK : MATERIAL_OPACITY_LIGHT,
    grid: hexToThreeColor(accents.grid),
    toolpath: hexToThreeColor(accents.toolpath),
    origin: hexToThreeColor(fixed.origin),
    hole: hexToThreeColor(accents.hole),
    axisX: hexToThreeColor(fixed.axisX),
    axisY: hexToThreeColor(fixed.axisY),
    offset: hexToThreeColor(fixed.offset),
    text: hexToThreeColor(fixed.text),
  }
}

// Small always-facing-camera text label rendered via a canvas texture — no
// extra dependency (troika-three-text / CSS2DRenderer) needed for a single
// short label.
function createTextSprite(text: string, color: number, size: number): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.font = 'bold 28px ui-monospace, monospace'
  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`
  ctx.textBaseline = 'middle'
  // Centered, not left-aligned at a fixed x — a fixed-x draw left single
  // characters ("X"/"Y") close enough to the canvas's true center that it
  // went unnoticed, but multi-digit grid tick numbers ("-30", "50") sat
  // visibly left of the sprite's actual anchor point. That produced two
  // reported symptoms from the same cause: X-axis tick labels drifting
  // left of their grid line, and right-edge Y-axis ticks (already
  // anchored further right, past the grid boundary) appearing to creep
  // back toward the plane while left-edge ones drifted the other way.
  ctx.textAlign = 'center'
  ctx.fillText(text, canvas.width / 2, canvas.height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(size, size / 2, 1)
  return sprite
}

// Rescales a text sprite so it occupies a *constant number of screen
// pixels* regardless of camera distance/zoom, instead of the fixed
// world-unit size createTextSprite() sets at construction time (which
// looks fine at whatever zoom the scene happened to be built at, then
// shrinks to an unreadable dot when zoomed out, or balloons when zoomed
// way in — the bug this fixes). Call every frame, after the camera may
// have moved (Scene3D.tsx's animate() loop) — cheap, no allocation.
// `sprite.userData.pixelHeight` is set once, at creation, by whichever
// code built the label (see GRID_LABEL_SIZE_PX above); this function
// doesn't need to know what *kind* of label it's rescaling.
//
// Standard perspective-camera billboard-scaling formula: the world-space
// height spanned by the full viewport at a given distance is
// `2 * distance * tan(verticalFov / 2)`; dividing by the viewport's pixel
// height gives "world units per pixel" at that distance, which converts
// the desired pixel height directly into the world-space scale Three.js
// sprites use. Depends only on vertical FOV, not aspect ratio, so it's
// unaffected by window/container resizing beyond re-reading the current
// pixel height each call.
export function rescaleLabelForConstantScreenSize(
  sprite: THREE.Sprite,
  camera: THREE.PerspectiveCamera,
  viewportHeightPx: number,
): void {
  const pixelHeight = (sprite.userData.pixelHeight as number | undefined) ?? GRID_LABEL_SIZE_PX.medium
  const distance = camera.position.distanceTo(sprite.position)
  const fovRad = (camera.fov * Math.PI) / 180
  const worldPerPixel = (2 * distance * Math.tan(fovRad / 2)) / viewportHeightPx
  const worldHeight = pixelHeight * worldPerPixel
  sprite.scale.set(worldHeight * 2, worldHeight, 1)
}

// Cone arrowhead pointing along `direction`, centered so its tip lands
// exactly at `tip`. Used to give the X/Y axis lines a visible positive
// direction instead of just extending both ways with no indication of
// which end is +X/+Y.
function createArrowhead(color: number, size: number, tip: THREE.Vector3, direction: THREE.Vector3): THREE.Mesh {
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(size * 0.35, size, 12),
    new THREE.MeshBasicMaterial({ color }),
  )
  cone.position.copy(tip).addScaledVector(direction, -size / 2)
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)
  return cone
}

export interface BuiltScene {
  objects: THREE.Object3D[]
  bounds: THREE.Box3
  // Every text sprite in the scene (origin "0,0", axis-end "X"/"Y", grid
  // coordinate ticks) — a subset of `objects`, handed back separately so
  // Scene3D.tsx's per-frame animate() loop can rescale them for constant
  // screen size (see rescaleLabelForConstantScreenSize) without having to
  // search the whole object graph for sprites every frame.
  labels: THREE.Sprite[]
  // The WebGL clear color the caller should apply (renderer.setClearColor)
  // — same value as `theme.material`, sourced from the active Theme's fixed
  // `background` color (config/palettes.ts) — the same one the 2D preview
  // already fills its canvas with (drawToolpath.ts). It's a Theme property,
  // not a Preview Color Palette accent, so it never changes when the user
  // switches palette, only when the Theme itself changes. Handing this back
  // instead of leaving Scene3D.tsx to compute or hardcode its own copy is
  // the whole point: it's the one thing that must track whichever Theme is
  // active, for every theme to come, without a second place to remember to
  // update — see the postmortem note at its call site in
  // buildToolpathScene() below.
  background: number
}

// Discriminated by operation/shape — same split as preview/drawToolpath.ts.
// Hole(s) is a repeated point pattern; Outline is a single shape (circle,
// or a 4-corner rectangle).
type ResolvedPattern =
  | { kind: 'holes'; params: WizardParams; points: Point2D[]; holeRadius: number; toolRadius: number }
  | {
      kind: 'outlineCircle'
      params: WizardParams
      center: Point2D
      nominalRadius: number
      toolRadius: number
      direction: 'cw' | 'ccw'
    }
  | {
      kind: 'outlineRect'
      params: WizardParams
      nominalCorners: Point2D[]
      toolCorners: Point2D[]
      rampEdge: 0 | 1
    }
  | {
      kind: 'surface'
      params: WizardParams
      nominalBounds: SurfaceBounds
      toolBounds: SurfaceBounds
    }
  | {
      kind: 'pocket'
      params: WizardParams
      center: Point2D
      shape: PocketShape
      nominalRadius: number // circle only
      nominalCorners: Point2D[] // rect only, [] for circle
    }

function resolvePattern(params: WizardParams): ResolvedPattern {
  if (params.operation === 'pocket') {
    const { pocket } = params
    const center = pocketCenter(pocket)
    if (pocket.shape === 'circle') {
      return { kind: 'pocket', params, center, shape: pocket.shape, nominalRadius: pocket.diameter / 2, nominalCorners: [] }
    }
    const nominalCorners: Point2D[] = [
      { x: center.x - pocket.width / 2, y: center.y - pocket.height / 2 },
      { x: center.x + pocket.width / 2, y: center.y - pocket.height / 2 },
      { x: center.x + pocket.width / 2, y: center.y + pocket.height / 2 },
      { x: center.x - pocket.width / 2, y: center.y + pocket.height / 2 },
    ]
    return { kind: 'pocket', params, center, shape: pocket.shape, nominalRadius: 0, nominalCorners }
  }
  if (params.operation === 'surface') {
    const { surface } = params
    return {
      kind: 'surface',
      params,
      nominalBounds: surfaceNominalBounds(surface),
      toolBounds: surfaceToolBounds(surface),
    }
  }
  if (params.operation === 'outline') {
    const { outline } = params
    if (outline.shape === 'circle') {
      const { radius: toolRadius, direction } = circleOutlineRadiusAndDirection(outline)
      return {
        kind: 'outlineCircle',
        params,
        center: { x: outline.offsetX, y: outline.offsetY },
        nominalRadius: outline.diameter / 2,
        toolRadius: Math.max(0, toolRadius),
        direction,
      }
    }
    const nominalCorners = rectCorners(
      outline.shape,
      outline.width,
      outline.height,
      outline.width,
      outline.height,
      outline.offsetX,
      outline.offsetY,
      'ccw',
    )
    const { toolWidth, toolHeight } = rectToolDimensions(
      outline.width,
      outline.height,
      outline.toolDiameter,
      outline.offsetMode,
    )
    const direction = outlineDirectionForOffsetMode(outline.offsetMode)
    const toolCorners = rectCorners(
      outline.shape,
      outline.width,
      outline.height,
      Math.max(0, toolWidth),
      Math.max(0, toolHeight),
      outline.offsetX,
      outline.offsetY,
      direction,
    )
    const rampEdge = longerEdgeIndex(Math.max(0, toolWidth), Math.max(0, toolHeight), direction)
    return { kind: 'outlineRect', params, nominalCorners, toolCorners, rampEdge }
  }

  const { geometry } = params
  const points = resolvePoints(geometry)
  const holeRadius = geometry.holeDiameter / 2
  // Guarded against a tool larger than the hole (allowed until Etap 5
  // validation covers every entry point) — CylinderGeometry with a
  // negative radius throws.
  const toolRadius = Math.max(0, (geometry.holeDiameter - geometry.toolDiameter) / 2)
  return { kind: 'holes', params, points, holeRadius, toolRadius }
}

// Expands `bounds` (in place, matching THREE.Box3's mutable API already used
// throughout this file) to include one pattern's footprint — using THAT
// pattern's own totalDepth/safeZ, since overlaid presets (BL-3) can have a
// different depth/Safe Z than the active one.
function expandBoundsForPattern(bounds: THREE.Box3, pattern: ResolvedPattern) {
  if (pattern.kind === 'pocket') {
    const { pocket, feeds } = pattern.params
    if (pattern.shape === 'circle') {
      const r = pattern.nominalRadius
      bounds.expandByPoint(toThree(pattern.center.x - r, pattern.center.y - r, -pocket.totalDepth))
      bounds.expandByPoint(toThree(pattern.center.x + r, pattern.center.y + r, feeds.safeZ))
    } else {
      for (const p of pattern.nominalCorners) {
        bounds.expandByPoint(toThree(p.x, p.y, -pocket.totalDepth))
        bounds.expandByPoint(toThree(p.x, p.y, feeds.safeZ))
      }
    }
    return
  }
  if (pattern.kind === 'surface') {
    const { surface, feeds } = pattern.params
    const { minX, maxX, minY, maxY } = pattern.toolBounds
    // The "remaining stock" block's bottom now sits a further feeds.safeZ
    // below -totalDepth (see buildSurfacePatternObjects) — bounds must
    // reach that deep too, or the camera/grid would clip it.
    bounds.expandByPoint(toThree(minX, minY, -surface.totalDepth - feeds.safeZ))
    bounds.expandByPoint(toThree(maxX, maxY, feeds.safeZ))
    return
  }
  if (pattern.kind === 'holes') {
    const { geometry, feeds } = pattern.params
    for (const p of pattern.points) {
      bounds.expandByPoint(toThree(p.x - pattern.holeRadius, p.y - pattern.holeRadius, -geometry.totalDepth))
      bounds.expandByPoint(toThree(p.x + pattern.holeRadius, p.y + pattern.holeRadius, feeds.safeZ))
    }
    return
  }
  const { outline, feeds } = pattern.params
  if (pattern.kind === 'outlineCircle') {
    let r = Math.max(pattern.nominalRadius, pattern.toolRadius)
    // On-line's new outer wall (BL-28) reaches past the nominal radius —
    // today's toolRadius/nominalRadius alone (both equal to the nominal
    // radius for On-line) would under-count the bounds otherwise.
    if (outline.offsetMode === 'onLine') {
      r = Math.max(r, onLineCircleEdges(outline).outerRadius)
    }
    bounds.expandByPoint(toThree(pattern.center.x - r, pattern.center.y - r, -outline.totalDepth))
    bounds.expandByPoint(toThree(pattern.center.x + r, pattern.center.y + r, feeds.safeZ))
    return
  }
  const corners = [...pattern.nominalCorners, ...pattern.toolCorners]
  // Same on-line under-count fix as Circle above, for the new outer wall.
  // outline.shape !== 'circle' always holds here (pattern.kind === 'outlineRect'
  // guarantees it), the check is only to narrow the type for rectCorners.
  if (outline.offsetMode === 'onLine' && outline.shape !== 'circle') {
    const { outerWidth, outerHeight } = onLineRectDimensions(outline.width, outline.height, outline.toolDiameter)
    corners.push(
      ...rectCorners(outline.shape, outline.width, outline.height, outerWidth, outerHeight, outline.offsetX, outline.offsetY, 'ccw'),
    )
  }
  for (const p of corners) {
    bounds.expandByPoint(toThree(p.x, p.y, -outline.totalDepth))
    bounds.expandByPoint(toThree(p.x, p.y, feeds.safeZ))
  }
}

// Offset vector — amber, physical origin to the shifted pattern/shape.
// Hidden entirely at (0,0), same rule as the collapsed Step 2 summary
// annotation. Shared by every pattern kind below.
function buildOffsetVectorObjects(offsetX: number, offsetY: number, theme: Theme, arrowSize: number): THREE.Object3D[] {
  if (offsetX === 0 && offsetY === 0) return []
  const offsetTip = toThree(offsetX, offsetY, 0)
  const offsetDir = offsetTip.clone().normalize()
  return [
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([toThree(0, 0, 0), offsetTip]),
      new THREE.LineBasicMaterial({ color: theme.offset }),
    ),
    createArrowhead(theme.offset, arrowSize, offsetTip, offsetDir),
  ]
}

// Every tool-motion line (cutting, rapid, non-cutting vertical step) shares
// one color (theme.toolpath) — no separate "rapid" accent in 3D anymore —
// and is told apart purely by dash pattern: 'solid' for actual cutting
// (circles/arcs/raster/ramp), 'dashed' for G0 rapid (traverse, retract,
// reposition), 'dotted' for a G1 move that isn't cutting laterally (Standard
// Hole/Outline's straight step-down between passes, Surface's Plunge-mode
// Z-transition). Previously rapids used a separate theme.rapid color/dashed
// style and non-cutting G1 steps were silently merged into the same solid
// line as real cutting, indistinguishable from it — both fixed together
// here, since achieving three different styles along what was one
// continuous polyline per pattern requires splitting it into multiple
// THREE.Line objects (LineDashedMaterial can only apply one dash pattern to
// an entire line, per its own cumulative distance from computeLineDistances()).
type ToolpathLineStyle = 'solid' | 'dashed' | 'dotted'

interface ToolpathSegment3D {
  style: ToolpathLineStyle
  points: THREE.Vector3[]
}

function toolpathLineMaterial(style: ToolpathLineStyle, theme: Theme, span: number): THREE.Material {
  if (style === 'solid') return new THREE.LineBasicMaterial({ color: theme.toolpath })
  // 'dotted' uses a much shorter dash than 'dashed' (and a slightly larger
  // gap) so it reads as discrete dots instead of short dashes.
  const dashSize = style === 'dashed' ? span * 0.02 : span * 0.003
  const gapSize = style === 'dashed' ? span * 0.01 : span * 0.008
  return new THREE.LineDashedMaterial({ color: theme.toolpath, dashSize, gapSize })
}

function buildToolpathLine3D(points: THREE.Vector3[], style: ToolpathLineStyle, theme: Theme, span: number): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const line = new THREE.Line(geometry, toolpathLineMaterial(style, theme, span))
  if (style !== 'solid') line.computeLineDistances()
  return line
}

// Turns a list of styled segments (each already including its own shared
// boundary point with the previous segment, so there's no visual gap
// between styles) into actual THREE.Line objects. Segments with fewer than
// 2 points (nothing was pushed onto them) are dropped.
function buildToolpathLines3D(segments: ToolpathSegment3D[], theme: Theme, span: number): THREE.Line[] {
  return segments.filter((s) => s.points.length > 1).map((s) => buildToolpathLine3D(s.points, s.style, theme, span))
}

// Accumulates styled segments where each new leg starts exactly where the
// previous one ended (shared vertex — no gap), mirroring how the old flat
// Vector3[] builders in this file used to just keep pushing onto one array.
function createSegmentBuilder3D(start: THREE.Vector3) {
  const segments: ToolpathSegment3D[] = []
  let cursor = start
  return {
    add(style: ToolpathLineStyle, points: THREE.Vector3[]) {
      if (points.length === 0) return
      segments.push({ style, points: [cursor, ...points] })
      cursor = points[points.length - 1]
    },
    segments,
  }
}

function rapidZLineObjects(x: number, y: number, safeZ: number, startZ: number, bottomZ: number, theme: Theme, span: number) {
  const descentLine = buildToolpathLine3D([toThree(x, y, safeZ), toThree(x, y, startZ)], 'dashed', theme, span)
  const retractLine = buildToolpathLine3D([toThree(x, y, bottomZ), toThree(x, y, safeZ)], 'dashed', theme, span)
  return [descentLine, retractLine]
}

// Builds everything that's per-pattern (BL-3 overlay): offset vector, rapid
// XY traverse, and per-hole rapid-Z lines + bore cylinder + toolpath line.
// The material plane/grid/origin/axes are NOT per-pattern — built once by
// the caller from the combined bounds.
function buildHolesPatternObjects(
  pattern: Extract<ResolvedPattern, { kind: 'holes' }>,
  theme: Theme,
  span: number,
  arrowSize: number,
  showStock: boolean,
  showToolpath: boolean,
): THREE.Object3D[] {
  const { points, holeRadius, toolRadius, params } = pattern
  const { geometry, feeds, method } = params
  const objects: THREE.Object3D[] = []

  const tabsConfig: TabsConfig3D | null = geometry.tabsEnabled
    ? { tabHeight: geometry.tabHeight, tabRanges: computeTabRanges(geometry.tabCount, geometry.tabWidth, toolRadius) }
    : null

  objects.push(...buildOffsetVectorObjects(geometry.offsetX, geometry.offsetY, theme, arrowSize))

  // Rapid traverse between holes, at Safe Z — through each hole's actual
  // descent-start XY (center + toolRadius on +X), matching the real G-code
  // (program.ts's assembleProgram no longer rapids to the raw center first)
  // and rapidZLineObjects below, which already uses this same startX.
  if (showToolpath && points.length > 1) {
    const rapidPoints = points.map((p) => toThree(p.x + toolRadius, p.y, feeds.safeZ))
    objects.push(buildToolpathLine3D(rapidPoints, 'dashed', theme, span))
  }

  for (const p of points) {
    const startX = p.x + toolRadius

    // Rapid Z moves around each hole: descend from Safe Z to the top of the
    // cut (Z0, or +startZ when the material is treated as taller), then
    // retract from full depth back to Safe Z (the actual "G0 Z5"-style moves
    // the engine emits) — previously only the lateral travel between holes
    // was drawn, not these.
    if (showToolpath) {
      objects.push(
        ...rapidZLineObjects(startX, p.y, feeds.safeZ, feeds.startZ, -geometry.totalDepth, theme, span),
      )
    }

    // Final bore (semi-transparent cylinder, top at Z=0 down to
    // -totalDepth — the real material extent. Start Z doesn't affect this
    // at all (BL-37): it's where the feed-rate descent begins, not a
    // material-height concept — totalDepth is already anchored to Z=0 on
    // its own (see helix.ts/standardHole.ts, the cut bottom is always
    // -totalDepth regardless of startZ). The toolpath's own above-material
    // segment (Start Z down to Z=0) is left to visibly poke out above this
    // block — that's the real, honest picture of what's happening: feed-
    // rate motion through open air before the tool actually reaches
    // material.
    if (showStock) {
      const boreHeight = geometry.totalDepth
      const hole = new THREE.Mesh(
        new THREE.CylinderGeometry(holeRadius, holeRadius, boreHeight, 32, 1, true),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(theme.hole).multiplyScalar(WALL_SHADE_FACTOR),
          transparent: true,
          opacity: 0.3,
          side: THREE.DoubleSide,
          // Same depthWrite fix as the stock cap (0.16.2) — without it,
          // overlaid patterns' bore cylinders can win the depth test
          // against each other's coils/walls depending on camera-distance
          // sort order, hard-hiding one instead of blending, and flipping
          // which one wins with tiny camera moves. Never an issue for a
          // single pattern alone (at most its own front/back wall overlap),
          // but overlay mode routes several independent patterns' bore
          // cylinders through this same near-camera screen space.
          depthWrite: false,
        }),
      )
      hole.position.copy(toThree(p.x, p.y, -geometry.totalDepth / 2))
      objects.push(hole)
    }

    // Actual tool-center toolpath
    if (showToolpath) {
      const pathSegments =
        method === 'helix'
          ? helixPoints3D(p.x, p.y, toolRadius, geometry.totalDepth, feeds.stepdown, feeds.startZ, tabsConfig, 'ccw')
          : standardHolePoints3D(
              p.x,
              p.y,
              toolRadius,
              geometry.totalDepth,
              feeds.stepdown,
              feeds.startZ,
              tabsConfig,
              'ccw',
            )
      objects.push(...buildToolpathLines3D(pathSegments, theme, span))
    }
  }

  return objects
}

function buildOutlineCirclePatternObjects(
  pattern: Extract<ResolvedPattern, { kind: 'outlineCircle' }>,
  theme: Theme,
  span: number,
  arrowSize: number,
  showStock: boolean,
  showToolpath: boolean,
): THREE.Object3D[] {
  const { center, nominalRadius, toolRadius, direction, params } = pattern
  const { outline, feeds } = params
  const objects: THREE.Object3D[] = []

  objects.push(...buildOffsetVectorObjects(outline.offsetX, outline.offsetY, theme, arrowSize))

  if (showToolpath) {
    const startX = center.x + toolRadius
    objects.push(...rapidZLineObjects(startX, center.y, feeds.safeZ, feeds.startZ, -outline.totalDepth, theme, span))
  }

  // Nominal shape (semi-transparent cylinder) — same convention as Hole(s):
  // the finished material boundary, not the tool-corrected path. Open/closed
  // follows the offset mode's physical meaning (BL-27): Outside means this
  // shape IS the kept, solid part (closed); Inside means material is removed
  // from the interior, a void like a hole/pocket (open, no caps).
  //
  // On-line (BL-28) gets two walls instead of one: the tool travels centered
  // on the nominal line, so it leaves two real physical edges — an inner
  // edge (a standalone island, rendered Outside-style/closed) and an outer
  // edge (still connected to the surrounding stock, rendered Inside-style/
  // open) — replacing the single nominal-radius wall, which doesn't
  // correspond to any real edge for On-line.
  //
  // Top sits at Z=0 (the real material surface), height exactly
  // totalDepth — Start Z doesn't affect this at all (BL-37): it's where
  // the feed-rate descent begins, not a material-height concept. The
  // toolpath's own above-material segment (Start Z down to Z=0) is left
  // to visibly poke out above this wall.
  if (showStock) {
    const boreHeight = outline.totalDepth
    const boreCenterZ = -outline.totalDepth / 2
    // side depends on closed, same reasoning as buildRectWallMesh: a closed
    // cylinder (nothing hollow to look into) only needs THREE.FrontSide,
    // which also avoids the same-mesh transparent self-overlap artifact
    // DoubleSide has (WebGL doesn't depth-sort triangles within one draw
    // call, so a near face and a far face of the same transparent cylinder
    // can blend in the wrong order depending on camera angle). An open
    // cylinder (Inside, On-line's outer edge) still needs DoubleSide to show
    // its interior wall from inside/above.
    //
    // For closed cylinders, the lateral (side) surface — CylinderGeometry's
    // own group 0, with the top/bottom caps as groups 1/2 — is rendered a
    // shade darker than the caps (WALL_SHADE_FACTOR), same fake-shading
    // reasoning as buildRectWallMesh: without it a solid closed cylinder
    // reads as a flat tinted circle instead of a 3D volume. Open cylinders
    // have no cap geometry at all (openEnded=true means only the side
    // group exists), so their single material IS the side — it gets the
    // same darkened color too, not the plain theme.hole it used to keep:
    // the darkening needs to hold against the separate flat stock cap
    // object sitting at the rim, not just against a cap that's part of
    // this same mesh.
    // depthWrite: false on both materials — same fix as the stock cap
    // (0.16.2) and the Hole(s) bore cylinder above, generalized: overlay
    // mode can stack several independent patterns' walls in the same
    // screen space, and without this, one can win the depth test against
    // another (or against a different pattern's coil) depending on
    // camera-distance sort order, hard-hiding it instead of blending.
    const wallMaterial = (closed: boolean): THREE.Material | THREE.Material[] => {
      const side = closed ? THREE.FrontSide : THREE.DoubleSide
      const sideColor = new THREE.Color(theme.hole).multiplyScalar(WALL_SHADE_FACTOR)
      const sideMaterial = new THREE.MeshBasicMaterial({
        color: sideColor,
        transparent: true,
        opacity: 0.3,
        side,
        depthWrite: false,
      })
      if (!closed) return sideMaterial
      const capMaterial = new THREE.MeshBasicMaterial({
        color: theme.hole,
        transparent: true,
        opacity: 0.3,
        side,
        depthWrite: false,
      })
      return [sideMaterial, capMaterial, capMaterial]
    }

    if (outline.offsetMode === 'onLine') {
      const { innerRadius, outerRadius } = onLineCircleEdges(outline)
      // Inner wall is closed (false = not open-ended) — its own top face
      // sits at world Y = 0, same height the material plane/grid sit at,
      // so it needs the same z-fight lift as the stock cap.
      const innerWall = new THREE.Mesh(
        new THREE.CylinderGeometry(innerRadius, innerRadius, boreHeight, 32, 1, false),
        wallMaterial(true),
      )
      innerWall.position.copy(toThree(center.x, center.y, boreCenterZ + SOLID_CAP_Z_LIFT))
      objects.push(innerWall)

      const outerWall = new THREE.Mesh(
        new THREE.CylinderGeometry(outerRadius, outerRadius, boreHeight, 32, 1, true),
        wallMaterial(false),
      )
      outerWall.position.copy(toThree(center.x, center.y, boreCenterZ))
      objects.push(outerWall)
    } else {
      const openEnded = outline.offsetMode !== 'outside'
      const shape = new THREE.Mesh(
        new THREE.CylinderGeometry(nominalRadius, nominalRadius, boreHeight, 32, 1, openEnded),
        wallMaterial(!openEnded),
      )
      // Only the closed (Outside) case has a real top face to lift — open
      // (Inside) has no cap geometry there at all.
      shape.position.copy(
        toThree(center.x, center.y, openEnded ? boreCenterZ : boreCenterZ + SOLID_CAP_Z_LIFT),
      )
      objects.push(shape)
    }
  }

  if (showToolpath) {
    const tabsConfig: TabsConfig3D | null = outline.tabsEnabled
      ? { tabHeight: outline.tabHeight, tabRanges: computeTabRanges(outline.tabCount, outline.tabWidth, toolRadius) }
      : null

    const pathSegments =
      outline.method === 'helix'
        ? helixPoints3D(center.x, center.y, toolRadius, outline.totalDepth, feeds.stepdown, feeds.startZ, tabsConfig, direction)
        : standardHolePoints3D(
            center.x,
            center.y,
            toolRadius,
            outline.totalDepth,
            feeds.stepdown,
            feeds.startZ,
            tabsConfig,
            direction,
          )
    objects.push(...buildToolpathLines3D(pathSegments, theme, span))
  }

  return objects
}

function boundingCenter(points: Point2D[]): Point2D {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
}

// Builds one semi-transparent box wall from a set of corners — aligned with
// CNC X/Y, no rotation needed (see the comment at its call site below for
// why). Open/closed follows BL-27's rule: BoxGeometry has no `openEnded`
// like CylinderGeometry, so "open" hides the top/bottom cap faces (indices
// 2/3 of BoxGeometry's default [+x,-x,+y,-y,+z,-z] groups — box-local Y is
// already the vertical bore axis here) via a per-face material array,
// instead of a hand-built tunnel BufferGeometry. Factored out (BL-28) since
// On-line now needs this twice (inner + outer wall) in addition to the
// single-wall case every other offset mode still uses. When `closed`, the
// box's own top face is a real, solid cap at world Y = startZ — same
// z-fight risk against the material plane/grid as the stock cap, so it
// gets the same SOLID_CAP_Z_LIFT nudge. An open wall's hidden cap faces
// have nothing there to collide with.
//
// `side` depends on `closed` too: a closed box (Outside, On-line's inner
// island, Surface's stock — nothing hollow to look into) only ever needs
// to be seen from outside, so THREE.FrontSide (culls the far faces) is
// correct and, crucially, avoids a real rendering artifact DoubleSide has
// here — WebGL doesn't depth-sort triangles *within* one draw call, so a
// transparent DoubleSide box viewed at an angle where a near face and a
// far face of the SAME box both project to the same pixels blends both
// (in whatever order the GPU happens to rasterize them, not by distance),
// making the box look inconsistently darker/lighter depending on camera
// angle and position — reported against Surface's stock block, alongside
// the separate plane/grid depthWrite fix above. An open wall (Inside,
// On-line's outer edge) still needs DoubleSide — the whole point of
// leaving it open is to see the interior wall from inside/above, which
// means seeing that geometry's back face.
function buildRectWallMesh(corners: Point2D[], boreHeight: number, centerZ: number, closed: boolean, theme: Theme): THREE.Mesh {
  const center = boundingCenter(corners)
  const width = Math.max(...corners.map((p) => p.x)) - Math.min(...corners.map((p) => p.x))
  const height = Math.max(...corners.map((p) => p.y)) - Math.min(...corners.map((p) => p.y))
  const side = closed ? THREE.FrontSide : THREE.DoubleSide
  // Side walls a shade darker (WALL_SHADE_FACTOR) than the top/bottom cap
  // — MeshBasicMaterial has no real lighting model, so without some
  // deliberate cap-vs-wall contrast a box reads as a flat tinted
  // rectangle rather than a solid 3D volume (this became visible once the
  // FrontSide fix above removed the DoubleSide self-overlap darkening,
  // which — by accident — had been the only cue making it read as 3D at
  // all). Cheap fake shading, same idea as a flat-shaded isometric
  // sprite's darker side faces. Applies to open shapes too, not just
  // closed ones — an open wall's own missing cap used to be considered
  // enough of a 3D cue on its own, but that breaks down next to the
  // separate flat stock cap object, which sits right at the opening in
  // the same undarkened theme.hole and reads as one continuous flat tint
  // with an undarkened wall.
  // depthWrite: false on both — same fix as the stock cap (0.16.2) and
  // the Hole(s)/Outline Circle walls above, generalized: overlay mode can
  // stack several independent patterns' walls in the same screen space,
  // and without this, one can win the depth test against another (or
  // against a different pattern's coil) depending on camera-distance sort
  // order, hard-hiding it instead of blending.
  const wallColor = new THREE.Color(theme.hole).multiplyScalar(WALL_SHADE_FACTOR)
  const wallMaterial = new THREE.MeshBasicMaterial({
    color: wallColor,
    transparent: true,
    opacity: 0.3,
    side,
    depthWrite: false,
  })
  const capMaterial = closed
    ? new THREE.MeshBasicMaterial({ color: theme.hole, transparent: true, opacity: 0.3, side, depthWrite: false })
    : new THREE.MeshBasicMaterial({ visible: false })
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, boreHeight, height),
    [wallMaterial, wallMaterial, capMaterial, capMaterial, wallMaterial, wallMaterial],
  )
  mesh.position.copy(toThree(center.x, center.y, closed ? centerZ + SOLID_CAP_Z_LIFT : centerZ))
  return mesh
}

function buildOutlineRectPatternObjects(
  pattern: Extract<ResolvedPattern, { kind: 'outlineRect' }>,
  theme: Theme,
  span: number,
  arrowSize: number,
  showStock: boolean,
  showToolpath: boolean,
): THREE.Object3D[] {
  const { nominalCorners, toolCorners, rampEdge, params } = pattern
  const { outline, feeds } = params
  const objects: THREE.Object3D[] = []

  objects.push(...buildOffsetVectorObjects(outline.offsetX, outline.offsetY, theme, arrowSize))
  if (showToolpath) {
    objects.push(
      ...rapidZLineObjects(toolCorners[0].x, toolCorners[0].y, feeds.safeZ, feeds.startZ, -outline.totalDepth, theme, span),
    )
  }

  // Nominal shape (semi-transparent box, aligned with CNC X/Y — BoxGeometry's
  // own local X/Y/Z axes need no rotation here, unlike ExtrudeGeometry,
  // since our fixed toThree() mapping is a pure axis permutation+negation:
  // Three's box-X == CNC width, box-Y == vertical bore height, box-Z ==
  // CNC height (mirrored in position by the -y term, but a centered box's
  // extent along an axis is symmetric either way)).
  //
  // Open/closed follows BL-27's offset-mode rule (see buildRectWallMesh).
  // On-line (BL-28) gets two walls instead of one, same reasoning as
  // Circle above: the tool travels centered on the nominal line, leaving
  // an inner edge (standalone island, closed) and an outer edge (still
  // connected to stock, open) — replacing the single nominal-corner wall,
  // which doesn't correspond to a real edge for On-line.
  //
  // Top sits at Z=0 (the real material surface), height exactly
  // totalDepth — Start Z doesn't affect this at all (BL-37): it's where
  // the feed-rate descent begins, not a material-height concept. The
  // toolpath's own above-material segment (Start Z down to Z=0) is left
  // to visibly poke out above this wall.
  if (showStock) {
    const boreHeight = outline.totalDepth
    const boreCenterZ = -outline.totalDepth / 2

    if (outline.offsetMode === 'onLine' && outline.shape !== 'circle') {
      const { innerWidth, innerHeight, outerWidth, outerHeight } = onLineRectDimensions(
        outline.width,
        outline.height,
        outline.toolDiameter,
      )
      const innerCorners = rectCorners(
        outline.shape,
        outline.width,
        outline.height,
        innerWidth,
        innerHeight,
        outline.offsetX,
        outline.offsetY,
        'ccw',
      )
      const outerCorners = rectCorners(
        outline.shape,
        outline.width,
        outline.height,
        outerWidth,
        outerHeight,
        outline.offsetX,
        outline.offsetY,
        'ccw',
      )
      objects.push(buildRectWallMesh(innerCorners, boreHeight, boreCenterZ, true, theme))
      objects.push(buildRectWallMesh(outerCorners, boreHeight, boreCenterZ, false, theme))
    } else {
      const closed = outline.offsetMode === 'outside'
      objects.push(buildRectWallMesh(nominalCorners, boreHeight, boreCenterZ, closed, theme))
    }
  }

  if (showToolpath) {
    const tabs = outline.tabsEnabled
      ? { tabHeight: outline.tabHeight, tabCount: outline.tabCount, tabWidth: outline.tabWidth }
      : null

    const pathSegments =
      outline.method === 'ramp'
        ? rectRampPoints3D(toolCorners, rampEdge, outline.totalDepth, feeds.stepdown, feeds.startZ, tabs)
        : rectStandardPoints3D(toolCorners, outline.totalDepth, feeds.stepdown, feeds.startZ, tabs)
    objects.push(...buildToolpathLines3D(pathSegments, theme, span))
  }

  return objects
}

// Flat, semi-transparent "remaining stock" block spanning the whole
// nominal footprint — reuses buildRectWallMesh's box technique unmodified
// (it's agnostic to corner order, computing its own bounding box via
// min/max), just passed the Surface footprint's 4 corners instead of an
// Outline perimeter's. Closed (real top cap), matching Outline's Outside
// treatment — Surface always represents kept, solid material, never a
// void/pocket the way Hole(s)/Outline Inside do. No separate
// stock-cap-with-cutout concept applies to Surface (see
// buildStockCapObject's early return below).
//
// Unlike Hole(s)/Outline's bore/wall (which spans the actual cut, top at
// +startZ down to -totalDepth), this block deliberately shows the
// RESULTING shape of the stock after facing, not the cut cavity: its top
// face sits at the new machined surface (-totalDepth, absolute — startZ
// only lengthens the approach from above and never shifts where cutting
// actually ends, so it plays no part in this block's position) and its
// walls extend an arbitrary further feeds.safeZ below that, standing in
// for "the rest of the material the app has no knowledge of" (that value
// was picked over a new constant/setting specifically because it already
// defaults to a visually reasonable few mm — see the /grill-me session
// this followed, 2026-09-12).
function buildSurfacePatternObjects(
  pattern: Extract<ResolvedPattern, { kind: 'surface' }>,
  theme: Theme,
  span: number,
  arrowSize: number,
  showStock: boolean,
  showToolpath: boolean,
): THREE.Object3D[] {
  const { nominalBounds, params } = pattern
  const { surface, feeds } = params
  const objects: THREE.Object3D[] = []

  objects.push(...buildOffsetVectorObjects(surface.offsetX, surface.offsetY, theme, arrowSize))

  if (showToolpath) {
    const corner = surfaceStartCorner(surface)
    objects.push(...rapidZLineObjects(corner.x, corner.y, feeds.safeZ, feeds.startZ, -surface.totalDepth, theme, span))
  }

  if (showStock) {
    const boreHeight = feeds.safeZ
    const boreCenterZ = -surface.totalDepth - feeds.safeZ / 2
    const corners: Point2D[] = [
      { x: nominalBounds.minX, y: nominalBounds.minY },
      { x: nominalBounds.maxX, y: nominalBounds.minY },
      { x: nominalBounds.maxX, y: nominalBounds.maxY },
      { x: nominalBounds.minX, y: nominalBounds.maxY },
    ]
    // closed=true — see the block comment above.
    objects.push(buildRectWallMesh(corners, boreHeight, boreCenterZ, true, theme))
  }

  if (showToolpath) {
    const pathSegments = buildSurfaceToolpathPoints3D(surface, feeds)
    objects.push(...buildToolpathLines3D(pathSegments, theme, span))
  }

  return objects
}

// Open geometry (Inside model, see CLAUDE.md's Pocket design notes) —
// Pocket always removes material from inside a closed boundary, the same
// physical situation as Outline's Inside offset mode, so it reuses that
// exact wall treatment (open cylinder/box, DoubleSide, no cap, side walls
// shaded WALL_SHADE_FACTOR darker than a cap — here there's no cap at all,
// so the shading applies to the only material there is, same as Outline's
// open-wall case). Top sits at Z=0, height exactly totalDepth, same
// Start-Z-independent convention as Hole(s)/Outline (BL-37).
function buildPocketPatternObjects(
  pattern: Extract<ResolvedPattern, { kind: 'pocket' }>,
  theme: Theme,
  span: number,
  arrowSize: number,
  showStock: boolean,
  showToolpath: boolean,
): THREE.Object3D[] {
  const { center, shape, nominalRadius, nominalCorners, params } = pattern
  const { pocket, feeds } = params
  const objects: THREE.Object3D[] = []

  objects.push(...buildOffsetVectorObjects(pocket.offsetX, pocket.offsetY, theme, arrowSize))

  if (showToolpath) {
    const entry = pocketEntryPoint(center.x, center.y, pocket.zTransitionMode, pocket.helixRadius)
    objects.push(...rapidZLineObjects(entry.x, entry.y, feeds.safeZ, feeds.startZ, -pocket.totalDepth, theme, span))
  }

  if (showStock) {
    const boreHeight = pocket.totalDepth
    const boreCenterZ = -pocket.totalDepth / 2
    if (shape === 'circle') {
      const sideColor = new THREE.Color(theme.hole).multiplyScalar(WALL_SHADE_FACTOR)
      const wall = new THREE.Mesh(
        new THREE.CylinderGeometry(nominalRadius, nominalRadius, boreHeight, 32, 1, true),
        new THREE.MeshBasicMaterial({ color: sideColor, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
      )
      wall.position.copy(toThree(center.x, center.y, boreCenterZ))
      objects.push(wall)
    } else {
      objects.push(buildRectWallMesh(nominalCorners, boreHeight, boreCenterZ, false, theme))
    }
  }

  if (showToolpath) {
    objects.push(...buildPocketToolpathObjects3D(pocket, feeds, theme, span))
  }

  return objects
}

function buildPatternObjects(
  pattern: ResolvedPattern,
  theme: Theme,
  span: number,
  arrowSize: number,
  showStock: boolean,
  showToolpath: boolean,
): THREE.Object3D[] {
  switch (pattern.kind) {
    case 'holes':
      return buildHolesPatternObjects(pattern, theme, span, arrowSize, showStock, showToolpath)
    case 'outlineCircle':
      return buildOutlineCirclePatternObjects(pattern, theme, span, arrowSize, showStock, showToolpath)
    case 'outlineRect':
      return buildOutlineRectPatternObjects(pattern, theme, span, arrowSize, showStock, showToolpath)
    case 'surface':
      return buildSurfacePatternObjects(pattern, theme, span, arrowSize, showStock, showToolpath)
    case 'pocket':
      return buildPocketPatternObjects(pattern, theme, span, arrowSize, showStock, showToolpath)
  }
}

function circlePath(cx: number, cy: number, radius: number): THREE.Path {
  const path = new THREE.Path()
  path.absarc(cx, cy, radius, 0, Math.PI * 2, false)
  return path
}

function rectPath(corners: Point2D[]): THREE.Path {
  const path = new THREE.Path()
  path.moveTo(corners[0].x, corners[0].y)
  for (let i = 1; i < corners.length; i++) path.lineTo(corners[i].x, corners[i].y)
  path.closePath()
  return path
}

// The illusory "stock" cap (BL-28) — a flat plate bounded by the same
// visible-grid extent as the material plane/GridHelper, with a hole cut
// where material is actually removed, so the existing bore/wall meshes
// (BL-27) read as "a hole in a plate" instead of a floating wall. Built
// with THREE.Shape + shape.holes (native Three.js tessellation) — not CSG,
// just a flat cap, since the existing wall already provides the "sides".
//
// Scope: Hole(s) always gets one shared cap with N holes (one per drilled
// point). Outline Inside always gets one cap, hole = the nominal boundary
// (matches the existing wall's footprint exactly, no seam at the rim).
// Outline Outside gets no cap — already a closed solid (BL-27), that's the
// whole "stock" on its own. Outline On-line gets one cap too, hole = the
// NEW outer wall's footprint (onLineCircleEdges/onLineRectDimensions,
// same as the wall above) — the inner island's own wall is now fully
// closed, so it already has its own top cap for free, no separate hole
// needed for it here.
//
// Coordinate mapping: THREE.Shape/Path points are consumed as raw CNC
// (x, y) — after rotating the mesh by rotation.x = -Math.PI/2 (the same
// rotation the existing flat material plane below already uses), local
// shape-X becomes world-X and local shape-Y becomes world -Z, which is
// exactly toThree(x, y, 0)'s (x, 0, -y) mapping. No extra transform.
function buildStockCapObject(
  pattern: ResolvedPattern,
  theme: Theme,
  planeSize: number,
  centerCNC: Point2D,
): THREE.Object3D | null {
  // Surface removes material across the whole top area rather than cutting
  // a bounded hole through a plate — the flat "removed material" box built
  // in buildSurfacePatternObjects already IS that visualization, so no
  // separate stock-cap-with-cutout concept applies here.
  if (pattern.kind === 'surface') return null

  // Cap sits at Z=0 (the real material surface) regardless of Start Z
  // (BL-37) — see buildHolesPatternObjects()/buildOutlineCirclePatternObjects()
  // for the same reasoning: Start Z is where the feed-rate descent
  // begins, not a material-height concept.
  let holePaths: THREE.Path[]

  if (pattern.kind === 'holes') {
    holePaths = pattern.points.map((p) => circlePath(p.x, p.y, pattern.holeRadius))
  } else if (pattern.kind === 'pocket') {
    holePaths =
      pattern.shape === 'circle'
        ? [circlePath(pattern.center.x, pattern.center.y, pattern.nominalRadius)]
        : [rectPath(pattern.nominalCorners)]
  } else {
    const { outline } = pattern.params
    if (outline.offsetMode === 'outside') return null

    if (pattern.kind === 'outlineCircle') {
      const radius = outline.offsetMode === 'onLine' ? onLineCircleEdges(outline).outerRadius : pattern.nominalRadius
      holePaths = [circlePath(pattern.center.x, pattern.center.y, radius)]
    } else {
      if (outline.offsetMode === 'onLine' && outline.shape !== 'circle') {
        const { outerWidth, outerHeight } = onLineRectDimensions(outline.width, outline.height, outline.toolDiameter)
        holePaths = [
          rectPath(
            rectCorners(outline.shape, outline.width, outline.height, outerWidth, outerHeight, outline.offsetX, outline.offsetY, 'ccw'),
          ),
        ]
      } else {
        holePaths = [rectPath(pattern.nominalCorners)]
      }
    }
  }

  const half = planeSize / 2
  const outer = new THREE.Shape()
  outer.moveTo(centerCNC.x - half, centerCNC.y - half)
  outer.lineTo(centerCNC.x + half, centerCNC.y - half)
  outer.lineTo(centerCNC.x + half, centerCNC.y + half)
  outer.lineTo(centerCNC.x - half, centerCNC.y + half)
  outer.closePath()
  outer.holes = holePaths

  // Same color/opacity as the wall meshes (theme.hole, 0.3) — not
  // theme.material/materialOpacity as first tried. theme.material equals
  // the scene's own background color, so a semi-transparent plane of "the
  // background color" over the background was barely visible in practice;
  // matching the wall exactly is what actually reads as "this is stock".
  const cap = new THREE.Mesh(
    new THREE.ShapeGeometry(outer),
    new THREE.MeshBasicMaterial({
      color: theme.hole,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      // Same fix as the material plane/grid (0.15.6): without this, the
      // cap — a single large quad spanning the whole visible grid, with a
      // hole cut only exactly at each drilled footprint — wins the depth
      // test against anything behind it at a raking camera angle (where
      // the sightline into a hole crosses the cap plane *outside* the
      // cutout before reaching a deep toolpath point), and then occludes
      // it like a real solid instead of staying a translucent backdrop.
      // Most visible on the hole nearest the camera, where perspective
      // makes that raking angle unavoidable.
      depthWrite: false,
    }),
  )
  cap.renderOrder = -1
  cap.rotation.x = -Math.PI / 2
  cap.position.set(0, SOLID_CAP_Z_LIFT, 0)
  return cap
}

export function buildToolpathScene(
  params: WizardParams,
  isDark: boolean,
  paletteId: PaletteId,
  themeId: ThemeId,
  overlayParams: WizardParams[] = [],
  showActivePattern = true,
  gridLabelsEnabled = true,
  gridLabelSize: Grid3DLabelSize = 'medium',
  showStock = true,
  showToolpath = true,
): BuiltScene {
  const theme = buildTheme(paletteId, isDark, themeId)

  // Overlay patterns first, active pattern last — cosmetically inert in 3D
  // (real depth-tested geometry, add-order doesn't affect occlusion) but
  // kept for consistency with the 2D preview, where draw order matters.
  // While comparing presets, the live pattern is left out entirely
  // (showActivePattern=false) — mixing it in made it hard to tell what was
  // being compared against what.
  const allPatterns = [
    ...overlayParams.map(resolvePattern),
    ...(showActivePattern ? [resolvePattern(params)] : []),
  ]

  const objects: THREE.Object3D[] = []
  const labels: THREE.Sprite[] = []
  const bounds = new THREE.Box3()
  bounds.expandByPoint(toThree(0, 0, 0))

  for (const pattern of allPatterns) {
    expandBoundsForPattern(bounds, pattern)
  }

  const size = new THREE.Vector3()
  bounds.getSize(size)
  // `bounds`/`size`/`span` (origin always forced in) stay exactly as
  // before — still the returned camera-framing bounds AND still what every
  // cosmetic scale factor below (arrow/label/origin-marker sizes,
  // edgeMargin) is proportional to. Fit View's own framing is unaffected
  // by the grid-sizing change below (/grill-me decision, follow-up to
  // BL-31), so nothing that scales relative to it should shrink either.
  const span = Math.max(size.x, size.z, 10)

  // Grid/plane footprint — a SEPARATE box, data-only (no forced origin),
  // padded around the data itself, then extended just enough to reach the
  // origin with zero extra margin on that side. NOT one flat symmetric
  // padding around the origin+data centroid (`bounds` above) — that always
  // bled space into empty quadrants whenever the pattern sat entirely on
  // one side of the origin (reported against an N-Holes-on-Circle pattern
  // sitting wholly in quadrant I). If the origin already falls inside the
  // padded data box (the common case — most patterns sit at or around the
  // origin already), the final expandByPoint is a no-op and this produces
  // essentially the same footprint as before.
  const dataBounds = new THREE.Box3()
  for (const pattern of allPatterns) {
    expandBoundsForPattern(dataBounds, pattern)
  }
  if (dataBounds.isEmpty()) dataBounds.expandByPoint(toThree(0, 0, 0))
  const dataSize = new THREE.Vector3()
  dataBounds.getSize(dataSize)
  const dataSpan = Math.max(dataSize.x, dataSize.z, 10)
  const dataPadding = dataSpan * 0.25
  const gridBounds = dataBounds
    .clone()
    .expandByVector(new THREE.Vector3(dataPadding, 0, dataPadding))
    .expandByPoint(toThree(0, 0, 0))
  const gridBoundsSize = new THREE.Vector3()
  gridBounds.getSize(gridBoundsSize)
  const planeSize = Math.max(gridBoundsSize.x, gridBoundsSize.z, 10)
  const center = new THREE.Vector3()
  gridBounds.getCenter(center)

  // "Nice" grid step (1-2-5-10-20-50... sequence), same helper and same
  // "aim for ~8 divisions across" target as the 2D preview's grid
  // (drawToolpath.ts) — planeSize/2 is the 3D equivalent of 2D's
  // half-visible-width. Snapping the grid/plane's center to a multiple of
  // that step (instead of the raw gridBounds center) means every grid line
  // lands on a real, nameable CNC coordinate (0, 5, 10, ...) instead of an
  // arbitrary offset — a prerequisite for the coordinate labels added
  // below, and a byproduct is the grid stops being purely decorative. The
  // snap shifts the center by at most half a step, imperceptible against
  // the plane's own padding margin. `GridHelper` below is always a square,
  // so whichever of X/Z needs more room to reach its own padded data (and
  // possibly the origin) sets `planeSize` for both — the shorter axis gets
  // symmetric filler around its own (already-correct) center, not around
  // some unrelated point; the longer axis's own edges are unaffected by
  // that filler.
  const gridStep = niceStep(planeSize / 8)
  const gridCenterX = Math.round(center.x / gridStep) * gridStep
  const gridCenterZ = Math.round(center.z / gridStep) * gridStep
  const gridHalfCells = Math.ceil(planeSize / 2 / gridStep)
  const gridSize = gridHalfCells * 2 * gridStep
  const gridDivisions = gridHalfCells * 2

  // Material surface (CNC Z = 0). This plane (and the grid below) is meant
  // purely as a translucent visual reference, never a real occluder — but
  // at 0.6 opacity in dark mode it's opaque enough that Three.js's
  // camera-distance transparent sort could, depending on camera angle and
  // where the pattern's own centroid lands (Offset X/Y shifts it), draw
  // the plane AFTER a transparent pattern mesh sitting behind it (e.g.
  // Surface's stock block, which sits at Z between -totalDepth and
  // -totalDepth-safeZ, below Y=0). Two things had to change together to
  // fully fix this (reported as the stock cleanly vanishing, then —
  // partway fixed — as it alternating darker/lighter by angle):
  // `depthWrite: false` so the plane can never win the depth buffer and
  // erase something behind it outright (depthTest stays on, so it still
  // correctly sits behind genuinely opaque objects like the origin
  // marker); and `renderOrder = -1` so the plane/grid are *always* drawn
  // first regardless of the camera-distance sort, making every pattern
  // mesh drawn after them blend consistently on top instead of the blend
  // order (and thus apparent brightness) flipping with camera angle.
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(gridSize, gridSize),
    new THREE.MeshBasicMaterial({
      color: theme.material,
      transparent: true,
      opacity: theme.materialOpacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  )
  plane.renderOrder = -1
  plane.rotation.x = -Math.PI / 2
  plane.position.set(gridCenterX, 0, gridCenterZ)
  objects.push(plane)

  const grid = new THREE.GridHelper(gridSize, gridDivisions, theme.grid, theme.grid)
  grid.renderOrder = -1
  grid.position.set(gridCenterX, 0.01, gridCenterZ)
  ;(grid.material as THREE.Material).transparent = true
  ;(grid.material as THREE.Material).opacity = 0.4
  ;(grid.material as THREE.Material).depthWrite = false
  objects.push(grid)

  // Illusory stock cap (BL-28) — only for the live/active pattern, never
  // for BL-3 overlay presets (each already shows its own footprint via its
  // own wall; a shared cap across presets with different startZ/geometry
  // has no single obvious answer — deferred per the BL-28 grill-me).
  // allPatterns always pushes the active pattern last when
  // showActivePattern is true (see the array literal above), so this is
  // always exactly resolvePattern(params), never an overlay entry.
  if (showActivePattern && showStock) {
    // Inverse of toThree's CNC->world Z mapping (world.z = -CNC.y), so the
    // cap's outer boundary can be built directly in CNC (x, y) coordinates,
    // matching the grid/plane's own (now step-snapped) center and size.
    const centerCNC: Point2D = { x: gridCenterX, y: -gridCenterZ }
    const cap = buildStockCapObject(allPatterns[allPatterns.length - 1], theme, gridSize, centerCNC)
    if (cap) objects.push(cap)
  }

  // Shared by origin/"X"/"Y" and, further below, every grid tick — one
  // Settings control (Small/Medium/Large) sizes all of them alike.
  const labelPixelHeight = GRID_LABEL_SIZE_PX[gridLabelSize]

  // Origin marker + label
  const origin = new THREE.Mesh(
    new THREE.SphereGeometry(span * 0.01, 12, 12),
    new THREE.MeshBasicMaterial({ color: theme.origin }),
  )
  objects.push(origin)

  const originLabel = createTextSprite('0,0', theme.origin, span * 0.08)
  originLabel.position.set(span * 0.02, span * 0.03, -span * 0.02)
  originLabel.userData.pixelHeight = labelPixelHeight
  objects.push(originLabel)
  labels.push(originLabel)

  // X/Y axes through the machine origin (not the geometry center — origin
  // is the fixed physical reference point, independent of where the holes
  // happen to sit). Each gets an arrowhead + text label at its positive end
  // to show direction, not just orientation.
  //
  // Each arm's length is computed separately, from the origin out to the
  // actual rendered grid edge in that direction (BL-31) — NOT one shared
  // scalar symmetric around the origin. A single symmetric length was only
  // correct when the pattern sat roughly centered on the origin; the
  // grid/plane above already recenters to gridCenterX/gridCenterZ (the
  // pattern's own bounding-box centroid), so e.g. Rectangle Cornered (whole
  // pattern in one quadrant) or a large Offset X/Y made one arm overshoot
  // past the visible grid while the opposite arm fell short of it. Reuses
  // the exact same edge boundaries the grid tick-labels below already
  // compute (gridHalfExtent ± gridCenterX/Z) — same edges, same math,
  // shared instead of duplicated. `Math.max(0, ...)` clamps an arm to zero
  // rather than negative if the origin sits entirely past that edge (grid
  // doesn't span across it at all in that direction).
  const gridHalfExtent = gridHalfCells * gridStep
  const minTickX = gridCenterX - gridHalfExtent
  const maxTickX = gridCenterX + gridHalfExtent
  const minTickY = -gridCenterZ - gridHalfExtent
  const maxTickY = -gridCenterZ + gridHalfExtent
  const xArmPos = Math.max(0, maxTickX) // +X, world X unchanged by toThree()
  const xArmNeg = Math.max(0, -minTickX) // -X
  const yArmPos = Math.max(0, maxTickY) // +Y (CNC), maps to world -Z
  const yArmNeg = Math.max(0, -minTickY) // -Y (CNC)
  const arrowSize = span * 0.05

  const xAxisGeometry = new THREE.BufferGeometry().setFromPoints([
    toThree(-xArmNeg, 0, 0),
    toThree(xArmPos, 0, 0),
  ])
  objects.push(new THREE.Line(xAxisGeometry, new THREE.LineBasicMaterial({ color: theme.axisX })))
  objects.push(
    createArrowhead(theme.axisX, arrowSize, toThree(xArmPos, 0, 0), new THREE.Vector3(1, 0, 0)),
  )
  const xLabel = createTextSprite('X', theme.axisX, span * 0.09)
  xLabel.position.copy(toThree(xArmPos + arrowSize * 1.5, 0, 0))
  xLabel.userData.pixelHeight = labelPixelHeight
  objects.push(xLabel)
  labels.push(xLabel)

  const yAxisGeometry = new THREE.BufferGeometry().setFromPoints([
    toThree(0, -yArmNeg, 0),
    toThree(0, yArmPos, 0),
  ])
  objects.push(new THREE.Line(yAxisGeometry, new THREE.LineBasicMaterial({ color: theme.axisY })))
  objects.push(
    createArrowhead(theme.axisY, arrowSize, toThree(0, yArmPos, 0), new THREE.Vector3(0, 0, -1)),
  )
  const yLabel = createTextSprite('Y', theme.axisY, span * 0.09)
  yLabel.position.copy(toThree(0, yArmPos + arrowSize * 1.5, 0))
  yLabel.userData.pixelHeight = labelPixelHeight
  objects.push(yLabel)
  labels.push(yLabel)

  // Grid coordinate-number labels, one ruler-style border per axis run
  // around all four edges of the grid square — mirrors drawToolpath.ts's
  // 2D grid labels (same niceStep() sequence), but placed just outside the
  // plane/grid footprint rather than on the axis lines themselves.
  // Duplicated on both opposite edges per axis (not just one side, like
  // 2D's bottom/left) because the 3D camera orbits freely — whichever edge
  // currently faces the camera should carry readable numbers. In
  // theme.text (a muted, non-axis color) so they read as secondary
  // reference numbers, though now the same configurable size as origin/
  // "X"/"Y" (labelPixelHeight above). Ranges come from the step-snapped
  // grid built above, so every label centers on a real grid line —
  // including the tick at zero: this border is a complete ruler in its
  // own right, not assumed to be covered by the origin's separate "0,0"
  // label (which sits inside the plane, not on this border, and may not
  // even be in view for a pattern offset far from the origin).
  // User-configurable via Settings > Appearance > Grid Labels
  // (gridLabelsEnabled) — skipped entirely, not just hidden, when
  // disabled; origin/"X"/"Y" above are unaffected by that checkbox.
  if (gridLabelsEnabled) {
    const tickLabelSize = span * 0.045
    const edgeMargin = span * 0.06
    const tickLiftY = span * 0.02

    // X ticks: the coordinate along the line (x) is unchanged; only the
    // cross-axis position (world Z) moves, to just outside the grid's near
    // and far edges. gridHalfExtent/minTickX/maxTickX are computed above,
    // shared with the axis-arm-length math (BL-31).
    const tickStartX = Math.ceil(minTickX / gridStep) * gridStep
    for (let x = tickStartX; x <= maxTickX; x += gridStep) {
      const label = String(Math.round(x))
      for (const z of [
        gridCenterZ - gridHalfExtent - edgeMargin,
        gridCenterZ + gridHalfExtent + edgeMargin,
      ]) {
        const tick = createTextSprite(label, theme.text, tickLabelSize)
        tick.position.set(x, tickLiftY, z)
        tick.userData.pixelHeight = labelPixelHeight
        objects.push(tick)
        labels.push(tick)
      }
    }

    // CNC-Y ticks run along world -Z (toThree(0, y, 0) → (0, 0, -y)) — see
    // the mapping note on toThree() above. Cross-axis position (world X)
    // moves to just outside the grid's left and right edges. minTickY/
    // maxTickY are computed above, shared with the axis-arm-length math
    // (BL-31).
    const tickStartY = Math.ceil(minTickY / gridStep) * gridStep
    for (let y = tickStartY; y <= maxTickY; y += gridStep) {
      const label = String(Math.round(y))
      for (const x of [
        gridCenterX - gridHalfExtent - edgeMargin,
        gridCenterX + gridHalfExtent + edgeMargin,
      ]) {
        const tick = createTextSprite(label, theme.text, tickLabelSize)
        tick.position.set(x, tickLiftY, -y)
        tick.userData.pixelHeight = labelPixelHeight
        objects.push(tick)
        labels.push(tick)
      }
    }
  }

  for (const pattern of allPatterns) {
    objects.push(...buildPatternObjects(pattern, theme, span, arrowSize, showStock, showToolpath))
  }

  return { objects, labels, bounds, background: theme.material }
}

export function disposeObject3D(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
      child.geometry.dispose()
      const material = child.material
      if (Array.isArray(material)) material.forEach((m) => m.dispose())
      else material.dispose()
    } else if (child instanceof THREE.Sprite) {
      child.material.map?.dispose()
      child.material.dispose()
    }
  })
}
