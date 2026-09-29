// BL-69: hand-set trim routers used as CNC spindles ignore `S` in the
// G-code — speed is a dial. Each entry maps dial positions (1…n) to RPM so
// the Feedrate Calculator can show the position closest to the RPM it
// suggests. `approximate`: the maker publishes only the range, so the
// positions in between are spread evenly across it — check with a
// tachometer if it matters.
export type RouterId = 'makitaRt0700c' | 'dewaltDwp611' | 'kress800' | 'kress1050' | 'amb1050'

export interface RouterSpec {
  label: string
  dial: number[]
  approximate: boolean
}

const evenly = (min: number, max: number, positions: number): number[] =>
  Array.from({ length: positions }, (_, i) => Math.round((min + ((max - min) * i) / (positions - 1)) / 100) * 100)

export const ROUTERS: Record<RouterId, RouterSpec> = {
  makitaRt0700c: {
    label: 'Makita RT0700C / RT0701C',
    dial: [10000, 12000, 17000, 22000, 27000, 30000],
    approximate: false,
  },
  dewaltDwp611: {
    label: 'DeWalt DWP611 / D26200',
    dial: evenly(16000, 27000, 6),
    approximate: true,
  },
  kress800: {
    label: 'Kress 800 FME',
    dial: evenly(10000, 29000, 6),
    approximate: true,
  },
  kress1050: {
    label: 'Kress 1050 FME',
    dial: evenly(10000, 29000, 6),
    approximate: true,
  },
  amb1050: {
    label: 'AMB (Kress) 1050 FME-1',
    dial: evenly(5000, 25000, 6),
    approximate: true,
  },
}

export const ROUTER_IDS = Object.keys(ROUTERS) as RouterId[]

export function isRouterId(value: unknown): value is RouterId {
  return typeof value === 'string' && value in ROUTERS
}

// BL-79: the selected router's dial setting for `rpm` (Step 3 and its
// summary), or null without a router.
export function routerDialHint(router: RouterId | null, rpm: number): { label: string; position: number; rpm: number; approximate: boolean } | null {
  if (!router) return null
  const spec = ROUTERS[router]
  const position = nearestDialPosition(spec.dial, rpm)
  return { label: spec.label, position, rpm: spec.dial[position - 1], approximate: spec.approximate }
}

// Dial position (1-based) whose RPM is closest to `rpm`.
export function nearestDialPosition(dial: number[], rpm: number): number {
  let best = 0
  for (let i = 1; i < dial.length; i++) {
    if (Math.abs(dial[i] - rpm) < Math.abs(dial[best] - rpm)) best = i
  }
  return best + 1
}
