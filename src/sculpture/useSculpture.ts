import { useEffect, useMemo, useState } from 'react'
import { type Hole, type LayerHoles, analyzeLayer, proposeHoles } from './holes'
import { type Layer, computeLayers, thinHubPieces } from './layers'
import { type Spacer, computeHubSpacers, computeSpacers } from './spacers'
import { type Mesh, normalizeMesh } from './mesh'
import { type LayerPlacement, type SculptureParams, DEFAULT_PARAMS, layerSignature, paramErrors } from './params'

const STORAGE_KEY = 'simplecam.sculpture'

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const finite = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

// Only whole layer numbers that move the layer at all. `legacy`: turns alone,
// as saved before a layer could also be shifted.
function sanitizePlacements(value: unknown, legacy: unknown): Record<string, LayerPlacement> {
  const out: Record<string, LayerPlacement> = {}
  const add = (key: string, placement: LayerPlacement) => {
    if (/^[1-9]\d*$/.test(key) && (placement.turn % 360 !== 0 || placement.x !== 0 || placement.y !== 0)) out[key] = placement
  }
  if (isRecord(legacy)) for (const [key, turn] of Object.entries(legacy)) add(key, { turn: finite(turn), x: 0, y: 0 })
  if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (isRecord(entry)) add(key, { turn: finite(entry.turn), x: finite(entry.x), y: finite(entry.y) })
    }
  }
  return out
}

// Stored or loaded parameters: every known field of the right type, defaults
// for the rest.
export function sanitizeParams(value: unknown): SculptureParams {
  const parsed = (typeof value === 'object' && value !== null ? value : {}) as Partial<Record<keyof SculptureParams, unknown>>
  const out: SculptureParams = { ...DEFAULT_PARAMS }
  for (const key of Object.keys(DEFAULT_PARAMS) as (keyof SculptureParams)[]) {
    if (typeof parsed[key] === typeof DEFAULT_PARAMS[key]) (out as unknown as Record<string, unknown>)[key] = parsed[key]
  }
  // Saved before the turn went to 45° steps: a quarter turn on or off.
  const legacy = parsed as { turnPlates?: unknown }
  if (parsed.plateTurn === undefined && legacy.turnPlates === true) out.plateTurn = 90
  out.plateTurn = ((Math.round(out.plateTurn / 45) * 45) % 360 + 360) % 360
  out.layerPlacements = sanitizePlacements(parsed.layerPlacements, (parsed as { layerTurns?: unknown }).layerTurns)
  return out
}

export function loadParams(): SculptureParams {
  try {
    return sanitizeParams(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'))
  } catch {
    return DEFAULT_PARAMS
  }
}

function saveParams(params: SculptureParams) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(params))
  } catch {
    // Only a convenience: the page works the same without it.
  }
}

export interface SculptureState {
  mesh: Mesh | null
  layers: Layer[]
  holes: Hole[]
  analyses: LayerHoles[]
  spacers: Spacer[]
  hubSpacers: Spacer[]
  // Layers whose hub has a part too narrow for a hole with its wall.
  thinHubLayers: number[]
  // Hole edits were made on a different layer stack.
  holesStale: boolean
  hasCommonArea: boolean
  errors: string[]
  computeError: string | null
  computing: boolean
  // `forSignature`: the stack the edit was made for, when it is not the current one.
  setHoles: (holes: Hole[], forSignature?: string) => void
  // Holes from a project file, held as an edit of the stack those parameters give.
  restoreHoles: (holes: Hole[], forParams: SculptureParams) => void
  reproposeHoles: () => void
}

export function useSculpture(raw: Float32Array | null, params: SculptureParams): SculptureState {
  useEffect(() => saveParams(params), [params])


  const signature = layerSignature(params)
  const { upAxis, flipUp, height, viewUp, viewFlip, plateTurn } = params
  const mesh = useMemo(() => {
    if (!raw || !(height > 0)) return null
    return normalizeMesh(raw, upAxis, flipUp, height, viewUp, viewFlip, plateTurn)
  }, [raw, upAxis, flipUp, height, viewUp, viewFlip, plateTurn])

  // Height measures the shown up axis, so the stack can be longer than it.
  const errors = useMemo(() => {
    const list = paramErrors(params)
    const pitch = params.thickness + params.gap
    if (mesh && pitch > 0 && mesh.height / pitch > 500 && !list.includes('More than 500 layers.')) list.push('More than 500 layers.')
    return list
  }, [params, mesh])

  // The stack is the only slow step, so it waits for typing to settle, and it
  // keeps the previous stack on screen meanwhile.
  const [computed, setComputed] = useState<{ layers: Layer[]; signature: string; error: string | null }>({
    layers: [],
    signature: '',
    error: null,
  })
  const [computing, setComputing] = useState(false)
  const stackInvalid =
    !(params.thickness > 0) ||
    params.gap < 0 ||
    !(params.tolerance > 0) ||
    !(params.bridgeWidth > 0) ||
    (mesh?.height ?? params.height) / (params.thickness + params.gap) > 500

  useEffect(() => {
    if (!mesh || stackInvalid) return
    let cancelled = false
    const start = setTimeout(() => setComputing(true), 0)
    const timer = setTimeout(() => {
      if (cancelled) return
      try {
        setComputed({ layers: computeLayers(mesh, params), signature, error: null })
      } catch (err) {
        console.warn('SculptureTool: could not compute layers', err)
        setComputed({ layers: [], signature, error: err instanceof Error ? err.message : String(err) })
      }
      setComputing(false)
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(start)
      clearTimeout(timer)
    }
    // `params` reaches computeLayers only through what `signature` lists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesh, signature, stackInvalid])

  const { layers } = computed

  // Hand-edited holes outlive a change of the stack, flagged as stale: the
  // states below are recomputed either way, so nothing is silently wrong.
  const [savedEdits, setEditedHoles] = useState<{ holes: Hole[]; signature: string; rodCount: number } | null>(null)
  // Asking for a different number of rods is asking for a new proposal.
  const editedHoles = savedEdits?.rodCount === params.rodCount ? savedEdits : null
  const proposal = useMemo(
    () => proposeHoles(layers, params),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layers, params.rodCount, params.holeDiameter, params.minWall, params.headDiameter, params.islandMode, params.hub, params.hubDiameter, params.hubX, params.hubY],
  )

  const holes = editedHoles ? editedHoles.holes : proposal.holes
  const analyses = useMemo(
    () => layers.map((layer) => analyzeLayer(layer, holes, params)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layers, holes, params.holeDiameter, params.minWall, params.headDiameter],
  )

  const spacers = useMemo(
    () => computeSpacers(layers, holes, params),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layers, holes, params.spacers, params.spacerShape, params.spacerSize, params.gap, params.minIslandArea, params.holeDiameter],
  )

  const hubSpacers = useMemo(
    () => computeHubSpacers(layers, holes, params),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layers, holes, params.hub, params.gap, params.hubDiameter, params.hubX, params.hubY, params.holeDiameter],
  )

  const thinHubLayers = useMemo(
    () => layers.filter((layer) => thinHubPieces(layer, params).length > 0).map((layer) => layer.number),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layers, params.holeDiameter, params.minWall],
  )

  return {
    mesh,
    spacers,
    hubSpacers,
    thinHubLayers,
    layers,
    holes,
    analyses,
    holesStale: editedHoles !== null && editedHoles.signature !== signature,
    hasCommonArea: proposal.hasCommonArea,
    errors,
    computeError: computed.error,
    computing,
    setHoles: (next, forSignature) => setEditedHoles({ holes: next, signature: forSignature ?? signature, rodCount: params.rodCount }),
    restoreHoles: (next, forParams) =>
      setEditedHoles({ holes: next, signature: layerSignature(forParams), rodCount: forParams.rodCount }),
    reproposeHoles: () => setEditedHoles(null),
  }
}
