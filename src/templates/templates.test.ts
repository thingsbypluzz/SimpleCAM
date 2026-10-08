import { describe, expect, it } from 'vitest'
import { PROJECT_TEMPLATES, templateSlots } from './index'
import { parseProjectFile } from '../lib/projectFile'
import { isWizardParamsValid } from '../lib/validation'
import { OPERATION_META } from '../config/operationMeta'
import { DEFAULT_MACHINE_SETTINGS } from '../types/machine'

// Templates are project files kept in the repo: a change to the preset
// format, validation or an engine must not leave one that no longer loads.
describe('project templates', () => {
  it('have unique ids', () => {
    const ids = PROJECT_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(PROJECT_TEMPLATES.map((t) => [t.title, t] as const))('%s is a loadable project named like its entry', (_title, template) => {
    const parsed = parseProjectFile(template.file)
    if (!parsed.ok) throw new Error(`template refused: ${parsed.reason}`)
    expect(parsed.name).toBe(template.title)
    expect(template.description.length).toBeGreaterThan(20)
    expect(Object.keys(parsed.slots).length).toBeGreaterThan(0)
  })

  it.each(PROJECT_TEMPLATES.map((t) => [t.title, t] as const))('%s: every preset is valid and generates G-code', (_title, template) => {
    const slots = templateSlots(template)!
    for (const [id, preset] of Object.entries(slots)) {
      expect(isWizardParamsValid(preset!), `slot ${id}`).toBe(true)
      expect(OPERATION_META[preset!.operation].generate(preset!, DEFAULT_MACHINE_SETTINGS).length, `slot ${id}`).toBeGreaterThan(5)
    }
  })

  it.each(PROJECT_TEMPLATES.map((t) => [t.title, t] as const))('%s is stored in the slim file shape', (_title, template) => {
    const file = JSON.parse(template.file) as { slots: Record<string, Record<string, unknown> | null> }
    const sections = ['geometry', 'outline', 'surface', 'pocket', 'facing', 'text']
    for (const preset of Object.values(file.slots)) {
      if (preset) expect(sections.filter((s) => s in preset)).toHaveLength(1)
    }
  })
})
