import type { WizardParams } from '../../types/wizard'
import type { MachineSettings } from '../../types/machine'
import { Step2GeometryHoles } from './Step2GeometryHoles'
import { Step2GeometryOutline } from './Step2GeometryOutline'
import { Step2GeometrySurface } from './Step2GeometrySurface'

interface Step2GeometryProps {
  params: WizardParams
  onChange: (patch: Partial<WizardParams>) => void
  machine: MachineSettings
}

// Thin router on params.operation — each operation's Step 2 fields are
// different enough (Hole(s): pattern-specific point-placement fields;
// Outline: shape/offset-mode/method fields; Surface: raster/stepover/
// Z-transition fields) that a single branchy component would be harder to
// follow than three focused ones. See Step2GeometryHoles.tsx /
// Step2GeometryOutline.tsx / Step2GeometrySurface.tsx.
export function Step2Geometry(props: Step2GeometryProps) {
  if (props.params.operation === 'outline') return <Step2GeometryOutline {...props} />
  if (props.params.operation === 'surface') return <Step2GeometrySurface {...props} />
  return <Step2GeometryHoles {...props} />
}
