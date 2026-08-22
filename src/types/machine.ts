// Machine settings are global, not per-preset — one physical CNC, not one
// per WizardParams slot — so they live in their own storage key (see
// lib/machineStorage.ts) instead of types/wizard.ts's slot system.
export interface MachineSettings {
  travelX: number
  travelY: number
  travelZ: number
}

// Generous enough that, unconfigured, these limits don't bite on typical
// wizard values — there's no "unconfigured" branch elsewhere in the app,
// just this always-present default.
export const DEFAULT_MACHINE_SETTINGS: MachineSettings = {
  travelX: 5000,
  travelY: 5000,
  travelZ: 1000,
}
