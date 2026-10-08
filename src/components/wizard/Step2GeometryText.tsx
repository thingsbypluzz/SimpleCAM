import { useEffect, useState } from 'react'
import type { WizardParams } from '../../types/wizard'
import type { MachineSettings } from '../../types/machine'
import type { ToolDiameterOption } from '../../types/toolDiameters'
import { TEXT_FONTS, textFontMeta } from '../../config/textFonts'
import { fmt } from '../../lib/format'
import { layoutText, textGrooveWidth } from '../../lib/textLayout'
import { resolveToolDiameterSelectOptions } from '../../lib/toolDiameterOptions'
import {
  isTextBitValid,
  isTextContentValid,
  isTextSizeValid,
  isTextSpacingValid,
  isTextWithinLimits,
  MAX_LETTER_SPACING_PERCENT,
  MAX_TEXT_LENGTH,
  MAX_VBIT_ANGLE_DEG,
  MIN_LETTER_SPACING_PERCENT,
  MIN_VBIT_ANGLE_DEG,
} from '../../lib/validation'
import { Checkbox } from './Checkbox'
import { FieldRow, inputClass } from './FieldRow'
import { HintPopover } from './HintPopover'
import { NumberInput } from './NumberInput'
import { PickHeader } from './PickHeader'
import { TextToggle } from './TextToggle'
import {
  TEXT_ALIGN_OPTIONS,
  TEXT_CIRCLE_SIDE_OPTIONS,
  TEXT_ORIGIN_X_OPTIONS,
  TEXT_ORIGIN_Y_OPTIONS,
  VBIT_ANGLE_OPTIONS,
  type VbitAngleOption,
} from './toggleOptions'
import { useNumberField } from './useNumberField'

interface Step2GeometryTextProps {
  params: WizardParams
  onChange: (patch: Partial<WizardParams>) => void
  machine: MachineSettings
  toolDiameters: ToolDiameterOption[]
}

const round2 = (value: number) => Math.round(value * 100) / 100
// The tool list's value for the V-bit; end mills are their diameter.
const VBIT_OPTION = 'vbit'
// Typing commits after a short pause, like the number fields (BL-89): every
// keystroke would otherwise re-lay the text and rebuild the previews.
const TEXT_COMMIT_IDLE_MS = 400

// Field order: the text itself -> Font + Height + Letter Spacing -> layout
// fields (Straight: Line Spacing + Align, Origin, Angle; On Circle: Diameter
// + Rotate + Letters) -> Mirror -> Bit (+ V Angle 30 / 60 / 90) + Depth +
// groove readout -> Offset X/Y. No method picker (one way of cutting), no
// Tabs, no Flutes / chip load (the Feedrate Calculator is not offered).
export function Step2GeometryText({ params, onChange, machine, toolDiameters }: Step2GeometryTextProps) {
  const { text } = params
  const updateText = (patch: Partial<WizardParams['text']>) => onChange({ text: { ...text, ...patch } })

  // The textarea keeps its own draft and commits it after a pause or on
  // blur; a change from outside (a loaded preset remounts the step) is
  // picked up through the key on the Step 2 panel.
  const [draft, setDraft] = useState(text.text)
  useEffect(() => {
    if (draft === text.text) return
    const timer = setTimeout(() => updateText({ text: draft }), TEXT_COMMIT_IDLE_MS)
    return () => clearTimeout(timer)
    // updateText closes over the current params; only the draft restarts the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  const heightField = useNumberField(text.height, (v) => updateText({ height: v }))
  const letterSpacingField = useNumberField(text.letterSpacingPercent, (v) => updateText({ letterSpacingPercent: v }))
  const lineSpacingField = useNumberField(text.lineSpacing, (v) => updateText({ lineSpacing: v }))
  const angleField = useNumberField(text.angleDeg, (v) => updateText({ angleDeg: v }))
  const circleDiameterField = useNumberField(text.circleDiameter, (v) => updateText({ circleDiameter: v }))
  const circleAngleField = useNumberField(text.circleAngleDeg, (v) => updateText({ circleAngleDeg: v }))
  const totalDepthField = useNumberField(text.totalDepth, (v) => updateText({ totalDepth: v }))
  const offsetXField = useNumberField(text.offsetX, (v) => updateText({ offsetX: v }))
  const offsetYField = useNumberField(text.offsetY, (v) => updateText({ offsetY: v }))

  const isCircle = text.layout === 'circle'
  const layout = layoutText(text)
  const tooLong = [...text.text].length > MAX_TEXT_LENGTH
  const contentInvalid = layout.fontReady && !isTextContentValid(text)
  const sizeInvalid = !isTextSizeValid(text)
  const spacingInvalid = !isTextSpacingValid(text)
  const bitInvalid = !isTextBitValid(text)
  const limitInvalid = !isTextWithinLimits(params)
  const groove = textGrooveWidth(text)
  const font = textFontMeta(text.fontId)

  return (
    <div className="flex flex-col gap-6">
      <PickHeader params={params} />

      <div className="flex flex-col gap-4">
        <FieldRow
          label="Text"
          hint={isCircle ? 'One line, bent along the circle. A line break reads as a space.' : 'Press Enter for a new line.'}
        >
          <textarea
            className={`${inputClass} h-20 resize-none`}
            aria-invalid={contentInvalid || limitInvalid}
            value={draft}
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (draft !== text.text) updateText({ text: draft })
            }}
          />
        </FieldRow>
        {!layout.fontReady && <p className="text-sm text-muted">Loading the font…</p>}
        {layout.missing.length > 0 && (
          <p className="text-sm text-status-error">
            {font.title} has no {layout.missing.length === 1 ? 'character' : 'characters'} {layout.missing.map((c) => `“${c}”`).join(' ')}.
            Remove {layout.missing.length === 1 ? 'it' : 'them'} or pick another font.
          </p>
        )}
        {tooLong && <p className="text-sm text-status-error">The text can be at most {MAX_TEXT_LENGTH} characters long.</p>}
        {layout.fontReady && layout.missing.length === 0 && !tooLong && layout.strokes.length === 0 && (
          <p className="text-sm text-status-error">Type something to engrave.</p>
        )}
        {limitInvalid && (
          <p className="text-sm text-status-error">Too much to engrave in one program — shorten the text or use a larger Stepdown.</p>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <FieldRow label="Font">
          <select className={inputClass} value={text.fontId} onChange={(e) => updateText({ fontId: e.target.value })}>
            {TEXT_FONTS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.title}
              </option>
            ))}
          </select>
        </FieldRow>
        <div className="flex items-end gap-4">
          <div className="min-w-0 flex-1">
            <FieldRow label="Height [mm]" hint="Height of a capital letter, e.g. H. Lowercase letters and descenders follow from it.">
              <NumberInput type="number" step="0.5" min="0" className={inputClass} aria-invalid={!(text.height > 0)} {...heightField} />
            </FieldRow>
          </div>
          <div className="min-w-0 flex-1">
            <FieldRow label="Spacing [%]" hint="Letter Spacing — extra space between letters, as a share of the Height. 0 is the font's own spacing.">
              <NumberInput
                type="number"
                step="1"
                min={MIN_LETTER_SPACING_PERCENT}
                max={MAX_LETTER_SPACING_PERCENT}
                className={inputClass}
                aria-invalid={spacingInvalid}
                {...letterSpacingField}
              />
            </FieldRow>
          </div>
          <div className="min-w-0 flex-1">
            <FieldRow label="Width [mm]">
              <input type="text" readOnly disabled value={layout.fontReady ? fmt(round2(layout.width)) : '—'} className={`${inputClass} cursor-not-allowed opacity-70`} />
            </FieldRow>
          </div>
        </div>
        {spacingInvalid && (
          <p className="text-sm text-status-error">
            Letter spacing must be between {MIN_LETTER_SPACING_PERCENT}% and {MAX_LETTER_SPACING_PERCENT}%.
          </p>
        )}
      </div>

      {isCircle ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-end gap-4">
            <div className="min-w-0 flex-1">
              <FieldRow label="Diameter [mm]" hint="The circle the letters stand on (their baseline).">
                <NumberInput
                  type="number"
                  step="0.5"
                  min="0"
                  max={Math.min(machine.travelX, machine.travelY)}
                  className={inputClass}
                  aria-invalid={!(text.circleDiameter > 0)}
                  {...circleDiameterField}
                />
              </FieldRow>
            </div>
            <div className="min-w-0 flex-1">
              <FieldRow label="Rotate [°]" hint="Turns the whole text around the circle: the angle its middle sits at. 0° = right (+X), 90° = top, 270° = bottom.">
                <NumberInput type="number" step="5" className={inputClass} {...circleAngleField} />
              </FieldRow>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-value">Letters</span>
            <TextToggle options={TEXT_CIRCLE_SIDE_OPTIONS} value={text.circleSide} onChange={(v) => updateText({ circleSide: v })} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-end gap-4">
            <div className="min-w-0 flex-1">
              <FieldRow label="Line Spacing [×]" hint="Distance between the baselines of two lines, as a multiple of the Height.">
                <NumberInput type="number" step="0.1" min="0" className={inputClass} aria-invalid={!(text.lineSpacing > 0)} {...lineSpacingField} />
              </FieldRow>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-sm font-medium text-value">Align</span>
              <TextToggle options={TEXT_ALIGN_OPTIONS} value={text.align} onChange={(v) => updateText({ align: v })} />
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-sm font-medium text-value">Origin X</span>
              <TextToggle options={TEXT_ORIGIN_X_OPTIONS} value={text.originX} onChange={(v) => updateText({ originX: v })} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-sm font-medium text-value">Origin Y</span>
              <TextToggle options={TEXT_ORIGIN_Y_OPTIONS} value={text.originY} onChange={(v) => updateText({ originY: v })} />
            </div>
          </div>
          <FieldRow label="Angle [°]" hint="Turns the whole text about its origin, counter-clockwise. 90° writes it upward along Y.">
            <NumberInput type="number" step="5" className={inputClass} {...angleField} />
          </FieldRow>
        </div>
      )}
      {sizeInvalid && <p className="text-sm text-status-error">Height, depth{isCircle ? ', diameter' : ' and line spacing'} must be greater than 0.</p>}

      <Checkbox checked={text.mirror} onChange={(checked) => updateText({ mirror: checked })} label="Mirror">
        <HintPopover text="Writes the text mirrored — for engraving the back of a clear sheet, to be read from the front." />
      </Checkbox>

      <div className="flex flex-col gap-4">
        <div className="flex items-end gap-4">
          <div className="min-w-0 flex-1">
            <FieldRow label="Bit" hint="The tool follows the letters' own lines either way — the bit only sets how wide the groove is drawn in the previews.">
              <select
                className={inputClass}
                aria-invalid={bitInvalid && text.bit === 'endmill'}
                value={text.bit === 'vbit' ? VBIT_OPTION : String(text.toolDiameter)}
                onChange={(e) =>
                  updateText(e.target.value === VBIT_OPTION ? { bit: 'vbit' } : { bit: 'endmill', toolDiameter: Number(e.target.value) })
                }
              >
                <option value={VBIT_OPTION}>Generic V-Bit</option>
                {resolveToolDiameterSelectOptions(toolDiameters, text.toolDiameter).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </FieldRow>
          </div>
          <div className="min-w-0 flex-1">
            {text.bit === 'vbit' && (
              <div className="flex flex-col gap-1">
                <span className="flex items-center gap-1.5 text-sm font-medium text-value">
                  V Angle
                  <HintPopover text="The V-bit's included angle. Used only to show the groove's width — the G-code is the same." />
                </span>
                <TextToggle
                  options={VBIT_ANGLE_OPTIONS}
                  value={String(text.vbitAngleDeg) as VbitAngleOption}
                  onChange={(v) => updateText({ vbitAngleDeg: Number(v) })}
                />
              </div>
            )}
          </div>
        </div>
        <div className="flex items-end gap-4">
          <div className="min-w-0 flex-1">
            <FieldRow label="Depth [mm]" hint="How deep the tip goes. With a V-bit, deeper also means a wider line.">
              <NumberInput
                type="number"
                step="0.05"
                min="0"
                max={machine.travelZ}
                className={inputClass}
                aria-invalid={!(text.totalDepth > 0)}
                {...totalDepthField}
              />
            </FieldRow>
          </div>
          <div className="min-w-0 flex-1">
            <FieldRow label="Line Width [mm]">
              <input type="text" readOnly disabled value={bitInvalid ? '—' : fmt(round2(groove))} className={`${inputClass} cursor-not-allowed opacity-70`} />
            </FieldRow>
          </div>
        </div>
        {bitInvalid && text.bit === 'vbit' && (
          <p className="text-sm text-status-error">
            V-bit angle must be between {MIN_VBIT_ANGLE_DEG}° and {MAX_VBIT_ANGLE_DEG}°.
          </p>
        )}
      </div>

      <div className="border-t border-border pt-4">
        <span className="mb-2 block text-sm font-medium text-value">Offset</span>
        <p className="mb-2 text-sm text-muted">{isCircle ? "Moves the circle's center from the origin." : 'Moves the text from the origin.'}</p>
        <div className="flex gap-4">
          <div className="min-w-0 flex-1">
            <FieldRow label="Offset X [mm]">
              <NumberInput type="number" step="0.1" min={-machine.travelX} max={machine.travelX} className={inputClass} {...offsetXField} />
            </FieldRow>
          </div>
          <div className="min-w-0 flex-1">
            <FieldRow label="Offset Y [mm]">
              <NumberInput type="number" step="0.1" min={-machine.travelY} max={machine.travelY} className={inputClass} {...offsetYField} />
            </FieldRow>
          </div>
        </div>
      </div>
    </div>
  )
}
