import type { HoleState } from './holes'

export const HOLE_STATE_LABELS: Record<HoleState, string> = {
  mount: 'Screw',
  empty: 'Unused',
  waste: 'In offcut',
  conflict: 'Conflict',
}

export function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export function holeStateColor(state: HoleState): string {
  if (state === 'mount') return token('--status-success')
  if (state === 'conflict') return token('--status-error')
  if (state === 'empty') return token('--edit')
  return token('--muted')
}
