// Rounds to 4 decimals and strips trailing zeros (e.g. 3.1750 -> "3.175").
// Number(...).toString() also normalizes -0 to "0".
export function fmt(n: number): string {
  return Number(n.toFixed(4)).toString()
}
