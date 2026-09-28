import { useId, useState, type ReactNode } from 'react'
import { DisclosureIcon } from '../icons'

// Collapsed note ids, kept for the session only (module state: survives the
// step panel unmounting on a step switch, resets on reload).
const collapsedNotes = new Set<string>()

interface InfoNoteProps {
  // Stable per-note key for the session memory above.
  id: string
  // One-line summary, visible collapsed or not.
  title: ReactNode
  children: ReactNode
  // Optional action (e.g. an Apply button) — stays visible when collapsed.
  action?: ReactNode
}

// Muted context note in the wizard (chip thinning, helix, stepdown hints):
// a disclosure triangle + title that folds the explanation away. Expanded
// by default.
export function InfoNote({ id, title, children, action }: InfoNoteProps) {
  const bodyId = useId()
  const [open, setOpen] = useState(() => !collapsedNotes.has(id))

  const toggle = () => {
    if (open) collapsedNotes.add(id)
    else collapsedNotes.delete(id)
    setOpen(!open)
  }

  return (
    <div className="flex items-start gap-3 text-sm text-muted">
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex items-center gap-1.5 text-left font-medium transition hover:text-fg"
        >
          <DisclosureIcon className={`h-2.5 w-2.5 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
          {title}
        </button>
        {open && (
          <p id={bodyId} className="mt-1 pl-4">
            {children}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}
