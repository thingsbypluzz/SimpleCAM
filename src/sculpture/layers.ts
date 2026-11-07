import type { Point2D } from '../types/wizard'
import {
  type Bounds,
  type Piece,
  type Region,
  type Ring,
  circlePiece,
  difference,
  intersect,
  offset,
  pieceArea,
  regionBounds,
  regionArea,
  regionFromRings,
  simplifyRegion,
  simplifyRing,
  union,
} from './geometry'
import type { Mesh } from './mesh'
import type { SculptureParams } from './params'
import { sliceMesh } from './slice'

export interface Layer {
  // 1-based, bottom to top.
  number: number
  // Where the plate sits in the model.
  zBottom: number
  zPlane: number
  // What is cut, largest piece first: the section plus, with a hub, the hub
  // and its bridges.
  region: Region
  // The sculpture alone.
  section: Region
  // The hub as cut where it stands apart from the section (empty when the
  // section covers it, or without a hub), and the bridges as added.
  hub: Region
  bridges: Region
  bounds: Bounds
  // Mesh chains on this plane that did not close.
  openChains: number
  // Pieces the area filter removed.
  removedPieces: number
}

function planeOffset(p: SculptureParams): number {
  return p.plane === 'bottom' ? 0 : p.plane === 'top' ? p.thickness : p.thickness / 2
}

// A strip of `width` from a to b, running `overlap` past both ends so the
// union with what it joins is solid.
function strip(a: Point2D, b: Point2D, width: number, overlap: number): Piece {
  const length = Math.max(Math.hypot(b.x - a.x, b.y - a.y), 1e-6)
  const ux = (b.x - a.x) / length
  const uy = (b.y - a.y) / length
  const half = width / 2
  const start = { x: a.x - ux * overlap, y: a.y - uy * overlap }
  const end = { x: b.x + ux * overlap, y: b.y + uy * overlap }
  return {
    outer: [
      { x: start.x + uy * half, y: start.y - ux * half },
      { x: end.x + uy * half, y: end.y - ux * half },
      { x: end.x - uy * half, y: end.y + ux * half },
      { x: start.x - uy * half, y: start.y + ux * half },
    ],
    holes: [],
  }
}

// A straight strip from a piece's nearest vertex to the main piece.
function bridgeTo(main: Piece, island: Piece, width: number): Piece {
  let a: Point2D = island.outer[0]
  let b: Point2D = main.outer[0]
  let best = Infinity
  for (const p of island.outer) {
    for (const q of main.outer) {
      const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2
      if (d < best) {
        best = d
        a = p
        b = q
      }
    }
  }
  return strip(a, b, width, width / 2)
}

// Where segment a→b crosses the ring, as fractions of its length.
function crossings(ring: Ring, a: Point2D, b: Point2D): number[] {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const out: number[] = []
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]
    const q = ring[(i + 1) % ring.length]
    const ex = q.x - p.x
    const ey = q.y - p.y
    const denominator = dx * ey - dy * ex
    if (Math.abs(denominator) < 1e-12) continue
    const t = ((p.x - a.x) * ey - (p.y - a.y) * ex) / denominator
    const u = ((p.x - a.x) * dy - (p.y - a.y) * dx) / denominator
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) out.push(t)
  }
  return out
}

const rings = (region: Region): Ring[] => region.flatMap((piece) => [piece.outer, ...piece.holes])

// A hub bridge from `start` on a piece straight toward the hub's center: it
// ends where it first meets a target (the hub, or another piece on the way)
// and starts where it last leaves its own piece before that.
function hubBridge(start: Point2D, center: Point2D, self: Piece, targets: Region, width: number): Piece | null {
  const hit = Math.min(...rings(targets).flatMap((ring) => crossings(ring, start, center)).filter((t) => t > 1e-9))
  if (!Number.isFinite(hit)) return null
  const leave = Math.max(0, ...rings([self]).flatMap((ring) => crossings(ring, start, center)).filter((t) => t < hit))
  const at = (t: number) => ({ x: start.x + (center.x - start.x) * t, y: start.y + (center.y - start.y) * t })
  return strip(at(leave), at(hit), width, width / 2)
}

// Where a piece's bridges start: its point nearest the hub for one; for two,
// the outermost points (as seen from the hub's center) among those not much
// farther away, so the pair is as wide as the piece allows.
function bridgeStarts(piece: Piece, center: Point2D, count: number, width: number): Point2D[] {
  const distance = (q: Point2D) => Math.hypot(q.x - center.x, q.y - center.y)
  let nearest = piece.outer[0]
  for (const q of piece.outer) if (distance(q) < distance(nearest)) nearest = q
  if (count < 2) return [nearest]
  const reach = 1.5 * distance(nearest) + width
  const base = Math.atan2(nearest.y - center.y, nearest.x - center.x)
  let low = nearest
  let high = nearest
  let lowAngle = 0
  let highAngle = 0
  for (const q of piece.outer) {
    if (distance(q) > reach) continue
    let angle = Math.atan2(q.y - center.y, q.x - center.x) - base
    while (angle > Math.PI) angle -= 2 * Math.PI
    while (angle < -Math.PI) angle += 2 * Math.PI
    if (angle < lowAngle) {
      lowAngle = angle
      low = q
    }
    if (angle > highAngle) {
      highAngle = angle
      high = q
    }
  }
  // Too narrow a piece for two bridges side by side.
  if (Math.hypot(high.x - low.x, high.y - low.y) < 2 * width) return [nearest]
  return [low, high]
}

interface HubbedLayer {
  region: Region
  hub: Region
  bridges: Region
}

// The hub joined to one layer's section. Where the section covers the whole
// disc, the hub is just material. Otherwise the hub is cut as its own part,
// kept `hubSlot` from the section, and every piece gets bridges to it; a
// covered piece (the torso around the center) is the hub for the others.
function attachHub(section: Region, p: SculptureParams): HubbedLayer {
  const center = { x: p.hubX, y: p.hubY }
  const disc: Region = [circlePiece(center.x, center.y, p.hubDiameter / 2)]
  const covered = regionArea(difference(disc, section)) < 1
  const hub = covered ? [] : difference(disc, offset(section, p.hubSlot)).filter((piece) => pieceArea(piece) > 1)
  const anchors = hub.length > 0 ? hub : section.filter((piece) => intersect([piece], disc).length > 0)
  const strips: Region = []
  for (const piece of section) {
    if (anchors.includes(piece)) continue
    const targets = [...anchors, ...section.filter((other) => other !== piece && !anchors.includes(other))]
    for (const start of bridgeStarts(piece, center, p.hubBridges, p.hubBridgeWidth)) {
      const bridge = hubBridge(start, center, piece, targets, p.hubBridgeWidth)
      if (bridge) strips.push(bridge)
    }
  }
  const solid = union(section, hub)
  return {
    region: sortedByArea(union(solid, strips)),
    hub,
    bridges: difference(union(strips, []), solid),
  }
}

// Hub parts too narrow for a hole with its wall — the crescents left where the
// section takes most of the disc. Flagged, not removed.
export function thinHubPieces(layer: Layer, p: SculptureParams): Region {
  return layer.hub.filter((piece) => offset([piece], -(p.holeDiameter / 2 + p.minWall)).length === 0)
}

function sortedByArea(region: Region): Region {
  return [...region].sort((a, b) => pieceArea(b) - pieceArea(a))
}

export function computeLayers(mesh: Mesh, p: SculptureParams): Layer[] {
  const pitch = p.thickness + p.gap
  const bottoms: number[] = []
  for (let z = 0; z < mesh.height - 1e-6; z += pitch) bottoms.push(z)
  // A plane exactly on the model's end would catch nothing but a cap.
  const planes = bottoms.map((z) => Math.min(Math.max(z + planeOffset(p), 1e-3), mesh.height - 1e-3))
  const slices = sliceMesh(mesh.positions, planes)

  const layers: Layer[] = []
  slices.forEach((slice, i) => {
    let region = regionFromRings(slice.rings.map((r) => simplifyRing(r, p.tolerance)))
    if (p.closeGap > 0) region = offset(offset(region, p.closeGap / 2), -p.closeGap / 2)
    const kept = region.filter((piece) => pieceArea(piece) >= p.minIslandArea)
    const removedPieces = region.length - kept.length
    region = sortedByArea(kept)
    const section = region
    let hub: Region = []
    let bridges: Region = []
    // The hub's own bridges reach every piece, so island bridges are not added.
    if (p.hub && region.length > 0) {
      ;({ region, hub, bridges } = attachHub(section, p))
    } else if (p.islandMode === 'bridge' && region.length > 1) {
      const main = region[0]
      region = sortedByArea(
        union(
          region,
          region.slice(1).map((island) => bridgeTo(main, island, p.bridgeWidth)),
        ),
      )
    }
    const bounds = regionBounds(region)
    if (!bounds) return
    layers.push({
      number: layers.length + 1,
      zBottom: bottoms[i],
      zPlane: planes[i],
      region,
      section,
      hub,
      bridges,
      bounds,
      openChains: slice.openChains,
      removedPieces,
    })
  })
  return layers
}

// The tool center's path: the section grown by the tool radius. Every ring here
// is one contour to cut; an inlet narrower than the tool closes by itself.
export function toolRegion(layer: Layer, p: SculptureParams): Region {
  return simplifyRegion(offset(layer.region, p.toolDiameter / 2), p.tolerance)
}

// What a round tool cannot reach: the section closed by the tool radius, minus
// the section. Slivers from arc approximation are dropped.
export function uncutRegion(layer: Layer, p: SculptureParams): Region {
  const closed = offset(offset(layer.region, p.toolDiameter / 2), -p.toolDiameter / 2)
  return difference(closed, layer.region).filter((piece) => pieceArea(piece) > 1)
}
