import { patternSlug } from '../config/positioningMeta'
import { outlineShapeSlug } from '../config/outlineMeta'
import { surfaceShapeSlug } from '../config/surfaceMeta'
import type { WizardParams } from '../types/wizard'

export function buildFilename(params: WizardParams): string {
  const date = new Date().toISOString().slice(0, 10)
  const slug =
    params.operation === 'outline'
      ? outlineShapeSlug(params.outline)
      : params.operation === 'surface'
        ? surfaceShapeSlug(params.surface)
        : patternSlug(params.geometry)
  return `op-${slug}-${date}.gcode`
}

export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
