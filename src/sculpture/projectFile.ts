import { projectFilename, sanitizeProjectName } from '../lib/projectFile'
import type { Hole } from './holes'
import type { SculptureParams } from './params'
import { sanitizeParams } from './useSculpture'

// A whole sculpture in one JSON file: the model itself (its triangles as read
// from the STL), every parameter of the four steps and the holes as they
// stand. Machine, tool list and appearance stay in the shared settings, as in
// OnlyPaths' project file.
const FORMAT_ID = 'simplecam-sculpture'
export const SCULPTURE_PROJECT_FORMAT = 1

export interface SculptureProject {
  name: string
  modelName: string
  params: SculptureParams
  holes: Hole[]
  // 9 numbers per triangle, file axes, before any orientation or scaling.
  raw: Float32Array
}

export function sculptureFilename(name: string, now = new Date()): string {
  return projectFilename(name, now, 'sculpture')
}

function toBase64(bytes: Uint8Array): string {
  let text = ''
  // In chunks: one call with millions of arguments overflows the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function buildSculptureProject(project: SculptureProject, appVersion: string, now = new Date()): string {
  const bytes = new Uint8Array(project.raw.buffer, project.raw.byteOffset, project.raw.byteLength)
  return JSON.stringify({
    format: FORMAT_ID,
    version: SCULPTURE_PROJECT_FORMAT,
    app: appVersion,
    savedAt: now.toISOString(),
    name: sanitizeProjectName(project.name),
    modelName: project.modelName,
    params: project.params,
    holes: project.holes,
    // Little-endian float32, as every browser stores it.
    model: { encoding: 'float32-base64', triangles: project.raw.length / 9, data: toBase64(bytes) },
  })
}

export type SculptureParseResult = { ok: true; project: SculptureProject } | { ok: false; reason: 'invalid' | 'newer' }

export const SCULPTURE_PROJECT_ERRORS: Record<Extract<SculptureParseResult, { ok: false }>['reason'], string> = {
  invalid: 'This is not a SculptureTool project file, or it is damaged.',
  newer: 'This project was saved by a newer version of SculptureTool. Update the page and try again.',
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

// A hole as saved: a known kind, finite coordinates, a whole id; the optional
// fields only when they are of the right type.
function parseHole(value: unknown): Hole | null {
  if (typeof value !== 'object' || value === null) return null
  const h = value as Record<string, unknown>
  if (!finite(h.id) || !Number.isInteger(h.id) || !finite(h.x) || !finite(h.y)) return null
  if (h.kind !== 'rod' && h.kind !== 'island') return null
  const hole: Hole = { id: h.id, x: h.x, y: h.y, kind: h.kind }
  if (finite(h.from)) hole.from = h.from
  if (finite(h.to)) hole.to = h.to
  if (typeof h.cut === 'boolean') hole.cut = h.cut
  return hole
}

// The whole file or nothing: a damaged model or hole list is refused, unknown
// or mistyped parameters fall back to their defaults.
export function parseSculptureProject(text: string): SculptureParseResult {
  let data: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null) return { ok: false, reason: 'invalid' }
    data = parsed as Record<string, unknown>
  } catch {
    return { ok: false, reason: 'invalid' }
  }
  if (data.format !== FORMAT_ID || !finite(data.version)) return { ok: false, reason: 'invalid' }
  if (data.version > SCULPTURE_PROJECT_FORMAT) return { ok: false, reason: 'newer' }
  const model = data.model as Record<string, unknown> | undefined
  if (!model || model.encoding !== 'float32-base64' || typeof model.data !== 'string') return { ok: false, reason: 'invalid' }
  let bytes: Uint8Array<ArrayBuffer>
  try {
    bytes = fromBase64(model.data)
  } catch {
    return { ok: false, reason: 'invalid' }
  }
  if (bytes.length === 0 || bytes.length % 36 !== 0) return { ok: false, reason: 'invalid' }
  const raw = new Float32Array(bytes.buffer)
  if (!raw.every(Number.isFinite)) return { ok: false, reason: 'invalid' }
  if (!Array.isArray(data.holes)) return { ok: false, reason: 'invalid' }
  const holes = data.holes.map(parseHole)
  if (holes.some((h) => h === null) || new Set(holes.map((h) => h!.id)).size !== holes.length) return { ok: false, reason: 'invalid' }
  return {
    ok: true,
    project: {
      name: typeof data.name === 'string' ? sanitizeProjectName(data.name) : '',
      modelName: typeof data.modelName === 'string' ? data.modelName : '',
      params: sanitizeParams(data.params),
      holes: holes as Hole[],
      raw,
    },
  }
}
