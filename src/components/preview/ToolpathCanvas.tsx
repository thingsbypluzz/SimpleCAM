import { useCallback, useEffect, useRef, useState } from 'react'
import type { PaletteId } from '../../config/palettes'
import type { WizardParams } from '../../types/wizard'
import { computeFitCamera, panBy, zoomAt, type Camera2D } from './camera2d'
import { computeToolpathDataBounds, drawToolpath } from './drawToolpath'

interface ToolpathCanvasProps {
  params: WizardParams
  isDark: boolean
  paletteId: PaletteId
  overlayParams: WizardParams[]
  showActivePattern: boolean
}

// Wheel deltaY -> zoom factor, exponential so repeated small scroll ticks
// feel smooth and a single large trackpad-pinch delta doesn't jump too far
// in one event.
const WHEEL_ZOOM_SPEED = 0.0015

export function ToolpathCanvas({
  params,
  isDark,
  paletteId,
  overlayParams,
  showActivePattern,
}: ToolpathCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [camera, setCamera] = useState<Camera2D | null>(null)
  // Mirrors `camera` state but readable from native event handlers below
  // without re-subscribing them on every camera change.
  const cameraRef = useRef<Camera2D | null>(null)
  // The scale computed by the last fit-to-data — zoom clamping (BL-11,
  // camera2d.ts) is relative to this, not an absolute constant.
  const fitScaleRef = useRef(1)
  const hasFittedRef = useRef(false)
  const prevOverlayParamsRef = useRef(overlayParams)
  const panStateRef = useRef<{ startX: number; startY: number; startCamera: Camera2D } | null>(null)

  useEffect(() => {
    cameraRef.current = camera
  }, [camera])

  // Fit-to-data: recomputed from current bounds + current canvas size.
  // Used for the initial view, the Fit View button, and the BL-3
  // overlay-selection re-fit below.
  const fitToData = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const bounds = computeToolpathDataBounds(params, overlayParams, showActivePattern)
    const next = computeFitCamera(bounds, container.clientWidth, container.clientHeight)
    fitScaleRef.current = next.scale
    setCamera(next)
  }, [params, overlayParams, showActivePattern])

  // Render effect — draws whenever params/theme/camera change, and on
  // resize (ResizeObserver). Does NOT touch `camera` itself: once a camera
  // exists, editing wizard parameters must not yank the user's zoom/pan,
  // same rule Scene3D.tsx follows for the 3D preview.
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas || !camera) return

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
      drawToolpath(ctx, width, height, params, isDark, paletteId, camera, overlayParams, showActivePattern)
    }

    render()

    const resizeObserver = new ResizeObserver(render)
    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [params, isDark, paletteId, overlayParams, showActivePattern, camera])

  // One-time initial fit, once the container has a real size — mirrors
  // Scene3D.tsx's hasFramedRef latch (there reset per new THREE camera;
  // here just once per mount, since this component's whole camera state
  // is React state, not tied to an imperative scene setup effect).
  useEffect(() => {
    if (hasFittedRef.current) return
    hasFittedRef.current = true
    fitToData()
  }, [fitToData])

  // BL-3 overlay selection changed — re-fit so a newly added/removed
  // preset isn't left off-screen, mirroring Scene3D.tsx's
  // prevOverlayParamsRef re-fit. 3D preserves the current viewing angle
  // when it does this; 2D has no angle, so this is simply a full re-fit.
  useEffect(() => {
    if (!hasFittedRef.current) return
    if (prevOverlayParamsRef.current === overlayParams) return
    prevOverlayParamsRef.current = overlayParams
    fitToData()
  }, [overlayParams, fitToData])

  // Wheel-to-zoom (zoom to cursor) and right-drag-to-pan. Native listeners
  // (not React's onWheel/onContextMenu) so wheel can reliably
  // preventDefault ({ passive: false }) instead of scrolling the page —
  // same "manual addEventListener" pattern Scene3D.tsx uses for window
  // resize.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const current = cameraRef.current
      if (!current) return
      const rect = canvas.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      const factor = Math.exp(-e.deltaY * WHEEL_ZOOM_SPEED)
      setCamera(zoomAt(current, rect.width, rect.height, px, py, factor, fitScaleRef.current))
    }

    // Panning is right-click drag (BL-11 decision) — the browser's own
    // context menu over the canvas would otherwise fire on every pan.
    const handleContextMenu = (e: MouseEvent) => e.preventDefault()

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 2) return
      const current = cameraRef.current
      if (!current) return
      e.preventDefault()
      panStateRef.current = { startX: e.clientX, startY: e.clientY, startCamera: current }
      canvas.style.cursor = 'grabbing'
    }

    // Recomputed from the drag-start camera + total delta each move
    // (rather than accumulating per-event deltas) to avoid drift.
    const handleMouseMove = (e: MouseEvent) => {
      const pan = panStateRef.current
      if (!pan) return
      setCamera(panBy(pan.startCamera, e.clientX - pan.startX, e.clientY - pan.startY))
    }

    const endPan = () => {
      if (!panStateRef.current) return
      panStateRef.current = null
      canvas.style.cursor = ''
    }

    canvas.addEventListener('wheel', handleWheel, { passive: false })
    canvas.addEventListener('contextmenu', handleContextMenu)
    canvas.addEventListener('mousedown', handleMouseDown)
    // Tracked on window, not the canvas, so a drag that leaves the canvas
    // mid-pan (fast mouse movement) still ends cleanly on mouseup.
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', endPan)

    return () => {
      canvas.removeEventListener('wheel', handleWheel)
      canvas.removeEventListener('contextmenu', handleContextMenu)
      canvas.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', endPan)
    }
  }, [])

  return (
    <div ref={containerRef} className="relative min-h-0 w-full flex-1">
      <canvas ref={canvasRef} />
      <div className="absolute right-3 bottom-3">
        <button
          type="button"
          onClick={fitToData}
          className="rounded-md border border-slate-300 bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm hover:bg-white dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-300 dark:hover:bg-slate-900"
        >
          Fit View
        </button>
      </div>
    </div>
  )
}
