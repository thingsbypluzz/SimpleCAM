import { type MouseEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import type { Point2D } from '../types/wizard'
import { blankOnSheet, layerBlank } from './gcode'
import { type Region, type Ring, offset } from './geometry'
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
function coverageImage(shrunk: Region[], width: number, height: number, scale: number): HTMLCanvasElement {
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
  const k = scale / HEAT_STEP
  for (const region of shrunk) {
    ctx.clearRect(0, 0, w, h)
    ctx.beginPath()
    for (const piece of region) {
      for (const ring of [piece.outer, ...piece.holes]) {
        ring.forEach((p, i) => {
          const x = w / 2 + p.x * k
          const y = h / 2 - p.y * k
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

interface Drag {
  id: number
  x: number
  y: number
  moved: boolean
}

// One layer from above, in machine coordinates: section, tool path, what the
// tool cannot reach, and every master hole in its state for this layer. The
// scale comes from the whole stack, so stepping through layers never moves a
// hole on screen. Holes are placed by hand here: click to add, drag to move,
// right-click to remove. A drag shows the hole's state on this layer as it
// goes and reaches the rest of the page (stack, 3D) only on release.
export function LayerView({ layers, layer, analysis, holes, params, isDark, addMode, superimposed, showHub, onAdd, onMove, onRemove }: LayerViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scaleRef = useRef(1)
  const [drag, setDrag] = useState<Drag | null>(null)
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
      const scale = (Math.min(width, height) / 2 - 24) / extent
      scaleRef.current = scale
      const sx = (x: number) => width / 2 + x * scale
      const sy = (y: number) => height / 2 - y * scale
      const ringPath = (ring: Ring) => {
        ring.forEach((p, i) => (i === 0 ? ctx.moveTo(sx(p.x), sy(p.y)) : ctx.lineTo(sx(p.x), sy(p.y))))
        ctx.closePath()
      }
      const regionPath = (region: Region) => {
        ctx.beginPath()
        for (const piece of region) {
          ringPath(piece.outer)
          piece.holes.forEach(ringPath)
        }
      }

      // Axes through the fixture's zero.
      ctx.strokeStyle = token('--border')
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, height / 2)
      ctx.lineTo(width, height / 2)
      ctx.moveTo(width / 2, 0)
      ctx.lineTo(width / 2, height)
      ctx.stroke()
      ctx.fillStyle = token('--muted')
      ctx.font = '11px system-ui, sans-serif'
      ctx.textBaseline = 'top'
      ctx.fillText('X0 Y0', width / 2 + 4, height / 2 + 4)

      if (superimposed) {
        const key = `${width}x${height}:${scale}`
        if (!heatRef.current || heatRef.current.key !== key || heatRef.current.shrunk !== shrunk) {
          heatRef.current = { key, shrunk, image: coverageImage(shrunk, width, height, scale) }
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

      // Where the hub disc sits, also where the section covers it.
      if (params.hub && showHub) {
        ctx.beginPath()
        ctx.arc(sx(params.hubX), sy(params.hubY), (params.hubDiameter / 2) * scale, 0, 2 * Math.PI)
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
        ctx.beginPath()
        ctx.arc(sx(hole.x), sy(hole.y), r, 0, 2 * Math.PI)
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
          ctx.arc(sx(hole.x), sy(hole.y), r + 4, 0, 2 * Math.PI)
          ctx.strokeStyle = token('--accent')
          ctx.lineWidth = 1.5
          ctx.setLineDash([3, 3])
          ctx.stroke()
          ctx.setLineDash([])
        }
        ctx.fillStyle = color
        ctx.fillText(String(hole.id), sx(hole.x) + r + 3, sy(hole.y))
        if (drag?.id === hole.id) {
          ctx.fillStyle = token('--fg')
          ctx.fillText(`X${hole.x} Y${hole.y}`, sx(hole.x) + r + 3, sy(hole.y) + 14)
        }
      }
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [layer, analysis, holes, params, isDark, extent, drag, superimposed, shrunk, showHub])

  const toModel = (e: PointerEvent | MouseEvent): Point2D => {
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect()
    const scale = scaleRef.current
    return { x: (e.clientX - rect.left - rect.width / 2) / scale, y: -(e.clientY - rect.top - rect.height / 2) / scale }
  }

  const holeAt = (p: Point2D): Hole | null => {
    const reach = Math.max(params.holeDiameter / 2, GRAB_PX / scaleRef.current)
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
    <canvas
      ref={canvasRef}
      className="block h-full w-full touch-none"
      onPointerDown={(e) => {
        if (!enabled || e.button !== 0) return
        const p = toModel(e)
        const hit = holeAt(p)
        if (hit) {
          e.currentTarget.setPointerCapture(e.pointerId)
          setDrag({ id: hit.id, x: hit.x, y: hit.y, moved: false })
        } else if (addMode) {
          onAdd({ x: snap(p.x), y: snap(p.y) })
        }
      }}
      onPointerMove={(e) => {
        if (!enabled) return
        const p = toModel(e)
        if (drag) {
          const x = snap(p.x)
          const y = snap(p.y)
          if (x !== drag.x || y !== drag.y) setDrag({ ...drag, x, y, moved: true })
          return
        }
        e.currentTarget.style.cursor = holeAt(p) ? 'grab' : addMode ? 'crosshair' : 'default'
      }}
      onPointerUp={() => {
        if (drag?.moved) onMove(drag.id, { x: drag.x, y: drag.y })
        setDrag(null)
      }}
      onPointerCancel={() => setDrag(null)}
      onContextMenu={(e) => {
        const hit = enabled ? holeAt(toModel(e)) : null
        if (!hit) return
        e.preventDefault()
        onRemove(hit.id)
      }}
    />
  )
}
