import { MATERIAL_IDS, MATERIALS, type MaterialId } from '../config/materials'
import { ROUTER_IDS, ROUTERS, type RouterId } from '../config/routers'
import { rigidityFactor, suggestedRampAngle } from '../lib/feedCalc'
import { fmt } from '../lib/format'
import { MAX_RECOMMENDED_DESCENT_DEG, MAX_RECOMMENDED_TURNS_PER_STEPDOWN, MIN_RAMP_ANGLE_DEG } from '../lib/validation'
import type { Rigidity } from '../types/machine'

// The Feedrate Calculator's material table, read-only — shared by the
// calculator's own "Material table" section and Settings → Feed Tables
// (BL-101A). `selected` highlights the calculator's current material.
// `rigidity`: show the values the calculator starts from on such a machine
// — the columns it scales (fz, the slot and stepover Stepdown, Ramp Angle)
// multiplied by its factor; omitted, the raw table.
export function MaterialTable({ selected, rigidity }: { selected?: MaterialId; rigidity?: Rigidity }) {
  const factor = rigidity ? rigidityFactor(rigidity) : 1
  const scaled = (value: number, digits: number) => fmt(Math.round(value * factor * 10 ** digits) / 10 ** digits)
  const rampAngle = (id: MaterialId) =>
    rigidity
      ? suggestedRampAngle(MATERIALS[id], rigidity, 0, 0, {
          minDeg: MIN_RAMP_ANGLE_DEG,
          maxDeg: MAX_RECOMMENDED_DESCENT_DEG,
          maxTurns: MAX_RECOMMENDED_TURNS_PER_STEPDOWN,
        }).baseDeg
      : MATERIALS[id].rampAngleDeg
  // Marks the columns the rigidity factor applies to.
  const mark = rigidity ? ' ‡' : ''
  return (
    <>
      <p>
        Starting values for a carbide tool{rigidity ? '' : ', before the rigidity factor'}. fz in mm/tooth for a 3 / 6 /
        8+ mm tool (in between: linear); Stepdown ×⌀ for a slot / stepover / Adaptive; widths in % of ⌀; Pocket Finishing
        Pass Stock to Leave in mm; Ramp Angle of a helix or ramp descent in °.
        {rigidity
          ? ` ‡ Scaled by the rigidity factor (× ${factor}): fz, the slot and stepover Stepdown (not Adaptive) and the Ramp Angle (rounded to 0.5°).`
          : ''}
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-right tabular-nums">
          <thead>
            <tr className="text-muted">
              <th className="py-1 pr-2 text-left font-medium">Material</th>
              <th className="px-1 py-1 font-medium">Vc m/min</th>
              <th className="px-1 py-1 font-medium">fz 3/6/8{mark}</th>
              <th className="px-1 py-1 font-medium">Plunge</th>
              <th className="px-1 py-1 font-medium">Stepdown ×⌀{mark}</th>
              <th className="px-1 py-1 font-medium">Stepover / Load %</th>
              <th className="px-1 py-1 font-medium">Finish stock mm</th>
              <th className="py-1 pl-1 font-medium">Ramp °{mark}</th>
            </tr>
          </thead>
          <tbody>
            {MATERIAL_IDS.map((id) => {
              const m = MATERIALS[id]
              return (
                <tr key={id} className={`border-t border-border ${id === selected ? 'font-semibold text-selected-fg' : ''}`}>
                  <td className="py-1 pr-2 text-left">{m.label}</td>
                  <td className="px-1 py-1">
                    {m.vc[0]}–{m.vc[1]}
                  </td>
                  <td className="px-1 py-1">{m.fz.map((f) => scaled(f, 4)).join(' / ')}</td>
                  <td className="px-1 py-1">×{fmt(m.plungeFactor)}</td>
                  <td className="px-1 py-1">
                    {scaled(m.ap.slot, 3)} / {scaled(m.ap.stepover, 3)} / {fmt(m.ap.optimalLoad)}
                  </td>
                  <td className="px-1 py-1">
                    {m.aeStepover} / {m.aeAdaptive}
                  </td>
                  <td className="px-1 py-1">{fmt(m.finishStock)}</td>
                  <td className="py-1 pl-1">{fmt(rampAngle(id))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

// The notes the calculator shows under a selected material, all at once.
export function MaterialNotes() {
  return (
    <ul className="flex flex-col gap-1">
      {MATERIAL_IDS.filter((id) => MATERIALS[id].note).map((id) => (
        <li key={id}>
          <span className="font-medium text-value">{MATERIALS[id].label}:</span> {MATERIALS[id].note}
        </li>
      ))}
    </ul>
  )
}

// Every router's speed dial: RPM per position (config/routers.ts).
// `selected` highlights the router chosen in Settings → Machine.
export function RouterTable({ selected }: { selected?: RouterId | null }) {
  const positions = Math.max(...ROUTER_IDS.map((id) => ROUTERS[id].dial.length))
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-right tabular-nums">
        <thead>
          <tr className="text-muted">
            <th className="py-1 pr-2 text-left font-medium">Router</th>
            {Array.from({ length: positions }, (_, i) => (
              <th key={i} className="px-1 py-1 font-medium">
                {i + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROUTER_IDS.map((id) => {
            const router = ROUTERS[id]
            return (
              <tr key={id} className={`border-t border-border ${id === selected ? 'font-semibold text-selected-fg' : ''}`}>
                <td className="py-1 pr-2 text-left">
                  {router.label}
                  {router.approximate ? ' *' : ''}
                </td>
                {Array.from({ length: positions }, (_, i) => (
                  <td key={i} className="px-1 py-1">
                    {router.dial[i] ?? '—'}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
