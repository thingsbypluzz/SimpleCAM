import { Component, type ErrorInfo, type ReactNode } from 'react'

// Every localStorage key the app owns shares this prefix (simplecam.storage,
// .machine, .appearance, .toolDiameters) — see lib/*Storage.ts.
const STORAGE_KEY_PREFIX = 'simplecam.'

function clearSavedState(): void {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(STORAGE_KEY_PREFIX))
      .forEach((key) => localStorage.removeItem(key))
  } catch (err) {
    console.warn('OnlyPaths: could not clear saved state', err)
  }
}

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

// BL-57: last line of defence for a render crash — without it React
// unmounts everything and leaves a blank page. The auto-save slot is
// restored on every startup, so a crash caused by saved data would repeat on
// every reload; "Reset saved state" is the way out that doesn't require
// opening DevTools. Class component: React has no hook equivalent of
// getDerivedStateFromError/componentDidCatch.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('OnlyPaths: unhandled render error', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex h-svh items-center justify-center bg-bg p-6 text-fg">
        <div className="flex max-w-md flex-col gap-4 rounded-lg border border-border p-6">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted">
            OnlyPaths hit an unexpected error. If it happens again after reloading, your saved state
            (presets, the last session and settings) may be damaged — resetting it restores the
            defaults.
          </p>
          <pre className="max-h-32 overflow-auto rounded-md bg-code-bg p-2 text-xs text-muted">
            {this.state.error.message}
          </pre>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-value hover:border-field-border"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={() => {
                if (!window.confirm('Delete all saved presets and settings, then reload?')) return
                clearSavedState()
                window.location.reload()
              }}
              className="rounded-md bg-status-delete-bg px-3 py-1.5 text-sm font-medium text-status-delete-fg"
            >
              Reset saved state
            </button>
          </div>
        </div>
      </div>
    )
  }
}
