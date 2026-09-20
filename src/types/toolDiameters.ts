// User-editable tool inventory (BL-19) — deliberately separate from
// MachineSettings (types/machine.ts), same reasoning as AppearanceSettings:
// this is a list the user curates, not a property of the physical CNC, so
// it gets its own storage key (see lib/toolDiameterStorage.ts) instead of
// piggybacking on simplecam.machine.
export interface ToolDiameterOption {
  value: number
  label: string
}

// The list every user starts with, and what "Reset to Default" (Settings ->
// Tool Diameters) restores — whole mm 1-8 plus the two common imperial
// shank sizes expressed in their mm equivalent. Labels are hand-written only
// here; anything the user adds gets an auto-generated label instead (see
// lib/toolDiameterOptions.ts's formatToolDiameterLabel).
export const DEFAULT_TOOL_DIAMETER_OPTIONS: ToolDiameterOption[] = [
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
