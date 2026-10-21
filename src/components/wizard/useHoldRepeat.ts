import { useEffect, useRef, type PointerEvent } from 'react'

// BL-26: holding a button repeats the step like a native spinner — one
// step on press, then after REPEAT_DELAY_MS one every REPEAT_INTERVAL_MS
// until release (or the pointer leaves the button).
const REPEAT_DELAY_MS = 400
const REPEAT_INTERVAL_MS = 75

// The repeat timer must always call the LATEST onAdjust: it steps from the
// value committed in the most recent render (useNumberField, Settings'
// handleAdjust), so a closure captured at press time would keep stepping
// from the same stale value.
export function useHoldRepeat(onAdjust: (delta: number) => void) {
  const onAdjustRef = useRef(onAdjust)
  useEffect(() => {
    onAdjustRef.current = onAdjust
  })
  const timers = useRef<{ delay?: ReturnType<typeof setTimeout>; interval?: ReturnType<typeof setInterval> }>({})

  const stop = () => {
    clearTimeout(timers.current.delay)
    clearInterval(timers.current.interval)
    timers.current = {}
  }
  useEffect(() => stop, [])

  const start = (e: PointerEvent<HTMLButtonElement>, delta: number) => {
    if (e.button !== 0) return
    stop()
    onAdjustRef.current(delta)
    timers.current.delay = setTimeout(() => {
      timers.current.interval = setInterval(() => onAdjustRef.current(delta), REPEAT_INTERVAL_MS)
    }, REPEAT_DELAY_MS)
  }

  return (delta: number) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => start(e, delta),
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    // A long press on touch would otherwise open the context menu.
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
  })
}
