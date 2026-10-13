import { createContext, useContext } from 'react'

// The numeric keypad's context (NumericKeypad.tsx holds the provider and
// the keys) — its own file so that one exports only a component.

export interface KeypadApi {
  // The keypad replaces the system keyboard for number fields.
  enabled: boolean
  // The keypad is on screen.
  open: boolean
  attach: (input: HTMLInputElement) => void
}

export const KeypadContext = createContext<KeypadApi>({ enabled: false, open: false, attach: () => {} })

export function useKeypad(): KeypadApi {
  return useContext(KeypadContext)
}

// Marks the fields the keypad serves — also what Previous / Next walk.
export const KEYPAD_FIELD_ATTR = 'data-keypad'
export const KEYPAD_FIELD_SELECTOR = `input[${KEYPAD_FIELD_ATTR}]`
