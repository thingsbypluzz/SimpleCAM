import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { applyKey, type KeypadKey } from '../lib/keypadInput'
import { ChevronDownIcon, ChevronUpIcon } from './icons'
import { KEYPAD_FIELD_SELECTOR, KeypadContext, type KeypadApi } from './keypadContext'
import { useCoarsePointer } from './useViewport'

// BL-8: the app's own numeric keypad for touch devices. Nearly every field
// is a number, and a system keyboard cannot be made to show just digits
// (an iPad shows the full one), may have no key to put it away, and covers
// the page without resizing it. A number field (NumberInput) asks for the
// keypad when it gets focus; the keypad types into that field through the
// field's ordinary change events, so committing, validation and Escape
// behave exactly as with a real keyboard. Text fields keep the system
// keyboard.

// Writes through the native setter and fires `input`, which is what makes
// React run the field's onChange — a plain `input.value = …` is invisible
// to a controlled input.
function setFieldText(input: HTMLInputElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, text)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function fieldLabel(input: HTMLInputElement): string {
  return (
    input.getAttribute('aria-label') ??
    input.closest('label')?.querySelector('span')?.textContent ??
    ''
  ).trim()
}

// The fields Previous / Next move between: the ones on screen, in the same
// dialog as the current one (or the page, when it is in none).
function siblingFields(input: HTMLInputElement): HTMLInputElement[] {
  const scope: ParentNode = input.closest('[role="dialog"]') ?? document
  return [...scope.querySelectorAll<HTMLInputElement>(KEYPAD_FIELD_SELECTOR)].filter(
    (el) => !el.disabled && !el.readOnly && el.offsetParent !== null,
  )
}

export function KeypadProvider({ children }: { children: ReactNode }) {
  const enabled = useCoarsePointer()
  const [target, setTarget] = useState<HTMLInputElement | null>(null)
  const targetRef = useRef<HTMLInputElement | null>(null)
  const replaceRef = useRef(false)
  const keypadRef = useRef<HTMLDivElement>(null)

  const attach = useCallback((input: HTMLInputElement) => {
    if (targetRef.current === input) return
    targetRef.current = input
    replaceRef.current = true
    input.select()
    setTarget(input)
  }, [])

  const close = useCallback(() => {
    const input = targetRef.current
    targetRef.current = null
    setTarget(null)
    // Blur commits what was typed (useNumberField).
    input?.blur()
  }, [])

  // The page makes room for the keypad instead of being covered by it:
  // `--keypad-h` is the bottom padding of the app's root and of the
  // full-screen dialogs, so whatever scrolls keeps scrolling and the field
  // being edited can always be brought above the keys.
  useLayoutEffect(() => {
    if (!target) return
    const root = document.documentElement
    root.style.setProperty('--keypad-h', `${keypadRef.current?.offsetHeight ?? 0}px`)
    const frame = requestAnimationFrame(() => target.scrollIntoView({ block: 'center' }))
    return () => {
      cancelAnimationFrame(frame)
      root.style.removeProperty('--keypad-h')
    }
  }, [target])

  useEffect(() => {
    if (!target) return
    // A touch browser does not blur a field when something that is not a
    // field is tapped, so the keypad closes itself.
    const handlePointerDown = (e: globalThis.PointerEvent) => {
      const el = e.target as Element | null
      if (!el || keypadRef.current?.contains(el)) return
      if (el === targetRef.current) {
        // A tap into the field being edited: keep typing where it left off.
        replaceRef.current = false
        return
      }
      if (el.closest(KEYPAD_FIELD_SELECTOR)) return
      close()
    }
    // Focus moved somewhere that is not a number field (a hardware
    // keyboard's Tab, a select).
    const handleFocusIn = (e: FocusEvent) => {
      const el = e.target as Element | null
      if (el && !el.matches(KEYPAD_FIELD_SELECTOR) && !keypadRef.current?.contains(el)) {
        targetRef.current = null
        setTarget(null)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('focusin', handleFocusIn)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('focusin', handleFocusIn)
    }
  }, [target, close])

  const press = (key: KeypadKey) => {
    const input = targetRef.current
    if (!input || !input.isConnected) {
      close()
      return
    }
    if (document.activeElement !== input) input.focus({ preventScroll: true })
    setFieldText(input, applyKey(input.value, key, replaceRef.current))
    replaceRef.current = false
  }

  const move = (delta: number) => {
    const input = targetRef.current
    if (!input) return
    const fields = siblingFields(input)
    fields[fields.indexOf(input) + delta]?.focus()
  }

  const fields = target && target.isConnected ? siblingFields(target) : []
  const index = target ? fields.indexOf(target) : -1

  const api = useMemo<KeypadApi>(
    () => ({ enabled, open: enabled && target !== null, attach }),
    [enabled, target, attach],
  )

  // Keys act on pointer down and never take focus away from the field.
  const keyHandlers = (action: () => void) => ({
    onPointerDown: (e: PointerEvent) => {
      e.preventDefault()
      action()
    },
    onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(),
    tabIndex: -1,
  })

  const keyClass =
    'flex h-14 items-center justify-center rounded-lg border border-field-border bg-field-bg text-2xl font-medium text-fg select-none active:bg-accent-bg'
  const sideKeyClass =
    'flex h-14 items-center justify-center rounded-lg border border-border bg-bg text-2xl font-medium text-value select-none active:bg-accent-bg'
  const barButtonClass =
    'flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-field-border text-value disabled:opacity-40'

  return (
    <KeypadContext.Provider value={api}>
      {children}
      {api.open && target && (
        <div
          ref={keypadRef}
          role="group"
          aria-label="Numeric keypad"
          className="fixed inset-x-0 bottom-0 z-[60] touch-manipulation border-t border-border bg-code-bg shadow-xl"
        >
          <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
            <button
              type="button"
              aria-label="Previous field"
              disabled={index <= 0}
              className={barButtonClass}
              {...keyHandlers(() => move(-1))}
            >
              <ChevronUpIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Next field"
              disabled={index < 0 || index >= fields.length - 1}
              className={barButtonClass}
              {...keyHandlers(() => move(1))}
            >
              <ChevronDownIcon className="h-5 w-5" />
            </button>
            <span className="min-w-0 flex-1 truncate px-2 text-sm text-value">{fieldLabel(target)}</span>
            <button
              type="button"
              className="flex h-11 shrink-0 items-center rounded-md bg-btn-bg px-6 text-base font-semibold text-btn-fg shadow-[var(--glow-btn)]"
              {...keyHandlers(close)}
            >
              Done
            </button>
          </div>
          <div className="mx-auto grid w-full max-w-[480px] grid-cols-4 gap-2 px-4 pt-3 pb-4">
            {(['7', '8', '9'] as const).map((k) => (
              <button key={k} type="button" className={keyClass} {...keyHandlers(() => press(k))}>
                {k}
              </button>
            ))}
            <button type="button" aria-label="Delete" className={sideKeyClass} {...keyHandlers(() => press('back'))}>
              ⌫
            </button>
            {(['4', '5', '6'] as const).map((k) => (
              <button key={k} type="button" className={keyClass} {...keyHandlers(() => press(k))}>
                {k}
              </button>
            ))}
            <button type="button" aria-label="Minus" className={sideKeyClass} {...keyHandlers(() => press('sign'))}>
              −
            </button>
            {(['1', '2', '3'] as const).map((k) => (
              <button key={k} type="button" className={keyClass} {...keyHandlers(() => press(k))}>
                {k}
              </button>
            ))}
            <button type="button" aria-label="Decimal point" className={sideKeyClass} {...keyHandlers(() => press('.'))}>
              .
            </button>
            <button type="button" className={`${keyClass} col-span-3`} {...keyHandlers(() => press('0'))}>
              0
            </button>
            <button type="button" aria-label="Hide keypad" className={sideKeyClass} {...keyHandlers(close)}>
              <svg
                viewBox="0 0 26 24"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="2" y="2" width="22" height="13" rx="2.5" />
                <path d="M6 6h1M10 6h1M14 6h1M18 6h1M7 11h12M9 19l4 3 4-3" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </KeypadContext.Provider>
  )
}
