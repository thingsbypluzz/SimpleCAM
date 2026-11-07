import type { MachineSettings } from '../types/machine'
import type { UpAxis, ViewUp } from './mesh'
import type { SpacerShape } from './spacers'

export type ContourPlane = 'bottom' | 'middle' | 'top'
export type IslandMode = 'screw' | 'bridge' | 'none'
// How a hole (plate hole or fixture insert) goes down: one helix, or a
// plunge and a full circle per Stepdown.
export type HoleMethod = 'helix' | 'standard'

export interface SculptureParams {
  // Model
  upAxis: UpAxis
  flipUp: boolean
  // Preview only (and what Height measures): the file axis shown as up.
  viewUp: ViewUp
  viewFlip: boolean
  // Every plate turned on the table by this many degrees CCW, in steps of
  // 45° (layers, holes, G-code and the 3D preview with them).
  plateTurn: number
  // The sheet the plates are cut from, X × Y (0 = not given), centered on
  // X0 Y0 plus the offset: drawn in the layer view and checked against every
  // layer's plate.
  sheetX: number
  sheetY: number
  sheetOffsetX: number
  sheetOffsetY: number
  height: number
  // Layers
  thickness: number
  gap: number
  plane: ContourPlane
  // Islands
  minIslandArea: number
  closeGap: number
  islandMode: IslandMode
  bridgeWidth: number
  // Tool and cutting. Z0 is the top of the plate: its bottom is at
  // Z = -thickness, a cut ends at Z = -(thickness + overshoot).
  toolDiameter: number
  feed: number
  plungeRate: number
  stepdown: number
  overshoot: number
  safeAbove: number
  tolerance: number
  holeMethod: HoleMethod
  // Helix only: the pitch per turn is the smaller of Stepdown and the turn's
  // length × tan(angle), as in OnlyPaths (cappedRampPitch()).
  rampAngle: number
  // Tabs on or off; count and size come from Settings → Tabs, shared with
  // OnlyPaths (withSettings() below), so the stored values are overwritten.
  tabs: boolean
  tabCount: number
  tabWidth: number
  tabHeight: number
  // Holes and fixture
  rodCount: number
  holeDiameter: number
  minWall: number
  headDiameter: number
  headHeight: number
  insertDiameter: number
  insertDepth: number
  insertRecess: number
  // Mounting hub: a disc added to every layer, bridged to every piece, that
  // holds the plate on the fixture and the pieces in place while gluing.
  hub: boolean
  hubDiameter: number
  hubX: number
  hubY: number
  // Gap between the hub and the section where they would touch.
  hubSlot: number
  hubBridges: number
  hubBridgeWidth: number
  // Spacers between plates (preview only)
  spacers: boolean
  spacerShape: SpacerShape
  spacerSize: number
}

export const DEFAULT_PARAMS: SculptureParams = {
  upAxis: 'z',
  flipUp: false,
  viewUp: 'same',
  viewFlip: false,
  plateTurn: 0,
  sheetX: 0,
  sheetY: 0,
  sheetOffsetX: 0,
  sheetOffsetY: 0,
  height: 600,
  thickness: 18,
  gap: 0,
  plane: 'middle',
  minIslandArea: 100,
  closeGap: 0,
  islandMode: 'screw',
  bridgeWidth: 12,
  toolDiameter: 6,
  feed: 1500,
  plungeRate: 400,
  stepdown: 6,
  overshoot: 0.5,
  safeAbove: 10,
  tolerance: 0.1,
  holeMethod: 'helix',
  rampAngle: 2,
  tabs: true,
  tabCount: 4,
  tabWidth: 8,
  tabHeight: 3,
  rodCount: 3,
  holeDiameter: 8,
  minWall: 4,
  headDiameter: 14,
  headHeight: 6,
  insertDiameter: 10,
  insertDepth: 16,
  insertRecess: 2,
  hub: false,
  hubDiameter: 120,
  hubX: 0,
  hubY: 0,
  hubSlot: 8,
  hubBridges: 1,
  hubBridgeWidth: 15,
  spacers: false,
  spacerShape: 'disc',
  spacerSize: 40,
}

export const MAX_RODS = 12

// What the layer stack depends on; the rest only changes holes or G-code.
export function layerSignature(p: SculptureParams): string {
  return JSON.stringify([
    p.upAxis,
    p.flipUp,
    p.viewUp,
    p.plateTurn,
    p.height,
    p.thickness,
    p.gap,
    p.plane,
    p.minIslandArea,
    p.closeGap,
    p.islandMode,
    p.bridgeWidth,
    p.tolerance,
    p.hub,
    p.hubDiameter,
    p.hubX,
    p.hubY,
    p.hubSlot,
    p.hubBridges,
    p.hubBridgeWidth,
  ])
}

export function paramErrors(p: SculptureParams): string[] {
  const errors: string[] = []
  const positive: [keyof SculptureParams, string][] = [
    ['height', 'Height'],
    ['thickness', 'Plate thickness'],
    ['toolDiameter', 'Tool diameter'],
    ['feed', 'Feed'],
    ['plungeRate', 'Plunge rate'],
    ['stepdown', 'Stepdown'],
    ['tolerance', 'Tolerance'],
    ['holeDiameter', 'Hole diameter'],
    ['insertDiameter', 'Insert diameter'],
    ['insertDepth', 'Insert hole depth'],
    ['bridgeWidth', 'Bridge width'],
  ]
  for (const [key, label] of positive) {
    if (!((p[key] as number) > 0)) errors.push(`${label} must be above 0.`)
  }
  if (p.gap < 0) errors.push('Gap cannot be negative.')
  if (p.holeMethod === 'helix' && !(p.rampAngle > 0 && p.rampAngle <= 45)) errors.push('Ramp angle must be above 0° and at most 45°.')
  if (p.sheetX < 0 || p.sheetY < 0) errors.push('Sheet size cannot be negative.')
  if (p.height > 0 && p.thickness > 0 && p.height / (p.thickness + p.gap) > 500) errors.push('More than 500 layers.')
  if (!Number.isInteger(p.tabCount) || p.tabCount < 0) errors.push('Tab count must be a whole number (Settings → Tabs).')
  if (!Number.isInteger(p.rodCount) || p.rodCount < 0 || p.rodCount > MAX_RODS) errors.push(`Rods must be a whole number from 0 to ${MAX_RODS}.`)
  if (p.holeDiameter < p.toolDiameter) errors.push('Hole diameter is smaller than the tool.')
  if (p.insertDiameter < p.toolDiameter) errors.push('Insert diameter is smaller than the tool.')
  if (p.tabCount > 0 && p.tabHeight >= p.thickness) errors.push('Tab height must be below the plate thickness (Settings → Tabs).')
  // A contour passes over inserts its layer does not use, and the tool must
  // never reach the metal.
  if (p.insertRecess <= p.overshoot) errors.push('Inserts must sit deeper than the through-cut overshoot.')
  if (p.hub) {
    if (!(p.hubDiameter > 0)) errors.push('Hub diameter must be above 0.')
    if (!(p.hubBridgeWidth > 0)) errors.push('Hub bridge width must be above 0.')
    if (p.hubBridges !== 1 && p.hubBridges !== 2) errors.push('Hub bridges per piece must be 1 or 2.')
    // A narrower slot closes under the tool and the hub stays glued on.
    if (!(p.hubSlot >= p.toolDiameter)) errors.push('Hub slot must be at least the tool diameter.')
  }
  if (p.safeAbove < p.headHeight + 2) errors.push('Safe Z above plate must clear the screw heads by 2 mm.')
  return errors
}

// Parameters as the engine sees them: tab count and size from the shared
// machine settings (none when tabs are off).
export function withSettings(p: SculptureParams, machine: MachineSettings): SculptureParams {
  return {
    ...p,
    tabCount: p.tabs ? machine.defaultTabCount : 0,
    tabWidth: machine.defaultTabWidth,
    tabHeight: machine.defaultTabHeight,
  }
}

// Smallest hub that holds `rodCount` rods at their spacing, each clear of the
// hub's edge by the screw clearance: the rods on a circle, plus a margin so
// the pattern can stay irregular. A hint only.
export function minHubDiameter(p: SculptureParams, clearance: number): number {
  const spacing = Math.max(3 * p.holeDiameter, p.headDiameter + 4)
  const n = Math.max(1, Math.round(p.rodCount))
  const ring = n === 1 ? 0 : spacing / (2 * Math.sin(Math.PI / n))
  return Math.ceil((2 * (clearance + 1.1 * ring)) / 5) * 5
}
