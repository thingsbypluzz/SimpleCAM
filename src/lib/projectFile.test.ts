import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_WIZARD_PARAMS, type WizardParams } from '../types/wizard'
import {
  buildProjectFile,
  parseProjectFile,
  PROJECT_FORMAT,
  projectFilename,
  projectNameFromFilename,
  sanitizeProjectName,
  slotsFingerprint,
  type PresetSlots,
} from './projectFile'
import { loadPresetSlots, loadSlot, replacePresetSlots, saveSlot, AUTO_SAVE_SLOT } from './storage'
import { loadProjectInfo, NO_PROJECT, PROJECT_STORAGE_KEY, saveProjectInfo } from './projectStorage'

const hole: WizardParams = { ...DEFAULT_WIZARD_PARAMS, geometry: { ...DEFAULT_WIZARD_PARAMS.geometry, holeDiameter: 10, holeBottom: 'closed' } }
const donut: WizardParams = {
  ...DEFAULT_WIZARD_PARAMS,
  operation: 'pocket',
  pocket: { ...DEFAULT_WIZARD_PARAMS.pocket, shape: 'donut', diameter: 60, islandDiameter: 25 },
}
const slots: PresetSlots = { '1': hole, '4': donut }
const when = new Date('2026-10-07T12:00:00Z')

describe('project file', () => {
  it('round-trips the seven slots and the name', () => {
    const parsed = parseProjectFile(buildProjectFile('  Wheel   cap ', slots, '0.50.0', when))
    expect(parsed).toEqual({ ok: true, name: 'Wheel cap', slots })
  })

  it('writes every slot, empty ones as null, with a header', () => {
    const file = JSON.parse(buildProjectFile('Wheel cap', slots, '0.50.0', when))
    expect(file).toMatchObject({ app: 'OnlyPaths', kind: 'project', format: PROJECT_FORMAT, name: 'Wheel cap', appVersion: '0.50.0', savedAt: '2026-10-07T12:00:00.000Z' })
    expect(Object.keys(file.slots)).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(file.slots['2']).toBeNull()
    expect(file.slots['4'].pocket.shape).toBe('donut')
  })

  it('refuses a file that is not a project', () => {
    expect(parseProjectFile('G21\nG90')).toEqual({ ok: false, reason: 'notJson' })
    expect(parseProjectFile('[1, 2]')).toEqual({ ok: false, reason: 'notProject' })
    expect(parseProjectFile('{"slots": {}}')).toEqual({ ok: false, reason: 'notProject' })
    expect(parseProjectFile(JSON.stringify({ app: 'OnlyPaths', kind: 'project', slots: {} }))).toEqual({ ok: false, reason: 'notProject' })
    expect(parseProjectFile(JSON.stringify({ app: 'Other', kind: 'project', format: 1, slots: {} }))).toEqual({ ok: false, reason: 'notProject' })
  })

  it('refuses a project from a newer format', () => {
    const file = JSON.stringify({ app: 'OnlyPaths', kind: 'project', format: PROJECT_FORMAT + 1, name: 'x', slots: {} })
    expect(parseProjectFile(file)).toEqual({ ok: false, reason: 'newerFormat' })
  })

  it('repairs presets field by field, like presets stored in the browser', () => {
    const file = JSON.stringify({
      app: 'OnlyPaths',
      kind: 'project',
      format: 1,
      slots: {
        '2': { operation: 'pocket', pocket: { shape: 'bogus', diameter: 33, method: 'adaptive', hacked: true } },
        '3': 'nonsense',
        '9': { operation: 'holes' },
      },
    })
    const parsed = parseProjectFile(file)
    if (!parsed.ok) throw new Error('expected a project')
    expect(parsed.name).toBe('')
    expect(Object.keys(parsed.slots)).toEqual(['2'])
    const pocket = parsed.slots['2']!.pocket
    expect(pocket.shape).toBe(DEFAULT_WIZARD_PARAMS.pocket.shape)
    expect(pocket.diameter).toBe(33)
    expect(pocket.method).toBe('adaptive')
    expect('hacked' in pocket).toBe(false)
    expect(parsed.slots['2']!.feeds).toEqual(DEFAULT_WIZARD_PARAMS.feeds)
  })

  it('names the file after the project and the day', () => {
    expect(projectFilename('Wheel cap', when)).toBe('onlypaths-wheel-cap-2026-10-07.json')
    expect(projectFilename('Kapsel ⌀60 / próba #2', when)).toBe('onlypaths-kapsel-60-proba-2-2026-10-07.json')
    expect(projectFilename('   ', when)).toBe('onlypaths-project-2026-10-07.json')
  })

  it('reads a name back out of a file name', () => {
    expect(projectNameFromFilename('onlypaths-wheel-cap-2026-10-07.json')).toBe('wheel cap')
    expect(projectNameFromFilename('My_part.JSON')).toBe('My part')
  })

  it('keeps names short and tidy', () => {
    expect(sanitizeProjectName('  a \n b  ')).toBe('a b')
    expect(sanitizeProjectName('x'.repeat(200))).toHaveLength(60)
  })

  it('fingerprints the content of the slots, not the objects', () => {
    const same: PresetSlots = { '4': { ...donut, pocket: { ...donut.pocket } }, '1': { ...hole } }
    expect(slotsFingerprint(same)).toBe(slotsFingerprint(slots))
    expect(slotsFingerprint({ ...slots, '1': { ...hole, geometry: { ...hole.geometry, holeDiameter: 10.1 } } })).not.toBe(slotsFingerprint(slots))
    expect(slotsFingerprint({ '2': hole, '4': donut })).not.toBe(slotsFingerprint(slots))
    expect(slotsFingerprint({})).not.toBe(slotsFingerprint(slots))
  })
})

// The project has no jsdom dependency — a minimal in-memory localStorage,
// as in storage.test.ts.
class FakeStorage implements Storage {
  private store = new Map<string, string>()
  get length() {
    return this.store.size
  }
  clear = () => this.store.clear()
  getItem = (key: string) => this.store.get(key) ?? null
  key = (index: number) => [...this.store.keys()][index] ?? null
  removeItem = (key: string) => {
    this.store.delete(key)
  }
  setItem = (key: string, value: string) => {
    this.store.set(key, value)
  }
}

describe('project in the browser', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new FakeStorage())
  })

  it('replaces every preset slot and leaves the auto-save slot alone', () => {
    saveSlot(AUTO_SAVE_SLOT, donut)
    saveSlot('2', hole)
    saveSlot('7', hole)
    replacePresetSlots(slots)
    expect(Object.keys(loadPresetSlots())).toEqual(['1', '4'])
    expect(loadPresetSlots()['4']!.pocket.islandDiameter).toBe(25)
    expect(loadSlot(AUTO_SAVE_SLOT)!.pocket.shape).toBe('donut')
  })

  it('remembers the project name and fingerprint across reloads', () => {
    expect(loadProjectInfo()).toEqual(NO_PROJECT)
    saveProjectInfo({ name: 'Wheel cap', fingerprint: 'abc' })
    expect(loadProjectInfo()).toEqual({ name: 'Wheel cap', fingerprint: 'abc' })
    saveProjectInfo(NO_PROJECT)
    expect(localStorage.getItem(PROJECT_STORAGE_KEY)).toBeNull()
  })

  it('treats a damaged entry as no project', () => {
    localStorage.setItem(PROJECT_STORAGE_KEY, '{oops')
    expect(loadProjectInfo()).toEqual(NO_PROJECT)
    localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify({ name: 42 }))
    expect(loadProjectInfo()).toEqual(NO_PROJECT)
  })
})
