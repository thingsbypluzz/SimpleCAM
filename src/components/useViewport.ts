import { useEffect, useSyncExternalStore } from 'react'

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
  )
}

// BL-8: the three layouts of the app. 'wide' — the 4-step accordion beside
// the preview (a desktop, a large laptop); 'medium' — a step rail above
// the open step, beside the preview (a tablet held landscape, a small
// laptop); 'narrow' — one view at a time, switched by the bottom bar (a
// tablet held portrait).
export type LayoutMode = 'wide' | 'medium' | 'narrow'

export const WIDE_MIN_WIDTH = 1280
export const MEDIUM_MIN_WIDTH = 900

export function useLayoutMode(): LayoutMode {
  const wide = useMediaQuery(`(min-width: ${WIDE_MIN_WIDTH}px)`)
  const narrow = useMediaQuery(`(max-width: ${MEDIUM_MIN_WIDTH - 1}px)`)
  return wide ? 'wide' : narrow ? 'narrow' : 'medium'
}

// A finger is the main pointer: no hover, larger targets, the app's own
// numeric keypad, long press on the Preset Bar.
export function useCoarsePointer(): boolean {
  return useMediaQuery('(pointer: coarse)')
}

// On touch devices the system keyboard covers the bottom of the page
// without resizing it, so `100dvh` would leave the lower part unreachable.
// Publishes the height that is actually visible as `--app-h` (the app's
// root sizes itself from it). Left alone while the page is pinch-zoomed —
// zooming shrinks the visual viewport too.
export function useVisibleHeight(enabled: boolean): void {
  useEffect(() => {
    const viewport = window.visualViewport
    if (!enabled || !viewport) return
    const root = document.documentElement
    const apply = () => {
      if (viewport.scale > 1.01) return
      root.style.setProperty('--app-h', `${Math.round(viewport.height)}px`)
    }
    apply()
    viewport.addEventListener('resize', apply)
    return () => {
      viewport.removeEventListener('resize', apply)
      root.style.removeProperty('--app-h')
    }
  }, [enabled])
}
