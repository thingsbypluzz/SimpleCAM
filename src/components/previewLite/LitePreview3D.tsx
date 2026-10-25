import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PaletteId } from '../../config/palettes'
import { PhoneLabel } from '../PhoneLabel'
import type { ThemeId } from '../../types/theme'
import type { WizardParams } from '../../types/wizard'
import { previewBottomBarClass, previewButtonClass, previewTopBarClass } from '../preview/previewToolbar'
import { useCoarsePointer } from '../useViewport'
import { LITE_VIEWS, fitCamera, orbitBy, panBy, pinchCamera, zoomAt, type LiteCamera, type LiteViewName } from './camera3d'
import { buildLiteScene, drawLiteScene, liteTheme } from './drawLiteScene'
import { drawLiteSimulation } from './drawLiteSimulation'
import { SimulationBar } from '../simulation/SimulationBar'
import { simulationTool } from '../simulation/simTool'
import { useSimulation, type SimulationMemory } from '../simulation/useSimulation'
import type { SimulationPosition } from '../../lib/simulation'

interface LitePreview3DProps {
  params: WizardParams
  isDark: boolean
  paletteId: PaletteId
  themeId: ThemeId
  overlayParams: readonly WizardParams[]
  showActivePattern: boolean
  dimOverlay: boolean
  activeToolpathVisible: boolean
  // Which presets are shown — a change re-fits the view (see ToolpathCanvas).
  fitKey: string
  // Text fonts loaded so far — a rebuild trigger, as in the other previews.
  fontEpoch: number
  stockVisible: boolean
  toolpathVisible: boolean
  cutShapeEnabled: boolean
  onToggleStockVisible: () => void
  onToggleToolpathVisible: () => void
  // Why this preview is shown instead of the full one — a line in its corner.
  note: string
  // The last view, kept by App.tsx across unmounts; session-only.
  viewMemory?: { current: SavedLiteView | null }
  // A modal is open over the preview (pauses Simulate).
  renderPaused: boolean
  // BL-100: Simulate mode — G0's feed and the mode's state kept by App.tsx.
  rapidFeed: number
  simulationMemory: SimulationMemory
}

export interface SavedLiteView {
  camera: LiteCamera
  fitScale: number
  fitKey: string
}

const VIEW_BUTTONS: { name: LiteViewName; label: string; short?: string }[] = [
  { name: 'top', label: 'Top' },
  { name: 'isometric', label: 'Isometric', short: 'Iso' },
  { name: 'front', label: 'Front' },
  { name: 'side', label: 'Side' },
]

const WHEEL_ZOOM_SPEED = 0.0015
// Radians of turn per px of drag.
const ORBIT_SPEED = 0.008

// BL-118: the 3D preview for a device without WebGL 2 — the engines' own
// toolpaths and the stock model's outline, projected onto a plain 2D
// canvas. It turns, pans and zooms like the full preview (one finger or
// the left button turns, two fingers or the right button pan, pinch or
// wheel zooms) but has no depth: nothing is lit and nothing hides anything.
export function LitePreview3D({
  params,
  isDark,
  paletteId,
  themeId,
  overlayParams,
  showActivePattern,
  dimOverlay,
  activeToolpathVisible,
  fitKey,
  fontEpoch,
  stockVisible,
  toolpathVisible,
  cutShapeEnabled,
  onToggleStockVisible,
  onToggleToolpathVisible,
  note,
  viewMemory,
  renderPaused,
  rapidFeed,
  simulationMemory,
}: LitePreview3DProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [restored] = useState(() => {
    const saved = viewMemory?.current
    return saved && saved.fitKey === fitKey ? saved : null
  })
  const [camera, setCamera] = useState<LiteCamera | null>(restored?.camera ?? null)
  const cameraRef = useRef<LiteCamera | null>(null)
  const fitScaleRef = useRef(restored?.fitScale ?? 1)
  const hasFittedRef = useRef(restored !== null)
  const prevFitKeyRef = useRef(fitKey)
  // The view is being dragged: the toolpath is drawn thinned out.
  const [moving, setMoving] = useState(false)
  // The touch bars lie over the canvas — Fit View keeps clear of them.
  const fitPadding = useCoarsePointer() ? 84 : 48

  // BL-100: Simulate — while it is open the live toolpath is drawn from
  // the timeline (drawLiteSimulation()) instead of the scene.
  const simulation = useSimulation({
    params,
    rapidFeed,
    enabled: showActivePattern && activeToolpathVisible,
    renderPaused,
    memory: simulationMemory,
  })
  const simulationRef = useRef(simulation)
  useEffect(() => {
    simulationRef.current = simulation
  })
  const simulationOpen = simulation.open
  const simTimeline = simulation.sim
  const simTool = useMemo(() => simulationTool(params), [params])
  const simPositionRef = useRef<SimulationPosition | null>(null)
  // The latest full redraw, for the playback loop.
  const renderRef = useRef<(() => void) | null>(null)

  const scene = useMemo(
    () =>
      buildLiteScene(params, overlayParams, showActivePattern, dimOverlay, activeToolpathVisible && !simulationOpen, cutShapeEnabled),
    // fontEpoch: a text has strokes only once its font has loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params, overlayParams, showActivePattern, dimOverlay, activeToolpathVisible, simulationOpen, cutShapeEnabled, fontEpoch],
  )
  const sceneRef = useRef(scene)
  useEffect(() => {
    sceneRef.current = scene
  }, [scene])

  useEffect(() => {
    cameraRef.current = camera
    if (camera && viewMemory) viewMemory.current = { camera, fitScale: fitScaleRef.current, fitKey }
  }, [camera, viewMemory, fitKey])

  // Frames everything shown at the given angles (the current ones for Fit
  // View and re-fits).
  const fit = useCallback(
    (view: { yaw: number; pitch: number }) => {
      const container = containerRef.current
      if (!container) return
      const next = fitCamera(view, sceneRef.current.box, container.clientWidth, container.clientHeight, fitPadding)
      fitScaleRef.current = next.scale
      setCamera(next)
    },
    [fitPadding],
  )

  // First view: Isometric. Editing parameters never moves the camera; a
  // change of what is shown (fitKey) re-fits at the current angle.
  useEffect(() => {
    if (!hasFittedRef.current) {
      hasFittedRef.current = true
      fit(LITE_VIEWS.isometric)
      return
    }
    if (prevFitKeyRef.current === fitKey) return
    prevFitKeyRef.current = fitKey
    fit(cameraRef.current ?? LITE_VIEWS.isometric)
    // `scene` — the re-fit must see the scene that belongs to the new key.
  }, [fitKey, fit, scene])

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas || !camera) return
    const theme = liteTheme(paletteId, isDark, themeId)

    const render = () => {
      const dpr = window.devicePixelRatio || 1
      const width = container.clientWidth
      const height = container.clientHeight
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      drawLiteScene(ctx, width, height, camera, scene, theme, stockVisible, toolpathVisible, moving)
      const position = simPositionRef.current
      if (simTimeline && position) {
        drawLiteSimulation(ctx, width, height, camera, simTimeline, position, simTool, theme, toolpathVisible, moving)
      }
    }
    simPositionRef.current = simTimeline ? simulationRef.current.tick(0) : null
    render()
    renderRef.current = render

    const resizeObserver = new ResizeObserver(render)
    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [scene, camera, paletteId, isDark, themeId, stockVisible, toolpathVisible, moving, simTimeline, simTool])

  // BL-100: the playback loop — runs only while Simulate is open, redraws
  // only when the clock moved.
  useEffect(() => {
    if (!simTimeline) return
    let frameId: number
    let lastFrame = performance.now()
    const loop = () => {
      frameId = requestAnimationFrame(loop)
      const now = performance.now()
      const position = simulationRef.current.tick((now - lastFrame) / 1000)
      lastFrame = now
      if (position && simulationRef.current.consumeChange()) {
        simPositionRef.current = position
        renderRef.current?.()
      }
    }
    frameId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frameId)
  }, [simTimeline])

  // Pointer input, as native listeners (the wheel must be cancellable).
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const size = () => canvas.getBoundingClientRect()
    const pivot = (): [number, number, number] => {
      const { min, max } = sceneRef.current.box
      return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
    }

    const pointers = new Map<number, [number, number]>()
    // 'orbit' — one finger or the left button; 'pan' — the right button;
    // 'pinch' — two fingers. Restarted from the current camera whenever a
    // pointer goes down or up, so the view never jumps.
    let gesture: {
      mode: 'orbit' | 'pan' | 'pinch'
      startCamera: LiteCamera
      startMid: [number, number]
      startDist: number
    } | null = null
    let mouseMode: 'orbit' | 'pan' = 'orbit'

    const state = (): { mid: [number, number]; dist: number } => {
      const rect = size()
      const points = [...pointers.values()].slice(0, 2)
      const [ax, ay] = points[0]
      const [bx, by] = points[1] ?? points[0]
      return { mid: [(ax + bx) / 2 - rect.left, (ay + by) / 2 - rect.top], dist: Math.hypot(bx - ax, by - ay) }
    }
    const restart = () => {
      const current = cameraRef.current
      if (pointers.size === 0 || !current) {
        gesture = null
        setMoving(false)
        return
      }
      const { mid, dist } = state()
      gesture = { mode: pointers.size > 1 ? 'pinch' : mouseMode, startCamera: current, startMid: mid, startDist: dist }
      setMoving(true)
    }

    const handlePointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') {
        if (e.button !== 0 && e.button !== 2) return
        mouseMode = e.button === 2 ? 'pan' : 'orbit'
      } else {
        mouseMode = 'orbit'
      }
      canvas.setPointerCapture(e.pointerId)
      pointers.set(e.pointerId, [e.clientX, e.clientY])
      // BL-100: a camera gesture holds the simulation while it lasts.
      simulationRef.current.holdForCamera()
      restart()
    }
    const handlePointerMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId) || !gesture) return
      pointers.set(e.pointerId, [e.clientX, e.clientY])
      const rect = size()
      const { mid, dist } = state()
      const dx = mid[0] - gesture.startMid[0]
      const dy = mid[1] - gesture.startMid[1]
      if (gesture.mode === 'orbit') {
        // The near side follows the pointer; dragging down raises the camera.
        setCamera(orbitBy(gesture.startCamera, -dx * ORBIT_SPEED, dy * ORBIT_SPEED, pivot()))
      } else if (gesture.mode === 'pan') {
        setCamera(panBy(gesture.startCamera, dx, dy))
      } else {
        const spread = gesture.startDist > 0 ? dist / gesture.startDist : 1
        setCamera(pinchCamera(gesture.startCamera, rect.width, rect.height, gesture.startMid, mid, spread, fitScaleRef.current))
      }
    }
    const handlePointerEnd = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return
      if (pointers.size === 0) simulationRef.current.releaseCamera()
      restart()
    }
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      simulationRef.current.holdForCamera()
      simulationRef.current.releaseCamera()
      const current = cameraRef.current
      if (!current) return
      const rect = size()
      const factor = Math.exp(-e.deltaY * WHEEL_ZOOM_SPEED)
      setCamera(zoomAt(current, rect.width, rect.height, e.clientX - rect.left, e.clientY - rect.top, factor, fitScaleRef.current))
    }
    // The right button pans — no context menu over the canvas.
    const handleContextMenu = (e: MouseEvent) => e.preventDefault()

    canvas.style.touchAction = 'none'
    canvas.addEventListener('pointerdown', handlePointerDown)
    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('pointerup', handlePointerEnd)
    canvas.addEventListener('pointercancel', handlePointerEnd)
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    canvas.addEventListener('contextmenu', handleContextMenu)
    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerup', handlePointerEnd)
      canvas.removeEventListener('pointercancel', handlePointerEnd)
      canvas.removeEventListener('wheel', handleWheel)
      canvas.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [])

  return (
    <div ref={containerRef} className="relative min-h-0 w-full flex-1">
      <canvas ref={canvasRef} className="cursor-grab active:cursor-grabbing" />
      <div className={previewTopBarClass}>
        <button type="button" onClick={onToggleStockVisible} className={previewButtonClass}>
          {stockVisible ? 'Hide Stock' : 'Show Stock'}
        </button>
        <button type="button" onClick={onToggleToolpathVisible} className={previewButtonClass}>
          {toolpathVisible ? 'Hide Toolpath' : 'Show Toolpath'}
        </button>
      </div>
      <p hidden={simulationOpen} className="pointer-events-none absolute bottom-3 left-3 max-w-[45%] text-[11px] leading-tight text-muted pointer-coarse:bottom-20 pointer-coarse:max-w-none">
        {note}
      </p>
      {simulationOpen ? (
        <SimulationBar controls={simulation} />
      ) : (
      <div className={previewBottomBarClass}>
        <div className="flex flex-wrap items-center justify-end gap-1.5 pointer-coarse:contents">
          {VIEW_BUTTONS.map((view) => (
            <button key={view.name} type="button" onClick={() => fit(LITE_VIEWS[view.name])} className={previewButtonClass}>
              {view.short ? <PhoneLabel full={view.label} short={view.short} /> : view.label}
            </button>
          ))}
        </div>
        <div className="h-5 w-px bg-field-border pointer-coarse:hidden" aria-hidden="true" />
        <button type="button" onClick={() => fit(cameraRef.current ?? LITE_VIEWS.isometric)} className={previewButtonClass}>
          Fit View
        </button>
        <button
          type="button"
          onClick={simulation.openMode}
          disabled={!simulation.enabled}
          title="Play the program move by move"
          className={`${previewButtonClass} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          Simulate
        </button>
      </div>
      )}
    </div>
  )
}
