import type { RouterId } from '../config/routers'

// Engine-visible differences between controllers: G4 P's units (seconds
// on GRBL/Mach3, milliseconds on Marlin), the modal preamble line, and the
// end-of-program code (M30 vs M2) — see lib/program.ts.
export type Dialect = 'grbl' | 'marlin' | 'mach3'

// How much load the machine frame takes before it chatters — scales the
// Feedrate Calculator's chip load and stepdown (lib/feedCalc.ts). Light =
// a router on aluminium extrusions, the app's typical user.
export type Rigidity = 'light' | 'medium' | 'rigid'

// Machine settings are global, not per-preset — one physical CNC, not one
// per WizardParams slot — so they live in their own storage key (see
// lib/machineStorage.ts) instead of types/wizard.ts's slot system.
export interface MachineSettings {
  travelX: number
  travelY: number
  travelZ: number
  dialect: Dialect
  // Free text, emitted verbatim (no validation), wrapped in comment
  // markers around the app-generated program — see lib/program.ts. Empty
  // by default: no markers, no behavior change for anyone who never opens
  // Settings.
  headerText: string
  footerText: string
  // BL-14: applied to geometry.tabHeight/tabWidth/tabCount whenever
  // "Enable Tabs" is checked on Step 2 (see Step2Geometry.tsx) — a
  // template for a new job, not a live binding, so editing these later
  // doesn't retroactively touch a job that already has tabs on.
  defaultTabHeight: number
  defaultTabWidth: number
  defaultTabCount: number
  // BL-53: emitted with the spindle start (`M3 S<spindleSpeed>`, then
  // `G4 P<dwell>`) when Step 4's "Start spindle" is checked — a property
  // of the machine (fixed-speed routers ignore S; dwell is spin-up time),
  // so global rather than per preset. dwellSeconds 0 = no G4 at all.
  spindleSpeed: number
  dwellSeconds: number
  // BL-68: limits the Feedrate Calculator works within — a suggested RPM is
  // clamped to the spindle's range, and a feed above maxFeed first lowers
  // the RPM (to keep the chip load), then is clamped. Never read by the
  // G-code engine. Defaults are wide enough to mean "no limit".
  spindleMinRpm: number
  spindleMaxRpm: number
  maxFeed: number
  rigidity: Rigidity
  // BL-69: a hand-set router (config/routers.ts) whose speed dial the
  // Feedrate Calculator translates its RPM to; null = a spindle driven by S.
  router: RouterId | null
}

// Generous enough that, unconfigured, these limits don't bite on typical
// wizard values — there's no "unconfigured" branch elsewhere in the app,
// just this always-present default.
export const DEFAULT_MACHINE_SETTINGS: MachineSettings = {
  travelX: 5000,
  travelY: 5000,
  travelZ: 1000,
  dialect: 'grbl',
  headerText: '',
  footerText: '',
  defaultTabHeight: 1,
  defaultTabWidth: 3,
  defaultTabCount: 3,
  spindleSpeed: 12000,
  dwellSeconds: 3,
  spindleMinRpm: 0,
  spindleMaxRpm: 60000,
  maxFeed: 50000,
  rigidity: 'light',
  router: null,
}
