import type { OperationType } from '../types/wizard'

export function buildFilename(operation: OperationType): string {
  const date = new Date().toISOString().slice(0, 10)
  return `simplecam-${operation}-${date}.gcode`
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
