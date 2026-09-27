import type { PocketMethodType, PocketShape } from '../types/wizard'

// BL-73: Raster is hidden for now — after the helix entry it cut a full-width
// slot diagonally to its first line's corner, and every raster's first line
// is a slot anyway; Spiral and Adaptive keep engagement under control. The
// engine (generatePocketRaster) and its tests stay until BL-73 decides
// whether Raster comes back, and how.
const HIDDEN_POCKET_METHODS: readonly PocketMethodType[] = ['raster']

export function pocketMethodAllowed(shape: PocketShape, method: PocketMethodType): boolean {
  if (HIDDEN_POCKET_METHODS.includes(method)) return false
  return method !== 'raster' || shape !== 'circle'
}
