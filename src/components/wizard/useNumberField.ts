import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'

// 1/100mm is more precision than any of these fields (mm dimensions,
// feedrates, angles) is ever meaningfully set to — plenty per the project's
// own precision requirement. Rounds away plain binary floating-point noise
// from repeated addition in onAdjust below (0.1 + 0.1 + 0.1 === 0.30000000
// 000000004 in JS), which otherwise both looks wrong in the field and
// silently drifts the true value a hair further from the intended one on
// every click.
const STEP_PRECISION = 100
export function roundToStepPrecision(n: number): number {
  return Math.round(n * STEP_PRECISION) / STEP_PRECISION
}

// How long the field waits after the last keystroke before committing what
// was typed (BL-89).
const COMMIT_IDLE_MS = 500

interface NumberFieldOptions {
  // For a field whose value can also change from outside while it isn't
  // being edited (two fields showing the same quantity in different units,
  // each derived from the other) — resyncs the display whenever the
  // committed value changes and this field doesn't have focus. Off by
  // default: every other field only ever changes through itself.
  syncWhenBlurred?: boolean
  // 'deferred' (default, BL-89): typing commits on blur, on Enter or after
  // COMMIT_IDLE_MS without a keystroke — the half-typed states on the way
  // to a number ("1", "12", "125") never reach validation, the previews or
  // a preset being edited. 'live': every keystroke that parses commits —
  // for fields whose results are cheap and shown right next to them
  // (Feedrate Calculator).
  commit?: 'deferred' | 'live'
}

// Decouples a numeric <input>'s displayed text from the committed value it
// feeds into WizardParams. Without this, `value={geometry.x}` /
// `onChange={(e) => update({ x: Number(e.target.value) })}` force the
// display back to "0" on every keystroke while the field is empty
// (`Number('') === 0`), so it can never actually be cleared and retyped.
// Only text that parses to a finite number is ever committed; blur resyncs
// the display to the committed value (clears a leftover empty field, trims
// a trailing "."). The up/down buttons and the Arrow keys commit at once
// in either mode; Escape drops what was typed and not yet committed.
export function useNumberField(value: number, onCommit: (next: number) => void, opts: NumberFieldOptions = {}) {
  const live = opts.commit === 'live'
  const [text, setText] = useState(() => String(value))
  const [focused, setFocused] = useState(false)
  const [lastValue, setLastValue] = useState(value)
  // Set on blur: the display resyncs in the render that follows, where
  // `value` already includes whatever the blur just committed (or didn't —
  // an onCommit is free to reject a value).
  const [resyncOnRender, setResyncOnRender] = useState(false)
  if (resyncOnRender) {
    setResyncOnRender(false)
    setText(String(value))
  }
  if (opts.syncWhenBlurred && value !== lastValue) {
    setLastValue(value)
    if (!focused) setText(String(value))
  }

  // The idle timer must call the LATEST onCommit: call sites build their
  // patch from the current params object (`{ ...pocket, width }`), so one
  // captured at keystroke time could undo a change made since.
  const onCommitRef = useRef(onCommit)
  useEffect(() => {
    onCommitRef.current = onCommit
  })
  const pending = useRef<{ timer?: ReturnType<typeof setTimeout>; value: number | null }>({ value: null })
  // An Arrow key was just pressed: the change it causes (the native step of
  // a number input) commits at once.
  const stepKeyRef = useRef(false)

  const dropPending = () => {
    clearTimeout(pending.current.timer)
    pending.current = { value: null }
  }
  const flushPending = () => {
    const { value: typed } = pending.current
    dropPending()
    if (typed !== null) onCommitRef.current(typed)
  }
  // Unmounting drops what is still pending instead of committing it: the
  // step panels remount when a preset is loaded, and a late commit would
  // write the old text into the freshly loaded preset. Leaving a field any
  // other way (another step, Generate, a preset slot) blurs it first.
  useEffect(() => dropPending, [])

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value
    setText(next)
    const parsed = Number(next)
    const commitNow = live || stepKeyRef.current
    stepKeyRef.current = false
    dropPending()
    if (!Number.isFinite(parsed)) return
    // An empty field parses to 0 — not a value anyone typed, so a deferred
    // field keeps its committed value (and shows it again on blur).
    if (!live && next.trim() === '') return
    if (commitNow) {
      onCommit(parsed)
      return
    }
    pending.current = { value: parsed, timer: setTimeout(flushPending, COMMIT_IDLE_MS) }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    stepKeyRef.current = e.key === 'ArrowUp' || e.key === 'ArrowDown'
    if (e.key === 'Enter') flushPending()
    else if (e.key === 'Escape' && pending.current.value !== null) {
      dropPending()
      setText(String(value))
    }
  }

  const onFocus = () => setFocused(true)
  const onBlur = () => {
    flushPending()
    setFocused(false)
    setResyncOnRender(true)
  }

  // Steps from the last *committed* value, not the possibly-empty/invalid
  // `text` currently on screen — used by NumberInput's custom up/down
  // buttons (replacing the browser's native spinner, which stepped from
  // its own internal parsed value the same way). Must also set `text`
  // directly: `value` is a prop here, so committing alone only updates the
  // displayed text once the parent re-renders with the new prop — on this
  // hook's very own field, that never happens (nothing else changes
  // `text`), so the input looked stuck at the old number until something
  // else (blur, remounting the step) forced a resync.
  const onAdjust = (delta: number) => {
    dropPending()
    const next = roundToStepPrecision(value + delta)
    setText(String(next))
    onCommit(next)
  }

  return { value: text, onChange, onKeyDown, onFocus, onBlur, onAdjust }
}
