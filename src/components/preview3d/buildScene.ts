import * as THREE from 'three'
import { resolvePoints } from '../../lib/positioning'
import { computeDepthPasses } from '../../lib/depthPasses'
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

// Mirrors the descent loop in src/lib/helix.ts, but emits Vector3 samples
// instead of G-code lines — kept separate from the engine on purpose, since
// entangling tested G-code text generation with rendering-only geometry
// isn't worth it for a ~10-line loop. Shares `computeDepthPasses()` though,
// since that's where the actual infinite-loop guard (stepdown <= 0) lives.
function helixPoints3D(
  cx: number,
  cy: number,
  radius: number,
  totalDepth: number,
  stepdown: number,
  startZ: number,
) {
  const points: THREE.Vector3[] = [toThree(cx + radius, cy, startZ)]
  let currentZ = startZ
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

// Mirrors src/lib/standardHole.ts.
function standardHolePoints3D(
  cx: number,
  cy: number,
  radius: number,
  totalDepth: number,
  stepdown: number,
  startZ: number,
) {
  const points: THREE.Vector3[] = [toThree(cx + radius, cy, startZ)]
  let currentZ = startZ

  for (const passDepth of computeDepthPasses(totalDepth + startZ, stepdown)) {
    currentZ -= passDepth
    points.push(toThree(cx + radius, cy, currentZ))
    for (let i = 1; i <= SEGMENTS_PER_TURN; i++) {
      const a = (2 * Math.PI * i) / SEGMENTS_PER_TURN
      points.push(toThree(cx + radius * Math.cos(a), cy + radius * Math.sin(a), currentZ))
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

const LIGHT_THEME: Theme = {
  material: 0xe2e8f0,
  materialOpacity: 0.5,
  grid: 0x94a3b8,
  toolpath: 0x16a34a,
  rapid: 0x94a3b8,
  origin: 0x4f46e5,
  hole: 0x64748b,
  axisX: 0xdc2626,
  axisY: 0x16a34a,
  offset: 0xd97706,
}

const DARK_THEME: Theme = {
  material: 0x1e293b,
  materialOpacity: 0.6,
  grid: 0x475569,
  toolpath: 0x4ade80,
  rapid: 0x64748b,
  origin: 0x818cf8,
  hole: 0x94a3b8,
  axisX: 0xf87171,
  axisY: 0x4ade80,
  offset: 0xfbbf24,
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

export function buildToolpathScene(params: WizardParams, isDark: boolean): BuiltScene {
  const theme = isDark ? DARK_THEME : LIGHT_THEME
  const { geometry, feeds, method } = params
  const points = resolvePoints(geometry)
  const holeRadius = geometry.holeDiameter / 2
  // Guarded against a tool larger than the hole (allowed until Etap 5
  // validation covers every entry point) — CylinderGeometry with a
  // negative radius throws.
  const toolRadius = Math.max(0, (geometry.holeDiameter - geometry.toolDiameter) / 2)

  const objects: THREE.Object3D[] = []
  const bounds = new THREE.Box3()
  bounds.expandByPoint(toThree(0, 0, 0))

  for (const p of points) {
    bounds.expandByPoint(toThree(p.x - holeRadius, p.y - holeRadius, -geometry.totalDepth))
    bounds.expandByPoint(toThree(p.x + holeRadius, p.y + holeRadius, feeds.safeZ))
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
        ? helixPoints3D(p.x, p.y, toolRadius, geometry.totalDepth, feeds.stepdown, feeds.startZ)
        : standardHolePoints3D(p.x, p.y, toolRadius, geometry.totalDepth, feeds.stepdown, feeds.startZ)
    const pathGeometry = new THREE.BufferGeometry().setFromPoints(pathPoints)
    const pathLine = new THREE.Line(pathGeometry, new THREE.LineBasicMaterial({ color: theme.toolpath }))
    objects.push(pathLine)
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
