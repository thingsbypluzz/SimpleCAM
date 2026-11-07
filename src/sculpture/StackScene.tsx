import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { type Piece, type Region, type Ring, difference } from './geometry'
import { token } from './holeColors'
import { type Hole, holeState } from './holes'
import type { Layer } from './layers'
import type { Mesh } from './mesh'
import type { SculptureParams } from './params'
import type { Spacer } from './spacers'

export type StackMode = 'stack' | 'single'

interface StackSceneProps {
  mesh: Mesh | null
  layers: Layer[]
  holes: Hole[]
  spacers: Spacer[]
  params: SculptureParams
  selected: number
  mode: StackMode
  showModel: boolean
  showRods: boolean
  // The hub, its bridges and hub spacers; off shows the sculpture alone.
  showHub: boolean
  isDark: boolean
}

function toPath(ring: Ring, path: THREE.Path) {
  ring.forEach((p, i) => (i === 0 ? path.moveTo(p.x, p.y) : path.lineTo(p.x, p.y)))
  path.closePath()
}

function pieceShape(piece: Piece): THREE.Shape {
  const shape = new THREE.Shape()
  toPath(piece.outer, shape)
  for (const hole of piece.holes) {
    const path = new THREE.Path()
    toPath(hole, path)
    shape.holes.push(path)
  }
  return shape
}

function circle(hole: Hole, radius: number): Piece {
  const outer: Ring = []
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * 2 * Math.PI
    outer.push({ x: hole.x + radius * Math.cos(a), y: hole.y + radius * Math.sin(a) })
  }
  return { outer, holes: [] }
}

function layerGeometry(layer: Layer, region: Region, holes: Hole[], params: SculptureParams): THREE.BufferGeometry | null {
  // A conflicting hole is left out of this layer's own holes file.
  const drilled = holes.filter((h) => holeState(layer, h, params) !== 'conflict')
  const cut = difference(region, drilled.map((h) => circle(h, params.holeDiameter / 2)))
  if (cut.length === 0) return null
  const geometry = new THREE.ExtrudeGeometry(cut.map(pieceShape), {
    depth: params.thickness,
    bevelEnabled: false,
    curveSegments: 1,
  })
  geometry.translate(0, 0, layer.zBottom)
  return geometry
}

// How far a drawn rod sticks out past its first and last layer.
const ROD_PROTRUSION = 10

// The heights a hole's rod spans: one stretch per unbroken run of layers it
// holds. A rod through the whole stack is one run; an arm's is only the arm.
function mountRuns(hole: Hole, layers: Layer[], params: SculptureParams): [number, number][] {
  const runs: [number, number][] = []
  let open = false
  for (const layer of layers) {
    const top = layer.zBottom + params.thickness
    const held = holeState(layer, hole, params) === 'mount'
    if (held && open) runs[runs.length - 1][1] = top
    else if (held) runs.push([layer.zBottom, top])
    open = held
  }
  return runs
}

function disposeGroup(group: THREE.Group) {
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose()
      const material = object.material as THREE.Material | THREE.Material[]
      if (Array.isArray(material)) material.forEach((m) => m.dispose())
      else material.dispose()
    }
  })
  group.clear()
}

// The stack as it will stand: every layer as a solid plate at its real height.
export function StackScene({ mesh, layers, holes, spacers, params, selected, mode, showModel, showRods, showHub, isDark }: StackSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<{
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    controls: OrbitControls
    renderer: THREE.WebGLRenderer
    content: THREE.Group
    fittedTo: string
  } | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    host.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    scene.add(new THREE.AmbientLight(0xffffff, 0.9))
    const key = new THREE.DirectionalLight(0xffffff, 2)
    key.position.set(1, -1.5, 2)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xffffff, 0.6)
    fill.position.set(-1.5, 1, 0.5)
    scene.add(fill)
    const camera = new THREE.PerspectiveCamera(35, 1, 1, 20000)
    camera.up.set(0, 0, 1)
    const controls = new OrbitControls(camera, renderer.domElement)
    const content = new THREE.Group()
    scene.add(content)
    sceneRef.current = { scene, camera, controls, renderer, content, fittedTo: '' }

    let frame = 0
    const loop = () => {
      frame = requestAnimationFrame(loop)
      controls.update()
      renderer.render(scene, camera)
    }
    loop()
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host
      if (w === 0 || h === 0) return
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.dispose()
      disposeGroup(content)
      renderer.dispose()
      renderer.domElement.remove()
      sceneRef.current = null
    }
  }, [])

  useEffect(() => {
    const view = sceneRef.current
    if (view) view.scene.background = new THREE.Color(token('--code-bg'))
  }, [isDark])

  useEffect(() => {
    const view = sceneRef.current
    if (!view) return
    disposeGroup(view.content)
    const wood = new THREE.MeshStandardMaterial({ color: 0xc8a97e, roughness: 0.85 })
    const picked = new THREE.MeshStandardMaterial({ color: new THREE.Color(token('--accent')), roughness: 0.6 })
    const shown = mode === 'single' ? layers.filter((l) => l.number === selected) : layers
    // The jig (hub and its bridges) in its own color, to tell it from the
    // sculpture it is cut off from.
    const jig = new THREE.MeshStandardMaterial({ color: 0x7590a8, roughness: 0.8 })
    for (const layer of shown) {
      // Without hub parts the cut region is the sculpture, island bridges included.
      const hubbed = layer.hub.length > 0 || layer.bridges.length > 0
      const geometry = layerGeometry(layer, hubbed ? layer.section : layer.region, holes, params)
      if (geometry) view.content.add(new THREE.Mesh(geometry, layer.number === selected ? picked : wood))
      if (!showHub || !hubbed) continue
      const extra = layerGeometry(layer, difference(layer.region, layer.section), holes, params)
      if (extra) view.content.add(new THREE.Mesh(extra, jig))
    }
    if (mode === 'stack' && spacers.length > 0) {
      const spacerWood = new THREE.MeshStandardMaterial({ color: 0x8a6440, roughness: 0.9 })
      for (const spacer of spacers) {
        const geometry = new THREE.ExtrudeGeometry(spacer.region.map(pieceShape), {
          depth: params.gap,
          bevelEnabled: false,
          curveSegments: 1,
        })
        geometry.translate(0, 0, spacer.zBottom)
        view.content.add(new THREE.Mesh(geometry, spacer.hub ? jig : spacerWood))
      }
    }
    if (showRods) {
      const steel = new THREE.MeshStandardMaterial({ color: 0x9aa5b1, metalness: 0.7, roughness: 0.35 })
      const brass = new THREE.MeshStandardMaterial({ color: 0xc9a13b, metalness: 0.7, roughness: 0.35 })
      for (const hole of holes) {
        for (const [from, to] of mountRuns(hole, layers, params)) {
          const length = to - from + 2 * ROD_PROTRUSION
          const rod = new THREE.Mesh(new THREE.CylinderGeometry(params.holeDiameter / 2, params.holeDiameter / 2, length, 16), hole.kind === 'rod' ? steel : brass)
          rod.rotation.x = Math.PI / 2
          rod.position.set(hole.x, hole.y, (from + to) / 2)
          view.content.add(rod)
        }
      }
    }
    if (showModel && mesh) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3))
      geometry.computeVertexNormals()
      view.content.add(
        new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
        ),
      )
    }

    // View up: the whole scene turned so the chosen file axis points up; the
    // layers themselves stay in cut coordinates.
    const up = mesh?.viewUp ?? [0, 0, 1]
    view.content.quaternion.setFromUnitVectors(new THREE.Vector3(...up), new THREE.Vector3(0, 0, 1))
    view.content.updateMatrixWorld(true)

    // Keep the viewer's angle while editing: refit only for a different
    // model size or view, or when going between the stack and one layer.
    const fitKey = `${mesh?.height}:${mesh?.width}:${mesh?.depth}:${up.join(',')}:${mode}`
    if (view.fittedTo !== fitKey && shown.length > 0) {
      view.fittedTo = fitKey
      const box = new THREE.Box3().setFromObject(view.content)
      const center = box.getCenter(new THREE.Vector3())
      const radius = box.getSize(new THREE.Vector3()).length() / 2
      const direction = new THREE.Vector3(0.7, -1.3, 0.6).normalize()
      view.controls.target.copy(center)
      view.camera.position.copy(center).addScaledVector(direction, (radius * 1.15) / Math.sin((view.camera.fov * Math.PI) / 360))
    }
  }, [mesh, layers, holes, spacers, params, selected, mode, showModel, showRods, showHub])

  return <div ref={hostRef} className="h-full w-full overflow-hidden" />
}
