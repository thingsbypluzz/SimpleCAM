import { useState, type FormEvent } from 'react'
import { MAX_PROJECT_NAME_LENGTH, projectFilename, sanitizeProjectName } from '../lib/projectFile'
import { useModalFocus } from './useModalFocus'

interface ProjectNameModalProps {
  // Suggested name: the current project's, or empty for an untitled one.
  initialName: string
  presetCount: number
  onSave: (name: string) => void
  onClose: () => void
}

// BL-112: asks for the project's name before its file is downloaded. Same
// keyboard behavior as the other modals (useModalFocus): focus lands in the
// field, Escape closes, Enter saves.
export function ProjectNameModal({ initialName, presetCount, onSave, onClose }: ProjectNameModalProps) {
  const { modalRef, initialFocusRef: inputRef } = useModalFocus<HTMLInputElement>(onClose)
  const [name, setName] = useState(initialName)
  const clean = sanitizeProjectName(name)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (clean) onSave(clean)
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
          <p className="text-sm text-muted">
            Saves {presetCount === 1 ? 'the 1 preset' : `all ${presetCount} presets`} to one file you can load back later, here or
            on another computer. Machine and tool settings are not included.
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-value">Project name</span>
            <input
              ref={inputRef}
              type="text"
              value={name}
              maxLength={MAX_PROJECT_NAME_LENGTH}
              onChange={(e) => setName(e.target.value)}
              onFocus={(e) => e.target.select()}
              className="rounded-md border border-field-border bg-transparent px-3 py-2 text-sm text-fg outline-none focus:border-accent"
            />
          </label>
          <p className="text-xs text-muted">File: {clean ? projectFilename(clean) : '—'}</p>
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
