import { PauseIcon, PlayIcon, RestartIcon } from '../icons'
import { formatSimTime } from '../../lib/simulation'
import { previewButtonClass } from '../preview/previewToolbar'
import { SIM_SPEEDS, type SimSpeed, type SimulationControls } from './useSimulation'

// BL-100: the Simulate mode's bar — in place of the preview's bottom row of
// buttons. Two rows, so it fits a phone: the progress slider with the
// time, then Play / Pause, back to the start, the speed and Close. The
// speed is one button that steps through SIM_SPEEDS and wraps around.

const barClass =
  'absolute inset-x-3 bottom-3 flex flex-col gap-2 rounded-md border border-field-border bg-code-bg/90 px-3 py-2 shadow-sm pointer-coarse:inset-x-0 pointer-coarse:bottom-0 pointer-coarse:rounded-none pointer-coarse:border-x-0 pointer-coarse:border-b-0 pointer-coarse:px-4 pointer-coarse:py-2.5 phone:gap-1.5 phone:py-1.5'

const iconButtonClass = `${previewButtonClass} flex items-center justify-center pointer-coarse:w-12 phone:w-10`

// A speed other than ×1 in the theme's second leading color (`--edit`) —
// the base button's own border, fill and text colors swapped out, not
// overridden, so no utility order decides which one wins.
const fastSpeedClass = previewButtonClass
  .replace('border-field-border', 'border-edit')
  .replace('bg-field-bg/90', 'bg-edit-bg')
  .replace('text-value', 'text-edit-fg')
  .replace('hover:bg-field-bg', '')
  .replace('pointer-coarse:bg-field-bg', '')

const nextSpeed = (speed: SimSpeed): SimSpeed => SIM_SPEEDS[(SIM_SPEEDS.indexOf(speed) + 1) % SIM_SPEEDS.length]

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
          className="min-w-0 flex-1 accent-accent pointer-coarse:h-8 phone:h-6"
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
        <button
          type="button"
          onClick={() => controls.setSpeed(nextSpeed(speed))}
          aria-label={`Playback speed ×${speed} — switch to ×${nextSpeed(speed)}`}
          title={`Playback speed — click for ×${nextSpeed(speed)}`}
          className={`${speed === 1 ? previewButtonClass : fastSpeedClass} w-11 tabular-nums pointer-coarse:w-14`}
        >
          ×{speed}
        </button>
        <button type="button" onClick={controls.close} className={`${previewButtonClass} ml-auto pointer-coarse:px-3`}>
          Close
        </button>
      </div>
    </div>
  )
}
