import * as THREE from 'three'
import { getFixedColors, getPaletteAccents, hexToThreeColor, type PaletteId } from '../../config/palettes'
import { resolvePoints } from '../../lib/positioning'
import { computeDepthPasses } from '../../lib/depthPasses'
import { computeTabRanges, type TabRange } from '../../lib/tabs'
import type { WizardParams } from '../../types/wizard'

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
// pass" point before sweeping.
function tabbedCirclePoints3D(
  cx: number,
  cy: number,
  radius: number,
  cutZ: number,
  liftZ: number,
  tabRanges: TabRange[],
): THREE.Vector3[] {
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
    const x = cx + radius * Math.cos(angle)
    const y = cy + radius * Math.sin(angle)

    if (nextInTab && !inTab) {
      points.push(toThree(prevX, prevY, liftZ))
      points.push(toThree(x, y, liftZ))
    } else if (!nextInTab && inTab) {
      points.push(toThree(x, y, liftZ))
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
function helixPoints3D(
  cx: number,
  cy: number,
  radius: number,
  totalDepth: number,
  stepdown: number,
  startZ: number,
  tabs: TabsConfig3D | null,
) {
  const points: THREE.Vector3[] = [toThree(cx + radius, cy, startZ)]
  let currentZ = startZ

  if (tabs) {
    const tabBandTopZ = -(totalDepth - tabs.tabHeight)
    const spiralDepth = totalDepth + startZ - tabs.tabHeight
    let angle = 0

    for (const turnDepth of computeDepthPasses(spiralDepth, stepdown)) {
      for (let i = 1; i <= SEGMENTS_PER_TURN; i++) {
        const a = angle + (2 * Math.PI * i) / SEGMENTS_PER_TURN
        const z = currentZ - (turnDepth * i) / SEGMENTS_PER_TURN
        points.push(toThree(cx + radius * Math.cos(a), cy + radius * Math.sin(a), z))
      }
      angle += 2 * Math.PI
      currentZ -= turnDepth
    }

    // Square off the helical ledge the spiral leaves behind at the tab-band
    // top before descending into the tabbed passes — mirrors the fix in
    // helix.ts (see its comment for the full explanation).
    for (let i = 1; i <= SEGMENTS_PER_TURN; i++) {
      const a = (2 * Math.PI * i) / SEGMENTS_PER_TURN
      points.push(toThree(cx + radius * Math.cos(a), cy + radius * Math.sin(a), currentZ))
    }

    for (const passDepth of computeDepthPasses(tabs.tabHeight, stepdown)) {
      currentZ -= passDepth
      points.push(toThree(cx + radius, cy, currentZ))
      points.push(...tabbedCirclePoints3D(cx, cy, radius, currentZ, tabBandTopZ, tabs.tabRanges))
    }

    return points
  }

  let angle = 0
  for (const turnDepth of computeDepthPasses(totalDepth + startZ, stepdown)) {
    for (let i = 1; i <= SEGMENTS_PER_TURN; i++) {
      const a = angle + (2 * Math.PI * i) / SEGMENTS_PER_TURN
      const z = currentZ - (turnDepth * i) / SEGMENTS_PER_TURN
      points.push(toThree(cx + radius * Math.cos(a), cy + radius * Math.sin(a), z))
    }
    angle += 2 * Math.PI
    currentZ -= turnDepth
  }

  for (let i = 1; i <= SEGMENTS_PER_TURN; i++) {
    const a = angle + (2 * Math.PI * i) / SEGMENTS_PER_TURN
    points.push(toThree(cx + radius * Math.cos(a), cy + radius * Math.sin(a), currentZ))
  }
  return points
}

// Mirrors src/lib/standardHole.ts. `tabs`: when set (BL-14), passes at or
// below the tab-band top skip the tab arcs — an atomic per-pass choice,
// same as the engine, since every pass here is already flat.
function standardHolePoints3D(
  cx: number,
  cy: number,
  radius: number,
  totalDepth: number,
  stepdown: number,
  startZ: number,
  tabs: TabsConfig3D | null,
) {
  const points: THREE.Vector3[] = [toThree(cx + radius, cy, startZ)]
  let currentZ = startZ
  const tabBandTopZ = tabs ? -(totalDepth - tabs.tabHeight) : 0

  for (const passDepth of computeDepthPasses(totalDepth + startZ, stepdown)) {
    currentZ -= passDepth
    points.push(toThree(cx + radius, cy, currentZ))
    if (tabs && currentZ <= tabBandTopZ + TAB_BAND_EPSILON) {
      points.push(...tabbedCirclePoints3D(cx, cy, radius, currentZ, tabBandTopZ, tabs.tabRanges))
    } else {
      for (let i = 1; i <= SEGMENTS_PER_TURN; i++) {
        const a = (2 * Math.PI * i) / SEGMENTS_PER_TURN
        points.push(toThree(cx + radius * Math.cos(a), cy + radius * Math.sin(a), currentZ))
      }
    }
  }
  return points
}

interface Theme {
  material: number
  materialOpacity: number
  grid: number
  toolpath: number
  rapid: number
  origin: number
  hole: number
  axisX: number
  axisY: number
  offset: number
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
function buildTheme(paletteId: PaletteId, isDark: boolean): Theme {
  const fixed = getFixedColors(isDark)
  const accents = getPaletteAccents(paletteId, isDark)
  return {
    material: hexToThreeColor(accents.background),
    materialOpacity: isDark ? MATERIAL_OPACITY_DARK : MATERIAL_OPACITY_LIGHT,
    grid: hexToThreeColor(accents.grid),
    toolpath: hexToThreeColor(accents.toolpath),
    rapid: hexToThreeColor(accents.rapid),
    origin: hexToThreeColor(fixed.origin),
    hole: hexToThreeColor(accents.hole),
    axisX: hexToThreeColor(fixed.axisX),
    axisY: hexToThreeColor(fixed.axisY),
    offset: hexToThreeColor(fixed.offset),
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
  ctx.fillText(text, 4, 34)

  const texture = new THREE.CanvasTexture(canvas)
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(size, size / 2, 1)
  return sprite
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
}

interface ResolvedPattern {
  params: WizardParams
  points: { x: number; y: number }[]
  holeRadius: number
  toolRadius: number
}

function resolvePattern(params: WizardParams): ResolvedPattern {
  const { geometry } = params
  const points = resolvePoints(geometry)
  const holeRadius = geometry.holeDiameter / 2
  // Guarded against a tool larger than the hole (allowed until Etap 5
  // validation covers every entry point) — CylinderGeometry with a
  // negative radius throws.
  const toolRadius = Math.max(0, (geometry.holeDiameter - geometry.toolDiameter) / 2)
  return { params, points, holeRadius, toolRadius }
}

// Expands `bounds` (in place, matching THREE.Box3's mutable API already used
// throughout this file) to include one pattern's footprint — using THAT
// pattern's own totalDepth/safeZ, since overlaid presets (BL-3) can have a
// different depth/Safe Z than the active one.
function expandBoundsForPattern(bounds: THREE.Box3, pattern: ResolvedPattern) {
  const { geometry, feeds } = pattern.params
  for (const p of pattern.points) {
    bounds.expandByPoint(toThree(p.x - pattern.holeRadius, p.y - pattern.holeRadius, -geometry.totalDepth))
    bounds.expandByPoint(toThree(p.x + pattern.holeRadius, p.y + pattern.holeRadius, feeds.safeZ))
  }
}

// Builds everything that's per-pattern (BL-3 overlay): offset vector, rapid
// XY traverse, and per-hole rapid-Z lines + bore cylinder + toolpath line.
// The material plane/grid/origin/axes are NOT per-pattern — built once by
// the caller from the combined bounds.
function buildPatternObjects(
  pattern: ResolvedPattern,
  theme: Theme,
  span: number,
  arrowSize: number,
): THREE.Object3D[] {
  const { points, holeRadius, toolRadius, params } = pattern
  const { geometry, feeds, method } = params
  const objects: THREE.Object3D[] = []

  const tabsConfig: TabsConfig3D | null = geometry.tabsEnabled
    ? { tabHeight: geometry.tabHeight, tabRanges: computeTabRanges(geometry.tabCount, geometry.tabWidth, toolRadius) }
    : null

  // Offset vector — amber, physical origin to the shifted pattern. Hidden
  // entirely at (0,0), same rule as the collapsed Step 2 summary annotation.
  if (geometry.offsetX !== 0 || geometry.offsetY !== 0) {
    const offsetTip = toThree(geometry.offsetX, geometry.offsetY, 0)
    const offsetDir = offsetTip.clone().normalize()
    objects.push(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([toThree(0, 0, 0), offsetTip]),
        new THREE.LineBasicMaterial({ color: theme.offset }),
      ),
    )
    objects.push(createArrowhead(theme.offset, arrowSize, offsetTip, offsetDir))
  }

  // Rapid traverse between holes, at Safe Z
  if (points.length > 1) {
    const rapidPoints = points.map((p) => toThree(p.x, p.y, feeds.safeZ))
    const rapidGeometry = new THREE.BufferGeometry().setFromPoints(rapidPoints)
    const rapidLine = new THREE.Line(
      rapidGeometry,
      new THREE.LineDashedMaterial({ color: theme.rapid, dashSize: span * 0.02, gapSize: span * 0.01 }),
    )
    rapidLine.computeLineDistances()
    objects.push(rapidLine)
  }

  const rapidZMaterial = () =>
    new THREE.LineDashedMaterial({ color: theme.rapid, dashSize: span * 0.02, gapSize: span * 0.01 })

  for (const p of points) {
    const startX = p.x + toolRadius

    // Rapid Z moves around each hole: descend from Safe Z to the top of the
    // cut (Z0, or +startZ when the material is treated as taller), then
    // retract from full depth back to Safe Z (the actual "G0 Z5"-style moves
    // the engine emits) — previously only the lateral travel between holes
    // was drawn, not these.
    const descentLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        toThree(startX, p.y, feeds.safeZ),
        toThree(startX, p.y, feeds.startZ),
      ]),
      rapidZMaterial(),
    )
    descentLine.computeLineDistances()
    objects.push(descentLine)

    const retractLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        toThree(startX, p.y, -geometry.totalDepth),
        toThree(startX, p.y, feeds.safeZ),
      ]),
      rapidZMaterial(),
    )
    retractLine.computeLineDistances()
    objects.push(retractLine)

    // Final bore (semi-transparent cylinder, top at +startZ down to
    // -totalDepth — startZ treats the material as taller by that amount).
    const boreHeight = geometry.totalDepth + feeds.startZ
    const hole = new THREE.Mesh(
      new THREE.CylinderGeometry(holeRadius, holeRadius, boreHeight, 32, 1, true),
      new THREE.MeshBasicMaterial({
        color: theme.hole,
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide,
      }),
    )
    hole.position.copy(toThree(p.x, p.y, (feeds.startZ - geometry.totalDepth) / 2))
    objects.push(hole)

    // Actual tool-center toolpath
    const pathPoints =
      method === 'helix'
        ? helixPoints3D(p.x, p.y, toolRadius, geometry.totalDepth, feeds.stepdown, feeds.startZ, tabsConfig)
        : standardHolePoints3D(p.x, p.y, toolRadius, geometry.totalDepth, feeds.stepdown, feeds.startZ, tabsConfig)
    const pathGeometry = new THREE.BufferGeometry().setFromPoints(pathPoints)
    const pathLine = new THREE.Line(pathGeometry, new THREE.LineBasicMaterial({ color: theme.toolpath }))
    objects.push(pathLine)
  }

  return objects
}

export function buildToolpathScene(
  params: WizardParams,
  isDark: boolean,
  paletteId: PaletteId,
  overlayParams: WizardParams[] = [],
  showActivePattern = true,
): BuiltScene {
  const theme = buildTheme(paletteId, isDark)

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
  const bounds = new THREE.Box3()
  bounds.expandByPoint(toThree(0, 0, 0))

  for (const pattern of allPatterns) {
    expandBoundsForPattern(bounds, pattern)
  }

  const size = new THREE.Vector3()
  bounds.getSize(size)
  const span = Math.max(size.x, size.z, 10)
  const padding = span * 0.25
  const planeSize = span + padding * 2

  // Material surface (CNC Z = 0)
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(planeSize, planeSize),
    new THREE.MeshBasicMaterial({
      color: theme.material,
      transparent: true,
      opacity: theme.materialOpacity,
      side: THREE.DoubleSide,
    }),
  )
  plane.rotation.x = -Math.PI / 2
  const center = new THREE.Vector3()
  bounds.getCenter(center)
  plane.position.set(center.x, 0, center.z)
  objects.push(plane)

  const grid = new THREE.GridHelper(planeSize, 10, theme.grid, theme.grid)
  grid.position.set(center.x, 0.01, center.z)
  ;(grid.material as THREE.Material).transparent = true
  ;(grid.material as THREE.Material).opacity = 0.4
  objects.push(grid)

  // Origin marker + label
  const origin = new THREE.Mesh(
    new THREE.SphereGeometry(span * 0.01, 12, 12),
    new THREE.MeshBasicMaterial({ color: theme.origin }),
  )
  objects.push(origin)

  const originLabel = createTextSprite('0,0', theme.origin, span * 0.08)
  originLabel.position.set(span * 0.02, span * 0.03, -span * 0.02)
  objects.push(originLabel)

  // X/Y axes through the machine origin (not the geometry center — origin
  // is the fixed physical reference point, independent of where the holes
  // happen to sit). Each gets an arrowhead + text label at its positive end
  // to show direction, not just orientation.
  const axisLength = planeSize * 0.55
  const arrowSize = span * 0.05

  const xAxisGeometry = new THREE.BufferGeometry().setFromPoints([
    toThree(-axisLength, 0, 0),
    toThree(axisLength, 0, 0),
  ])
  objects.push(new THREE.Line(xAxisGeometry, new THREE.LineBasicMaterial({ color: theme.axisX })))
  objects.push(
    createArrowhead(theme.axisX, arrowSize, toThree(axisLength, 0, 0), new THREE.Vector3(1, 0, 0)),
  )
  const xLabel = createTextSprite('X', theme.axisX, span * 0.09)
  xLabel.position.copy(toThree(axisLength + arrowSize * 1.5, 0, 0))
  objects.push(xLabel)

  const yAxisGeometry = new THREE.BufferGeometry().setFromPoints([
    toThree(0, -axisLength, 0),
    toThree(0, axisLength, 0),
  ])
  objects.push(new THREE.Line(yAxisGeometry, new THREE.LineBasicMaterial({ color: theme.axisY })))
  objects.push(
    createArrowhead(theme.axisY, arrowSize, toThree(0, axisLength, 0), new THREE.Vector3(0, 0, -1)),
  )
  const yLabel = createTextSprite('Y', theme.axisY, span * 0.09)
  yLabel.position.copy(toThree(0, axisLength + arrowSize * 1.5, 0))
  objects.push(yLabel)

  for (const pattern of allPatterns) {
    objects.push(...buildPatternObjects(pattern, theme, span, arrowSize))
  }

  return { objects, bounds }
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
