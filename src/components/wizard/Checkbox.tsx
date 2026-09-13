import type { ReactNode } from 'react'
import { CheckIcon } from '../icons'

interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  // Extra classes for the wrapping <label> — layout classes (flex/
  // items-center/gap-2/cursor-pointer) are already baked in below.
  className?: string
  // Rendered after the label text, e.g. a trailing HintPopover.
  children?: ReactNode
}

// Custom-drawn checkbox — same "hide the native, unstylable control and
// render our own on top" pattern as NumberInput's spinner buttons. The
// native <input> stays mounted (sr-only, not display:none) for real
// checkbox semantics/keyboard/screen-reader/form behavior; only its
// visual box is replaced. peer + peer-focus-visible: restores a visible
// keyboard focus ring, which the custom box would otherwise swallow.
//
// Checked-state colors reuse the exact border-selected-border/
// bg-selected-bg/text-selected-fg trio already used for the selected
// state of Step4Output's interpolation toggle buttons — a checkbox is
// the same "user's own choice/commit" category of control (see
// CLAUDE.md's Theme notes: róż/--selected-* in Arcade Studio, vs. cyan
// --accent for structural/navigation elements), so it gets the same
// already-calibrated per-theme color instead of a new one.
export function Checkbox({ checked, onChange, label, className, children }: CheckboxProps) {
  return (
    <label className={`flex cursor-pointer items-center gap-2 ${className ?? ''}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={
          checked
            ? 'flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 border-selected-border bg-selected-bg text-selected-fg shadow-[var(--glow-selected)] transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent-strong peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-bg'
            : 'flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 border-field-border bg-transparent transition-colors hover:border-selected-border peer-focus-visible:ring-2 peer-focus-visible:ring-accent-strong peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-bg'
        }
      >
        {checked && <CheckIcon className="h-2.5 w-2.5" />}
      </span>
      {label}
      {children}
    </label>
  )
}
