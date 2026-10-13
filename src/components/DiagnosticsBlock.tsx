import { useState } from 'react'
import { collectDiagnostics, diagnosticsText } from './diagnostics'

type CopyState = 'idle' | 'copied' | 'failed'

// Settings → About: what this browser and device offer (diagnostics.ts),
// read once when the section opens. The rows stay selectable, so they can
// be copied by hand where the clipboard is not available.
export function DiagnosticsBlock({ simple3DPreview }: { simple3DPreview: boolean }) {
  const [rows] = useState(() => collectDiagnostics(simple3DPreview))
  const [copyState, setCopyState] = useState<CopyState>('idle')

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(diagnosticsText(rows))
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-value">Diagnostics</span>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-md border border-field-border px-3 py-1 text-sm font-medium text-value hover:border-accent hover:text-accent pointer-coarse:px-4 pointer-coarse:py-2"
        >
          {copyState === 'copied' ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="text-sm text-muted">
        What this browser and device support. Include it when you report a problem.
      </p>
      {copyState === 'failed' && (
        <p role="status" className="text-sm text-status-error">
          Copying is not available here. Select the text below instead.
        </p>
      )}
      <dl className="flex flex-col gap-1 rounded-md border border-border bg-code-bg p-3 font-mono text-xs select-text">
        {rows.map((row) => (
          <div key={row.label} className="flex gap-2">
            <dt className="w-28 shrink-0 text-muted">{row.label}</dt>
            <dd className="min-w-0 break-words text-value">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
