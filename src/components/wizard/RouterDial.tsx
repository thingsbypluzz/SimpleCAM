interface RouterDialProps {
  // RPM per dial position (config/routers.ts), position 1 first.
  dial: number[]
  // 1-based position to highlight — the one closest to the spindle speed.
  position: number
}

// A hand-set router's speed dial as a row of positions with their RPM,
// the suggested one highlighted (BL-69/BL-79) — shared by the Feedrate
// Calculator and Step 3.
export function RouterDial({ dial, position }: RouterDialProps) {
  return (
    <div className="flex gap-1" role="img" aria-label={`Dial position ${position} of ${dial.length}`}>
      {dial.map((rpm, i) => (
        <span
          key={i}
          title={`${rpm} RPM`}
          className={`flex min-w-0 flex-1 flex-col items-center rounded border px-1 py-0.5 text-xs tabular-nums ${
            i + 1 === position ? 'border-selected-border text-selected-fg' : 'border-border text-muted'
          }`}
        >
          <span className="font-semibold">{i + 1}</span>
          <span className="text-[10px]">{Math.round(rpm / 1000)}k</span>
        </span>
      ))}
    </div>
  )
}
