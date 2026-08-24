import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HintIcon } from '../icons'

interface HintPopoverProps {
  text: string
}

// Matches the w-56 popover box below — kept as a JS constant since we need
// it before the box is measured (see the chicken-and-egg note below).
const POPOVER_WIDTH = 224
const EDGE_MARGIN = 8
const GAP = 4
// Conservative estimate for the popover's rendered height, used only to
// decide whether it should flip above the icon instead of below. The
// portal element doesn't exist yet on the render where we compute this (it
// only mounts once `position` is set), so we can't measure the real height
// in time — a fixed estimate is simpler than a two-pass measure/correct.
const ESTIMATED_HEIGHT = 90

export function HintPopover({ text }: HintPopoverProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Positioned via the icon's viewport rect (position: fixed) rather than
  // being absolutely positioned inside a `relative` ancestor — the wizard's
  // step panel has `overflow-y-auto`, which per the CSS spec forces
  // `overflow-x` to `auto` too, silently clipping anything that would
  // otherwise spill past the panel's edge. Rendering through a portal to
  // `document.body` escapes that clipping ancestor entirely; the edge
  // clamping below keeps it fully on-screen regardless of where the icon
  // sits (e.g. Width's icon near the panel's left edge).
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setPosition(null)
      return
    }
    const rect = buttonRef.current.getBoundingClientRect()
    let left = rect.right - POPOVER_WIDTH
    left = Math.min(left, window.innerWidth - POPOVER_WIDTH - EDGE_MARGIN)
    left = Math.max(left, EDGE_MARGIN)
    const spaceBelow = window.innerHeight - rect.bottom
    let top =
      spaceBelow >= ESTIMATED_HEIGHT + GAP ? rect.bottom + GAP : rect.top - GAP - ESTIMATED_HEIGHT
    top = Math.max(top, EDGE_MARGIN)
    setPosition({ top, left })
  }, [open])

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (buttonRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    // Scroll can come from the wizard step panel (overflow-y-auto), not
    // just the window — capture phase catches scroll on any ancestor.
    const handleScroll = () => setOpen(false)
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [open])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Hint: ${text}`}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
      >
        <HintIcon className="h-4 w-4" />
      </button>
      {open &&
        position &&
        createPortal(
          <div
            ref={popoverRef}
            role="tooltip"
            style={{ top: position.top, left: position.left }}
            className="fixed z-50 w-56 rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-600 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
          >
            {text}
          </div>,
          document.body,
        )}
    </>
  )
}
