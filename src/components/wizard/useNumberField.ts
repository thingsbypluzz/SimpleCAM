import { useState, type ChangeEvent } from 'react'

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

// Decouples a numeric <input>'s displayed text from the committed value it
// feeds into WizardParams. Without this, `value={geometry.x}` /
// `onChange={(e) => update({ x: Number(e.target.value) })}` force the
// display back to "0" on every keystroke while the field is empty
// (`Number('') === 0`), so it can never actually be cleared and retyped.
// Commits live on every keystroke that parses to a finite number — same
// always-live Preview behavior as before, just decoupled from the display —
// and only resyncs the display to the committed value on blur (clears a
// leftover empty field, trims a trailing "."), never gating when Preview
// updates.
// `syncWhenBlurred`: for a field whose value can also change from outside
// while it isn't being edited (two fields showing the same quantity in
// different units, each derived from the other) — resyncs the display
// whenever the committed value changes and this field doesn't have focus.
// Off by default: every other field only ever changes through itself.
export function useNumberField(value: number, onCommit: (next: number) => void, opts: { syncWhenBlurred?: boolean } = {}) {
  const [text, setText] = useState(() => String(value))
  const [focused, setFocused] = useState(false)
  const [lastValue, setLastValue] = useState(value)
  if (opts.syncWhenBlurred && value !== lastValue) {
    setLastValue(value)
    if (!focused) setText(String(value))
  }

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value
    setText(next)
    const parsed = Number(next)
    if (Number.isFinite(parsed)) onCommit(parsed)
  }

  const onFocus = () => setFocused(true)
  const onBlur = () => {
    setFocused(false)
    setText(String(value))
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
    const next = roundToStepPrecision(value + delta)
    setText(String(next))
    onCommit(next)
  }

  return { value: text, onChange, onFocus, onBlur, onAdjust }
}
