import { type MouseEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { fmt } from '../lib/format'
import type { Point2D } from '../types/wizard'
import { blankOnSheet, layerBlank, layerPlacement, placeLayer } from './gcode'
import { type Region, type Ring, offset, placePoint, placeRegion, regionBounds, turnPoint } from './geometry'
import { holeStateColor, token } from './holeColors'
import { type Hole, type LayerHoles, holeState, screwClearance } from './holes'
import { type Layer, thinHubPieces, toolRegion, uncutRegion } from './layers'
import type { SculptureParams } from './params'

interface LayerViewProps {
  layers: Layer[]
  layer: Layer | null
  analysis: LayerHoles | null
  holes: Hole[]
  params: SculptureParams
  isDark: boolean
  // Clicking empty space adds a hole there.
  addMode: boolean
  // Every layer at once as a coverage map instead of the current layer alone.
  superimposed: boolean
  // The hub and its bridges; off shows the sculpture alone.
  showHub: boolean
  onAdd: (at: Point2D) => void
  onMove: (id: number, at: Point2D) => void
  onRemove: (id: number) => void
}

// Holes snap to half a millimetre: enough for a hand placement, and the list
// stays readable.
const snap = (v: number) => Math.round(v * 2) / 2
// Grab radius around a hole on screen, in pixels, however small it is drawn.
const GRAB_PX = 8

// The coverage map is computed on a grid this many screen pixels apart.
const HEAT_STEP = 2

// For every spot of the view, the number of layers in which a screw there would
// clear the edge (each section shrunk by the screw clearance), painted from red
// (one layer) to green (every layer). Built by filling each shrunk section into
// a small offscreen canvas and counting covered pixels.
function coverageImage(shrunk: Region[], width: number, height: number, view: View): HTMLCanvasElement {
  const w = Math.max(1, Math.ceil(width / HEAT_STEP))
  const h = Math.max(1, Math.ceil(height / HEAT_STEP))
  const work = document.createElement('canvas')
  work.width = w
  work.height = h
  const ctx = work.getContext('2d', { willReadFrequently: true })
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  if (!ctx || shrunk.length === 0) return out
  const counts = new Uint16Array(w * h)
  const k = view.scale / HEAT_STEP
  for (const region of shrunk) {
    ctx.clearRect(0, 0, w, h)
    ctx.beginPath()
    for (const piece of region) {
      for (const ring of [piece.outer, ...piece.holes]) {
        ring.forEach((p, i) => {
          const x = w / 2 + (p.x - view.cx) * k
          const y = h / 2 - (p.y - view.cy) * k
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        })
        ctx.closePath()
      }
    }
    ctx.fillStyle = '#000'
    ctx.fill('evenodd')
    const alpha = ctx.getImageData(0, 0, w, h).data
    for (let i = 0; i < counts.length; i++) if (alpha[i * 4 + 3] > 127) counts[i]++
  }
  const outCtx = out.getContext('2d')
  if (!outCtx) return out
  const image = outCtx.createImageData(w, h)
  const total = shrunk.length
  for (let i = 0; i < counts.length; i++) {
    const n = counts[i]
    if (n === 0) continue
    // Hue 0 (red) for one layer up to 120 (green) for all of them; full
    // coverage is set apart by full opacity.
    const t = total > 1 ? (n - 1) / (total - 1) : 1
    const [r, g, b] = hslToRgb((120 * t) / 360, 0.85, 0.5)
    image.data[i * 4] = r
    image.data[i * 4 + 1] = g
    image.data[i * 4 + 2] = b
    image.data[i * 4 + 3] = n === total ? 230 : 150
  }
  outCtx.putImageData(image, 0, 0)
  return out
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h * 12) % 12
    const a = s * Math.min(l, 1 - l)
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
  }
  return [f(0), f(8), f(4)]
}

// What the view shows: the machine point at its center and pixels per mm.
interface View {
  cx: number
  cy: number
  scale: number
}

// Mouse wheel zoom per pixel of scroll, and the zoom range around the fit.
const ZOOM_RATE = 0.0015
const ZOOM_RANGE = [0.05, 50]

const UNPLACED = { turn: 0, x: 0, y: 0 }

interface Drag {
  id: number
  x: number
  y: number
  moved: boolean
}

// The smallest of 1, 2, 5 × 10ⁿ mm not below `min`.
function gridStep(min: number): number {
  const power = 10 ** Math.floor(Math.log10(min))
  return [1, 2, 5, 10].map((m) => m * power).find((v) => v >= min) ?? 10 * power
}

// One layer from above, in machine coordinates: section, tool path, what the
// tool cannot reach, and every master hole in its state for this layer. The
// view (pan and zoom) stays put through layers and their placements: until
// it is moved, it fits the whole stack as in the sculpture; Fit View fits the
// current layer as it lies on the machine. Drag empty space (or with the
// middle button) to pan, the wheel zooms. Holes are placed by hand here: click
// to add, drag to move, right-click to remove. A drag shows the hole's state on
// this layer as it goes and reaches the rest of the page (stack, 3D) only on
// release.
export function LayerView({ layers, layer, analysis, holes, params, isDark, addMode, superimposed, showHub, onAdd, onMove, onRemove }: LayerViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // The view as last drawn, for the pointer; `view` null = fit the stack.
  const viewRef = useRef<View>({ cx: 0, cy: 0, scale: 1 })
  const [view, setView] = useState<View | null>(null)
  const panRef = useRef<{ x: number; y: number; from: View } | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  // The layer as it lies on the machine: its own turn and shift. The map of
  // the whole stack stays in sculpture coordinates.
  const placement = superimposed || !layer ? UNPLACED : layerPlacement(params, layer.number)
  const clearance = screwClearance(params)
  const shrunk = useMemo(
    () => (superimposed ? layers.map((l) => offset(l.region, -clearance)) : []),
    [superimposed, layers, clearance],
  )
  // The map only changes with the stack or the view size, never with a drag.
  const heatRef = useRef<{ key: string; shrunk: Region[]; image: HTMLCanvasElement } | null>(null)
  const extent = useMemo(() => {
    let reach = 10
    for (const { bounds } of layers) {
      reach = Math.max(reach, Math.abs(bounds.minX), Math.abs(bounds.maxX), Math.abs(bounds.minY), Math.abs(bounds.maxY))
    }
    for (const hole of holes) reach = Math.max(reach, Math.abs(hole.x), Math.abs(hole.y))
    if (params.hub) reach = Math.max(reach, Math.hypot(params.hubX, params.hubY) + params.hubDiameter / 2)
    reach += params.toolDiameter + params.holeDiameter
    // The sheet stays in view too.
    if (params.sheetX > 0 && params.sheetY > 0) {
      reach = Math.max(reach, Math.abs(params.sheetOffsetX) + params.sheetX / 2 + 5, Math.abs(params.sheetOffsetY) + params.sheetY / 2 + 5)
    }
    return reach
  }, [layers, holes, params.toolDiameter, params.holeDiameter, params.hub, params.hubX, params.hubY, params.hubDiameter, params.sheetX, params.sheetY, params.sheetOffsetX, params.sheetOffsetY])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const draw = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const ratio = window.devicePixelRatio || 1
      const { width, height } = canvas.getBoundingClientRect()
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.fillStyle = token('--code-bg')
      ctx.fillRect(0, 0, width, height)
      if (!layer || !analysis || width === 0 || height === 0) return

      const tool = toolRegion(layer, params)
      const shown = view ?? { cx: 0, cy: 0, scale: (Math.min(width, height) / 2 - 24) / extent }
      viewRef.current = shown
      const { scale } = shown
      const sx = (x: number) => width / 2 + (x - shown.cx) * scale
      const sy = (y: number) => height / 2 - (y - shown.cy) * scale
      // Sculpture coordinates → the machine's, for everything of this layer.
      const onMachine = (p: Point2D) => placePoint(p, placement.turn, placement.x, placement.y)
      const ringPath = (ring: Ring) => {
        ring.forEach((point, i) => {
          const p = onMachine(point)
          if (i === 0) ctx.moveTo(sx(p.x), sy(p.y))
          else ctx.lineTo(sx(p.x), sy(p.y))
        })
        ctx.closePath()
      }
      const regionPath = (region: Region) => {
        ctx.beginPath()
        for (const piece of region) {
          ringPath(piece.outer)
          piece.holes.forEach(ringPath)
        }
      }

      // A millimetre grid of round steps at least 40 px apart, labelled along
      // the bottom and left edges.
      const step = gridStep(40 / scale)
      const viewLeft = shown.cx - width / 2 / scale
      const viewRight = shown.cx + width / 2 / scale
      const viewBottom = shown.cy - height / 2 / scale
      const viewTop = shown.cy + height / 2 / scale
      ctx.strokeStyle = token('--border')
      ctx.globalAlpha = 0.35
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = Math.ceil(viewLeft / step) * step; x <= viewRight; x += step) {
        ctx.moveTo(Math.round(sx(x)) + 0.5, 0)
        ctx.lineTo(Math.round(sx(x)) + 0.5, height)
      }
      for (let y = Math.ceil(viewBottom / step) * step; y <= viewTop; y += step) {
        ctx.moveTo(0, Math.round(sy(y)) + 0.5)
        ctx.lineTo(width, Math.round(sy(y)) + 0.5)
      }
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.fillStyle = token('--muted')
      ctx.font = '10px system-ui, sans-serif'
      ctx.textBaseline = 'bottom'
      ctx.textAlign = 'center'
      for (let x = Math.ceil(viewLeft / step) * step; x <= viewRight; x += step) {
        if (Math.abs(x) > step / 2) ctx.fillText(fmt(x), sx(x), height - 2)
      }
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      for (let y = Math.ceil(viewBottom / step) * step; y <= viewTop; y += step) {
        if (Math.abs(y) > step / 2) ctx.fillText(fmt(y), 3, sy(y))
      }

      // Axes through the fixture's zero.
      ctx.strokeStyle = token('--border')
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, sy(0))
      ctx.lineTo(width, sy(0))
      ctx.moveTo(sx(0), 0)
      ctx.lineTo(sx(0), height)
      ctx.stroke()
      ctx.fillStyle = token('--muted')
      ctx.font = '11px system-ui, sans-serif'
      ctx.textBaseline = 'top'
      ctx.fillText('X0 Y0', sx(0) + 4, sy(0) + 4)

      if (superimposed) {
        const key = `${width}x${height}:${shown.cx}:${shown.cy}:${scale}`
        if (!heatRef.current || heatRef.current.key !== key || heatRef.current.shrunk !== shrunk) {
          heatRef.current = { key, shrunk, image: coverageImage(shrunk, width, height, shown) }
        }
        ctx.imageSmoothingEnabled = true
        ctx.drawImage(heatRef.current.image, 0, 0, width, height)
        // The current layer as an outline only, to tell where in the stack one is.
        regionPath(layer.region)
        ctx.strokeStyle = token('--fg')
        ctx.lineWidth = 1
        ctx.stroke()
      } else if (!showHub) {
        // The sculpture as assembled: no hub, no bridges, nothing to cut.
        regionPath(layer.section)
        ctx.fillStyle = isDark ? 'rgba(180, 150, 110, 0.35)' : 'rgba(180, 150, 110, 0.45)'
        ctx.fill('evenodd')
        ctx.strokeStyle = token('--fg')
        ctx.lineWidth = 1.5
        ctx.stroke()
      } else {
        regionPath(layer.region)
        ctx.fillStyle = isDark ? 'rgba(180, 150, 110, 0.35)' : 'rgba(180, 150, 110, 0.45)'
        ctx.fill('evenodd')
        ctx.strokeStyle = token('--fg')
        ctx.lineWidth = 1.5
        ctx.stroke()

        // The jig part of the plate (hub and bridges) tinted apart, and the
        // hub's parts too narrow for a hole flagged.
        if (layer.hub.length > 0 || layer.bridges.length > 0) {
          regionPath([...layer.hub, ...layer.bridges])
          ctx.fillStyle = 'rgba(117, 144, 168, 0.55)'
          ctx.fill('evenodd')
          const thin = thinHubPieces(layer, params)
          if (thin.length > 0) {
            regionPath(thin)
            ctx.strokeStyle = token('--status-error')
            ctx.lineWidth = 2
            ctx.stroke()
          }
        }

        regionPath(uncutRegion(layer, params))
        ctx.fillStyle = token('--status-error')
        ctx.globalAlpha = 0.5
        ctx.fill('evenodd')
        ctx.globalAlpha = 1

        regionPath(tool)
        ctx.strokeStyle = token('--accent')
        ctx.setLineDash([5, 4])
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.setLineDash([])
      }

      // The sheet as given in Step 1, centered on X0 Y0 plus its offset: red
      // when this layer's plate does not lie entirely on it.
      if (params.sheetX > 0 && params.sheetY > 0) {
        const fits = blankOnSheet(layerBlank(layer, params), params)
        ctx.strokeStyle = token(fits ? '--fg' : '--status-error')
        ctx.globalAlpha = 0.45
        ctx.setLineDash([8, 5])
        ctx.lineWidth = 1
        const left = params.sheetOffsetX - params.sheetX / 2
        const top = params.sheetOffsetY + params.sheetY / 2
        ctx.strokeRect(sx(left), sy(top), params.sheetX * scale, params.sheetY * scale)
        ctx.setLineDash([])
        ctx.globalAlpha = 1
      }

      // How far the cut reaches on the machine: the tool path plus the tool's
      // other half, with its corners' coordinates.
      if (!superimposed) {
        const path = regionBounds(placeRegion(tool, placement.turn, placement.x, placement.y))
        if (path) {
          const r = params.toolDiameter / 2
          const mm = (v: number) => fmt(Math.round(v * 10) / 10)
          const reach = { minX: path.minX - r, maxX: path.maxX + r, minY: path.minY - r, maxY: path.maxY + r }
          const x0 = sx(reach.minX)
          const y0 = sy(reach.maxY)
          const x1 = sx(reach.maxX)
          const y1 = sy(reach.minY)
          ctx.strokeStyle = token('--accent')
          ctx.globalAlpha = 0.8
          ctx.lineWidth = 1
          ctx.strokeRect(x0, y0, x1 - x0, y1 - y0)
          ctx.globalAlpha = 1
          ctx.fillStyle = token('--accent')
          ctx.font = '11px system-ui, sans-serif'
          ctx.textAlign = 'right'
          ctx.textBaseline = 'top'
          ctx.fillText(`X${mm(reach.minX)} Y${mm(reach.minY)}`, x0 - 4, y1 + 3)
          ctx.textAlign = 'left'
          ctx.textBaseline = 'bottom'
          ctx.fillText(`X${mm(reach.maxX)} Y${mm(reach.maxY)}`, x1 + 4, y0 - 3)
          ctx.textAlign = 'center'
          ctx.fillText(`${mm(reach.maxX - reach.minX)} x ${mm(reach.maxY - reach.minY)} mm`, (x0 + x1) / 2, y0 - 17)
          ctx.textAlign = 'left'
          ctx.font = '11px system-ui, sans-serif'
        }
      }

      // Where the hub disc sits, also where the section covers it.
      if (params.hub && showHub) {
        const hub = onMachine({ x: params.hubX, y: params.hubY })
        ctx.beginPath()
        ctx.arc(sx(hub.x), sy(hub.y), (params.hubDiameter / 2) * scale, 0, 2 * Math.PI)
        ctx.strokeStyle = token('--muted')
        ctx.setLineDash([2, 3])
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.setLineDash([])
      }

      ctx.textBaseline = 'middle'
      for (const original of holes) {
        const hole = drag?.id === original.id ? { ...original, x: drag.x, y: drag.y } : original
        const state = drag?.id === hole.id ? holeState(layer, hole, params) : (analysis.states.get(hole.id) ?? 'waste')
        const color = holeStateColor(state)
        const r = Math.max((params.holeDiameter / 2) * scale, 3)
        const at = onMachine(hole)
        ctx.beginPath()
        ctx.arc(sx(at.x), sy(at.y), r, 0, 2 * Math.PI)
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        if (state === 'mount') {
          ctx.fillStyle = color
          ctx.fill()
        }
        ctx.stroke()
        // Bored by this layer's contour file too: a dashed ring in the tool path's color.
        if (analysis.cutIds.includes(hole.id)) {
          ctx.beginPath()
          ctx.arc(sx(at.x), sy(at.y), r + 4, 0, 2 * Math.PI)
          ctx.strokeStyle = token('--accent')
          ctx.lineWidth = 1.5
          ctx.setLineDash([3, 3])
          ctx.stroke()
          ctx.setLineDash([])
        }
        ctx.fillStyle = color
        ctx.fillText(String(hole.id), sx(at.x) + r + 3, sy(at.y))
        if (drag?.id === hole.id) {
          ctx.fillStyle = token('--fg')
          ctx.fillText(`X${hole.x} Y${hole.y}`, sx(at.x) + r + 3, sy(at.y) + 14)
        }
      }
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [layer, analysis, holes, params, isDark, extent, drag, superimposed, shrunk, showHub, placement, view])

  // A point of the canvas (CSS pixels from its corner) on the machine.
  const toMachine = (px: number, py: number, rect: DOMRect): Point2D => {
    const v = viewRef.current
    return { x: v.cx + (px - rect.width / 2) / v.scale, y: v.cy - (py - rect.height / 2) / v.scale }
  }

  // The wheel zooms about the point under the cursor. A listener of its own:
  // React's wheel handler is passive and cannot keep the page from scrolling.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      const at = toMachine(px, py, rect)
      const fit = (Math.min(rect.width, rect.height) / 2 - 24) / extent
      const scale = Math.min(fit * ZOOM_RANGE[1], Math.max(fit * ZOOM_RANGE[0], viewRef.current.scale * Math.exp(-e.deltaY * ZOOM_RATE)))
      setView({ scale, cx: at.x - (px - rect.width / 2) / scale, cy: at.y + (py - rect.height / 2) / scale })
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
    // toMachine reads the view through its ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extent])

  // The current layer as it lies on the machine, its holes and the sheet; the
  // whole stack in the coverage map.
  const fitView = () => {
    const canvas = canvasRef.current
    if (!canvas || !layer || superimposed) {
      setView(null)
      return
    }
    const rect = canvas.getBoundingClientRect()
    const placed = placeLayer(layer, placement)
    const bounds = regionBounds(toolRegion(placed, params)) ?? placed.bounds
    let { minX, minY, maxX, maxY } = bounds
    const add = (x: number, y: number) => {
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
    add(0, 0)
    for (const hole of holes) {
      const p = placePoint(hole, placement.turn, placement.x, placement.y)
      add(p.x, p.y)
    }
    if (params.sheetX > 0 && params.sheetY > 0) {
      add(params.sheetOffsetX - params.sheetX / 2, params.sheetOffsetY - params.sheetY / 2)
      add(params.sheetOffsetX + params.sheetX / 2, params.sheetOffsetY + params.sheetY / 2)
    }
    const margin = 24 + params.holeDiameter
    const scale = Math.min((rect.width - 2 * margin) / Math.max(maxX - minX, 1), (rect.height - 2 * margin) / Math.max(maxY - minY, 1))
    setView({ cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, scale: Math.max(scale, 0.01) })
  }

  const toModel = (e: PointerEvent | MouseEvent): Point2D => {
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect()
    const p = toMachine(e.clientX - rect.left, e.clientY - rect.top, rect)
    // Back from the layer's placement to sculpture coordinates.
    return turnPoint({ x: p.x - placement.x, y: p.y - placement.y }, -placement.turn)
  }

  const holeAt = (p: Point2D): Hole | null => {
    const reach = Math.max(params.holeDiameter / 2, GRAB_PX / viewRef.current.scale)
    let best: Hole | null = null
    let bestDistance = reach
    for (const hole of holes) {
      const d = Math.hypot(hole.x - p.x, hole.y - p.y)
      if (d <= bestDistance) {
        bestDistance = d
        best = hole
      }
    }
    return best
  }

  const enabled = layer !== null

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none"
        onPointerDown={(e) => {
          if (!enabled) return
          const p = toModel(e)
          const hit = e.button === 0 ? holeAt(p) : null
          if (hit) {
            e.currentTarget.setPointerCapture(e.pointerId)
            setDrag({ id: hit.id, x: hit.x, y: hit.y, moved: false })
          } else if (e.button === 0 && addMode) {
            onAdd({ x: snap(p.x), y: snap(p.y) })
          } else if (e.button === 0 || e.button === 1) {
            // Empty space, or the middle button anywhere: pan.
            e.preventDefault()
            e.currentTarget.setPointerCapture(e.pointerId)
            panRef.current = { x: e.clientX, y: e.clientY, from: viewRef.current }
            e.currentTarget.style.cursor = 'grabbing'
          }
        }}
        onPointerMove={(e) => {
          if (!enabled) return
          const pan = panRef.current
          if (pan) {
            const { from } = pan
            setView({ scale: from.scale, cx: from.cx - (e.clientX - pan.x) / from.scale, cy: from.cy + (e.clientY - pan.y) / from.scale })
            return
          }
          const p = toModel(e)
          if (drag) {
            const x = snap(p.x)
            const y = snap(p.y)
            if (x !== drag.x || y !== drag.y) setDrag({ ...drag, x, y, moved: true })
            return
          }
          e.currentTarget.style.cursor = holeAt(p) ? 'grab' : addMode ? 'crosshair' : 'move'
        }}
        onPointerUp={(e) => {
          if (panRef.current) {
            panRef.current = null
            e.currentTarget.style.cursor = 'move'
            return
          }
          if (drag?.moved) onMove(drag.id, { x: drag.x, y: drag.y })
          setDrag(null)
        }}
        onPointerCancel={() => {
          panRef.current = null
          setDrag(null)
        }}
        onContextMenu={(e) => {
          const hit = enabled ? holeAt(toModel(e)) : null
          if (!hit) return
          e.preventDefault()
          onRemove(hit.id)
        }}
      />
      <button
        type="button"
        onClick={fitView}
        className="absolute right-2 top-2 rounded border border-border bg-bg/80 px-2 py-1 text-xs text-fg hover:border-accent"
      >
        Fit View
      </button>
    </div>
  )
}
