import { useEffect, useRef, type InputHTMLAttributes, type PointerEvent } from 'react'
import { ChevronDownIcon, ChevronUpIcon } from '../icons'

// Deliberately doesn't Omit 'type' — call sites keep writing
// `type="number"` (harmless, overridden below) so swapping the tag name
// is the only change needed at each of the ~26 existing call sites.
interface NumberInputProps extends InputHTMLAttributes<HTMLInputElement> {
  onAdjust: (delta: number) => void
}

function stepAmount(step: NumberInputProps['step']): number {
  const parsed = Number(step)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

// BL-26: holding a button repeats the step like a native spinner — one
// step on press, then after REPEAT_DELAY_MS one every REPEAT_INTERVAL_MS
// until release (or the pointer leaves the button).
const REPEAT_DELAY_MS = 400
const REPEAT_INTERVAL_MS = 75

// The repeat timer must always call the LATEST onAdjust: it steps from the
// value committed in the most recent render (useNumberField, Settings'
// handleAdjust), so a closure captured at press time would keep stepping
// from the same stale value.
function useHoldRepeat(onAdjust: (delta: number) => void) {
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

// Drop-in replacement for `<input type="number">` that hides the browser's
// native spinner and replaces it with two small, theme-colored buttons
// side by side (not stacked, unlike the native one) in the field's right
// edge — the native spinner is unstyleable and, on every theme here,
// renders as plain OS-grey, clashing hardest against the Arcade Studio
// themes' near-black chrome. `onAdjust` steps from the field's last
// *committed* value (see useNumberField.ts), not the transient display
// text, and isn't clamped to `min`/`max` — typing a value outside that
// range already isn't blocked today (min/max only ever drove the native
// spinner and :invalid styling), so the buttons stay exactly as
// permissive as the keyboard.
export function NumberInput({ className, onAdjust, step, ...rest }: NumberInputProps) {
  const delta = stepAmount(step)
  const holdHandlers = useHoldRepeat(onAdjust)
  return (
    <div className="relative">
      <input
        type="number"
        step={step}
        className={`${className} appearance-none pr-11 [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
        {...rest}
      />
      <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
        <button
          type="button"
          tabIndex={-1}
          aria-label="Increase"
          onMouseDown={(e) => e.preventDefault()}
          {...holdHandlers(delta)}
          className="flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-border/40 hover:text-accent"
        >
          <ChevronUpIcon className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-label="Decrease"
          onMouseDown={(e) => e.preventDefault()}
          {...holdHandlers(-delta)}
          className="flex h-5 w-5 items-center justify-center rounded border-l border-field-border text-muted hover:bg-border/40 hover:text-accent"
        >
          <ChevronDownIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
