import { useEffect, useRef, useState } from 'react'
import { OpenFileIcon, SaveFileIcon } from './icons'

interface ProjectMenuProps {
  // null until a project has been saved or loaded.
  name: string | null
  dirty: boolean
  presetCount: number
  onLoad: () => void
  onSave: () => void
}

// BL-8: the project controls of the medium and narrow layouts — the
// project's name as one button in the Header's corner, Load and Save in
// the menu it opens (the wide layout shows all three side by side).
export function ProjectMenu({ name, dirty, presetCount, onLoad, onSave }: ProjectMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const itemClass =
    'flex h-12 items-center gap-2.5 rounded-md px-3 text-left text-base font-medium text-fg hover:bg-border/40 disabled:opacity-50 disabled:hover:bg-transparent'

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Project menu: ${name ?? 'Untitled'}${dirty ? ' (unsaved changes)' : ''}`}
        className={`flex h-11 max-w-44 items-center gap-1.5 rounded-md border border-edit px-3 text-xs font-semibold text-edit-fg shadow-[var(--glow-edit)] ${open ? 'bg-edit-bg' : ''}`}
      >
        <span className="truncate">{name ?? 'Untitled'}</span>
        {dirty && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-edit" />}
        <span aria-hidden="true" className="shrink-0">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Project"
          className="absolute top-full right-0 z-30 mt-2 flex w-56 flex-col rounded-lg border border-field-border bg-bg p-1.5 shadow-xl"
        >
          <p className="px-3 pt-1.5 pb-1 text-xs text-muted">
            {presetCount === 1 ? '1 preset' : `${presetCount} presets`}
            {dirty ? ' · changed since saved' : ''}
          </p>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onLoad()
            }}
            className={itemClass}
          >
            <OpenFileIcon className="h-5 w-5" />
            Load project
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={presetCount === 0}
            onClick={() => {
              setOpen(false)
              onSave()
            }}
            className={itemClass}
          >
            <SaveFileIcon className="h-5 w-5" />
            Save project
          </button>
        </div>
      )}
    </div>
  )
}
