import relief from '../fonts/relief-singleline.svg?raw'
import { parseSvgFont, registerFont, type StrokeFont } from './textFont'

// Test-only: fonts are fetched lazily in the app (config/textFonts.ts);
// tests take the same files straight from the source tree and register
// them up front.
const FILES: Record<string, string> = { relief }

export function loadTestFont(id = 'relief'): StrokeFont {
  const font = parseSvgFont(FILES[id])
  registerFont(id, font)
  return font
}
