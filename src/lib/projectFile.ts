import { mergeWithDefaults, PRESET_SLOT_IDS, type PresetSlotId } from './storage'
import type { WizardParams } from '../types/wizard'

// A project (BL-112): the seven preset slots saved to, and loaded from, one
// JSON file — an object built from several presets survives moving on to
// the next one, and travels between browsers and machines. Only the slots
// go in: machine, controller, tool list and appearance stay the user's own.
//
// Pure functions; the download and the file picker live in App.tsx.

export type PresetSlots = Partial<Record<PresetSlotId, WizardParams>>

const PROJECT_APP = 'OnlyPaths'
const PROJECT_KIND = 'project'
// Bumped only when a file written by a newer version could not be read
// correctly by an older one. A new preset field doesn't need it: a missing
// field takes its default on load, like a preset stored before the field
// existed.
export const PROJECT_FORMAT = 1
export const MAX_PROJECT_NAME_LENGTH = 60

// Trimmed, single-spaced, capped — what is shown in the Header and stored
// in the file. Empty when nothing usable is left.
export function sanitizeProjectName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_PROJECT_NAME_LENGTH)
}

// `onlypaths-<name>-<date>.json`; the name reduced to what every file system
// accepts.
export function projectFilename(name: string, now = new Date()): string {
  const slug = sanitizeProjectName(name)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `onlypaths-${slug || 'project'}-${now.toISOString().slice(0, 10)}.json`
}

// A project name out of a file name, for a file that carries none:
// `onlypaths-wheel-cap-2026-10-07.json` → `wheel cap`.
export function projectNameFromFilename(filename: string): string {
  const base = filename
    .replace(/\.json$/i, '')
    .replace(/^onlypaths-/i, '')
    .replace(/-\d{4}-\d{2}-\d{2}$/, '')
  return sanitizeProjectName(base.replace(/[-_]+/g, ' '))
}

export function buildProjectFile(name: string, slots: PresetSlots, appVersion: string, now = new Date()): string {
  const out: Record<string, WizardParams | null> = {}
  for (const id of PRESET_SLOT_IDS) out[id] = slots[id] ?? null
  return JSON.stringify(
    {
      app: PROJECT_APP,
      kind: PROJECT_KIND,
      format: PROJECT_FORMAT,
      name: sanitizeProjectName(name),
      savedAt: now.toISOString(),
      appVersion,
      slots: out,
    },
    null,
    2,
  )
}

export type ProjectParseResult =
  | { ok: true; name: string; slots: PresetSlots }
  // notJson — not JSON at all; notProject — JSON, but not an OnlyPaths
  // project; newerFormat — written by a newer version of the app.
  | { ok: false; reason: 'notJson' | 'notProject' | 'newerFormat' }

// A foreign file is refused whole. A project's presets each go through the
// same field guards as presets stored in the browser: a missing or
// malformed field falls back to its default, unknown keys are dropped.
export function parseProjectFile(text: string): ProjectParseResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'notJson' }
  }
  if (typeof data !== 'object' || data === null) return { ok: false, reason: 'notProject' }
  const file = data as Record<string, unknown>
  if (file.app !== PROJECT_APP || file.kind !== PROJECT_KIND || typeof file.slots !== 'object' || file.slots === null) {
    return { ok: false, reason: 'notProject' }
  }
  if (typeof file.format !== 'number' || !Number.isFinite(file.format)) return { ok: false, reason: 'notProject' }
  if (file.format > PROJECT_FORMAT) return { ok: false, reason: 'newerFormat' }
  const source = file.slots as Record<string, unknown>
  const slots: PresetSlots = {}
  for (const id of PRESET_SLOT_IDS) {
    const saved = source[id]
    if (typeof saved === 'object' && saved !== null) slots[id] = mergeWithDefaults(saved)
  }
  return { ok: true, name: typeof file.name === 'string' ? sanitizeProjectName(file.name) : '', slots }
}

export const PROJECT_ERROR_MESSAGE: Record<Extract<ProjectParseResult, { ok: false }>['reason'], string> = {
  notJson: 'This file is not an OnlyPaths project (it is not valid JSON).',
  notProject: 'This file is not an OnlyPaths project.',
  newerFormat: 'This project was saved by a newer version of OnlyPaths. Reload the page to update, then try again.',
}

// A short stand-in for the slots' whole content, to tell whether they have
// changed since the project was last saved or loaded. Slot order is fixed
// and every preset has every field in the same order (mergeWithDefaults()),
// so equal content gives equal text.
export function slotsFingerprint(slots: PresetSlots): string {
  const text = JSON.stringify(PRESET_SLOT_IDS.map((id) => slots[id] ?? null))
  let h1 = 0x811c9dc5
  let h2 = 5381
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193)
    h2 = (Math.imul(h2, 33) + c) | 0
  }
  return `${text.length.toString(36)}-${(h1 >>> 0).toString(36)}-${(h2 >>> 0).toString(36)}`
}
