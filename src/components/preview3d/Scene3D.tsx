import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { WizardParams } from '../../types/wizard'
import { buildToolpathScene, disposeObject3D } from './buildScene'
import { frameCamera, VIEW_PRESETS, type ViewPresetName } from './cameraPresets'

interface Scene3DProps {
  params: WizardParams
  isDark: boolean
}

const PRESET_BUTTONS: { name: ViewPresetName; label: string }[] = [
  { name: 'top', label: 'Top' },
  { name: 'isometric', label: 'Isometric' },
  { name: 'front', label: 'Front' },
  { name: 'side', label: 'Side' },
]

export function Scene3D({ params, isDark }: Scene3DProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const contentGroupRef = useRef<THREE.Group | null>(null)
  const boundsRef = useRef<THREE.Box3 | null>(null)
  const hasFramedRef = useRef(false)

  // One-time scene/camera/renderer/controls setup.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Every run of this effect builds a *new* camera, so the "already
    // framed" latch below must reset with it. Without this, React
    // StrictMode's deliberate double-invoke (setup → cleanup → setup, on
    // the same component instance, so refs survive) left the second camera
    // unframed at Three's default (0,0,0): sitting exactly on the CNC
    // origin, looking down -Z (CNC +Y). That rendered as a flat, hugely
    // zoomed-in view along the Y axis *and* made OrbitControls appear
    // dead, since camera.position === controls.target means an orbit
    // radius of zero — there's nothing to rotate around.
    hasFramedRef.current = false

    const scene = new THREE.Scene()
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10000)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    rendererRef.current = renderer
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controlsRef.current = controls

    const contentGroup = new THREE.Group()
    scene.add(contentGroup)
    contentGroupRef.current = contentGroup

    scene.add(new THREE.AmbientLight(0xffffff, 0.7))
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6)
    dirLight.position.set(1, 1.5, 1)
    scene.add(dirLight)

    let frameId: number
    const animate = () => {
      controls.update()
      renderer.render(scene, camera)
      frameId = requestAnimationFrame(animate)
    }
    animate()

    const handleResize = () => {
      const w = container.clientWidth
      const h = container.clientHeight
      if (w === 0 || h === 0) return
      // Re-read devicePixelRatio on every resize, not just at setup — it
      // changes on browser zoom (Ctrl+/Ctrl-) even when clientWidth/Height
      // don't, and a stale ratio is what made the canvas look "stuck" at
      // the zoom level active when the scene was first built. Same fix
      // ToolpathCanvas already applies for the 2D preview.
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(container)
    // Browser zoom doesn't always change container.clientWidth/Height by
    // enough to trip the ResizeObserver, but it always fires a window
    // resize event — belt-and-suspenders alongside the observer, which
    // still does the heavy lifting for layout-driven resizes (e.g. the
    // step panel expanding/collapsing) that don't touch window size.
    window.addEventListener('resize', handleResize)
    handleResize()

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', handleResize)
      resizeObserver.disconnect()
      disposeObject3D(contentGroup)
      controls.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [])

  // Rebuild toolpath content whenever params or theme change.
  useEffect(() => {
    const camera = cameraRef.current
    const renderer = rendererRef.current
    const controls = controlsRef.current
    const contentGroup = contentGroupRef.current
    if (!camera || !renderer || !controls || !contentGroup) return

    renderer.setClearColor(isDark ? 0x0f172a : 0xffffff, 1)

    while (contentGroup.children.length > 0) {
      const child = contentGroup.children[0]
      contentGroup.remove(child)
      disposeObject3D(child)
    }

    const { objects, bounds } = buildToolpathScene(params, isDark)
    objects.forEach((obj) => contentGroup.add(obj))
    boundsRef.current = bounds

    // Default view is the fitted front angle (camera centered on -Y,
    // elevated on +Z, looking toward +Y — see VIEW_PRESETS.front) — only
    // on the very first build, so later parameter tweaks don't yank the
    // camera out of the angle the user rotated to.
    if (!hasFramedRef.current) {
      frameCamera(camera, controls, bounds, VIEW_PRESETS.front.direction, VIEW_PRESETS.front.up)
      hasFramedRef.current = true
    }
  }, [params, isDark])

  const handlePreset = (name: ViewPresetName) => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    const bounds = boundsRef.current
    if (!camera || !controls || !bounds) return
    const preset = VIEW_PRESETS[name]
    frameCamera(camera, controls, bounds, preset.direction, preset.up)
  }

  const handleFitView = () => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    const bounds = boundsRef.current
    if (!camera || !controls || !bounds) return
    // Re-fit distance/target at whatever angle the camera is currently at,
    // instead of snapping to a preset.
    const direction = camera.position.clone().sub(controls.target)
    if (direction.lengthSq() === 0) direction.copy(VIEW_PRESETS.isometric.direction)
    frameCamera(camera, controls, bounds, direction.normalize(), camera.up.clone())
  }

  const buttonClass =
    'rounded-md border border-slate-300 bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm hover:bg-white dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-300 dark:hover:bg-slate-900'

  return (
    <div className="relative min-h-0 w-full flex-1">
      <div ref={containerRef} className="h-full w-full" />
      <div className="absolute right-3 bottom-3 flex flex-wrap items-center justify-end gap-1.5">
        {PRESET_BUTTONS.map((preset) => (
          <button
            key={preset.name}
            type="button"
            onClick={() => handlePreset(preset.name)}
            className={buttonClass}
          >
            {preset.label}
          </button>
        ))}
        <button type="button" onClick={handleFitView} className={buttonClass}>
          Fit View
        </button>
      </div>
    </div>
  )
}
