import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { MOVE_STYLE, type ToolpathLineStyle, buildTheme, toolpathLineMaterial } from '../components/preview3d/buildScene'
import { type Move, movePoints } from '../lib/toolpath'
import type { AppearanceSettings } from '../types/appearance'
import type { FileKind, FilePlate, GcodeFile } from './gcode'
import { token } from './holeColors'

interface ToolpathSceneProps {
  file: GcodeFile | null
  kind: FileKind
  // The plate under the path; none for the fixture, which is cut into the board.
  plate: FilePlate | null
  appearance: AppearanceSettings
  isDark: boolean
}

function disposeGroup(group: THREE.Group) {
  group.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      object.geometry.dispose()
      const material = object.material as THREE.Material | THREE.Material[]
      if (Array.isArray(material)) material.forEach((m) => m.dispose())
      else material.dispose()
    }
  })
  group.clear()
}

// The program's own moves plus what program() adds after them: back to Safe
// Z and a rapid to X0 Y0. Consecutive moves of one style share a line, as in
// OnlyPaths' 3D preview.
function toolpathLines(file: GcodeFile, theme: ReturnType<typeof buildTheme>, span: number): THREE.Line[] {
  const { toolpath, safeZ } = file
  const last = toolpath.moves.at(-1)?.to ?? toolpath.start
  const tail: Move[] = [
    { type: 'line', kind: 'rapid', to: { x: last.x, y: last.y, z: safeZ }, axes: 'z' },
    { type: 'line', kind: 'rapid', to: { x: 0, y: 0, z: safeZ }, axes: 'xy' },
  ]
  const lines: THREE.Line[] = []
  let current = toolpath.start
  let style: ToolpathLineStyle | null = null
  let points: THREE.Vector3[] = []
  const flush = () => {
    if (style && points.length > 1) {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), toolpathLineMaterial(style, theme, span))
      if (style !== 'solid') line.computeLineDistances()
      lines.push(line)
    }
  }
  for (const move of [...toolpath.moves, ...tail]) {
    const next = MOVE_STYLE[move.kind]
    if (next !== style) {
      flush()
      // Each line starts where the last one ended, so styles join without a gap.
      points = [new THREE.Vector3(current.x, current.y, current.z)]
      style = next
    }
    for (const p of movePoints(current, move)) points.push(new THREE.Vector3(p.x, p.y, p.z))
    current = move.to
  }
  flush()
  return lines
}

function ringLine(ring: { x: number; y: number }[], z: number, material: THREE.Material): THREE.LineLoop {
  return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ring.map((p) => new THREE.Vector3(p.x, p.y, z))), material)
}

// One G-code file as the machine runs it: the path in the palette's toolpath
// color (solid cut, dashed rapid, dotted plunge), over the plate it is cut
// from with the part's outline on top. Z0 is the top of the plate (of the
// board, for the fixture).
export function ToolpathScene({ file, kind, plate, appearance, isDark }: ToolpathSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<{
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    controls: OrbitControls
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
    const camera = new THREE.PerspectiveCamera(35, 1, 0.5, 20000)
    camera.up.set(0, 0, 1)
    const controls = new OrbitControls(camera, renderer.domElement)
    const content = new THREE.Group()
    scene.add(content)
    viewRef.current = { scene, camera, controls, content, fittedTo: '' }

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
      renderer.forceContextLoss()
      renderer.domElement.remove()
      viewRef.current = null
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.scene.background = new THREE.Color(token('--code-bg'))
    disposeGroup(view.content)
    if (!file) return
    const theme = buildTheme(appearance.palette, isDark, appearance.theme)

    // Everything the path and the plate cover, for the dash lengths and the camera.
    const box = new THREE.Box3()
    box.expandByPoint(new THREE.Vector3(file.toolpath.start.x, file.toolpath.start.y, file.toolpath.start.z))
    for (const move of file.toolpath.moves) box.expandByPoint(new THREE.Vector3(move.to.x, move.to.y, move.to.z))
    box.expandByPoint(new THREE.Vector3(0, 0, 0))
    if (plate) {
      const { width, height, centerX, centerY } = plate.blank
      box.expandByPoint(new THREE.Vector3(centerX - width / 2, centerY - height / 2, -plate.thickness))
      box.expandByPoint(new THREE.Vector3(centerX + width / 2, centerY + height / 2, 0))
    }
    const size = box.getSize(new THREE.Vector3())
    const span = Math.max(size.x, size.y, 1)

    for (const line of toolpathLines(file, theme, span)) view.content.add(line)

    if (plate) {
      // The stock: see-through, so the path inside it stays visible.
      const { width, height, centerX, centerY } = plate.blank
      const stock = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, plate.thickness),
        new THREE.MeshBasicMaterial({ color: theme.hole, transparent: true, opacity: 0.18, depthWrite: false }),
      )
      stock.position.set(centerX, centerY, -plate.thickness / 2)
      view.content.add(stock)
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(stock.geometry), new THREE.LineBasicMaterial({ color: theme.stockEdge }))
      edges.position.copy(stock.position)
      view.content.add(edges)
      // The part that stays, outlined on the top face.
      const outline = new THREE.LineBasicMaterial({ color: theme.edit })
      for (const piece of plate.region) {
        view.content.add(ringLine(piece.outer, 0, outline))
        for (const hole of piece.holes) view.content.add(ringLine(hole, 0, outline))
      }
    } else {
      // The fixture board's top face, around the holes.
      const pad = Math.max(20, span * 0.1)
      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(size.x + 2 * pad, size.y + 2 * pad),
        new THREE.MeshBasicMaterial({ color: theme.hole, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }),
      )
      const center = box.getCenter(new THREE.Vector3())
      board.position.set(center.x, center.y, 0)
      view.content.add(board)
    }

    // X0 Y0: the fixture center, where every file is zeroed; Z0 on the plate's top.
    const axis = span * 0.08
    const axisLine = (to: THREE.Vector3, color: number) =>
      new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), to]), new THREE.LineBasicMaterial({ color }))
    view.content.add(axisLine(new THREE.Vector3(axis, 0, 0), theme.axisX), axisLine(new THREE.Vector3(0, axis, 0), theme.axisY))

    // Refit when going to another kind of file; moving through the layers
    // keeps the viewer's angle and distance.
    if (view.fittedTo !== kind) {
      view.fittedTo = kind
      const center = box.getCenter(new THREE.Vector3())
      const radius = Math.max(size.length() / 2, 10)
      const direction = new THREE.Vector3(0.5, -1.2, 0.9).normalize()
      view.controls.target.copy(center)
      view.camera.position.copy(center).addScaledVector(direction, (radius * 1.15) / Math.sin((view.camera.fov * Math.PI) / 360))
    }
  }, [file, kind, plate, appearance.palette, appearance.theme, isDark])

  return <div ref={hostRef} className="h-full w-full overflow-hidden" />
}
