// The 3D preview's renderer (Three.js) runs on WebGL 2 only — an older GPU
// that offers just WebGL 1 cannot show it. Kept apart from Scene3D.tsx and
// free of any `three` import: App asks this before it decides to load the
// 3D chunk at all.

let cached: boolean | null = null

// One probe per session: creates a throwaway WebGL 2 context and gives it
// straight back, so it does not count against the browser's context limit.
export function hasWebGL2(): boolean {
  if (cached !== null) return cached
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    cached = gl !== null
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    cached = false
  }
  return cached
}
