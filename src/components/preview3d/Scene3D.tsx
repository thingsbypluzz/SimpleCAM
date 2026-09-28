import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { PaletteId } from '../../config/palettes'
import type { WizardParams } from '../../types/wizard'
import type { ThemeId } from '../../types/theme'
import type { Grid3DLabelSize } from '../../types/appearance'
import { buildToolpathScene, disposeObject3D, rescaleLabelForConstantScreenSize } from './buildScene'
import { frameCamera, VIEW_PRESETS, type ViewPresetName } from './cameraPresets'

interface Scene3DProps {
  params: WizardParams
  isDark: boolean
  paletteId: PaletteId
  themeId: ThemeId
  overlayParams: readonly WizardParams[]
  showActivePattern: boolean
  gridLabelsEnabled: boolean
  gridLabelSize: Grid3DLabelSize
  stockVisible: boolean
  toolpathVisible: boolean
  onToggleStockVisible: () => void
  onToggleToolpathVisible: () => void
  // BL-38: unlike stockVisible/toolpathVisible (local, session-only view
  // state), this flips the same persisted appearance.grid3DLabelsEnabled
  // the Settings > Appearance checkbox reads/writes — a faster path to
  // the same field, not a separate toggle.
  onToggleGridLabels: () => void
  // BL-43: true while the Settings Modal is open over a blurred backdrop.
  // The render loop otherwise redraws every frame, which would make the
  // browser re-blur the whole page 60 times a second; paused, it only
  // redraws when the scene or viewport actually changes (e.g. a palette
  // picked in Settings > Appearance still shows up behind the blur).
  renderPaused?: boolean
  // BL-76: the last view, kept by App.tsx across unmounts (switching to the
  // 2D or G-Code tab unmounts this component) — restored on the next mount
  // instead of the default Front framing. Session-only, never persisted.
  viewMemory?: { current: Saved3DView | null }
}

type XYZ = { x: number; y: number; z: number }

export interface Saved3DView {
  position: XYZ
  target: XYZ
  up: XYZ
  near: number
  far: number
  // The overlay selection the view was framed for — a different one on
  // the next mount re-fits the distance (angle kept), same as a selection
  // change while mounted.
  overlayParams: readonly WizardParams[]
}

const PRESET_BUTTONS: { name: ViewPresetName; label: string }[] = [
  { name: 'top', label: 'Top' },
  { name: 'isometric', label: 'Isometric' },
  { name: 'front', label: 'Front' },
  { name: 'side', label: 'Side' },
]

export function Scene3D({
  params,
  isDark,
  paletteId,
  themeId,
  overlayParams,
  showActivePattern,
  gridLabelsEnabled,
  gridLabelSize,
  stockVisible,
  toolpathVisible,
  onToggleStockVisible,
  onToggleToolpathVisible,
  onToggleGridLabels,
  renderPaused = false,
  viewMemory,
}: Scene3DProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const contentGroupRef = useRef<THREE.Group | null>(null)
  const boundsRef = useRef<THREE.Box3 | null>(null)
  const labelsRef = useRef<THREE.Sprite[]>([])
  const renderPausedRef = useRef(renderPaused)
  const needsRenderRef = useRef(true)

  useEffect(() => {
    renderPausedRef.current = renderPaused
  }, [renderPaused])
  const hasFramedRef = useRef(false)
  const prevOverlayParamsRef = useRef(overlayParams)

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
      frameId = requestAnimationFrame(animate)
      if (renderPausedRef.current && !needsRenderRef.current) return
      needsRenderRef.current = false
      controls.update()
      // Text labels (origin, axis ends, grid ticks) are sized in world
      // units at build time but need to read as a constant pixel size
      // regardless of zoom — re-derive their scale from the camera's
      // *current* distance every frame, right before the render that
      // actually uses it. See buildScene.ts's
      // rescaleLabelForConstantScreenSize for why this can't just be done
      // once in buildToolpathScene() (it has no camera/viewport to read).
      const viewportHeight = renderer.domElement.clientHeight
      if (viewportHeight > 0) {
        for (const label of labelsRef.current) {
          rescaleLabelForConstantScreenSize(label, camera, viewportHeight)
        }
      }
      renderer.render(scene, camera)
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
      needsRenderRef.current = true
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
      // BL-76: remember the view for the next mount (see viewMemory).
      if (viewMemory && hasFramedRef.current) {
        viewMemory.current = {
          position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
          target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
          up: { x: camera.up.x, y: camera.up.y, z: camera.up.z },
          near: camera.near,
          far: camera.far,
          overlayParams: prevOverlayParamsRef.current,
        }
      }
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', handleResize)
      resizeObserver.disconnect()
      disposeObject3D(contentGroup)
      controls.dispose()
      renderer.dispose()
      // Release the WebGL context right away (BL-63) — every 2D↔3D switch
      // unmounts this component and creates a new renderer, and browsers
      // cap live contexts (~16), dropping the oldest with a console warning.
      renderer.forceContextLoss()
      container.removeChild(renderer.domElement)
    }
    // viewMemory is App's stable ref object — listed for the linter, it
    // never changes, so setup still runs once per mount.
  }, [viewMemory])

  // Rebuild toolpath content whenever params or theme change.
  useEffect(() => {
    const camera = cameraRef.current
    const renderer = rendererRef.current
    const controls = controlsRef.current
    const contentGroup = contentGroupRef.current
    if (!camera || !renderer || !controls || !contentGroup) return

    while (contentGroup.children.length > 0) {
      const child = contentGroup.children[0]
      contentGroup.remove(child)
      disposeObject3D(child)
    }

    // Clear color intentionally comes from buildToolpathScene()'s result
    // (the same palette `background` accent the 2D preview fills its
    // canvas with), not a hardcoded literal here — a hardcoded value is
    // exactly what silently went stale when Shopfloor Amber shipped (this
    // stayed Tailwind slate-900/white while everything else picked up the
    // new theme). Deriving it from the one shared source means a future
    // theme can't repeat that by omission.
    const { objects, labels, bounds, background } = buildToolpathScene(
      params,
      isDark,
      paletteId,
      themeId,
      overlayParams,
      showActivePattern,
      gridLabelsEnabled,
      gridLabelSize,
      stockVisible,
      toolpathVisible,
    )
    renderer.setClearColor(background, 1)
    objects.forEach((obj) => contentGroup.add(obj))
    boundsRef.current = bounds
    labelsRef.current = labels
    needsRenderRef.current = true

    // Default view is the fitted front angle (camera centered on -Y,
    // elevated on +Z, looking toward +Y — see VIEW_PRESETS.front) — only
    // on the very first build, so later parameter tweaks don't yank the
    // camera out of the angle the user rotated to. hasFramedRef is only
    // ever reset in the setup effect above. A view remembered from before
    // the last tab switch (BL-76) replaces the default framing; framed for
    // a different overlay selection, it keeps its angle and re-fits.
    const saved = !hasFramedRef.current ? viewMemory?.current : null
    const overlayParamsChanged = saved
      ? saved.overlayParams !== overlayParams
      : prevOverlayParamsRef.current !== overlayParams
    prevOverlayParamsRef.current = overlayParams

    if (saved) {
      camera.position.set(saved.position.x, saved.position.y, saved.position.z)
      camera.up.set(saved.up.x, saved.up.y, saved.up.z)
      camera.near = saved.near
      camera.far = saved.far
      camera.updateProjectionMatrix()
      controls.target.set(saved.target.x, saved.target.y, saved.target.z)
      camera.lookAt(controls.target)
      controls.update()
      hasFramedRef.current = true
    }

    if (!hasFramedRef.current) {
      frameCamera(camera, controls, bounds, VIEW_PRESETS.front.direction, VIEW_PRESETS.front.up)
      hasFramedRef.current = true
    } else if (overlayParamsChanged) {
      // Re-fit distance/target at whatever angle the camera is currently
      // at (same math as handleFitView below) whenever the BL-3 overlay
      // selection changes — newly added/removed presets shouldn't require
      // a manual "Fit View" click to become visible, but this must NOT
      // change the angle itself, only reuse it, or every checkbox click
      // would yank the view like editing the live pattern deliberately
      // doesn't.
      const direction = camera.position.clone().sub(controls.target)
      if (direction.lengthSq() > 0) {
        frameCamera(camera, controls, bounds, direction.normalize(), camera.up.clone())
      }
    }
  }, [
    params,
    isDark,
    paletteId,
    themeId,
    overlayParams,
    showActivePattern,
    gridLabelsEnabled,
    gridLabelSize,
    stockVisible,
    toolpathVisible,
    viewMemory,
  ])

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
    'rounded-md border border-field-border bg-field-bg/90 px-2.5 py-1 text-xs font-medium text-value shadow-sm hover:bg-field-bg'

  return (
    <div className="relative min-h-0 w-full flex-1">
      <div ref={containerRef} className="h-full w-full" />
      <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={onToggleStockVisible} className={buttonClass}>
          {stockVisible ? 'Hide Stock' : 'Show Stock'}
        </button>
        <button type="button" onClick={onToggleToolpathVisible} className={buttonClass}>
          {toolpathVisible ? 'Hide Toolpath' : 'Show Toolpath'}
        </button>
        <button type="button" onClick={onToggleGridLabels} className={buttonClass}>
          {gridLabelsEnabled ? 'Hide Grid Labels' : 'Show Grid Labels'}
        </button>
      </div>
      <div className="absolute right-3 bottom-3 flex flex-wrap items-center justify-end gap-1.5">
        {/* Two different kinds of action, grouped and separated by a hairline:
            the presets set a specific viewing angle, Fit View keeps whatever
            angle is current and only refits distance/target — visually
            identical buttons made that distinction invisible. */}
        <div className="flex flex-wrap items-center justify-end gap-1.5">
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
        </div>
        <div className="h-5 w-px bg-field-border" aria-hidden="true" />
        <button type="button" onClick={handleFitView} className={buttonClass}>
          Fit View
        </button>
      </div>
    </div>
  )
}
