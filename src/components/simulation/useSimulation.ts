import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildSimulation, simulationAt, type Simulation, type SimulationPosition } from '../../lib/simulation'
import type { WizardParams } from '../../types/wizard'

// BL-100: the Simulate mode's playback, shared by both 3D previews (the
// full one and the simplified one). The preview owns the frame loop and
// calls tick() every frame; the clock lives in refs so playing never
// re-renders React 60 times a second — only the bar's time readout is
// state, refreshed a few times a second.

export const SIM_SPEEDS = [1, 2, 4, 8, 16] as const
export type SimSpeed = (typeof SIM_SPEEDS)[number]

// Kept by App.tsx across unmounts (switching to 2D or G-Code unmounts the
// 3D preview): coming back with the same parameters restores the mode and
// the position, paused. Session-only.
export interface SimulationMemory {
  open: boolean
  time: number
  speed: SimSpeed
  params: WizardParams | null
}

export function createSimulationMemory(): SimulationMemory {
  return { open: false, time: 0, speed: 1, params: null }
}

// A real-time step longer than this is clamped — a hidden tab stops the
// frame loop, and the first frame back must not jump ahead.
const MAX_FRAME_SECONDS = 0.1
// How long after a camera gesture ends playback waits before it goes on —
// a mouse wheel sends start and end on every notch.
const CAMERA_RESUME_MS = 300
// How often the bar's time readout follows the clock while playing.
const READOUT_INTERVAL_MS = 100

interface UseSimulationOptions {
  params: WizardParams
  rapidFeed: number
  // Whether the live pattern's toolpath is shown at all (not with only
  // overlaid presets, not with invalid parameters).
  enabled: boolean
  // A modal is open over the preview.
  renderPaused: boolean
  memory: SimulationMemory
}

export interface SimulationControls {
  enabled: boolean
  open: boolean
  playing: boolean
  speed: SimSpeed
  // The bar's readout (seconds) — follows the clock a few times a second.
  time: number
  total: number
  // The timeline while the mode is open.
  sim: Simulation | null
  openMode: () => void
  close: () => void
  togglePlay: () => void
  restart: () => void
  seek: (time: number) => void
  setSpeed: (speed: SimSpeed) => void
  // Advances the clock by a real-time step (seconds) and returns the tool's
  // position, or null when the mode is closed.
  tick: (dtSeconds: number) => SimulationPosition | null
  // Whether the clock moved since the last frame drew it.
  consumeChange: () => boolean
  holdForCamera: () => void
  releaseCamera: () => void
}

export function useSimulation({ params, rapidFeed, enabled, renderPaused, memory }: UseSimulationOptions): SimulationControls {
  // Restored from the last mount only for the same parameters.
  const restore = memory.params === params
  const [open, setOpen] = useState(() => memory.open && restore && enabled)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeedState] = useState<SimSpeed>(memory.speed)
  const [readout, setReadout] = useState(() => (restore ? memory.time : 0))

  const timeRef = useRef(restore ? memory.time : 0)
  const playingRef = useRef(false)
  const speedRef = useRef<SimSpeed>(memory.speed)
  const changedRef = useRef(true)
  const cameraHoldRef = useRef(false)
  const resumeTimerRef = useRef<number | null>(null)
  const lastReadoutRef = useRef(0)

  const sim = useMemo(() => (open ? buildSimulation(params, rapidFeed) : null), [open, params, rapidFeed])
  const simRef = useRef(sim)
  const total = sim?.total ?? 0

  const setTime = useCallback((t: number) => {
    timeRef.current = t
    changedRef.current = true
    lastReadoutRef.current = performance.now()
    setReadout(t)
  }, [])

  const setPlay = useCallback((value: boolean) => {
    playingRef.current = value
    setPlaying(value)
  }, [])

  // New parameters (a field edited, a preset loaded) or a new rapid feed:
  // back to the start, paused. Compared by identity, so the mount (and
  // StrictMode's repeated mount) keeps a restored position.
  const prevSimRef = useRef(sim)
  useEffect(() => {
    simRef.current = sim
    changedRef.current = true
    if (prevSimRef.current === sim) return
    prevSimRef.current = sim
    setPlay(false)
    setTime(0)
  }, [sim, setPlay, setTime])

  // Nothing to animate any more (only overlaid presets, invalid
  // parameters) — the mode closes.
  useEffect(() => {
    if (!enabled && open) {
      setOpen(false)
      setPlay(false)
    }
  }, [enabled, open, setPlay])

  // A modal over the preview pauses playback.
  useEffect(() => {
    if (renderPaused) setPlay(false)
  }, [renderPaused, setPlay])

  // So does hiding the browser tab.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) setPlay(false)
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [setPlay])

  // Remember the mode for the next mount (paused).
  const memoryState = useRef({ open, speed, params })
  memoryState.current = { open, speed, params }
  useEffect(
    () => () => {
      memory.open = memoryState.current.open
      memory.speed = memoryState.current.speed
      memory.params = memoryState.current.params
      memory.time = timeRef.current
      if (resumeTimerRef.current !== null) window.clearTimeout(resumeTimerRef.current)
    },
    [memory],
  )

  const openMode = useCallback(() => {
    if (!enabled) return
    setOpen(true)
    setPlay(false)
    setTime(0)
  }, [enabled, setPlay, setTime])

  const close = useCallback(() => {
    setOpen(false)
    setPlay(false)
  }, [setPlay])

  const togglePlay = useCallback(() => {
    if (playingRef.current) {
      setPlay(false)
      return
    }
    // From the end, Play starts over.
    if (timeRef.current >= (simRef.current?.total ?? 0)) setTime(0)
    setPlay(true)
  }, [setPlay, setTime])

  const restart = useCallback(() => setTime(0), [setTime])

  const seek = useCallback(
    (t: number) => {
      setPlay(false)
      setTime(Math.min(Math.max(t, 0), simRef.current?.total ?? 0))
    },
    [setPlay, setTime],
  )

  const setSpeed = useCallback((value: SimSpeed) => {
    speedRef.current = value
    setSpeedState(value)
  }, [])

  const tick = useCallback(
    (dtSeconds: number): SimulationPosition | null => {
      const current = simRef.current
      if (!current) return null
      if (playingRef.current && !cameraHoldRef.current) {
        const dt = Math.min(Math.max(dtSeconds, 0), MAX_FRAME_SECONDS)
        let t = timeRef.current + dt * speedRef.current
        if (t >= current.total) {
          t = current.total
          setPlay(false)
          setReadout(t)
        }
        if (t !== timeRef.current) {
          timeRef.current = t
          changedRef.current = true
          const now = performance.now()
          if (now - lastReadoutRef.current >= READOUT_INTERVAL_MS) {
            lastReadoutRef.current = now
            setReadout(t)
          }
        }
      }
      return simulationAt(current, timeRef.current)
    },
    [setPlay],
  )

  const consumeChange = useCallback(() => {
    const changed = changedRef.current
    changedRef.current = false
    return changed
  }, [])

  const holdForCamera = useCallback(() => {
    if (resumeTimerRef.current !== null) {
      window.clearTimeout(resumeTimerRef.current)
      resumeTimerRef.current = null
    }
    cameraHoldRef.current = true
  }, [])

  const releaseCamera = useCallback(() => {
    if (resumeTimerRef.current !== null) window.clearTimeout(resumeTimerRef.current)
    resumeTimerRef.current = window.setTimeout(() => {
      resumeTimerRef.current = null
      cameraHoldRef.current = false
    }, CAMERA_RESUME_MS)
  }, [])

  return {
    enabled,
    open,
    playing,
    speed,
    time: Math.min(readout, total),
    total,
    sim,
    openMode,
    close,
    togglePlay,
    restart,
    seek,
    setSpeed,
    tick,
    consumeChange,
    holdForCamera,
    releaseCamera,
  }
}
