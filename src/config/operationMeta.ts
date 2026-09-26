import type { ComponentType } from 'react'
import { BitIcon, DepthIcon, DiameterIcon, OffsetIcon, TabBridgeIcon } from '../components/icons'
import { fmt } from '../lib/format'
import { generateOutline } from '../lib/outline'
import type { MachineSettings } from '../types/machine'
import type { OperationType, WizardParams } from '../types/wizard'
import { METHOD_META } from './methodMeta'
import {
  activeOutlineMethodMeta,
  offsetModeLabel,
  OUTLINE_SHAPE_META,
  outlineShapeIcon,
  outlineShapeLabel,
  outlineShapeLines,
  outlineShapeSlug,
  outlineSummary,
} from './outlineMeta'
import { POCKET_METHOD_META } from './pocketMethodMeta'
import { POCKET_SHAPE_META, pocketShapeIcon, pocketShapeLabel, pocketShapeLines, pocketShapeSlug, pocketSummary } from './pocketMeta'
import { patternLabel, patternSlug, positioningIcon, positioningLines, positioningSummary } from './positioningMeta'
import { SURFACE_METHOD_META } from './surfaceMethodMeta'
import { SURFACE_SHAPE_META, surfaceShapeIcon, surfaceShapeLabel, surfaceShapeLines, surfaceShapeSlug, surfaceSummary } from './surfaceMeta'

type IconComponent = ComponentType<{ className?: string }>

// The subset of the per-method registries (METHOD_META, OutlineMethodMeta,
// SURFACE_METHOD_META, POCKET_METHOD_META) every operation shares.
export interface MethodDisplay {
  Icon: IconComponent
  shortLabel: string
  title: string
  stepdown: { fieldLabel: string; shortLabel: string }
}

// One MiniStat in Step 2 Summary.
export interface SummaryStat {
  Icon: IconComponent
  label: string
  value: string
  unit?: string
  title: string
}

// Everything the UI does differently per operation, in one entry per
// operation instead of an `operation === …` chain at every call site
// (BL-61). Keyed by OperationType, so a new operation doesn't type-check
// until it fills in every entry. The pure, UI-free counterpart (validation,
// depth, tabs, machine-fit footprint) is lib/validation.ts's
// OPERATION_RULES.
export interface OperationMeta {
  label: string
  // What Step 1 picks for this operation: a hole pattern or a shape.
  pickKind: 'Pattern' | 'Shape'
  pickIcon: (params: WizardParams) => IconComponent
  pickLines: (params: WizardParams) => string[]
  pickSummary: (params: WizardParams) => string
  method: (params: WizardParams) => MethodDisplay
  // Step 2 Summary stats shown after METHOD, and Step 2's collapsed tooltip.
  geometryStats: (params: WizardParams) => SummaryStat[]
  geometryTitle: (params: WizardParams) => string
  generate: (params: WizardParams, machine: MachineSettings) => string[]
  filenameSlug: (params: WizardParams) => string
  // Saved-preset tooltip: pattern/shape first (the preset's identity), then
  // method.
  presetLabel: (params: WizardParams) => string
}

function offsetSummary(offset: { offsetX: number; offsetY: number }): string | null {
  if (offset.offsetX === 0 && offset.offsetY === 0) return null
  return `(${fmt(offset.offsetX)};${fmt(offset.offsetY)})mm`
}

function offsetStat(offset: { offsetX: number; offsetY: number }): SummaryStat[] {
  const value = offsetSummary(offset)
  return value ? [{ Icon: OffsetIcon, label: 'OFFSET', value, title: `Offset: ${value}` }] : []
}

function withOffset(offset: { offsetX: number; offsetY: number }): string {
  const value = offsetSummary(offset)
  return value ? ` — Offset ${value}` : ''
}

const bitStat = (toolDiameter: number): SummaryStat => ({
  Icon: BitIcon,
  label: 'BIT',
  value: `${toolDiameter}`,
  unit: 'mm',
  title: `Tool Diameter: ${toolDiameter} mm`,
})

const depthStat = (depthLabel: string, totalDepth: number): SummaryStat => ({
  Icon: DepthIcon,
  label: 'DEPTH',
  value: `${totalDepth}`,
  unit: 'mm',
  title: `${depthLabel}: ${totalDepth} mm`,
})

const tabsStat = (tabsEnabled: boolean): SummaryStat[] =>
  tabsEnabled ? [{ Icon: TabBridgeIcon, label: 'TABS', value: 'YES', title: 'Tabs: enabled' }] : []

const sizeStat = (Icon: IconComponent, size: string, title: string): SummaryStat => ({
  Icon,
  label: 'SIZE',
  value: size,
  unit: 'mm',
  title,
})

const roundSize = (shape: { shape: string; diameter?: number; width: number; height: number }) =>
  shape.shape === 'circle' ? `⌀${shape.diameter}` : `${shape.width}×${shape.height}`

export const OPERATION_META: Record<OperationType, OperationMeta> = {
  holes: {
    label: 'Hole(s)',
    pickKind: 'Pattern',
    pickIcon: (p) => positioningIcon(p.geometry.positioning),
    pickLines: (p) => positioningLines(p.geometry),
    pickSummary: (p) => positioningSummary(p.geometry),
    method: (p) => METHOD_META[p.method],
    geometryStats: (p) => [
      ...offsetStat(p.geometry),
      bitStat(p.geometry.toolDiameter),
      {
        Icon: DiameterIcon,
        label: 'HOLE',
        value: `${p.geometry.holeDiameter}`,
        unit: 'mm',
        title: `Hole Diameter: ${p.geometry.holeDiameter} mm`,
      },
      depthStat('Total Depth', p.geometry.totalDepth),
      ...tabsStat(p.geometry.tabsEnabled),
    ],
    geometryTitle: (p) =>
      `Tool ⌀${p.geometry.toolDiameter}mm, Hole ⌀${p.geometry.holeDiameter}mm, Depth ${p.geometry.totalDepth}mm${withOffset(p.geometry)} — Method: ${METHOD_META[p.method].title}`,
    generate: (p, machine) => METHOD_META[p.method].generate(p, machine),
    filenameSlug: (p) => patternSlug(p.geometry),
    presetLabel: (p) => `${patternLabel(p.geometry)} • ${METHOD_META[p.method].shortLabel} • ⌀${p.geometry.holeDiameter}mm`,
  },
  outline: {
    label: 'Outline',
    pickKind: 'Shape',
    pickIcon: (p) => outlineShapeIcon(p.outline.shape),
    pickLines: (p) => outlineShapeLines(p.outline),
    pickSummary: (p) => outlineSummary(p.outline),
    method: (p) => activeOutlineMethodMeta(p.outline),
    geometryStats: (p) => [
      sizeStat(
        outlineShapeIcon(p.outline.shape),
        roundSize(p.outline),
        `${OUTLINE_SHAPE_META[p.outline.shape].title}: ${roundSize(p.outline)}mm — ${offsetModeLabel(p.outline.offsetMode)}`,
      ),
      ...offsetStat(p.outline),
      bitStat(p.outline.toolDiameter),
      depthStat('Cutting Depth', p.outline.totalDepth),
      ...tabsStat(p.outline.tabsEnabled),
    ],
    geometryTitle: (p) =>
      `Tool ⌀${p.outline.toolDiameter}mm, ${OUTLINE_SHAPE_META[p.outline.shape].title} ${roundSize(p.outline)}mm, Depth ${p.outline.totalDepth}mm (${offsetModeLabel(p.outline.offsetMode)})${withOffset(p.outline)} — Method: ${activeOutlineMethodMeta(p.outline).title}`,
    // Outline's method list depends on the shape, so it has no flat
    // METHOD_META-style registry — generateOutline() dispatches itself.
    generate: generateOutline,
    filenameSlug: (p) => outlineShapeSlug(p.outline),
    presetLabel: (p) => `${outlineShapeLabel(p.outline)} • ${activeOutlineMethodMeta(p.outline).shortLabel}`,
  },
  surface: {
    label: 'Surface',
    pickKind: 'Shape',
    pickIcon: (p) => surfaceShapeIcon(p.surface.shape),
    pickLines: (p) => surfaceShapeLines(p.surface),
    pickSummary: (p) => surfaceSummary(p.surface),
    method: (p) => SURFACE_METHOD_META[p.surface.method],
    geometryStats: (p) => [
      sizeStat(
        surfaceShapeIcon(p.surface.shape),
        roundSize(p.surface),
        `${SURFACE_SHAPE_META[p.surface.shape].title}: ${roundSize(p.surface)}mm`,
      ),
      ...offsetStat(p.surface),
      bitStat(p.surface.toolDiameter),
      depthStat('Depth to Remove', p.surface.totalDepth),
    ],
    geometryTitle: (p) =>
      `Tool ⌀${p.surface.toolDiameter}mm, ${SURFACE_SHAPE_META[p.surface.shape].title} ${roundSize(p.surface)}mm, Depth ${p.surface.totalDepth}mm${withOffset(p.surface)} — Method: ${SURFACE_METHOD_META[p.surface.method].title}`,
    generate: (p, machine) => SURFACE_METHOD_META[p.surface.method].generate(p, machine),
    filenameSlug: (p) => surfaceShapeSlug(p.surface),
    presetLabel: (p) => `${surfaceShapeLabel(p.surface)} • ${SURFACE_METHOD_META[p.surface.method].shortLabel}`,
  },
  pocket: {
    label: 'Pocket',
    pickKind: 'Shape',
    pickIcon: (p) => pocketShapeIcon(p.pocket.shape),
    pickLines: (p) => pocketShapeLines(p.pocket),
    pickSummary: (p) => pocketSummary(p.pocket),
    method: (p) => POCKET_METHOD_META[p.pocket.method],
    geometryStats: (p) => [
      sizeStat(
        pocketShapeIcon(p.pocket.shape),
        roundSize(p.pocket),
        `${POCKET_SHAPE_META[p.pocket.shape].title}: ${roundSize(p.pocket)}mm`,
      ),
      ...offsetStat(p.pocket),
      bitStat(p.pocket.toolDiameter),
      depthStat('Total Depth', p.pocket.totalDepth),
    ],
    geometryTitle: (p) =>
      `Tool ⌀${p.pocket.toolDiameter}mm, ${POCKET_SHAPE_META[p.pocket.shape].title} ${roundSize(p.pocket)}mm, Depth ${p.pocket.totalDepth}mm${withOffset(p.pocket)} — Method: ${POCKET_METHOD_META[p.pocket.method].title}`,
    generate: (p, machine) => POCKET_METHOD_META[p.pocket.method].generate(p, machine),
    filenameSlug: (p) => pocketShapeSlug(p.pocket),
    presetLabel: (p) => `${pocketShapeLabel(p.pocket)} • ${POCKET_METHOD_META[p.pocket.method].shortLabel}`,
  },
}
