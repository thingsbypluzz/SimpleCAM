import type { WizardParams } from '../../types/wizard'
import type { MachineSettings } from '../../types/machine'
import { Step2GeometryHoles } from './Step2GeometryHoles'
import { Step2GeometryOutline } from './Step2GeometryOutline'

interface Step2GeometryProps {
  params: WizardParams
  onChange: (patch: Partial<WizardParams>) => void
  machine: MachineSettings
}

// Thin router on params.operation — each operation's Step 2 fields are
// different enough (Hole(s): pattern-specific point-placement fields;
// Outline: shape/offset-mode/method fields) that a single branchy
// component would be harder to follow than two focused ones. See
// Step2GeometryHoles.tsx / Step2GeometryOutline.tsx.
export function Step2Geometry(props: Step2GeometryProps) {
  return props.params.operation === 'outline' ? (
    <Step2GeometryOutline {...props} />
  ) : (
    <Step2GeometryHoles {...props} />
  )
}
