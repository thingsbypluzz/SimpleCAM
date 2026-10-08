import { parseProjectFile, type PresetSlots } from '../lib/projectFile'
import nema23Mount from './nema23-mount.json?raw'

// Templates (BL-113): ready-made projects built into the app, offered in
// Settings → Templates. Each one is an ordinary project file (the same JSON
// Save project writes, lib/projectFile.ts) sitting next to this module — to
// add one, save a project, drop its file here and list it below.
//
// They are examples to look at and rework — a way into what the app can do
// — not programs to run as they are: feeds, depths and spindle options are
// whatever their author's machine and material needed.
export interface ProjectTemplate {
  id: string
  // Shown in the list, and the project's name once loaded.
  title: string
  description: string
  // The project file's text, read through the same parser as a loaded file.
  file: string
}

export const PROJECT_TEMPLATES: readonly ProjectTemplate[] = [
  {
    id: 'nema23-mount',
    title: 'NEMA23 Mount',
    description:
      'A 10 mm mounting plate for a NEMA23 stepper motor, built from five presets: the plate\'s outline with tabs, four motor screw holes on the 47.1 mm pattern, the centre bore for the motor\'s boss, and two fixing holes with counterbores for the screw heads.',
    file: nema23Mount,
  },
]

// The template's presets, or null for a file the parser refuses (a test
// keeps that from ever shipping).
export function templateSlots(template: ProjectTemplate): PresetSlots | null {
  const parsed = parseProjectFile(template.file)
  return parsed.ok ? parsed.slots : null
}
