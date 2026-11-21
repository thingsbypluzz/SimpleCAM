import { FieldRow, inputClass } from '../components/wizard/FieldRow'
import { NumberInput } from '../components/wizard/NumberInput'
import { useNumberField } from '../components/wizard/useNumberField'
import type { ToolDiameterOption } from '../types/toolDiameters'

// The wizard's fields as in OnlyPaths: FieldRow's label with the unit in
// brackets, the same input and the two step buttons. Values can also change
// from outside (a dragged hole, a loaded project, a turned plate), so a
// field not being edited follows them.

interface NumberFieldProps {
  label: string
  unit?: string
  value: number
  onChange: (v: number) => void
  step?: number
}

export function NumberField({ label, unit, value, onChange, step }: NumberFieldProps) {
  const { onAdjust, ...field } = useNumberField(value, onChange, { syncWhenBlurred: true })
  return (
    <FieldRow label={unit ? `${label} [${unit}]` : label}>
      <NumberInput type="number" step={step} className={inputClass} onAdjust={onAdjust} {...field} />
    </FieldRow>
  )
}

// A small field with its own aria-label, for a bar laid over a preview.
export function CompactNumberField({ ariaLabel, value, onChange, step }: { ariaLabel: string; value: number; onChange: (v: number) => void; step?: number }) {
  const { onAdjust, ...field } = useNumberField(value, onChange, { syncWhenBlurred: true })
  return (
    <div className="w-24">
      <NumberInput
        type="number"
        step={step}
        aria-label={ariaLabel}
        className="h-7 w-full rounded-md border border-field-border bg-field-bg px-2 text-xs text-fg focus:border-accent-strong focus:outline-none"
        onAdjust={onAdjust}
        {...field}
      />
    </div>
  )
}

export function SelectField<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <FieldRow label={label}>
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </FieldRow>
  )
}

// The tool comes from the Tool Diameters list in Settings; a value saved before
// it left the list stays selectable.
export function ToolDiameterField({ value, options, onChange }: { value: number; options: ToolDiameterOption[]; onChange: (v: number) => void }) {
  const list = options.some((o) => o.value === value) ? options : [...options, { value, label: `${value} mm` }]
  return (
    <FieldRow label="Tool diameter">
      <select className={inputClass} value={String(value)} onChange={(e) => onChange(Number(e.target.value))}>
        {list.map((o) => (
          <option key={o.value} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldRow>
  )
}
