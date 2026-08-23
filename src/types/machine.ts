// The only engine-visible difference between controllers today: G4 P's
// units (seconds on GRBL/Mach3, milliseconds on Marlin) and the
// end-of-program code (M30 vs M2) — see lib/program.ts.
export type Dialect = 'grbl' | 'marlin' | 'mach3'

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
}
