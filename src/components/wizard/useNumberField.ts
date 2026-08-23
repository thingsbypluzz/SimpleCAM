import { useState, type ChangeEvent } from 'react'

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
export function useNumberField(value: number, onCommit: (next: number) => void) {
  const [text, setText] = useState(() => String(value))

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value
    setText(next)
    const parsed = Number(next)
    if (Number.isFinite(parsed)) onCommit(parsed)
  }

  const onBlur = () => setText(String(value))

  return { value: text, onChange, onBlur }
}
