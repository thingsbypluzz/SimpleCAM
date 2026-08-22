import { useEffect, useRef } from 'react'
import type { WizardParams } from '../../types/wizard'
import { drawToolpath } from './drawToolpath'

interface ToolpathCanvasProps {
  params: WizardParams
  isDark: boolean
  overlayParams: WizardParams[]
  showActivePattern: boolean
}

export function ToolpathCanvas({
  params,
  isDark,
  overlayParams,
  showActivePattern,
}: ToolpathCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

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
      drawToolpath(ctx, width, height, params, isDark, overlayParams, showActivePattern)
    }

    render()

    const resizeObserver = new ResizeObserver(render)
    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [params, isDark, overlayParams, showActivePattern])

  return (
    <div ref={containerRef} className="min-h-0 w-full flex-1">
      <canvas ref={canvasRef} />
    </div>
  )
}
