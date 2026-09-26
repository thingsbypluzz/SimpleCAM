export interface TextToggleOption<T extends string> {
  value: T
  label: string
  // Optional tooltip, for when the label is abbreviated (e.g. "Conv.").
  title?: string
}

interface TextToggleProps<T extends string> {
  options: readonly TextToggleOption<T>[]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
}

// Compact row of text buttons where exactly one is selected — Raster
// Direction, Z-Transition Mode, Cut Direction (Step 2) and Circle
// interpolation (Step 4). Same selected-state tokens as every other
// "user's choice" control (OptionButton, Checkbox). Pickers with icons and
// descriptions (MethodPicker and friends) stay separate.
export function TextToggle<T extends string>({ options, value, onChange, disabled = false }: TextToggleProps<T>) {
  return (
    <div className="flex gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          title={opt.title}
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={[
            'rounded-md border px-2.5 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
            value === opt.value
              ? 'border-selected-border bg-selected-bg text-selected-fg shadow-[var(--glow-selected)]'
              : 'border-border text-muted hover:border-field-border',
          ].join(' ')}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
