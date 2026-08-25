// Shared between Step2GeometryHoles.tsx and Step2GeometryOutline.tsx — both
// operations pick from the same physical tool inventory. See CLAUDE.md's
// BL-19 for the (not-yet-built) idea of making this list user-editable.
export const TOOL_DIAMETER_OPTIONS = [
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
