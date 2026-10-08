import { getLoadedFont, parseSvgFont, registerFont } from '../lib/textFont'

// The single-line fonts the Text operation offers (OP-4). Each is the
// font's original SVG file under src/fonts/, fetched as its own chunk the
// first time it is needed and parsed in the browser (lib/textFont.ts) —
// the app's start-up carries none of them.
//
// Every font here is under an open license that asks for its authors and
// license to be named: `credit`, `license` and `source` are what Settings →
// About shows; the license text itself ships in public/licenses/.
export interface TextFontMeta {
  id: string
  title: string
  // One line for the font picker.
  description: string
  credit: string
  license: string
  // The license text shipped with the app (public/licenses/).
  licenseUrl: string
  source: string
  load: () => Promise<string>
}

export const TEXT_FONTS: readonly TextFontMeta[] = [
  {
    id: 'relief',
    title: 'Relief SingleLine',
    description: 'Clean sans serif. Full Polish and Latin Extended alphabet.',
    credit: 'The Relief SingleLine Project Authors (isdaT-type)',
    license: 'SIL Open Font License 1.1',
    licenseUrl: 'licenses/relief-singleline-OFL.txt',
    source: 'https://github.com/isdat-type/Relief-SingleLine',
    load: () => import('../fonts/relief-singleline.svg?raw').then((m) => m.default),
  },
]

export const DEFAULT_TEXT_FONT_ID = TEXT_FONTS[0].id

export function textFontMeta(id: string): TextFontMeta {
  return TEXT_FONTS.find((f) => f.id === id) ?? TEXT_FONTS[0]
}

const pending = new Map<string, Promise<void>>()

// Fetches and registers a font once; resolves when it is ready to use (at
// once when it already is). A failed fetch is forgotten, so the next call
// tries again.
export function ensureTextFont(id: string): Promise<void> {
  const meta = textFontMeta(id)
  if (getLoadedFont(meta.id)) return Promise.resolve()
  let promise = pending.get(meta.id)
  if (!promise) {
    promise = meta
      .load()
      .then((svg) => registerFont(meta.id, parseSvgFont(svg)))
      .finally(() => pending.delete(meta.id))
    pending.set(meta.id, promise)
  }
  return promise
}
