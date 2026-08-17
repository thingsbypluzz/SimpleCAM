import { useState } from 'react'
import type { PositioningMode, WizardParams } from '../../types/wizard'
import { isToolDiameterValid } from '../../lib/validation'
import { FieldRow, inputClass } from './FieldRow'

interface Step2GeometryProps {
  params: WizardParams
  onChange: (patch: Partial<WizardParams>) => void
}

const POSITIONING_OPTIONS: { value: PositioningMode; label: string }[] = [
  { value: 'single', label: 'Single (0,0)' },
  { value: 'grid', label: 'Rectangular Grid' },
  { value: 'custom', label: 'Custom List' },
]

const TOOL_DIAMETER_OPTIONS = [
  { value: 1, label: '1 mm' },
  { value: 2, label: '2 mm' },
  { value: 3, label: '3 mm' },
  { value: 3.175, label: '1/8" (3.175 mm)' },
  { value: 4, label: '4 mm' },
  { value: 5, label: '5 mm' },
  { value: 6, label: '6 mm' },
  { value: 6.35, label: '1/4" (6.35 mm)' },
  { value: 7, label: '7 mm' },
  { value: 8, label: '8 mm' },
]

function parseCustomPoints(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [x, y] = line.split(',').map((v) => Number(v.trim()))
      return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 }
    })
}

function formatCustomPoints(points: { x: number; y: number }[]) {
  return points.map((p) => `${p.x},${p.y}`).join('\n')
}

export function Step2Geometry({ params, onChange }: Step2GeometryProps) {
  const { geometry } = params

  const updateGeometry = (patch: Partial<WizardParams['geometry']>) =>
    onChange({ geometry: { ...geometry, ...patch } })

  // The textarea keeps its own raw-text state instead of being derived via
  // formatCustomPoints(parseCustomPoints(text)) on every keystroke — that
  // round-trip strips blank/trailing lines (parseCustomPoints filters empty
  // lines), which snapped back and swallowed the Enter key. Lazy-init reads
  // the current geometry once; the component remounts whenever Step 2
  // becomes active again, so it stays in sync across visits.
  const [customPointsText, setCustomPointsText] = useState(() =>
    formatCustomPoints(geometry.customPoints),
  )

  const handleCustomPointsChange = (text: string) => {
    setCustomPointsText(text)
    updateGeometry({ customPoints: parseCustomPoints(text) })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <FieldRow label="Tool Diameter [mm]">
          <select
            className={inputClass}
            value={geometry.toolDiameter}
            onChange={(e) => updateGeometry({ toolDiameter: Number(e.target.value) })}
          >
            {TOOL_DIAMETER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </FieldRow>
        <FieldRow label="Hole Diameter [mm]">
          <input
            type="number"
            step="0.01"
            className={inputClass}
            value={geometry.holeDiameter}
            onChange={(e) => updateGeometry({ holeDiameter: Number(e.target.value) })}
          />
        </FieldRow>
        {!isToolDiameterValid(geometry) && (
          <p className="text-sm text-red-600 dark:text-red-400">
            Tool diameter can't be larger than the hole diameter.
          </p>
        )}
        <FieldRow label="Total Depth [mm]">
          <input
            type="number"
            step="0.01"
            className={inputClass}
            value={geometry.totalDepth}
            onChange={(e) => updateGeometry({ totalDepth: Number(e.target.value) })}
          />
        </FieldRow>
      </div>

      <div>
        <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Positioning
        </span>
        <div className="flex flex-col gap-2">
          {POSITIONING_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => updateGeometry({ positioning: opt.value })}
              className={[
                'rounded-md border px-3 py-1.5 text-left text-sm font-medium transition',
                geometry.positioning === opt.value
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400',
              ].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {geometry.positioning === 'single' && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Single hole at (0, 0) — zero the machine at the hole location.
        </p>
      )}

      {geometry.positioning === 'grid' && (
        <div className="flex flex-col gap-4">
          <FieldRow label="X [mm]">
            <input
              type="number"
              step="0.1"
              className={inputClass}
              value={geometry.gridX}
              onChange={(e) => updateGeometry({ gridX: Number(e.target.value) })}
            />
          </FieldRow>
          <FieldRow label="Y [mm]">
            <input
              type="number"
              step="0.1"
              className={inputClass}
              value={geometry.gridY}
              onChange={(e) => updateGeometry({ gridY: Number(e.target.value) })}
            />
          </FieldRow>
        </div>
      )}

      {geometry.positioning === 'custom' && (
        <FieldRow label="Points (X,Y per line)" hint="e.g. 10,10">
          <textarea
            className={`${inputClass} h-28 font-mono`}
            value={customPointsText}
            onChange={(e) => handleCustomPointsChange(e.target.value)}
          />
        </FieldRow>
      )}

      <div>
        <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Offset
        </span>
        <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">
          Shifts the whole pattern — applies on top of any positioning mode above.
        </p>
        <div className="flex flex-col gap-4">
          <FieldRow label="Offset X [mm]">
            <input
              type="number"
              step="0.1"
              className={inputClass}
              value={geometry.offsetX}
              onChange={(e) => updateGeometry({ offsetX: Number(e.target.value) })}
            />
          </FieldRow>
          <FieldRow label="Offset Y [mm]">
            <input
              type="number"
              step="0.1"
              className={inputClass}
              value={geometry.offsetY}
              onChange={(e) => updateGeometry({ offsetY: Number(e.target.value) })}
            />
          </FieldRow>
        </div>
      </div>
    </div>
  )
}
