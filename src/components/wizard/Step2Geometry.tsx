import type { WizardParams } from '../../types/wizard'
import type { MachineSettings } from '../../types/machine'
import type { ToolDiameterOption } from '../../types/toolDiameters'
import { Step2GeometryHoles } from './Step2GeometryHoles'
import { Step2GeometryOutline } from './Step2GeometryOutline'
import { Step2GeometrySurface } from './Step2GeometrySurface'
import { Step2GeometryPocket } from './Step2GeometryPocket'
import { Step2GeometryFacing } from './Step2GeometryFacing'
import { Step2GeometryText } from './Step2GeometryText'

interface Step2GeometryProps {
  params: WizardParams
  onChange: (patch: Partial<WizardParams>) => void
  machine: MachineSettings
  toolDiameters: ToolDiameterOption[]
  // BL-68: the flute count shared with the Feedrate Calculator, edited
  // next to Tool Diameter (ToolChipLoad).
  flutes: number
  onFlutesChange: (flutes: number) => void
}

// Thin router on params.operation — each operation's Step 2 fields are
// different enough (Hole(s): pattern-specific point-placement fields;
// Outline: shape/offset-mode/method fields; Surface: raster/stepover/
// Z-transition fields; Pocket: method-specific clearing fields; Facing: one
// side and its sideways passes) that a
// single branchy component would be harder to follow than five focused
// ones. See Step2GeometryHoles.tsx / Step2GeometryOutline.tsx /
// Step2GeometrySurface.tsx / Step2GeometryPocket.tsx /
// Step2GeometryFacing.tsx.
export function Step2Geometry(props: Step2GeometryProps) {
  if (props.params.operation === 'outline') return <Step2GeometryOutline {...props} />
  if (props.params.operation === 'surface') return <Step2GeometrySurface {...props} />
  if (props.params.operation === 'pocket') return <Step2GeometryPocket {...props} />
  if (props.params.operation === 'facing') return <Step2GeometryFacing {...props} />
  if (props.params.operation === 'text') {
    return <Step2GeometryText params={props.params} onChange={props.onChange} machine={props.machine} toolDiameters={props.toolDiameters} />
  }
  return <Step2GeometryHoles {...props} />
}
