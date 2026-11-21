interface Section {
  z: number
  cx: number
  rx: number
  ry: number
}

function loft(sections: Section[], out: number[]) {
  const n = 48
  const point = (s: Section, i: number) => {
    const a = (2 * Math.PI * i) / n
    return [s.cx + s.rx * Math.cos(a), s.ry * Math.sin(a), s.z]
  }
  for (let k = 0; k + 1 < sections.length; k++) {
    for (let i = 0; i < n; i++) {
      const a = point(sections[k], i)
      const b = point(sections[k], i + 1)
      const c = point(sections[k + 1], i + 1)
      const d = point(sections[k + 1], i)
      out.push(...a, ...b, ...c, ...a, ...c, ...d)
    }
  }
  const bottom = sections[0]
  const top = sections[sections.length - 1]
  for (let i = 0; i < n; i++) {
    out.push(bottom.cx, 0, bottom.z, ...point(bottom, i + 1), ...point(bottom, i))
    out.push(top.cx, 0, top.z, ...point(top, i), ...point(top, i + 1))
  }
}

function interpolated(keys: number[][], steps: number, section: (k: number[]) => Section): Section[] {
  const sections: Section[] = []
  const lerp = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t)
  for (let i = 0; i + 1 < keys.length; i++) {
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      sections.push(section(lerp(keys[i], keys[i + 1], (1 - Math.cos(t * Math.PI)) / 2)))
    }
  }
  sections.push(section(keys[keys.length - 1]))
  return sections
}

// A synthetic torso for the tests, in the same units as a loaded file: one
// body and two arms that leave it at the shoulder and come back at the hip, so
// islands show up between the two.
export function demoTorso(): Float32Array {
  const out: number[] = []
  // height, half width, half depth
  const body = [
    [0, 0.26, 0.16],
    [0.2, 0.3, 0.18],
    [0.45, 0.21, 0.13],
    [0.72, 0.3, 0.17],
    [0.85, 0.32, 0.14],
    [0.92, 0.11, 0.1],
    [1, 0.09, 0.09],
  ]
  loft(
    interpolated(body, 6, ([z, rx, ry]) => ({ z, cx: 0, rx, ry })),
    out,
  )
  // height, center x
  const arm = [
    [0.3, 0.27],
    [0.55, 0.42],
    [0.84, 0.3],
  ]
  for (const side of [-1, 1]) {
    loft(
      interpolated(arm, 6, ([z, cx]) => ({ z, cx: side * cx, rx: 0.045, ry: 0.045 })),
      out,
    )
  }
  return Float32Array.from(out)
}
