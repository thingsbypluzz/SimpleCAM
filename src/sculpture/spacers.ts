import { type Region, type Ring, circlePiece, difference, distanceToBoundary, intersect, offset, pieceArea } from './geometry'
import { type Hole, deepestPoint } from './holes'
import type { Layer } from './layers'
import type { SculptureParams } from './params'

// Spacers between plates when the stack has a gap: one per area two
// neighbouring layers share (both legs get their own). Preview only for now;
// they would be cut from a plate as thick as the gap.
export type SpacerShape = 'disc' | 'inset'

export interface Spacer {
  // Sits on top of this layer.
  below: number
  zBottom: number
  region: Region
  // A hub spacer: part of the gluing jig, cut off with the hub.
  hub: boolean
}

// Smallest disc radius worth drawing, mm.
const MIN_DISC_RADIUS = 3

function circle(x: number, y: number, radius: number): Ring {
  const ring: Ring = []
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * 2 * Math.PI
    ring.push({ x: x + radius * Math.cos(a), y: y + radius * Math.sin(a) })
  }
  return ring
}

// disc  — a disc of spacerSize diameter at the spot deepest inside the shared
//         area, smaller where the area is narrower;
// inset — the shared area itself, pulled spacerSize in from its edge.
export function computeSpacers(layers: Layer[], holes: Hole[], p: SculptureParams): Spacer[] {
  if (!p.spacers || p.gap <= 0 || !(p.spacerSize > 0)) return []
  const holeDiscs: Region = holes.map((h) => ({ outer: circle(h.x, h.y, p.holeDiameter / 2), holes: [] }))
  const spacers: Spacer[] = []
  for (let i = 0; i + 1 < layers.length; i++) {
    const shared = intersect(layers[i].region, layers[i + 1].region).filter((piece) => pieceArea(piece) >= p.minIslandArea)
    let region: Region = []
    for (const piece of shared) {
      if (p.spacerShape === 'inset') {
        region.push(...offset([piece], -p.spacerSize))
        continue
      }
      const center = deepestPoint([piece])
      if (!center) continue
      const radius = Math.min(p.spacerSize / 2, distanceToBoundary([piece], center) - 1)
      if (radius >= MIN_DISC_RADIUS) region.push({ outer: circle(center.x, center.y, radius), holes: [] })
    }
    region = difference(region, holeDiscs)
    if (region.length > 0) spacers.push({ below: layers[i].number, zBottom: layers[i].zBottom + p.thickness, region, hub: false })
  }
  return spacers
}

// The hub's disc with the holes inside it: what fills the gap between two hubs.
export function hubSpacerRegion(holes: Hole[], p: SculptureParams): Region {
  const holeDiscs: Region = holes.map((h) => ({ outer: circle(h.x, h.y, p.holeDiameter / 2), holes: [] }))
  return difference([circlePiece(p.hubX, p.hubY, p.hubDiameter / 2)], holeDiscs)
}

// With a gap, one hub spacer between every two neighbouring layers, so the
// stack of hubs stays solid on the rods.
export function computeHubSpacers(layers: Layer[], holes: Hole[], p: SculptureParams): Spacer[] {
  if (!p.hub || p.gap <= 0 || !(p.hubDiameter > 0)) return []
  const region = hubSpacerRegion(holes, p)
  return layers.slice(0, -1).map((layer) => ({ below: layer.number, zBottom: layer.zBottom + p.thickness, region, hub: true }))
}
