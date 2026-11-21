import { describe, expect, it } from 'vitest'
import { DEFAULT_MACHINE_SETTINGS } from '../types/machine'
import { offset, regionArea, regionFromRings, ringSignedArea, simplifyRing } from './geometry'
import { blankOnSheet, fixtureGcode, gcodeFiles, holePitch, holesGcode, layerBlank, hubSpacerGcode, layerGcode, mountingCard, tabSpans } from './gcode'
import { addHole, analyzeLayer, canMountRotated, holeState, holeSummary, proposeHoles } from './holes'
import { computeHubSpacers, computeSpacers } from './spacers'
import { computeLayers, thinHubPieces, toolRegion, uncutRegion } from './layers'
import demoBust from './assets/demo-bust.stl?inline'
import { dropDuplicateTriangles, normalizeMesh, parseStl } from './mesh'
import { demoTorso } from './testTorso'
import { DEFAULT_PARAMS, type SculptureParams, paramErrors } from './params'
import { sliceMesh } from './slice'
import { sanitizeParams } from './useSculpture'
import { buildSculptureProject, parseSculptureProject, sculptureFilename } from './projectFile'
import { buildZip, crc32 } from './zip'

// A closed box with outward normals, 12 triangles.
function box(w: number, d: number, h: number): Float32Array {
  const c = (x: number, y: number, z: number) => [x * w, y * d, z * h]
  const quad = (a: number[], b: number[], e: number[], f: number[]) => [...a, ...b, ...e, ...a, ...e, ...f]
  return Float32Array.from([
    ...quad(c(0, 0, 0), c(0, 1, 0), c(1, 1, 0), c(1, 0, 0)),
    ...quad(c(0, 0, 1), c(1, 0, 1), c(1, 1, 1), c(0, 1, 1)),
    ...quad(c(0, 0, 0), c(1, 0, 0), c(1, 0, 1), c(0, 0, 1)),
    ...quad(c(1, 1, 0), c(0, 1, 0), c(0, 1, 1), c(1, 1, 1)),
    ...quad(c(0, 1, 0), c(0, 0, 0), c(0, 0, 1), c(0, 1, 1)),
    ...quad(c(1, 0, 0), c(1, 1, 0), c(1, 1, 1), c(1, 0, 1)),
  ])
}

const params = (over: Partial<SculptureParams> = {}): SculptureParams => ({ ...DEFAULT_PARAMS, ...over })

function zValues(gcode: string): number[] {
  return [...gcode.matchAll(/Z(-?[\d.]+)/g)].map((m) => Number(m[1]))
}

describe('slicing', () => {
  it('turns a box into one CCW ring with the right area', () => {
    const [slice] = sliceMesh(box(100, 50, 30), [15])
    expect(slice.openChains).toBe(0)
    expect(slice.rings).toHaveLength(1)
    expect(ringSignedArea(slice.rings[0])).toBeCloseTo(5000, 3)
  })

  it('survives a plane through vertices and flat faces', () => {
    const [slice] = sliceMesh(box(100, 50, 30), [30])
    expect(slice.openChains).toBe(0)
    expect(regionArea(regionFromRings(slice.rings))).toBeCloseTo(5000, 3)
  })

  it('merges overlapping shells instead of cancelling them', () => {
    const a = box(100, 100, 30)
    const b = box(100, 100, 30).map((v, i) => (i % 3 === 0 ? v + 50 : v))
    const joined = new Float32Array(a.length + b.length)
    joined.set(a)
    joined.set(b, a.length)
    const [slice] = sliceMesh(joined, [15])
    expect(regionArea(regionFromRings(slice.rings))).toBeCloseTo(15000, 1)
  })

  it('closes a contour across a hairline crack in the mesh', () => {
    // One side triangle pulled 0.02 mm off its neighbour: the edge they share
    // no longer matches, as in a mesh exported with a seam.
    const cracked = box(100, 50, 30)
    cracked[2 * 9 * 2 + 9 + 3] += 0.02
    for (const height of [5, 15, 25]) {
      const [slice] = sliceMesh(cracked, [height])
      expect(slice.openChains).toBe(0)
      expect(slice.rings).toHaveLength(1)
      expect(regionArea(regionFromRings(slice.rings))).toBeCloseTo(5000, 0)
    }
  })

  it('counts an open mesh instead of inventing a ring', () => {
    const open = box(100, 50, 30).slice(0, 9 * 10)
    const [slice] = sliceMesh(open, [15])
    expect(slice.openChains).toBeGreaterThan(0)
  })

  it('parses an ASCII STL', () => {
    const text = `solid t
facet normal 0 0 1
outer loop
vertex 0 0 0
vertex 1 0 0
vertex 0 1 0
endloop
endfacet
endsolid t`
    expect(parseStl(new TextEncoder().encode(text).buffer as ArrayBuffer)).toHaveLength(9)
  })
})

describe('mesh normalizing', () => {
  it('drops repeated triangles; opposite copies cancel out', () => {
    const a = [0, 0, 0, 1, 0, 0, 0, 1, 0]
    const flipped = [0, 0, 0, 0, 1, 0, 1, 0, 0]
    const b = [5, 5, 5, 6, 5, 5, 5, 6, 5]
    // Same corners in a shifted order: still the same face, same way round.
    const shifted = [1, 0, 0, 0, 1, 0, 0, 0, 0]
    expect(Array.from(dropDuplicateTriangles(Float32Array.from([...a, ...shifted, ...b])))).toEqual([...a, ...b])
    expect(Array.from(dropDuplicateTriangles(Float32Array.from([...a, ...flipped, ...b])))).toEqual(b)
    expect(Array.from(dropDuplicateTriangles(Float32Array.from([...a, ...flipped, ...flipped])))).toEqual(flipped)
  })

  it('keeps both legs of the demo bust where its mesh repeats triangles', () => {
    const bytes = Uint8Array.from(atob(demoBust.slice(demoBust.indexOf(',') + 1)), (c) => c.charCodeAt(0))
    const mesh = normalizeMesh(parseStl(bytes.buffer), 'z', false, 600)
    const layers = computeLayers(mesh, { ...DEFAULT_PARAMS, thickness: 7.7, gap: 0, plane: 'middle', minIslandArea: 0 })
    expect(layers[33].section).toHaveLength(2)
    expect(regionArea(layers[33].section)).toBeGreaterThan(15000)
  })

  it('centers, scales and stands the model up', () => {
    const mesh = normalizeMesh(box(10, 20, 40), 'y', false, 100)
    expect(mesh.height).toBe(100)
    expect(mesh.width).toBeCloseTo(50)
    expect(mesh.depth).toBeCloseTo(200)
    expect(Math.min(...mesh.positions.filter((_, i) => i % 3 === 2))).toBeCloseTo(0)
  })

  it('measures Height along the view up axis and turns only the preview', () => {
    // Cut across X, shown standing on the file's Z.
    const mesh = normalizeMesh(box(100, 50, 30), 'x', false, 60, 'z')
    expect(mesh.height).toBeCloseTo(200)
    expect(mesh.viewUp).toEqual([-1, 0, 0])
    expect(normalizeMesh(box(100, 50, 30), 'x', false, 60, 'z', true).viewUp).toEqual([1, 0, 0])
    const same = normalizeMesh(box(100, 50, 30), 'x', false, 60)
    expect(same.height).toBe(60)
    expect(same.viewUp).toEqual([0, 0, 1])
  })

  it('turns every plate a quarter turn, the preview with it', () => {
    const turned = normalizeMesh(box(100, 50, 30), 'z', false, 30, 'same', false, 90)
    expect(turned.width).toBeCloseTo(50)
    expect(turned.depth).toBeCloseTo(100)
    expect(normalizeMesh(box(100, 50, 30), 'x', false, 60, 'z', false, 90).viewUp).toEqual([-0, -1, 0])
  })

  it('turns the plates in 45° steps', () => {
    const square = normalizeMesh(box(100, 100, 30), 'z', false, 30, 'same', false, 45)
    expect(square.width).toBeCloseTo(100 * Math.SQRT2)
    expect(square.depth).toBeCloseTo(100 * Math.SQRT2)
    const half = normalizeMesh(box(100, 50, 30), 'z', false, 30, 'same', false, 180)
    expect(half.width).toBeCloseTo(100)
    expect(half.depth).toBeCloseTo(50)
  })

  it('turns the plates about X0 Y0, so turned holes stay on the model', () => {
    const plain = normalizeMesh(box(100, 50, 30), 'z', false, 30)
    const turned = normalizeMesh(box(100, 50, 30), 'z', false, 30, 'same', false, 45)
    const c = Math.SQRT1_2
    for (let i = 0; i < plain.positions.length; i += 3) {
      const x = plain.positions[i]
      const y = plain.positions[i + 1]
      expect(turned.positions[i]).toBeCloseTo(x * c - y * c, 3)
      expect(turned.positions[i + 1]).toBeCloseTo(x * c + y * c, 3)
    }
  })

  it('repairs an inside-out mesh', () => {
    const inverted = box(100, 50, 30)
    for (let o = 0; o < inverted.length; o += 9) {
      for (let k = 0; k < 3; k++) {
        const swap = inverted[o + 3 + k]
        inverted[o + 3 + k] = inverted[o + 6 + k]
        inverted[o + 6 + k] = swap
      }
    }
    const mesh = normalizeMesh(inverted, 'z', false, 30)
    const [slice] = sliceMesh(mesh.positions, [15])
    expect(ringSignedArea(slice.rings[0])).toBeGreaterThan(0)
  })
})

describe('layers', () => {
  const mesh = normalizeMesh(box(100, 100, 90), 'z', false, 90)

  it('gives one parameter for solid and open stacks', () => {
    expect(computeLayers(mesh, params({ thickness: 18, gap: 0 }))).toHaveLength(5)
    const open = computeLayers(mesh, params({ thickness: 18, gap: 18 }))
    expect(open.map((l) => l.zBottom)).toEqual([0, 36, 72])
  })

  it('finds separated arms on the demo torso and bridges them on request', () => {
    const torso = normalizeMesh(demoTorso(), 'z', false, 600)
    const midArm = (layers: ReturnType<typeof computeLayers>) => layers.find((l) => l.zPlane > 330 && l.zPlane < 350)
    expect(midArm(computeLayers(torso, params()))?.region.length).toBe(3)
    expect(midArm(computeLayers(torso, params({ islandMode: 'bridge' })))?.region.length).toBe(1)
  })

  it('drops pieces under the area filter', () => {
    const torso = normalizeMesh(demoTorso(), 'z', false, 600)
    const layer = computeLayers(torso, params({ minIslandArea: 3000 })).find((l) => l.zPlane > 330 && l.zPlane < 350)
    expect(layer?.region.length).toBe(1)
    expect(layer?.removedPieces).toBe(2)
  })

  it('leaves an inlet narrower than the tool uncut', () => {
    const notched = regionFromRings([
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 52, y: 100 },
        { x: 52, y: 50 },
        { x: 48, y: 50 },
        { x: 48, y: 100 },
        { x: 0, y: 100 },
      ],
    ])
    const layer = { number: 1, zBottom: 0, zPlane: 9, region: notched, section: notched, hub: [], bridges: [], bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 }, openChains: 0, removedPieces: 0 }
    expect(regionArea(uncutRegion(layer, params({ toolDiameter: 6 })))).toBeGreaterThan(150)
    expect(regionArea(uncutRegion(layer, params({ toolDiameter: 3 })))).toBeLessThan(1)
    expect(toolRegion(layer, params({ toolDiameter: 6 }))[0].holes).toHaveLength(0)
  })

  it('offsets with a tool-sized margin', () => {
    const square = regionFromRings([
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
    ])
    expect(regionArea(offset(square, -2))).toBeCloseTo(36, 3)
  })

  it('simplifies a dense circle within tolerance', () => {
    const ring = Array.from({ length: 2000 }, (_, i) => {
      const a = (i / 2000) * 2 * Math.PI
      return { x: 100 * Math.cos(a), y: 100 * Math.sin(a) }
    })
    const simple = simplifyRing(ring, 0.1)
    expect(simple.length).toBeLessThan(150)
    expect(Math.abs(ringSignedArea(simple))).toBeGreaterThan(Math.PI * 100 * 100 * 0.995)
  })
})

describe('holes', () => {
  const torso = normalizeMesh(demoTorso(), 'z', false, 600)
  const p = params()
  const layers = computeLayers(torso, p)
  const { holes, hasCommonArea } = proposeHoles(layers, p)

  it('puts a scalene rod triangle where every layer has it', () => {
    expect(hasCommonArea).toBe(true)
    const rods = holes.filter((h) => h.kind === 'rod')
    expect(rods.length).toBeGreaterThanOrEqual(1)
    for (const layer of layers) for (const rod of rods) expect(holeState(layer, rod, p)).toBe('mount')
    if (rods.length === 3) {
      const [a, b, c] = rods
      const sides = [Math.hypot(a.x - b.x, a.y - b.y), Math.hypot(b.x - c.x, b.y - c.y), Math.hypot(c.x - a.x, c.y - a.y)].sort((x, y) => x - y)
      expect(sides[1] - sides[0]).toBeGreaterThan(0.01)
      expect(sides[2] - sides[1]).toBeGreaterThan(0.01)
    }
  })

  it('places as many rods as asked, each through every layer', () => {
    for (const rodCount of [0, 1, 2, 3, 4, 5]) {
      const q = params({ rodCount, holeDiameter: 6, headDiameter: 10 })
      const stack = computeLayers(torso, q)
      const rods = proposeHoles(stack, q).holes.filter((h) => h.kind === 'rod')
      expect(rods).toHaveLength(rodCount)
      for (const layer of stack) for (const rod of rods) expect(holeState(layer, rod, q)).toBe('mount')
      if (rodCount >= 3) expect(canMountRotated(rods, q.holeDiameter)).toBe(false)
    }
  })

  it('places fewer rods when no more keep their distance', () => {
    const q = params({ rodCount: 12, holeDiameter: 20, headDiameter: 30 })
    const rods = proposeHoles(computeLayers(torso, q), q).holes.filter((h) => h.kind === 'rod')
    expect(rods.length).toBeGreaterThan(0)
    expect(rods.length).toBeLessThan(12)
  })

  it('holds every piece on its own screws with no rods', () => {
    const q = params({ rodCount: 0 })
    const stack = computeLayers(torso, q)
    const found = proposeHoles(stack, q).holes
    expect(found.every((h) => h.kind === 'island')).toBe(true)
    expect(found.length).toBeGreaterThan(0)
  })

  it('tells a pattern that fits rotated from one that does not', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
      { x: 0, y: 50 },
    ]
    expect(canMountRotated(square, 1)).toBe(true)
    expect(canMountRotated(square.slice(0, 2), 1)).toBe(true)
    expect(canMountRotated(square.slice(0, 3), 1)).toBe(false)
    expect(canMountRotated([], 1)).toBe(false)
  })

  it('adds a hand-placed hole with the next free id and sums it over the stack', () => {
    const placed = addHole(holes.filter((h) => h.id !== 1), { x: 0, y: 0 }, 'rod')
    const added = placed[placed.length - 1]
    expect(added.id).toBe(Math.max(...holes.map((h) => h.id)) + 1)
    const summary = holeSummary(layers.map((l) => analyzeLayer(l, placed, p)), added.id)
    expect(summary.mount).toBe(layers.length)
    expect(summary.conflict).toBe(0)
    const outside = addHole(placed, { x: 0, y: 108 }, 'rod')
    const edge = holeSummary(layers.map((l) => analyzeLayer(l, outside, p)), added.id + 1)
    expect(edge.conflict).toBeGreaterThan(0)
  })

  it('holds a screw only within its layer range', () => {
    const center = addHole([], { x: 0, y: 0 }, 'rod')[0]
    const ranged = { ...center, from: 3, to: 5 }
    const states = layers.map((l) => holeState(l, ranged, p))
    expect(states.filter((s) => s === 'mount')).toHaveLength(3)
    expect(states[0]).toBe('empty')
    expect(states[3]).toBe('mount')
  })

  it('bores a hole with Cut on in the layer file, only in its range', () => {
    const center = addHole([], { x: 0, y: 0 }, 'rod')[0]
    const cut = { ...center, cut: true, from: 3, to: 5 }
    expect(analyzeLayer(layers[0], [cut], p).cutIds).toEqual([])
    const third = analyzeLayer(layers[3], [cut], p)
    expect(third.cutIds).toEqual([cut.id])
    // The tool bores it during the contour, so no screw may sit in it there.
    expect(third.mountIds).not.toContain(cut.id)
    const plain = layerGcode(layers[3], third, layers.length, p, DEFAULT_MACHINE_SETTINGS)
    const bored = layerGcode(layers[3], third, layers.length, p, DEFAULT_MACHINE_SETTINGS, [cut])
    expect(bored).toContain(`; Holes cut before the contour: ${cut.id}`)
    expect(bored.split('\n').length).toBeGreaterThan(plain.split('\n').length)
    // The holes file is unchanged: the hole is drilled in every plate.
    const files = gcodeFiles(layers, layers.map((l) => analyzeLayer(l, [cut], p)), [cut], p, DEFAULT_MACHINE_SETTINGS)
    expect(files.find((f) => f.kind === 'holes')!.build().content).toContain(`Hole ${cut.id} `)
    const summary = holeSummary(layers.map((l) => analyzeLayer(l, [cut], p)), cut.id)
    expect(summary.cut).toBe(3)
    expect(summary.mount).toBe(0)
  })

  it('gives island holes the layers of their own chain', () => {
    const islands = holes.filter((h) => h.kind === 'island')
    for (const hole of islands) {
      expect(hole.from).toBeGreaterThanOrEqual(1)
      expect(hole.to).toBeGreaterThanOrEqual(hole.from!)
      const mounted = layers.filter((l) => holeState(l, hole, p) === 'mount').map((l) => l.number)
      for (const n of mounted) {
        expect(n).toBeGreaterThanOrEqual(hole.from!)
        expect(n).toBeLessThanOrEqual(hole.to!)
      }
    }
  })

  it('gives separated arms their own screws', () => {
    expect(holes.some((h) => h.kind === 'island')).toBe(true)
    const midArm = layers.find((l) => l.zPlane > 330 && l.zPlane < 350)!
    expect(analyzeLayer(midArm, holes, p).unheldPieces).toEqual([])
  })

  it('classifies a hole against a layer', () => {
    const square = regionFromRings([
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
    ])
    const layer = { number: 1, zBottom: 0, zPlane: 9, region: square, section: square, hub: [], bridges: [], bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 }, openChains: 0, removedPieces: 0 }
    expect(holeState(layer, { x: 50, y: 50 }, p)).toBe('mount')
    expect(holeState(layer, { x: 9, y: 50 }, p)).toBe('mount')
    expect(holeState(layer, { x: 9, y: 50 }, { ...p, headDiameter: 20 })).toBe('empty')
    expect(holeState(layer, { x: 5, y: 50 }, p)).toBe('conflict')
    expect(holeState(layer, { x: -2, y: 50 }, p)).toBe('conflict')
    expect(holeState(layer, { x: -20, y: 50 }, p)).toBe('waste')
  })
})

describe('spacers', () => {
  const torso = normalizeMesh(demoTorso(), 'z', false, 600)

  it('puts one spacer on each shared area, only with a gap', () => {
    const q = params({ gap: 18, spacers: true, spacerShape: 'disc', spacerSize: 40 })
    const layers = computeLayers(torso, q)
    const spacers = computeSpacers(layers, [], q)
    expect(spacers).toHaveLength(layers.length - 1)
    // Where the arms are separate, the body and both arms get one each.
    const midArm = spacers.find((s) => s.zBottom > 330 && s.zBottom < 360)
    expect(midArm?.region.length).toBe(3)
    expect(computeSpacers(computeLayers(torso, { ...q, gap: 0 }), [], { ...q, gap: 0 })).toEqual([])
    expect(computeSpacers(layers, [], { ...q, spacers: false })).toEqual([])
  })

  it('keeps a disc within the shared area and an inset inside it', () => {
    const q = params({ gap: 18, spacers: true, spacerShape: 'disc', spacerSize: 40 })
    const layers = computeLayers(torso, q)
    const [first] = computeSpacers(layers, [], q)
    expect(regionArea(first.region)).toBeCloseTo(Math.PI * 20 * 20, -1)
    const inset = computeSpacers(layers, [], { ...q, spacerShape: 'inset', spacerSize: 10 })[0]
    expect(regionArea(inset.region)).toBeLessThan(regionArea(layers[0].region))
    expect(regionArea(inset.region)).toBeGreaterThan(regionArea(first.region))
  })
})

describe('G-code', () => {
  const torso = normalizeMesh(demoTorso(), 'z', false, 200)
  const p = params({ thickness: 12, height: 200 })
  const layers = computeLayers(torso, p)
  const { holes } = proposeHoles(layers, p)
  const analysis = analyzeLayer(layers[0], holes, p)
  const gcode = layerGcode(layers[0], analysis, layers.length, p, DEFAULT_MACHINE_SETTINGS)

  it('runs from Safe Z down through the plate (Z0 on its top), and ends the program', () => {
    const z = zValues(gcode)
    expect(Math.min(...z)).toBeCloseTo(-(p.thickness + p.overshoot))
    expect(Math.max(...z)).toBeCloseTo(p.safeAbove)
    expect(gcode.trim().endsWith('M30')).toBe(true)
    expect(gcode).not.toMatch(/NaN|Infinity/)
  })

  it('names the screws and the plate in comments', () => {
    expect(gcode).toMatch(/^; Layer 1 of /)
    expect(gcode).toContain('; Screws:')
    expect(gcode).toContain('; Plate: at least')
  })

  it('leaves tabs: the tool stays at tab height on part of the last lap', () => {
    const atTab = gcode.split('\n').filter((l) => l.startsWith('G1 X') && l.includes(`Z${p.tabHeight - p.thickness} `))
    expect(atTab.length).toBeGreaterThan(p.tabCount)
    const noTabs = layerGcode(layers[0], analysis, layers.length, { ...p, tabCount: 0 }, DEFAULT_MACHINE_SETTINGS)
    expect(noTabs.split('\n').filter((l) => l.startsWith('G1 X') && l.includes(`Z${p.tabHeight - p.thickness} `)).length).toBeLessThan(atTab.length)
  })

  it('fits fewer tabs on a contour too short for them', () => {
    expect(tabSpans(1000, params({ tabCount: 4 }))).toHaveLength(4)
    expect(tabSpans(40, params({ tabCount: 4 }))).toHaveLength(1)
    expect(tabSpans(10, params({ tabCount: 4 }))).toHaveLength(0)
  })

  it('bores holes through the plate, never as deep as the insert', () => {
    const file = holesGcode(holes, 'All holes', p, DEFAULT_MACHINE_SETTINGS)
    expect(Math.min(...zValues(file))).toBeCloseTo(-(p.thickness + p.overshoot))
    expect(p.overshoot).toBeLessThan(p.insertRecess)
    expect(file).toMatch(/G3 /)
  })

  it('checks a plate against the sheet centered on X0 Y0 plus its offset', () => {
    const blank = { width: 100, height: 60, centerX: 20, centerY: 0 }
    expect(blankOnSheet(blank, params({ sheetX: 0, sheetY: 0 }))).toBe(true)
    expect(blankOnSheet(blank, params({ sheetX: 140, sheetY: 60 }))).toBe(true)
    expect(blankOnSheet(blank, params({ sheetX: 120, sheetY: 60 }))).toBe(false)
    expect(blankOnSheet(blank, params({ sheetX: 120, sheetY: 60, sheetOffsetX: 10 }))).toBe(true)
    expect(blankOnSheet(blank, params({ sheetX: 120, sheetY: 60, sheetOffsetX: 10, sheetOffsetY: 5 }))).toBe(false)
  })

  it('caps the helix pitch by the ramp angle, or plunges per Stepdown', () => {
    const one = [{ id: 1, x: 0, y: 0, kind: 'rod' as const }]
    const turns = (q: SculptureParams) => (holesGcode(one, 'All holes', q, DEFAULT_MACHINE_SETTINGS).match(/^G3 /gm) ?? []).length
    // An 8 mm hole with a 6 mm tool: a 6.28 mm turn, 0.22 mm deep at 2°.
    expect(holePitch(8, p)).toBeCloseTo(Math.PI * 2 * Math.tan(Math.PI / 90))
    expect(holePitch(6, p)).toBe(0)
    expect(holePitch(8, { ...p, rampAngle: 80 })).toBe(p.stepdown)
    expect(turns({ ...p, rampAngle: 2 })).toBeGreaterThan(turns({ ...p, rampAngle: 20 }))
    const standard = holesGcode(one, 'All holes', { ...p, holeMethod: 'standard' }, DEFAULT_MACHINE_SETTINGS)
    const levels = Math.ceil((p.thickness + p.overshoot) / p.stepdown)
    expect((standard.match(/^G3 /gm) ?? []).length).toBe(levels)
    expect(standard.split('\n').filter((l) => l.startsWith('G1 Z')).length).toBe(levels + 1)
  })

  it('bores the fixture to insert depth, with a zero mark', () => {
    const file = fixtureGcode(holes, p, DEFAULT_MACHINE_SETTINGS)
    expect(Math.min(...zValues(file))).toBeCloseTo(-p.insertDepth)
    expect(file).toContain('G1 Z-1 ')
  })

  it('lists every file of the ZIP, each with the moves it was written from', () => {
    const analyses = layers.map((l) => analyzeLayer(l, holes, p))
    const files = gcodeFiles(layers, analyses, holes, p, DEFAULT_MACHINE_SETTINGS)
    expect(files.slice(0, 3).map((f) => f.name)).toEqual(['fixture.gcode', 'holes.gcode', 'layer-001.gcode'])
    expect(files.filter((f) => f.kind === 'layer')).toHaveLength(layers.length)
    const first = files[2].build()
    expect(first.content).toBe(gcode)
    expect(first.safeZ).toBe(p.safeAbove)
    const lowest = Math.min(...first.toolpath.moves.map((m) => m.to.z))
    expect(lowest).toBeCloseTo(-(p.thickness + p.overshoot))
    expect(files[2].plate?.thickness).toBe(p.thickness)
    expect(files[0].plate).toBeNull()
  })

  it('turns one layer on the machine: its contour, its own holes file and its plate', () => {
    const analyses = layers.map((l) => analyzeLayer(l, holes, p))
    const q = { ...p, layerPlacements: { '1': { turn: 90, x: 0, y: 0 } } }
    const files = gcodeFiles(layers, analyses, holes, q, DEFAULT_MACHINE_SETTINGS)
    const layerOne = files.find((f) => f.name === 'layer-001.gcode')!.build()
    const plain = files.find((f) => f.name === 'layer-002.gcode')!.build()
    expect(layerOne.content).toContain('; Turned 90 deg CCW about X0 Y0')
    expect(layerOne.content).toContain('; Screws: none (moved layer')
    expect(plain.content).not.toContain('Turned')
    // The turned contour covers the plain one's extent turned a quarter (Clipper
    // may start a ring elsewhere, so points are not compared one by one).
    const straight = layerGcode(layers[0], analyses[0], layers.length, p, DEFAULT_MACHINE_SETTINGS)
    const extent = (text: string) => {
      const points = text.split('\n').filter((l) => l.startsWith('G1 X')).map((l) => l.match(/X(-?[\d.]+) Y(-?[\d.]+)/)!.slice(1).map(Number))
      return { minX: Math.min(...points.map((q) => q[0])), maxX: Math.max(...points.map((q) => q[0])), minY: Math.min(...points.map((q) => q[1])), maxY: Math.max(...points.map((q) => q[1])) }
    }
    const before = extent(straight)
    const after = extent(layerOne.content)
    expect(after.minX).toBeCloseTo(-before.maxY, 0)
    expect(after.maxX).toBeCloseTo(-before.minY, 0)
    expect(after.minY).toBeCloseTo(before.minX, 0)
    expect(after.maxY).toBeCloseTo(before.maxX, 0)
    const own = files.find((f) => f.name === 'layer-001-holes.gcode')
    expect(own).toBeDefined()
    expect(own!.build().content).toContain('turned 90 deg')
    const blank = layerBlank(layers[0], p)
    const turned = layerBlank(layers[0], q)
    expect(turned.width).toBe(blank.height)
    expect(turned.height).toBe(blank.width)
  })

  it('shifts one layer on the machine after turning it', () => {
    const q = { ...p, layerPlacements: { '1': { turn: 0, x: 120, y: -40 } } }
    const blank = layerBlank(layers[0], p)
    const shifted = layerBlank(layers[0], q)
    expect(shifted.width).toBe(blank.width)
    expect(shifted.centerX - blank.centerX).toBeCloseTo(120, 0)
    expect(shifted.centerY - blank.centerY).toBeCloseTo(-40, 0)
    const analyses = layers.map((l) => analyzeLayer(l, holes, p))
    const content = gcodeFiles(layers, analyses, holes, q, DEFAULT_MACHINE_SETTINGS).find((f) => f.name === 'layer-001.gcode')!.build().content
    expect(content).toContain('; Shifted X120 Y-40 on the machine')
  })

  it('keeps only whole layer numbers that are really moved, and reads the old turn-only field', () => {
    const clean = sanitizeParams({
      layerPlacements: { '3': { turn: 30, x: 0, y: 0 }, '0': { turn: 10, x: 0, y: 0 }, x: { turn: 5, x: 0, y: 0 }, '4': { turn: 360, x: 0, y: 0 }, '5': 'a', '7': { turn: 0, x: 5, y: 'b' } },
    })
    expect(clean.layerPlacements).toEqual({ '3': { turn: 30, x: 0, y: 0 }, '7': { turn: 0, x: 5, y: 0 } })
    expect(sanitizeParams({ layerTurns: { '2': -15, '0': 10 } }).layerPlacements).toEqual({ '2': { turn: -15, x: 0, y: 0 } })
    expect(sanitizeParams({ layerPlacements: [1, 2] }).layerPlacements).toEqual({})
  })

  it('writes one card line per layer', () => {
    const card = mountingCard(layers, layers.map((l) => analyzeLayer(l, holes, p)), holes, p)
    expect(card).toContain('001 | plate')
    expect(card.split('\n').filter((l) => l.includes('| plate'))).toHaveLength(layers.length)
  })
})

describe('parameter checks', () => {
  it('accepts the defaults', () => {
    expect(paramErrors(DEFAULT_PARAMS)).toEqual([])
  })

  it('refuses a cut that would reach an insert', () => {
    expect(paramErrors(params({ overshoot: 3, insertRecess: 2 })).join()).toContain('Inserts')
  })

  it('refuses a rod count that is not a whole number in range', () => {
    expect(paramErrors(params({ rodCount: 2.5 })).join()).toContain('Rods')
    expect(paramErrors(params({ rodCount: 13 })).join()).toContain('Rods')
    expect(paramErrors(params({ rodCount: 0 }))).toEqual([])
  })

  it('refuses a Safe Z below the screw heads', () => {
    expect(paramErrors(params({ safeAbove: 5, headHeight: 6 })).join()).toContain('Safe Z')
  })
})

describe('ZIP', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('hello'))).toBe(0x3610a686)
  })

  it('lays out entries an unzipper can walk', () => {
    const zip = buildZip([
      { name: 'a.gcode', content: 'G0 X0\n' },
      { name: 'b.txt', content: 'hi' },
    ])
    const view = new DataView(zip.buffer)
    expect(view.getUint32(0, true)).toBe(0x04034b50)
    const end = zip.length - 22
    expect(view.getUint32(end, true)).toBe(0x06054b50)
    expect(view.getUint16(end + 10, true)).toBe(2)
    const directory = view.getUint32(end + 16, true)
    expect(view.getUint32(directory, true)).toBe(0x02014b50)
    expect(view.getUint32(directory + 42, true)).toBe(0)
  })
})

describe('hub', () => {
  // Two legs 40 x 50 mm, 60 mm apart: nothing in the middle.
  const legs = (() => {
    const leg = box(40, 50, 54)
    const right = Float32Array.from(leg, (v, i) => (i % 3 === 0 ? v + 100 : v))
    return normalizeMesh(Float32Array.from([...leg, ...right]), 'z', false, 54)
  })()
  const hubbed = (over: Partial<SculptureParams> = {}) => params({ thickness: 18, hub: true, hubDiameter: 40, rodCount: 1, ...over })

  it('joins separate legs to a hub between them', () => {
    const layers = computeLayers(legs, hubbed())
    expect(layers).toHaveLength(3)
    for (const layer of layers) {
      expect(layer.section).toHaveLength(2)
      expect(layer.hub).toHaveLength(1)
      expect(layer.bridges.length).toBeGreaterThan(0)
      expect(layer.region).toHaveLength(1)
    }
  })

  it('gives each leg two bridges on request', () => {
    const [one] = computeLayers(legs, hubbed({ hubBridges: 1 }))
    const [two] = computeLayers(legs, hubbed({ hubBridges: 2 }))
    expect(one.bridges).toHaveLength(2)
    expect(two.bridges).toHaveLength(4)
  })

  it('adds nothing where the section covers the hub', () => {
    const block = normalizeMesh(box(100, 100, 36), 'z', false, 36)
    const [layer] = computeLayers(block, hubbed())
    expect(layer.hub).toHaveLength(0)
    expect(layer.bridges).toHaveLength(0)
    expect(regionArea(layer.region)).toBeCloseTo(regionArea(layer.section), 0)
  })

  it('puts the rods in the hub', () => {
    const p = hubbed({ hubDiameter: 50, rodCount: 1 })
    const { holes, hasCommonArea } = proposeHoles(computeLayers(legs, p), p)
    expect(hasCommonArea).toBe(true)
    const rods = holes.filter((h) => h.kind === 'rod')
    expect(rods).toHaveLength(1)
    expect(Math.hypot(rods[0].x, rods[0].y)).toBeLessThan(25)
  })

  it('flags a hub part too narrow for a hole', () => {
    const [layer] = computeLayers(legs, hubbed({ hubDiameter: 10, hubSlot: 6 }))
    expect(thinHubPieces(layer, hubbed())).toHaveLength(1)
  })

  it('puts a hub spacer between every two hubs and cuts it from the gap plate', () => {
    const p = hubbed({ gap: 6, hubDiameter: 50 })
    const layers = computeLayers(legs, p)
    const { holes } = proposeHoles(layers, p)
    expect(computeHubSpacers(layers, holes, p)).toHaveLength(layers.length - 1)
    expect(computeHubSpacers(layers, holes, { ...p, gap: 0 })).toHaveLength(0)
    const files = hubSpacerGcode(holes, layers.length - 1, p, DEFAULT_MACHINE_SETTINGS)
    expect(Math.min(...zValues(files.contour))).toBeCloseTo(-(p.gap + p.overshoot))
    expect(files.holes).toContain('Hub spacer holes')
  })

  it('needs a slot at least as wide as the tool', () => {
    expect(paramErrors(hubbed({ hubSlot: 4, toolDiameter: 6 }))).toContain('Hub slot must be at least the tool diameter.')
  })
})

describe('project file', () => {
  const raw = box(100, 50, 30)
  const p = params({ plateTurn: 45, sheetX: 600, rodCount: 2, layerPlacements: { '2': { turn: 12.5, x: 30, y: -10 } } })
  const holes = [
    { id: 1, x: 1.5, y: -2, kind: 'rod' as const, cut: true },
    { id: 3, x: 10, y: 4, kind: 'island' as const, from: 2, to: 5 },
  ]
  const text = buildSculptureProject({ name: 'Torso  one ', modelName: 'torso.stl', params: p, holes, raw }, '0.62.0')

  it('brings back the model, the parameters and the holes', () => {
    const result = parseSculptureProject(text)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.project.name).toBe('Torso one')
    expect(result.project.modelName).toBe('torso.stl')
    expect(result.project.params).toEqual(p)
    expect(result.project.holes).toEqual(holes)
    expect(Array.from(result.project.raw)).toEqual(Array.from(raw))
  })

  it('refuses a foreign, damaged or newer file', () => {
    expect(parseSculptureProject('{"format":"onlypaths-project","version":1}')).toEqual({ ok: false, reason: 'invalid' })
    const data = JSON.parse(text)
    expect(parseSculptureProject(JSON.stringify({ ...data, version: 99 }))).toEqual({ ok: false, reason: 'newer' })
    expect(parseSculptureProject(JSON.stringify({ ...data, model: { ...data.model, data: 'AAAA' } })).ok).toBe(false)
    expect(parseSculptureProject(JSON.stringify({ ...data, holes: [{ id: 1, x: 0, y: 0, kind: 'peg' }] })).ok).toBe(false)
  })

  it('names the file after the project', () => {
    expect(sculptureFilename('Torso one', new Date('2026-11-07T10:00:00Z'))).toBe('sculpture-torso-one-2026-11-07.json')
  })
})
