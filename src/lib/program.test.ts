import { describe, expect, it } from 'vitest'
import { assembleProgram, buildHeader, endOfProgramCode } from './program'
import { DEFAULT_MACHINE_SETTINGS } from '../types/machine'
import { DEFAULT_WIZARD_PARAMS, type WizardParams } from '../types/wizard'

function buildParams(overrides: {
  geometry?: Partial<WizardParams['geometry']>
  feeds?: Partial<WizardParams['feeds']>
  output?: Partial<WizardParams['output']>
} = {}): WizardParams {
  return {
    ...DEFAULT_WIZARD_PARAMS,
    geometry: { ...DEFAULT_WIZARD_PARAMS.geometry, ...overrides.geometry },
    feeds: { ...DEFAULT_WIZARD_PARAMS.feeds, ...overrides.feeds },
    output: { ...DEFAULT_WIZARD_PARAMS.output, ...overrides.output },
  }
}

// Trivial stand-in for helixToolpath/standardHoleToolpath — assembleProgram
// itself doesn't care what a toolpath contains, only where it sits relative
// to the header/footer/user-code wrapping.
const noopToolpath = () => ['; toolpath']

describe('endOfProgramCode', () => {
  it('is M30 for grbl and mach3, M2 for marlin', () => {
    expect(endOfProgramCode('grbl')).toBe('M30')
    expect(endOfProgramCode('mach3')).toBe('M30')
    expect(endOfProgramCode('marlin')).toBe('M2')
  })
})

describe('buildHeader', () => {
  it('emits G4 P in seconds for grbl/mach3', () => {
    const params = buildParams({ output: { spindleStart: true, dwellSeconds: 3 } })
    expect(buildHeader(params, 'grbl')).toContain('G4 P3')
    expect(buildHeader(params, 'mach3')).toContain('G4 P3')
  })

  it('converts G4 P to milliseconds for marlin', () => {
    const params = buildParams({ output: { spindleStart: true, dwellSeconds: 3 } })
    expect(buildHeader(params, 'marlin')).toContain('G4 P3000')
  })

  it('omits G4 P entirely when dwellSeconds is 0, regardless of dialect', () => {
    const params = buildParams({ output: { spindleStart: true, dwellSeconds: 0 } })
    expect(buildHeader(params, 'marlin').some((l) => l.startsWith('G4'))).toBe(false)
  })
})

describe('assembleProgram — user header/footer wrapping', () => {
  it('has no markers and ends with M30 when header/footer are empty (default)', () => {
    const lines = assembleProgram(buildParams(), DEFAULT_MACHINE_SETTINGS, noopToolpath)
    expect(lines.some((l) => l.includes('User header'))).toBe(false)
    expect(lines.some((l) => l.includes('Application code'))).toBe(false)
    expect(lines.some((l) => l.includes('User footer'))).toBe(false)
    expect(lines[0]).toBe('G21 G90 G17')
    expect(lines[lines.length - 1]).toBe('M30')
  })

  it('treats whitespace-only header/footer as empty', () => {
    const machine = { ...DEFAULT_MACHINE_SETTINGS, headerText: '  \n ', footerText: '\n' }
    const lines = assembleProgram(buildParams(), machine, noopToolpath)
    expect(lines.some((l) => l.includes('---'))).toBe(false)
  })

  it('wraps a non-empty header with markers, before the app preamble', () => {
    const machine = { ...DEFAULT_MACHINE_SETTINGS, headerText: '$H\nG28' }
    const lines = assembleProgram(buildParams(), machine, noopToolpath)
    expect(lines.slice(0, 5)).toEqual([
      '; --- User header ---',
      '$H',
      'G28',
      '; --- Application code ---',
      'G21 G90 G17',
    ])
  })

  it('wraps a non-empty footer with a marker, after the app footer, before M30/M2', () => {
    const machine = { ...DEFAULT_MACHINE_SETTINGS, footerText: 'M9\n; done' }
    const lines = assembleProgram(buildParams(), machine, noopToolpath)
    expect(lines.slice(-4)).toEqual(['; --- User footer ---', 'M9', '; done', 'M30'])
  })

  it('omits the "Application code" marker when only the footer is used', () => {
    const machine = { ...DEFAULT_MACHINE_SETTINGS, footerText: 'M9' }
    const lines = assembleProgram(buildParams(), machine, noopToolpath)
    expect(lines.some((l) => l.includes('Application code'))).toBe(false)
    expect(lines[0]).toBe('G21 G90 G17')
  })

  it('always ends with the dialect end-of-program code, after any user footer', () => {
    const machine = { ...DEFAULT_MACHINE_SETTINGS, dialect: 'marlin' as const, footerText: 'M9' }
    const lines = assembleProgram(buildParams(), machine, noopToolpath)
    expect(lines[lines.length - 1]).toBe('M2')
    expect(lines[lines.length - 2]).toBe('M9')
  })
})
