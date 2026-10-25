import { PauseIcon, PlayIcon, RestartIcon } from '../icons'
import { formatSimTime } from '../../lib/simulation'
import { previewButtonClass } from '../preview/previewToolbar'
import { SIM_SPEEDS, type SimulationControls } from './useSimulation'

// BL-100: the Simulate mode's bar — in place of the preview's bottom row of
// buttons. Two rows, so it fits a phone: the progress slider with the
// time, then Play / Pause, back to the start, the speed and Close.

const barClass =
  'absolute inset-x-3 bottom-3 flex flex-col gap-2 rounded-md border border-field-border bg-code-bg/90 px-3 py-2 shadow-sm pointer-coarse:inset-x-0 pointer-coarse:bottom-0 pointer-coarse:rounded-none pointer-coarse:border-x-0 pointer-coarse:border-b-0 pointer-coarse:px-4 pointer-coarse:py-2.5'

const iconButtonClass = `${previewButtonClass} flex items-center justify-center pointer-coarse:w-12`

// The current speed in the theme's second leading color (`--edit`) — the
// base button's own border, fill and text colors swapped out, not
// overridden, so no utility order decides which one wins.
const activeSpeedClass = previewButtonClass
  .replace('border-field-border', 'border-edit')
  .replace('bg-field-bg/90', 'bg-edit-bg')
  .replace('text-value', 'text-edit-fg')
  .replace('hover:bg-field-bg', '')
  .replace('pointer-coarse:bg-field-bg', '')

export function SimulationBar({ controls }: { controls: SimulationControls }) {
  const { playing, speed, time, total } = controls
  return (
    <div className={barClass} role="group" aria-label="Simulation">
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={total}
          step={total > 0 ? total / 1000 : 1}
          value={time}
          onChange={(e) => controls.seek(Number(e.target.value))}
          aria-label="Simulation progress"
          className="min-w-0 flex-1 accent-accent pointer-coarse:h-8"
        />
        <span className="shrink-0 font-mono text-xs text-value tabular-nums">
          {formatSimTime(time)} / {formatSimTime(total)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pointer-coarse:gap-2">
        <button
          type="button"
          onClick={controls.togglePlay}
          aria-label={playing ? 'Pause' : 'Play'}
          title={playing ? 'Pause' : 'Play'}
          className={iconButtonClass}
        >
          {playing ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
        </button>
        <button type="button" onClick={controls.restart} aria-label="Back to start" title="Back to start" className={iconButtonClass}>
          <RestartIcon className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-1" role="group" aria-label="Playback speed">
          {SIM_SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => controls.setSpeed(s)}
              aria-pressed={speed === s}
              className={`${speed === s ? activeSpeedClass : previewButtonClass} pointer-coarse:w-11`}
            >
              ×{s}
            </button>
          ))}
        </div>
        <button type="button" onClick={controls.close} className={`${previewButtonClass} ml-auto pointer-coarse:px-3`}>
          Close
        </button>
      </div>
    </div>
  )
}
