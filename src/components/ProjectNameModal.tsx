import { useState, type FormEvent } from 'react'
import { MAX_PROJECT_NAME_LENGTH, projectFilename, sanitizeProjectName } from '../lib/projectFile'
import { useModalFocus } from './useModalFocus'

interface ProjectNameModalProps {
  // Suggested name: the current project's, or empty for an untitled one.
  initialName: string
  presetCount: number
  onSave: (name: string) => void
  onClose: () => void
  // BL-8: full screen like Settings and the Feedrate Calculator (a touch
  // device, a small window).
  fullScreen?: boolean
}

// BL-112: asks for the project's name before its file is downloaded. Same
// keyboard behavior as the other modals (useModalFocus): focus lands in the
// field, Escape closes, Enter saves. Full screen: Back on the left and
// Save file on the right of the top bar, the field right under it — the
// system keyboard comes up for it and nothing it needs sits at the bottom.
export function ProjectNameModal({ initialName, presetCount, onSave, onClose, fullScreen = false }: ProjectNameModalProps) {
  const { modalRef, initialFocusRef: inputRef } = useModalFocus<HTMLInputElement>(onClose)
  const [name, setName] = useState(initialName)
  const clean = sanitizeProjectName(name)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (clean) onSave(clean)
  }

  const description = (
    <p className="text-sm text-muted">
      Saves {presetCount === 1 ? 'the 1 preset' : `all ${presetCount} presets`} to one file you can load back later, here or on
      another computer. Machine and tool settings are not included.
    </p>
  )
  const nameField = (
    <>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-value">Project name</span>
        <input
          ref={inputRef}
          type="text"
          value={name}
          maxLength={MAX_PROJECT_NAME_LENGTH}
          onChange={(e) => setName(e.target.value)}
          onFocus={(e) => e.target.select()}
          className="rounded-md border border-field-border bg-transparent px-3 py-2 text-sm text-fg outline-none focus:border-accent pointer-coarse:min-h-11 pointer-coarse:text-base"
        />
      </label>
      <p className="text-xs text-muted">File: {clean ? projectFilename(clean) : '—'}</p>
    </>
  )

  if (fullScreen) {
    return (
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-name-title"
        className="fixed inset-x-0 top-0 z-50 flex h-[var(--app-h,100dvh)] flex-col bg-bg"
      >
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2">
            <button
              type="button"
              onClick={onClose}
              aria-label="Cancel and go back"
              className="flex h-11 items-center gap-2 rounded-md border border-border px-3.5 text-sm font-semibold text-value hover:bg-border/40"
            >
              <span aria-hidden="true">‹</span>
              Back
            </button>
            <h2 id="project-name-title" className="min-w-0 flex-1 truncate text-base font-semibold text-fg">
              Save project
            </h2>
            <button
              type="submit"
              disabled={!clean}
              className="flex h-11 shrink-0 items-center rounded-md bg-accent px-4 text-sm font-semibold text-btn-fg shadow-[var(--glow-btn)] transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save file
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-5">
            {nameField}
            {description}
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-name-title"
        className="w-[420px] max-w-[95vw] rounded-lg border border-border bg-bg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-5">
          <h2 id="project-name-title" className="text-sm font-semibold text-fg">
            Save project
          </h2>
          {description}
          {nameField}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted transition hover:border-field-border hover:text-fg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!clean}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-btn-fg shadow-[var(--glow-btn)] transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save file
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
