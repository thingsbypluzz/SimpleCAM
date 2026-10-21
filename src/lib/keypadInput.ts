// BL-8: what a key of the app's numeric keypad (components/NumericKeypad.tsx)
// does to the text of the field being edited. The keypad only ever edits
// the end of the text.

export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'sign' | 'back' | 'clear'

// Keys always extend what is in the field — entering a field never wipes
// its value; a new number starts with Clear.
export function applyKey(text: string, key: KeypadKey): string {
  if (key === 'clear') return ''
  if (key === 'sign') return text.startsWith('-') ? text.slice(1) : `-${text}`
  if (key === 'back') return text.slice(0, -1)
  if (key === '.') {
    if (text.includes('.')) return text
    return text === '' || text === '-' ? `${text}0.` : `${text}.`
  }
  return text + key
}

// The − / + buttons beside the field's name: the text on screen moved by
// `delta` (the field's step), so a number typed and not yet committed is
// stepped from too. Rounded to the step's decimals (at least 1/100, the
// precision of the desktop buttons) against floating-point noise. Null
// when the text is not a number yet ("", "-") — the buttons then do
// nothing.
export function stepText(text: string, delta: number): string | null {
  if (text.trim() === '' || !Number.isFinite(Number(text))) return null
  const decimals = Math.max(2, (String(Math.abs(delta)).split('.')[1] ?? '').length)
  const scale = 10 ** decimals
  return String(Math.round((Number(text) + delta) * scale) / scale)
}
