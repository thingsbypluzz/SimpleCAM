import { DEFAULT_MACHINE_SETTINGS, type Dialect, type MachineSettings, type Rigidity } from '../types/machine'
import { isValidTabCount } from './validation'
import { isRouterId } from '../config/routers'

// Separate localStorage key from simplecam.storage (the WizardParams preset
// slots) — machine settings are a single global object describing the
// user's physical CNC, not one of several interchangeable presets, and
// keeping the key separate leaves room to gate this independently later
// without touching the preset system at all.
const MACHINE_STORAGE_KEY = 'simplecam.machine'

const VALID_DIALECTS: Dialect[] = ['grbl', 'marlin', 'mach3']

function isDialect(value: unknown): value is Dialect {
  return typeof value === 'string' && (VALID_DIALECTS as string[]).includes(value)
}

const VALID_RIGIDITIES: Rigidity[] = ['light', 'medium', 'rigid']

function isRigidity(value: unknown): value is Rigidity {
  return typeof value === 'string' && (VALID_RIGIDITIES as string[]).includes(value)
}

function isPositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

export function loadMachineSettings(): MachineSettings {
  try {
    const raw = localStorage.getItem(MACHINE_STORAGE_KEY)
    if (!raw) return DEFAULT_MACHINE_SETTINGS
    const parsed = JSON.parse(raw) as Partial<Record<keyof MachineSettings, unknown>> | null
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_MACHINE_SETTINGS
    const d = DEFAULT_MACHINE_SETTINGS
    // Per field (BL-57): a value of the wrong type or out of range falls
    // back to its default instead of reaching the engine — e.g. a
    // non-string headerText made assembleProgram()'s .trim() throw. A
    // dialect from an older/corrupted save falls back the same way rather
    // than reaching an unhandled branch in lib/program.ts. Numeric rules
    // match SettingsModal's commitField (all > 0, dwell may be 0).
    const positive = (
      key: 'travelX' | 'travelY' | 'travelZ' | 'defaultTabHeight' | 'defaultTabWidth' | 'spindleSpeed' | 'spindleMaxRpm' | 'maxFeed',
    ) => (isPositive(parsed[key]) ? parsed[key] : d[key])
    const nonNegative = (key: 'dwellSeconds' | 'spindleMinRpm') => {
      const value = parsed[key]
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : d[key]
    }
    const spindleMaxRpm = positive('spindleMaxRpm')
    const spindleMinRpm = nonNegative('spindleMinRpm')
    const text = (key: 'headerText' | 'footerText') =>
      typeof parsed[key] === 'string' ? parsed[key] : d[key]
    return {
      travelX: positive('travelX'),
      travelY: positive('travelY'),
      travelZ: positive('travelZ'),
      dialect: isDialect(parsed.dialect) ? parsed.dialect : d.dialect,
      headerText: text('headerText'),
      footerText: text('footerText'),
      defaultTabHeight: positive('defaultTabHeight'),
      defaultTabWidth: positive('defaultTabWidth'),
      defaultTabCount:
        typeof parsed.defaultTabCount === 'number' && isValidTabCount(parsed.defaultTabCount)
          ? parsed.defaultTabCount
          : d.defaultTabCount,
      spindleSpeed: positive('spindleSpeed'),
      dwellSeconds: nonNegative('dwellSeconds'),
      // An inverted range can't be clamped to — fall back to no lower limit.
      spindleMinRpm: spindleMinRpm < spindleMaxRpm ? spindleMinRpm : 0,
      spindleMaxRpm,
      maxFeed: positive('maxFeed'),
      rigidity: isRigidity(parsed.rigidity) ? parsed.rigidity : d.rigidity,
      router: isRouterId(parsed.router) ? parsed.router : d.router,
    }
  } catch (err) {
    console.warn('OnlyPaths: could not read machine settings from localStorage', err)
    return DEFAULT_MACHINE_SETTINGS
  }
}

export function saveMachineSettings(settings: MachineSettings): void {
  try {
    localStorage.setItem(MACHINE_STORAGE_KEY, JSON.stringify(settings))
  } catch (err) {
    console.warn('OnlyPaths: could not save machine settings to localStorage', err)
  }
}
