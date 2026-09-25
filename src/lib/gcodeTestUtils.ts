// Test-only G-code checks shared by several engine test files.

// Tracks the tool's XY through the program and checks every G2/G3's start
// (current position) and end point are equidistant from its I/J center —
// what GRBL enforces (error 33) before it will execute an arc.
export function arcRadiusMismatches(lines: string[]): string[] {
  const bad: string[] = []
  let x = 0
  let y = 0
  const word = (line: string, letter: string) => {
    const m = line.match(new RegExp(`${letter}(-?[\\d.]+)`))
    return m ? Number(m[1]) : undefined
  }
  for (const line of lines) {
    if (!/^G[0-3] /.test(line)) continue
    const nx = word(line, 'X') ?? x
    const ny = word(line, 'Y') ?? y
    if (/^G[23] /.test(line)) {
      const cxArc = x + (word(line, 'I') ?? 0)
      const cyArc = y + (word(line, 'J') ?? 0)
      const rStart = Math.hypot(x - cxArc, y - cyArc)
      const rEnd = Math.hypot(nx - cxArc, ny - cyArc)
      if (Math.abs(rStart - rEnd) > 0.005) bad.push(line)
    }
    x = nx
    y = ny
  }
  return bad
}
