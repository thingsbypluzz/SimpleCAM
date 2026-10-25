import * as THREE from 'three'
import { SIM_KINDS, type Simulation, type SimulationPosition } from '../../lib/simulation'
import type { SimTool } from '../simulation/simTool'
import { MOVE_STYLE, toolpathLineMaterial, toThree, type Theme, type ToolpathLineStyle } from './buildScene'

// BL-100: what Simulate adds to the 3D scene — the live pattern's toolpath
// split at the tool into the stretch already travelled (dimmed) and the
// one still ahead (the usual color), and the tool itself. Built once per
// timeline; every frame only moves the split (draw ranges) and the tool.

// How much of the toolpath color a travelled stretch keeps; the rest is
// the background — the look of 30% opacity without transparent lines.
export const SIM_DONE_COLOR_SHARE = 0.3
const TOOL_OPACITY = 0.45

const STYLES: ToolpathLineStyle[] = ['solid', 'dashed', 'dotted', 'linking']

interface StyleLines {
  // Global segment indices of this style, ascending.
  segments: Int32Array
  done: THREE.LineSegments
  ahead: THREE.LineSegments
  // The current segment split at the tool.
  donePart: THREE.LineSegments
  aheadPart: THREE.LineSegments
}

export interface SimulationScene {
  group: THREE.Group
  lines: THREE.Group
  update: (position: SimulationPosition) => void
}

function dimmed(material: THREE.Material, background: number): THREE.Material {
  const m = material.clone() as THREE.LineBasicMaterial
  m.color = m.color.clone().lerp(new THREE.Color(background), 1 - SIM_DONE_COLOR_SHARE)
  return m
}

// Two-vertex line for the split segment; positions rewritten every frame.
function partLine(material: THREE.Material): THREE.LineSegments {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
  geometry.setAttribute('lineDistance', new THREE.BufferAttribute(new Float32Array(2), 1))
  const line = new THREE.LineSegments(geometry, material)
  line.frustumCulled = false
  line.visible = false
  return line
}

function buildToolMesh(tool: SimTool, color: number): THREE.Group {
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: TOOL_OPACITY, depthWrite: false })
  const group = new THREE.Group()
  // Three's Y is CNC Z (toThree()): every part stands up from the tip.
  if (tool.coneHeight > 0) {
    const cone = new THREE.ConeGeometry(tool.radius, tool.coneHeight, 32, 1, true)
    cone.rotateX(Math.PI)
    cone.translate(0, tool.coneHeight / 2, 0)
    group.add(new THREE.Mesh(cone, material))
  }
  const bodyLength = tool.length - tool.coneHeight
  if (bodyLength > 0) {
    const body = new THREE.CylinderGeometry(tool.radius, tool.radius, bodyLength, 32)
    body.translate(0, tool.coneHeight + bodyLength / 2, 0)
    group.add(new THREE.Mesh(body, material))
  }
  const shank = new THREE.CylinderGeometry(tool.shankRadius, tool.shankRadius, tool.shankLength, 24)
  shank.translate(0, tool.length + tool.shankLength / 2, 0)
  group.add(new THREE.Mesh(shank, material))
  group.renderOrder = 10
  return group
}

export function buildSimulationScene(sim: Simulation, tool: SimTool, theme: Theme, span: number): SimulationScene {
  const group = new THREE.Group()
  const lines = new THREE.Group()
  group.add(lines)
  const { points, kinds } = sim
  const segmentCount = kinds.length

  // Distance along the whole path at each vertex — the dash pattern runs
  // on across segments instead of starting over at every one.
  const along = new Float32Array(segmentCount + 1)
  for (let i = 0; i < segmentCount; i++) {
    const a = i * 3
    along[i + 1] =
      along[i] + Math.hypot(points[a + 3] - points[a], points[a + 4] - points[a + 1], points[a + 5] - points[a + 2])
  }

  const styleOf = (segment: number) => MOVE_STYLE[SIM_KINDS[kinds[segment]]]
  const vertex = (i: number) => toThree(points[i * 3], points[i * 3 + 1], points[i * 3 + 2])

  const byStyle = new Map<ToolpathLineStyle, StyleLines>()
  for (const style of STYLES) {
    let count = 0
    for (let i = 0; i < segmentCount; i++) if (styleOf(i) === style) count++
    if (count === 0) continue
    const segments = new Int32Array(count)
    const position = new Float32Array(count * 6)
    const distance = new Float32Array(count * 2)
    let k = 0
    for (let i = 0; i < segmentCount; i++) {
      if (styleOf(i) !== style) continue
      segments[k] = i
      const a = vertex(i)
      const b = vertex(i + 1)
      position.set([a.x, a.y, a.z, b.x, b.y, b.z], k * 6)
      distance[k * 2] = along[i]
      distance[k * 2 + 1] = along[i + 1]
      k++
    }
    const positionAttr = new THREE.BufferAttribute(position, 3)
    const distanceAttr = new THREE.BufferAttribute(distance, 1)
    const geometryFor = () => {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', positionAttr)
      geometry.setAttribute('lineDistance', distanceAttr)
      return geometry
    }
    const material = toolpathLineMaterial(style, theme, span)
    const doneMaterial = dimmed(material, theme.material)
    const entry: StyleLines = {
      segments,
      done: new THREE.LineSegments(geometryFor(), doneMaterial),
      ahead: new THREE.LineSegments(geometryFor(), material),
      donePart: partLine(doneMaterial),
      aheadPart: partLine(material),
    }
    lines.add(entry.done, entry.ahead, entry.donePart, entry.aheadPart)
    byStyle.set(style, entry)
  }

  const toolMesh = buildToolMesh(tool, theme.toolpath)
  group.add(toolMesh)

  // How many of `segments` come before global segment `i`.
  const countBefore = (segments: Int32Array, i: number) => {
    let lo = 0
    let hi = segments.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (segments[mid] < i) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  const setPart = (line: THREE.LineSegments, from: THREE.Vector3, to: THREE.Vector3, fromAlong: number, toAlong: number) => {
    const position = line.geometry.getAttribute('position') as THREE.BufferAttribute
    position.setXYZ(0, from.x, from.y, from.z)
    position.setXYZ(1, to.x, to.y, to.z)
    position.needsUpdate = true
    const distance = line.geometry.getAttribute('lineDistance') as THREE.BufferAttribute
    distance.setX(0, fromAlong)
    distance.setX(1, toAlong)
    distance.needsUpdate = true
    line.visible = true
  }

  const update = ({ segment, point }: SimulationPosition) => {
    const tip = toThree(point.x, point.y, point.z)
    toolMesh.position.copy(tip)
    if (segmentCount === 0) return
    const currentStyle = styleOf(segment)
    for (const [style, entry] of byStyle) {
      const before = countBefore(entry.segments, segment)
      const isCurrent = style === currentStyle
      entry.done.geometry.setDrawRange(0, before * 2)
      entry.ahead.geometry.setDrawRange((before + (isCurrent ? 1 : 0)) * 2, Infinity)
      entry.donePart.visible = false
      entry.aheadPart.visible = false
      if (isCurrent) {
        const a = vertex(segment)
        const b = vertex(segment + 1)
        const length = a.distanceTo(b)
        const at = along[segment] + (length > 0 ? a.distanceTo(tip) : 0)
        setPart(entry.donePart, a, tip, along[segment], at)
        setPart(entry.aheadPart, tip, b, at, along[segment + 1])
      }
    }
  }

  return { group, lines, update }
}
