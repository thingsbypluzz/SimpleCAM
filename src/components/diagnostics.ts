import { hasWebGL2 } from './preview3d/webglSupport'
import { MEDIUM_MIN_WIDTH, WIDE_MIN_WIDTH } from './useViewport'

// What this browser and device offer, for Settings → About: a report from
// an unusual device (an old tablet, an embedded browser) then comes down to
// one screenshot or one pasted block. Read on demand, nothing is stored or
// sent anywhere.

export interface DiagnosticRow {
  label: string
  value: string
}

const yesNo = (value: boolean) => (value ? 'yes' : 'no')

function media(query: string): boolean {
  try {
    return window.matchMedia(query).matches
  } catch {
    return false
  }
}

function cssSupports(condition: string): boolean {
  try {
    return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports(condition)
  } catch {
    return false
  }
}

function firstMatch(options: [query: string, name: string][], fallback: string): string {
  return options.find(([query]) => media(query))?.[1] ?? fallback
}

// WebGL 1 and the GPU's name. The context is given straight back, so it
// does not count against the browser's context limit.
function webgl1Info(): { available: boolean; renderer: string } {
  try {
    const canvas = document.createElement('canvas')
    const gl = (canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null
    if (!gl) return { available: false, renderer: '' }
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '')
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return { available: true, renderer }
  } catch {
    return { available: false, renderer: '' }
  }
}

// How a bare button — no classes, so only the stylesheet's reset applies —
// ends up styled. A background other than transparent here means the reset
// lost to the browser's own button style.
function bareButtonStyle(): string {
  try {
    const button = document.createElement('button')
    button.style.cssText = 'position:fixed;left:-999px;top:0'
    document.body.appendChild(button)
    const style = getComputedStyle(button)
    const text = `background ${style.backgroundColor}, appearance ${style.appearance || style.webkitAppearance || 'unknown'}, color scheme ${style.colorScheme || 'unknown'}`
    button.remove()
    return text
  } catch {
    return 'not reported'
  }
}

function storageAvailable(): boolean {
  try {
    const key = 'simplecam.probe'
    window.localStorage.setItem(key, '1')
    window.localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

// The CSS features the stylesheet leans on, newest requirement first.
const CSS_FEATURES: [name: string, supported: () => boolean][] = [
  ['nesting', () => cssSupports('selector(&)')],
  ['color-mix()', () => cssSupports('color: color-mix(in oklab, red, red)')],
  ['dvh units', () => cssSupports('height: 1dvh')],
  ['individual transforms', () => cssSupports('translate: 0')],
  ['media range syntax', () => media('(width >= 1px)')],
  ['hex colors with alpha', () => cssSupports('color: #0000')],
  ['@layer', () => typeof CSSLayerBlockRule !== 'undefined'],
  [':where()', () => cssSupports('selector(:where(a))')],
  ['logical properties', () => cssSupports('padding-inline: 0')],
  ['@property', () => typeof CSS !== 'undefined' && 'registerProperty' in CSS],
]

export function collectDiagnostics(simple3DPreview: boolean): DiagnosticRow[] {
  const width = window.innerWidth
  const layout = width >= WIDE_MIN_WIDTH ? 'wide' : width >= MEDIUM_MIN_WIDTH ? 'medium' : 'narrow'
  const webgl2 = hasWebGL2()
  const webgl1 = webgl1Info()
  const root = document.documentElement
  const viewport = window.visualViewport
  const missing = CSS_FEATURES.filter(([, supported]) => !supported()).map(([name]) => name)

  return [
    { label: 'App version', value: __APP_VERSION__ },
    { label: 'User agent', value: navigator.userAgent },
    {
      label: 'Window',
      value: `${width} × ${window.innerHeight} px, pixel ratio ${window.devicePixelRatio}`,
    },
    {
      label: 'Visible area',
      value: viewport
        ? `${Math.round(viewport.width)} × ${Math.round(viewport.height)} px, zoom ${viewport.scale.toFixed(2)}`
        : 'not reported',
    },
    { label: 'Screen', value: `${window.screen.width} × ${window.screen.height} px` },
    { label: 'Layout', value: layout },
    {
      label: 'Pointer',
      value: `${firstMatch(
        [
          ['(pointer: coarse)', 'coarse'],
          ['(pointer: fine)', 'fine'],
        ],
        'none',
      )}, hover ${yesNo(media('(hover: hover)'))}, any coarse ${yesNo(media('(any-pointer: coarse)'))}, touch points ${navigator.maxTouchPoints ?? 0}`,
    },
    {
      label: 'Input',
      value: `pointer events ${yesNo('PointerEvent' in window)}, inputmode ${yesNo('inputMode' in document.createElement('input'))}`,
    },
    { label: 'WebGL 2', value: yesNo(webgl2) },
    { label: 'WebGL 1', value: yesNo(webgl1.available) },
    { label: 'Graphics', value: webgl1.renderer || 'not reported' },
    { label: '3D preview', value: webgl2 && !simple3DPreview ? 'full' : 'simple' },
    {
      label: 'Theme',
      value: `${root.dataset.theme ?? 'default'}, ${root.classList.contains('dark') ? 'dark' : 'light'} (system prefers ${firstMatch([['(prefers-color-scheme: dark)', 'dark']], 'light')})`,
    },
    { label: 'Bare button', value: bareButtonStyle() },
    { label: 'CSS missing', value: missing.length > 0 ? missing.join(', ') : 'nothing' },
    { label: 'Storage', value: storageAvailable() ? 'available' : 'blocked' },
  ]
}

export function diagnosticsText(rows: DiagnosticRow[]): string {
  return rows.map((row) => `${row.label}: ${row.value}`).join('\n')
}
