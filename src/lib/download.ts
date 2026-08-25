import { patternSlug } from '../config/positioningMeta'
import { outlineShapeSlug } from '../config/outlineMeta'
import type { WizardParams } from '../types/wizard'

export function buildFilename(params: WizardParams): string {
  const date = new Date().toISOString().slice(0, 10)
  const slug = params.operation === 'outline' ? outlineShapeSlug(params.outline) : patternSlug(params.geometry)
  return `simplecam-${slug}-${date}.gcode`
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
