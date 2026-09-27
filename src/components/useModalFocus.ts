import { useEffect, useRef } from 'react'

// Keyboard behavior shared by the app's modals (Settings, Feedrate
// Calculator): focus moves to `initialFocusRef` on open and returns to
// whatever was focused before once the modal unmounts (otherwise a keyboard
// user's focus silently drops back to <body>); Escape closes; Tab/Shift+Tab
// wrap within the dialog instead of escaping to the page behind the
// backdrop. The modals render inline in App's tree, not portaled, so
// `inert` on sibling content isn't a practical option — a keydown-based
// trap covers the same requirement without a new dependency.
export function useModalFocus<T extends HTMLElement>(onClose: () => void) {
  const modalRef = useRef<HTMLDivElement>(null)
  const initialFocusRef = useRef<T>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    initialFocusRef.current?.focus()
    return () => {
      previouslyFocused?.focus?.()
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !modalRef.current) return
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return { modalRef, initialFocusRef }
}
