import { useState, type ReactNode } from 'react'
import { MATERIAL_IDS, MATERIALS, type MaterialId } from '../config/materials'
import { nearestDialPosition, ROUTERS } from '../config/routers'
import { OPERATION_META, type CalcPatch } from '../config/operationMeta'
import { computeFeeds, rigidityFactor, suggestedChipLoad, suggestedFinishStock, tableChipLoad, type ToolMaterial } from '../lib/feedCalc'
import { isValidFluteCount, MAX_FLUTES, type FeedCalcSettings } from '../lib/feedCalcStorage'
import { fmt } from '../lib/format'
import { resolveToolDiameterSelectOptions } from '../lib/toolDiameterOptions'
import { engagementAngleFor } from '../lib/pocketAdaptiveMath'
import { OPERATION_RULES } from '../lib/validation'
import type { MachineSettings, Rigidity } from '../types/machine'
import type { ToolDiameterOption } from '../types/toolDiameters'
import type { WizardParams } from '../types/wizard'
import { Checkbox } from './wizard/Checkbox'
import { RouterDial } from './wizard/RouterDial'
import { inputClass } from './wizard/FieldRow'
import { NumberInput } from './wizard/NumberInput'
import { TextToggle } from './wizard/TextToggle'
import { useNumberField } from './wizard/useNumberField'
import { useModalFocus } from './useModalFocus'

interface FeedCalculatorModalProps {
  params: WizardParams
  machine: MachineSettings
  settings: FeedCalcSettings
  // Settings → Tool Diameters — the diameter is picked from the same list as
  // Step 2's Tool Diameter, never typed (BL-71).
  toolDiameters: ToolDiameterOption[]
  onSaveSettings: (settings: FeedCalcSettings) => void
  // `patch` goes into WizardParams; `spindleSpeed` (when the RPM result was
  // selected) into Settings → Machine.
  onApply: (patch: Partial<WizardParams>, spindleSpeed: number | null) => void
  onClose: () => void
}

type ResultKey = 'rpm' | 'feed' | 'plunge' | 'stepdown' | 'width' | 'linking' | 'finishStock' | 'finishFeed'

const TOOL_MATERIAL_OPTIONS = [
  { value: 'carbide', label: 'Carbide' },
  { value: 'hss', label: 'HSS' },
] as const

const RIGIDITY_LABEL: Record<Rigidity, string> = { light: 'Light', medium: 'Medium', rigid: 'Rigid' }

const deg = (rad: number) => (rad * 180) / Math.PI
const chipLoadText = (n: number) => String(Math.round(n * 10000) / 10000)

// BL-68: cutting parameters from a material, the tool and the machine's
// limits (lib/feedCalc.ts), for the active operation — its method can be
// switched here too (same list as Step 2). Nothing is written until "Apply
// selected": the method and tool diameter always (they're what the numbers
// were computed for), each result only when its checkbox is on. The
// material and tool (flutes, carbide/HSS) are remembered across sessions;
// a typed chip load is not.
export function FeedCalculatorModal({ params, machine, settings, toolDiameters, onSaveSettings, onApply, onClose }: FeedCalculatorModalProps) {
  const { modalRef, initialFocusRef: closeButtonRef } = useModalFocus<HTMLButtonElement>(onClose)
  const meta = OPERATION_META[params.operation]
  const currentMethod = meta.methodValue(params)
  const currentDiameter = meta.toolDiameter(params)

  const [method, setMethod] = useState(currentMethod)
  const [toolDiameter, setToolDiameter] = useState(currentDiameter)
  const [chipLoadOverride, setChipLoadOverride] = useState<number | null>(null)
  const [checks, setChecks] = useState<Record<ResultKey, boolean>>({
    rpm: true,
    feed: true,
    plunge: true,
    stepdown: true,
    width: true,
    linking: true,
    finishStock: true,
    finishFeed: true,
  })

  const material = MATERIALS[settings.material]
  const updateSettings = (patch: Partial<FeedCalcSettings>) => onSaveSettings({ ...settings, ...patch })

  const flutesField = useNumberField(settings.flutes, (v) => {
    if (isValidFluteCount(v)) updateSettings({ flutes: v })
  })
  const tableLoad = suggestedChipLoad(material, toolDiameter, machine.rigidity)
  const chipLoadField = useNumberField(Number(chipLoadText(chipLoadOverride ?? tableLoad)), setChipLoadOverride, {
    syncWhenBlurred: true,
  })

  // The params as they'd be with this method and tool — gives the
  // engagement (slot / stepover / optimal load) and its current width.
  const draft = { ...params, ...meta.withCalc(params, { method, toolDiameter }) }
  const engagement = OPERATION_RULES[params.operation].engagement(draft)
  const currentWidth = engagement.kind === 'slot' ? null : engagement.percent
  const suggestedWidth =
    engagement.kind === 'stepover' ? material.aeStepover : engagement.kind === 'optimalLoad' ? material.aeAdaptive : null
  const widthInEffect = checks.width && suggestedWidth !== null ? suggestedWidth : (currentWidth ?? 100)

  // Pocket Finishing Pass (BL-78): Stock to Leave from the material table,
  // and the finish feed for the stock in effect (suggested when taken,
  // otherwise the current one) — like the width above.
  const isFinishing = params.operation === 'pocket' && draft.pocket.finishingEnabled
  const suggestedStock = suggestedFinishStock(material, toolDiameter)
  const stockInEffect = isFinishing ? (checks.finishStock ? suggestedStock : draft.pocket.stockToLeave) : null

  const inputsValid = toolDiameter > 0 && isValidFluteCount(settings.flutes) && (chipLoadOverride ?? tableLoad) > 0
  const r = computeFeeds({
    material,
    toolMaterial: settings.toolMaterial,
    toolDiameter,
    flutes: settings.flutes,
    chipLoad: chipLoadOverride,
    engagementKind: engagement.kind,
    widthPercent: widthInEffect,
    currentRpm: machine.spindleSpeed,
    useSuggestedRpm: checks.rpm,
    machine,
    finishStock: stockInEffect,
  })
  const isAdaptive = engagement.kind === 'optimalLoad'
  const widthLabel = isAdaptive ? 'Optimal Load [%]' : 'Stepover [%]'

  // BL-69: a hand-set router ignores S — show which dial position gives
  // the RPM the feeds are computed for.
  const router = machine.router ? ROUTERS[machine.router] : null
  const shownRpm = checks.rpm ? r.rpm : r.suggestedRpm
  const dialPosition = router ? nearestDialPosition(router.dial, shownRpm) : null

  const rows: { key: ResultKey; label: string; current: string; proposed: string; note?: string }[] = [
    {
      key: 'rpm',
      label: 'Spindle Speed [RPM]',
      current: String(machine.spindleSpeed),
      proposed: String(checks.rpm ? r.rpm : r.suggestedRpm),
      note:
        router && dialPosition !== null
          ? `Set the ${router.label} dial to ${dialPosition} (≈ ${router.dial[dialPosition - 1]} RPM). Global — saved to Settings → Machine, used by every preset.`
          : 'Global — saved to Settings → Machine, used by every preset.',
    },
    { key: 'feed', label: 'Feedrate XY [mm/min]', current: fmt(params.feeds.feedrateXY), proposed: String(r.feed) },
    { key: 'plunge', label: 'Plunge Rate [mm/min]', current: fmt(params.feeds.plungeRate), proposed: String(r.plungeRate) },
    { key: 'stepdown', label: 'Stepdown [mm]', current: fmt(params.feeds.stepdown), proposed: fmt(r.stepdown) },
    ...(suggestedWidth !== null
      ? [{ key: 'width' as const, label: widthLabel, current: fmt(currentWidth ?? 0), proposed: fmt(suggestedWidth) }]
      : []),
    ...(r.linkingFeed !== null
      ? [{ key: 'linking' as const, label: 'Linking Feed [mm/min]', current: fmt(draft.pocket.linkingFeed), proposed: String(r.linkingFeed) }]
      : []),
    ...(isFinishing
      ? [
          { key: 'finishStock' as const, label: 'Stock to Leave [mm]', current: fmt(draft.pocket.stockToLeave), proposed: fmt(suggestedStock) },
          {
            key: 'finishFeed' as const,
            label: 'Finish Feed [mm/min]',
            current: fmt(draft.pocket.finishFeed),
            proposed: String(r.finishFeed ?? '—'),
            note: r.finishFeedClampedToMax
              ? `Limited to Max Feed (${machine.maxFeed} mm/min) — the finishing chip is thinner than fz.`
              : undefined,
          },
        ]
      : []),
  ]

  const methodOptions = meta.calcMethods(params)
  const methodLabel = (value: string) => methodOptions.find((m) => m.value === value)?.label ?? value
  const contextChanges = [
    ...(toolDiameter !== currentDiameter ? [`Tool Diameter ${fmt(currentDiameter)} → ${fmt(toolDiameter)} mm`] : []),
    ...(method !== currentMethod ? [`Method ${methodLabel(currentMethod)} → ${methodLabel(method)}`] : []),
  ]

  const warnings = [
    ...(r.rpmClampedToRange
      ? [
          `The ideal speed for this material and tool is about ${Math.round(r.idealRpm)} RPM — limited to the spindle's range (${machine.spindleMinRpm}–${machine.spindleMaxRpm}). The feed follows the limited RPM, so the chip load stays the same.`,
        ]
      : []),
    ...(r.rpmLoweredForMaxFeed
      ? [`RPM lowered to ${r.rpm} so the feed stays under Max Feed (${machine.maxFeed} mm/min) at the same chip load.`]
      : []),
    ...(r.feedClampedToMax
      ? [
          `Feed limited to Max Feed (${machine.maxFeed} mm/min) — the chip load drops to ${chipLoadText(r.effectiveChipLoad)} mm/tooth. Too thin a chip rubs instead of cutting (plastics melt)${checks.rpm ? '' : '; taking the suggested RPM may help'}.`,
        ]
      : []),
  ]

  const handleApply = () => {
    const calc: CalcPatch = { method, toolDiameter }
    if (checks.width && suggestedWidth !== null) calc.widthPercent = suggestedWidth
    if (isAdaptive && checks.linking && r.linkingFeed !== null) calc.linkingFeed = r.linkingFeed
    // Tell Step 2/3 the feed is already chip-thinning compensated, so its
    // own Apply doesn't multiply it a second time.
    if (isAdaptive && checks.feed) calc.chipThinningBaseFeed = r.baseFeed
    if (isFinishing && checks.finishStock) calc.stockToLeave = suggestedStock
    if (isFinishing && checks.finishFeed && r.finishFeed !== null) calc.finishFeed = r.finishFeed
    const feeds = {
      ...params.feeds,
      ...(checks.feed ? { feedrateXY: r.feed } : {}),
      ...(checks.plunge ? { plungeRate: r.plungeRate } : {}),
      ...(checks.stepdown ? { stepdown: r.stepdown } : {}),
    }
    onApply({ ...meta.withCalc(params, calc), feeds }, checks.rpm ? r.rpm : null)
  }

  const setCheck = (key: ResultKey, value: boolean) => setChecks((prev) => ({ ...prev, [key]: value }))
  const anySelected = rows.some((row) => checks[row.key]) || contextChanges.length > 0
  const hssNote = settings.toolMaterial === 'hss' ? ' × 0.4 (HSS)' : ''
  const rigidity = `${RIGIDITY_LABEL[machine.rigidity]} × ${rigidityFactor(machine.rigidity)}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feed-calc-title"
        className="relative flex h-[680px] max-h-[95vh] w-[900px] max-w-[95vw] flex-col overflow-hidden rounded-lg border border-border bg-bg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 id="feed-calc-title" className="text-sm font-semibold text-fg">
            Feedrate Calculator — {meta.label}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close feedrate calculator"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-border/40 hover:text-fg"
          >
            ✕
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="flex w-[320px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-code-bg p-6">
            <Field label="Method">
              <select className={inputClass} value={method} onChange={(e) => setMethod(e.target.value)}>
                {methodOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Material">
              <select
                className={inputClass}
                value={settings.material}
                onChange={(e) => {
                  updateSettings({ material: e.target.value as MaterialId })
                  setChipLoadOverride(null)
                }}
              >
                {MATERIAL_IDS.map((id) => (
                  <option key={id} value={id}>
                    {MATERIALS[id].label}
                  </option>
                ))}
              </select>
            </Field>
            {material.note && <p className="text-xs text-muted">{material.note}</p>}
            <div className="flex gap-4">
              <div className="min-w-0 flex-1">
                <Field label="Tool ⌀ [mm]">
                  <select className={inputClass} value={toolDiameter} onChange={(e) => setToolDiameter(Number(e.target.value))}>
                    {/* The current Step 2 value stays selectable even if it
                        was removed from the list — same as Step 2's own
                        dropdown (resolveToolDiameterSelectOptions). */}
                    {resolveToolDiameterSelectOptions(toolDiameters, currentDiameter).map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="min-w-0 flex-1">
                <Field label="Flutes">
                  <NumberInput type="number" step="1" min="1" max={MAX_FLUTES} className={inputClass} {...flutesField} />
                </Field>
              </div>
            </div>
            <Field label="Tool Material">
              <TextToggle
                options={TOOL_MATERIAL_OPTIONS}
                value={settings.toolMaterial}
                onChange={(v: ToolMaterial) => updateSettings({ toolMaterial: v })}
              />
            </Field>
            <Field label="Chip Load fz [mm/tooth]">
              <NumberInput type="number" step="0.005" min="0" className={inputClass} {...chipLoadField} />
            </Field>
            <p className="-mt-2 flex items-center gap-2 text-xs text-muted">
              {chipLoadOverride === null ? (
                <span>From the table for this material and tool, × {rigidity}.</span>
              ) : (
                <>
                  <span>Your value — table: {chipLoadText(tableLoad)}.</span>
                  <button
                    type="button"
                    onClick={() => setChipLoadOverride(null)}
                    className="rounded border border-border px-1.5 py-0.5 font-medium hover:border-field-border hover:text-fg"
                  >
                    Use table
                  </button>
                </>
              )}
            </p>
            {!inputsValid && (
              <p className="text-sm text-status-error">
                Chip load must be greater than 0, flutes a whole number from 1 to {MAX_FLUTES}.
              </p>
            )}
            <div className="flex flex-col gap-1 border-t border-border pt-4 text-xs text-muted">
              <span className="font-medium text-value">Machine (Settings → Machine)</span>
              <span>
                Spindle {machine.spindleSpeed} RPM, range {machine.spindleMinRpm}–{machine.spindleMaxRpm}
              </span>
              {router && dialPosition !== null && (
                <div className="mt-1 flex flex-col gap-1">
                  <span>
                    {router.label} dial{router.approximate ? ' (estimated between the ends)' : ''}:
                  </span>
                  <RouterDial dial={router.dial} position={dialPosition} />
                </div>
              )}
              <span>
                Max Feed {machine.maxFeed} mm/min · Rigidity {RIGIDITY_LABEL[machine.rigidity]}
              </span>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="pb-2 font-medium">Apply</th>
                  <th className="pb-2 pl-4 text-right font-medium">Current</th>
                  <th className="pb-2 pl-4 text-right font-medium">Suggested</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="border-t border-border align-top">
                    <td className="py-2 pr-2">
                      <Checkbox
                        checked={checks[row.key]}
                        onChange={(v) => setCheck(row.key, v)}
                        label={<span className="font-medium text-value">{row.label}</span>}
                      />
                      {row.note && <p className="mt-1 ml-6 text-xs text-muted">{row.note}</p>}
                    </td>
                    <td className="py-2 text-right text-muted tabular-nums">{row.current}</td>
                    <td
                      className={`py-2 text-right font-semibold tabular-nums ${checks[row.key] ? 'text-stat-value' : 'text-muted line-through'}`}
                    >
                      {inputsValid ? row.proposed : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {contextChanges.length > 0 && (
              <p className="rounded-md border border-accent-border bg-accent-bg px-3 py-2 text-xs text-accent-fg">
                Apply also sets Step 2: {contextChanges.join(', ')}.
              </p>
            )}

            {inputsValid &&
              warnings.map((w) => (
                <p key={w} className="rounded-md border border-status-warn-border bg-status-warn-bg px-3 py-2 text-xs text-status-warn-fg">
                  {w}
                </p>
              ))}

            {inputsValid && (
              <details className="text-xs text-muted">
                <summary className="cursor-pointer font-medium text-value">How it's calculated</summary>
                <ul className="mt-2 flex flex-col gap-1.5 pl-1">
                  <li>
                    Cutting speed Vc = middle of {material.vc[0]}–{material.vc[1]} m/min{hssNote} = {fmt(r.vc)} m/min
                  </li>
                  <li>
                    RPM = Vc × 1000 ÷ (π × {fmt(toolDiameter)}) = {Math.round(r.idealRpm)} → suggested {r.suggestedRpm}
                    {r.rpmClampedToRange ? ' (spindle range)' : ''}
                    {checks.rpm ? '' : `; using the current ${machine.spindleSpeed}`}
                  </li>
                  <li>
                    fz ={' '}
                    {chipLoadOverride === null
                      ? `${chipLoadText(tableChipLoad(material, toolDiameter))} (table) × ${rigidityFactor(machine.rigidity)} (${RIGIDITY_LABEL[machine.rigidity]}) = ${chipLoadText(r.chipLoad)}`
                      : `${chipLoadText(r.chipLoad)} (your value)`}{' '}
                    mm/tooth
                  </li>
                  <li>
                    Chip thinning:{' '}
                    {engagement.kind === 'slot'
                      ? '× 1 — full-width slot, the chip is as thick as fz'
                      : widthInEffect >= 50
                        ? `× 1 — width ${fmt(widthInEffect)}% of ⌀ (at 50% or more the chip already reaches fz)`
                        : `width ${fmt(widthInEffect)}% of ⌀ → engagement ${fmt(Math.round(deg(engagementAngleFor(widthInEffect)) * 10) / 10)}°, × 1/sin = ${fmt(Math.round(r.chipThinning * 100) / 100)}`}
                  </li>
                  <li>
                    Feed = {r.rpm} × {settings.flutes} × {chipLoadText(r.chipLoad)} × {fmt(Math.round(r.chipThinning * 100) / 100)} ={' '}
                    {r.feedClampedToMax ? `${Math.round(r.rpm * settings.flutes * r.chipLoad * r.chipThinning)} → ${r.feed} (Max Feed)` : r.feed}{' '}
                    mm/min
                  </li>
                  <li>
                    Plunge = {r.baseFeed} (feed without chip thinning) × {material.plungeFactor} = {r.plungeRate} mm/min
                  </li>
                  <li>
                    Stepdown = {fmt(toolDiameter)} × {material.ap[engagement.kind]} (
                    {engagement.kind === 'slot' ? 'slot' : isAdaptive ? 'Adaptive' : 'stepover'})
                    {isAdaptive ? ' — no rigidity factor: the narrow cut is what allows the depth' : ` × ${rigidityFactor(machine.rigidity)}`} ={' '}
                    {fmt(r.stepdown)} mm
                  </li>
                  {r.linkingFeed !== null && <li>Linking Feed = 2 × Feed, at most Max Feed = {r.linkingFeed} mm/min</li>}
                  {stockInEffect !== null && r.finishChipThinning !== null && (
                    <li>
                      Finish Feed = {r.rpm} × {settings.flutes} × {chipLoadText(r.chipLoad)} ×{' '}
                      {fmt(Math.round(r.finishChipThinning * 100) / 100)} (chip thinning for Stock to Leave {fmt(stockInEffect)} mm ={' '}
                      {fmt(Math.round((stockInEffect / toolDiameter) * 1000) / 10)}% of ⌀){r.finishFeedClampedToMax ? ', at most Max Feed' : ''}{' '}
                      = {r.finishFeed} mm/min. Stock to Leave: {fmt(material.finishStock)} mm (table), at most the tool radius
                    </li>
                  )}
                </ul>
                <p className="mt-3">
                  Table values are conservative starting points for a carbide tool — the machine, the tool's stick-out
                  and its condition all shift them. Listen to the first cut and adjust.
                </p>
              </details>
            )}

            <details className="text-xs text-muted">
              <summary className="cursor-pointer font-medium text-value">Material table</summary>
              <p className="mt-2">
                Starting values for a carbide tool, before the rigidity factor. fz in mm/tooth for a 3 / 6 / 8+ mm tool
                (in between: linear); Stepdown ×⌀ for a slot / stepover / Adaptive; widths in % of ⌀; Pocket
                Finishing Pass Stock to Leave in mm.
              </p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-right tabular-nums">
                  <thead>
                    <tr className="text-muted">
                      <th className="py-1 pr-2 text-left font-medium">Material</th>
                      <th className="px-1 py-1 font-medium">Vc m/min</th>
                      <th className="px-1 py-1 font-medium">fz 3/6/8</th>
                      <th className="px-1 py-1 font-medium">Plunge</th>
                      <th className="px-1 py-1 font-medium">Stepdown ×⌀</th>
                      <th className="px-1 py-1 font-medium">Stepover / Load %</th>
                      <th className="py-1 pl-1 font-medium">Finish stock mm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MATERIAL_IDS.map((id) => {
                      const m = MATERIALS[id]
                      return (
                        <tr
                          key={id}
                          className={`border-t border-border ${id === settings.material ? 'font-semibold text-selected-fg' : ''}`}
                        >
                          <td className="py-1 pr-2 text-left">{m.label}</td>
                          <td className="px-1 py-1">
                            {m.vc[0]}–{m.vc[1]}
                          </td>
                          <td className="px-1 py-1">{m.fz.map((f) => fmt(f)).join(' / ')}</td>
                          <td className="px-1 py-1">×{fmt(m.plungeFactor)}</td>
                          <td className="px-1 py-1">
                            {fmt(m.ap.slot)} / {fmt(m.ap.stepover)} / {fmt(m.ap.optimalLoad)}
                          </td>
                          <td className="px-1 py-1">
                            {m.aeStepover} / {m.aeAdaptive}
                          </td>
                          <td className="py-1 pl-1">{fmt(m.finishStock)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted hover:border-field-border hover:text-fg"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!inputsValid || !anySelected}
            onClick={handleApply}
            className="rounded-md bg-btn-bg px-4 py-2 text-sm font-medium text-btn-fg shadow-[var(--glow-btn)] hover:bg-btn-bg-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-btn-bg"
          >
            Apply selected
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-value">{label}</span>
      {children}
    </label>
  )
}
