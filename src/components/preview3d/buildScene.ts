import * as THREE from 'three'
import { getFixedColors, getPaletteAccents, hexToThreeColor, type PaletteId } from '../../config/palettes'
import { resolvePoints } from '../../lib/positioning'
import { circleOutlineOptions, circleOutlineRadiusAndDirection, onLineCircleEdges } from '../../lib/outlineCircle'
import { buildHelixCircleToolpath, holeCircleOptions } from '../../lib/helix'
import { buildStandardCircleToolpath } from '../../lib/standardHole'
import { onLineRectDimensions, rectCorners, rectToolDimensions } from '../../lib/outlineRectangleGeometry'
import {
  buildRectRampToolpath,
  buildRectStandardToolpath,
  outlineDirectionForOffsetMode,
  rectOutlineOptions,
} from '../../lib/outlineRectangle'
import { surfaceNominalBounds, surfaceToolBounds, type SurfaceBounds } from '../../lib/surfaceGeometry'
import { buildSurfaceToolpath } from '../../lib/surface'
import { buildFacingToolpath } from '../../lib/facing'
import { buildLobedToolpath } from '../../lib/outlineLobed'
import { lobedUnionLoop, loopBounds, translateLoop, type LoopBounds } from '../../lib/outlineLobedGeometry'
import { facingBlockCorners, facingStripCorners, facingViewBounds, type FacingBounds } from '../../lib/facingGeometry'
import { buildPocketToolpath } from '../../lib/pocket'
import { movePoints, type MoveKind, type Toolpath } from '../../lib/toolpath'
import { pocketCenter } from '../../lib/pocketGeometry'
import { stockSheetRect } from '../preview/drawToolpath'
import { stockModel, type StockModel } from '../../lib/stockModel'
import type { MultiPolygon, Ring } from 'polygon-clipping'
import type { Point2D, PocketShape, WizardParams } from '../../types/wizard'
import type { ThemeId } from '../../types/theme'
import type { Grid3DLabelSize } from '../../types/appearance'

// CNC (x, y, z) -> Three.js (x, z, -y): CNC Z (up/down into material) becomes
// the Three.js Y (vertical) axis, so an orbit camera gives an intuitive
// "looking at the material from above/around" view without any rotation.
//
// The Y is negated (not just moved into the Z slot) on purpose: swapping two
// axes without a sign flip reverses handedness (an odd permutation, det -1),
// and Three.js's camera basis math (lookAt's cross products) is always
// right-handed. A handedness-reversing map means, for every camera preset,
// one screen axis renders mirrored relative to plain CNC-space expectations
// (see the "Top"/"Isometric" postmortem in CHANGELOG 0.6.7) — negating one
// component restores a proper (handedness-preserving) map, so lookAt-derived
// cameras "just work" without per-preset mirror workarounds. `cameraPresets.ts`
// is written in terms of this fixed mapping.
function toThree(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, z, -y)
}

// Lifts a flat top face a hair above its nominal height so it never
// renders exactly coplanar with the material plane (world Y=0) or the grid
// (world Y=0.01, see the GridHelper below) — all semi-transparent flat
// surfaces, so an exact Y match z-fights (a moire flicker). Bigger than the
// grid's own 0.01 offset so one lift clears both. Purely cosmetic — 0.02mm
// is invisible at any real part scale. Used by the stock model's top face
// (buildStockModelObjects) and a closed box's top (buildRectWallMesh).
const SOLID_CAP_Z_LIFT = 0.02

// Vertical faces are drawn at this fraction of theme.hole's brightness —
// always darker than any horizontal face next to them. MeshBasicMaterial
// has no real lighting model, so this flat-shaded-sprite-style contrast is
// the only cue that a wall is a distinct vertical surface and not part of
// the flat tint of the face at its rim.
const WALL_SHADE_FACTOR = 0.5

// Desired on-screen size (CSS px) of EVERY text sprite in the scene — the
// origin "0,0", the axis-end "X"/"Y", and the grid coordinate ticks all
// share this one setting (Settings > Appearance > Grid Labels), held
// constant regardless of camera zoom/distance — see
// rescaleLabelForConstantScreenSize below. Kept as pixel sizes, not
// world-unit sizes, specifically so a heavily zoomed-out or zoomed-in view
// never turns these into unreadable dots or oversized blobs (the bug this
// fixes). Named sizes only, not a raw pixel input — see the
// Grid3DLabelSize comment in types/appearance.ts for why. 'medium' is the
// shipped default, deliberately higher than this feature's original flat
// 13px default, which user testing found too small even once the
// constant-screen-size fix made it consistently legible. The "Show grid
// coordinate labels" checkbox this same Settings block offers only
// controls whether the grid ticks are built at all (see gridLabelsEnabled
// below) — origin/"X"/"Y" always render regardless of that checkbox, they
// just resize along with it.
const GRID_LABEL_SIZE_PX: Record<Grid3DLabelSize, number> = {
  small: 15,
  medium: 19,
  large: 25,
}

// Line style per move kind — see "Styl linii ruchu narzędzia w 3D Preview"
// in CLAUDE.md.
const MOVE_STYLE: Record<MoveKind, ToolpathLineStyle> = {
  cut: 'solid',
  rapid: 'dashed',
  plunge: 'dotted',
  link: 'linking',
  finish: 'solid',
}

// Draws an engine's own move list (lib/toolpath.ts, BL-61) — the same
// moves toolpathToGcode() formats, so the preview can't drift from the
// G-code. Arcs are sampled exactly as the G1 output samples them
// (movePoints()). Consecutive moves of one style share a THREE.Line — an
// engine emits hundreds of short moves per level. `retractToZ` adds the
// final Safe Z retract assembleProgram() appends after the toolpath.
function toolpathLines3D(toolpath: Toolpath, theme: Theme, span: number, retractToZ?: number): THREE.Line[] {
  const builder = createSegmentBuilder3D(toThree(toolpath.start.x, toolpath.start.y, toolpath.start.z))
  let current = toolpath.start
  let pending: THREE.Vector3[] = []
  let pendingStyle: ToolpathLineStyle | null = null
  const flush = () => {
    if (pendingStyle) builder.add(pendingStyle, pending)
    pending = []
  }
  for (const move of toolpath.moves) {
    const style = MOVE_STYLE[move.kind]
    if (style !== pendingStyle) {
      flush()
      pendingStyle = style
    }
    for (const p of movePoints(current, move)) pending.push(toThree(p.x, p.y, p.z))
    current = move.to
  }
  flush()
  if (retractToZ !== undefined) builder.add('dashed', [toThree(current.x, current.y, retractToZ)])
  return buildToolpathLines3D(builder.segments, theme, span)
}

interface Theme {
  material: number
  materialOpacity: number
  grid: number
  // No separate "rapid" color in 3D — every tool-motion line shares this
  // one color, told apart by dash pattern instead (see ToolpathLineStyle).
  // 2D Preview still has its own separate rapid accent (drawToolpath.ts).
  toolpath: number
  linking: number
  origin: number
  hole: number
  stockEdge: number
  axisX: number
  axisY: number
  offset: number
  // Muted, neutral color for the grid's coordinate-number labels — same
  // role as drawToolpath.ts's theme.text, deliberately NOT an axis color
  // so the ticks read as secondary/reference, not competing with the
  // axis lines or the origin label.
  text: number
}

// materialOpacity isn't a color and stays fixed per light/dark mode
// (unrelated to the BL-12 palette choice) — the plane's own accent color
// still comes from the selected palette.
const MATERIAL_OPACITY_LIGHT = 0.5
const MATERIAL_OPACITY_DARK = 0.6

// Merges the palette-selectable accents (material/grid/toolpath/rapid/hole)
// with the fixed CNC-convention colors (axes/origin/offset) — see
// config/palettes.ts (BL-12). Mirrors preview/drawToolpath.ts's buildTheme,
// just in Three.js's numeric 0xrrggbb color format instead of CSS hex
// strings.
function buildTheme(paletteId: PaletteId, isDark: boolean, themeId: ThemeId): Theme {
  const fixed = getFixedColors(themeId, isDark)
  const accents = getPaletteAccents(paletteId, isDark, themeId)
  return {
    material: hexToThreeColor(fixed.background),
    materialOpacity: isDark ? MATERIAL_OPACITY_DARK : MATERIAL_OPACITY_LIGHT,
    grid: hexToThreeColor(accents.grid),
    toolpath: hexToThreeColor(accents.toolpath),
    linking: hexToThreeColor(accents.linking),
    origin: hexToThreeColor(fixed.origin),
    hole: hexToThreeColor(accents.hole),
    stockEdge: hexToThreeColor(accents.stockEdge),
    axisX: hexToThreeColor(fixed.axisX),
    axisY: hexToThreeColor(fixed.axisY),
    offset: hexToThreeColor(fixed.offset),
    text: hexToThreeColor(fixed.text),
  }
}

// Small always-facing-camera text label rendered via a canvas texture — no
// extra dependency (troika-three-text / CSS2DRenderer) needed for a single
// short label.
function createTextSprite(text: string, color: number, size: number): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.font = 'bold 28px ui-monospace, monospace'
  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`
  ctx.textBaseline = 'middle'
  // Centered, not left-aligned at a fixed x — a fixed-x draw left single
  // characters ("X"/"Y") close enough to the canvas's true center that it
  // went unnoticed, but multi-digit grid tick numbers ("-30", "50") sat
  // visibly left of the sprite's actual anchor point. That produced two
  // reported symptoms from the same cause: X-axis tick labels drifting
  // left of their grid line, and right-edge Y-axis ticks (already
  // anchored further right, past the grid boundary) appearing to creep
  // back toward the plane while left-edge ones drifted the other way.
  ctx.textAlign = 'center'
  ctx.fillText(text, canvas.width / 2, canvas.height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(size, size / 2, 1)
  return sprite
}

// Rescales a text sprite so it occupies a *constant number of screen
// pixels* regardless of camera distance/zoom, instead of the fixed
// world-unit size createTextSprite() sets at construction time (which
// looks fine at whatever zoom the scene happened to be built at, then
// shrinks to an unreadable dot when zoomed out, or balloons when zoomed
// way in — the bug this fixes). Call every frame, after the camera may
// have moved (Scene3D.tsx's animate() loop) — cheap, no allocation.
// `sprite.userData.pixelHeight` is set once, at creation, by whichever
// code built the label (see GRID_LABEL_SIZE_PX above); this function
// doesn't need to know what *kind* of label it's rescaling.
//
// Standard perspective-camera billboard-scaling formula: the world-space
// height spanned by the full viewport at a given distance is
// `2 * distance * tan(verticalFov / 2)`; dividing by the viewport's pixel
// height gives "world units per pixel" at that distance, which converts
// the desired pixel height directly into the world-space scale Three.js
// sprites use. Depends only on vertical FOV, not aspect ratio, so it's
// unaffected by window/container resizing beyond re-reading the current
// pixel height each call.
export function rescaleLabelForConstantScreenSize(
  sprite: THREE.Sprite,
  camera: THREE.PerspectiveCamera,
  viewportHeightPx: number,
): void {
  const pixelHeight = (sprite.userData.pixelHeight as number | undefined) ?? GRID_LABEL_SIZE_PX.medium
  const distance = camera.position.distanceTo(sprite.position)
  const fovRad = (camera.fov * Math.PI) / 180
  const worldPerPixel = (2 * distance * Math.tan(fovRad / 2)) / viewportHeightPx
  const worldHeight = pixelHeight * worldPerPixel
  sprite.scale.set(worldHeight * 2, worldHeight, 1)
}

// Cone arrowhead pointing along `direction`, centered so its tip lands
// exactly at `tip`. Used to give the X/Y axis lines a visible positive
// direction instead of just extending both ways with no indication of
// which end is +X/+Y.
function createArrowhead(color: number, size: number, tip: THREE.Vector3, direction: THREE.Vector3): THREE.Mesh {
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(size * 0.35, size, 12),
    new THREE.MeshBasicMaterial({ color }),
  )
  cone.position.copy(tip).addScaledVector(direction, -size / 2)
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)
  return cone
}

export interface BuiltScene {
  objects: THREE.Object3D[]
  bounds: THREE.Box3
  // Every text sprite in the scene (origin "0,0", axis-end "X"/"Y", grid
  // coordinate ticks) — a subset of `objects`, handed back separately so
  // Scene3D.tsx's per-frame animate() loop can rescale them for constant
  // screen size (see rescaleLabelForConstantScreenSize) without having to
  // search the whole object graph for sprites every frame.
  labels: THREE.Sprite[]
  // The WebGL clear color the caller should apply (renderer.setClearColor)
  // — same value as `theme.material`, sourced from the active Theme's fixed
  // `background` color (config/palettes.ts) — the same one the 2D preview
  // already fills its canvas with (drawToolpath.ts). It's a Theme property,
  // not a Preview Color Palette accent, so it never changes when the user
  // switches palette, only when the Theme itself changes. Handing this back
  // instead of leaving Scene3D.tsx to compute or hardcode its own copy is
  // the whole point: it's the one thing that must track whichever Theme is
  // active, for every theme to come, without a second place to remember to
  // update — see the postmortem note at its call site in
  // buildToolpathScene() below.
  background: number
}

// Discriminated by operation/shape — same split as preview/drawToolpath.ts.
// Hole(s) is a repeated point pattern; Outline is a single shape (circle,
// or a 4-corner rectangle).
type ResolvedPattern =
  | { kind: 'holes'; params: WizardParams; points: Point2D[]; holeRadius: number; toolRadius: number }
  | {
      kind: 'outlineCircle'
      params: WizardParams
      center: Point2D
      nominalRadius: number
      toolRadius: number
    }
  | {
      kind: 'outlineRect'
      params: WizardParams
      nominalCorners: Point2D[]
      toolCorners: Point2D[]
    }
  | {
      kind: 'surface'
      params: WizardParams
      nominalBounds: SurfaceBounds
      toolBounds: SurfaceBounds
    }
  | {
      kind: 'outlineLobed'
      params: WizardParams
      bounds: LoopBounds
    }
  | {
      kind: 'facing'
      params: WizardParams
      // Tool travel plus a band of the part behind the finished edge.
      viewBounds: FacingBounds
    }
  | {
      kind: 'pocket'
      params: WizardParams
      center: Point2D
      shape: PocketShape
      nominalRadius: number // circle only
      nominalCorners: Point2D[] // rect only, [] for circle
    }

function resolvePattern(params: WizardParams): ResolvedPattern {
  if (params.operation === 'pocket') {
    const { pocket } = params
    const center = pocketCenter(pocket)
    if (pocket.shape === 'circle' || pocket.shape === 'circleLightened') {
      return { kind: 'pocket', params, center, shape: pocket.shape, nominalRadius: pocket.diameter / 2, nominalCorners: [] }
    }
    const nominalCorners: Point2D[] = [
      { x: center.x - pocket.width / 2, y: center.y - pocket.height / 2 },
      { x: center.x + pocket.width / 2, y: center.y - pocket.height / 2 },
      { x: center.x + pocket.width / 2, y: center.y + pocket.height / 2 },
      { x: center.x - pocket.width / 2, y: center.y + pocket.height / 2 },
    ]
    return { kind: 'pocket', params, center, shape: pocket.shape, nominalRadius: 0, nominalCorners }
  }
  if (params.operation === 'facing') {
    return { kind: 'facing', params, viewBounds: facingViewBounds(params.facing) }
  }
  if (params.operation === 'surface') {
    const { surface } = params
    return {
      kind: 'surface',
      params,
      nominalBounds: surfaceNominalBounds(surface),
      toolBounds: surfaceToolBounds(surface),
    }
  }
  if (params.operation === 'outline') {
    const { outline } = params
    if (outline.shape === 'lobedCircle') {
      const r = outline.toolDiameter / 2
      // Everything the shape reaches — outline, tool path, On-line's outer
      // edge — lies inside the circles (Add) or the main circle (Subtract)
      // grown by the tool radius.
      const extent = loopBounds(translateLoop(lobedUnionLoop({ ...outline, lobeMode: 'add' }, r), outline.offsetX, outline.offsetY))
      return {
        kind: 'outlineLobed',
        params,
        bounds: extent ?? { minX: outline.offsetX, maxX: outline.offsetX, minY: outline.offsetY, maxY: outline.offsetY },
      }
    }
    if (outline.shape === 'circle') {
      const { radius: toolRadius } = circleOutlineRadiusAndDirection(outline)
      return {
        kind: 'outlineCircle',
        params,
        center: { x: outline.offsetX, y: outline.offsetY },
        nominalRadius: outline.diameter / 2,
        toolRadius: Math.max(0, toolRadius),
      }
    }
    const nominalCorners = rectCorners(
      outline.shape,
      outline.width,
      outline.height,
      outline.width,
      outline.height,
      outline.offsetX,
      outline.offsetY,
      'ccw',
    )
    const { toolWidth, toolHeight } = rectToolDimensions(
      outline.width,
      outline.height,
      outline.toolDiameter,
      outline.offsetMode,
    )
    const direction = outlineDirectionForOffsetMode(outline.offsetMode)
    const toolCorners = rectCorners(
      outline.shape,
      outline.width,
      outline.height,
      Math.max(0, toolWidth),
      Math.max(0, toolHeight),
      outline.offsetX,
      outline.offsetY,
      direction,
    )
    return { kind: 'outlineRect', params, nominalCorners, toolCorners }
  }

  const { geometry } = params
  const points = resolvePoints(geometry)
  const holeRadius = geometry.holeDiameter / 2
  // Guarded against a tool larger than the hole (allowed until Etap 5
  // validation covers every entry point) — CylinderGeometry with a
  // negative radius throws.
  const toolRadius = Math.max(0, (geometry.holeDiameter - geometry.toolDiameter) / 2)
  return { kind: 'holes', params, points, holeRadius, toolRadius }
}

// Expands `bounds` (in place, matching THREE.Box3's mutable API already used
// throughout this file) to include one pattern's footprint — using THAT
// pattern's own totalDepth/safeZ, since overlaid presets (BL-3) can have a
// different depth/Safe Z than the active one.
function expandBoundsForPattern(bounds: THREE.Box3, pattern: ResolvedPattern) {
  if (pattern.kind === 'pocket') {
    const { pocket, feeds } = pattern.params
    if (pattern.shape === 'circle' || pattern.shape === 'circleLightened') {
      const r = pattern.nominalRadius
      bounds.expandByPoint(toThree(pattern.center.x - r, pattern.center.y - r, -pocket.totalDepth))
      bounds.expandByPoint(toThree(pattern.center.x + r, pattern.center.y + r, feeds.safeZ))
    } else {
      for (const p of pattern.nominalCorners) {
        bounds.expandByPoint(toThree(p.x, p.y, -pocket.totalDepth))
        bounds.expandByPoint(toThree(p.x, p.y, feeds.safeZ))
      }
    }
    return
  }
  if (pattern.kind === 'facing') {
    const { facing, feeds } = pattern.params
    const { minX, maxX, minY, maxY } = pattern.viewBounds
    bounds.expandByPoint(toThree(minX, minY, -facing.totalDepth))
    bounds.expandByPoint(toThree(maxX, maxY, feeds.safeZ))
    return
  }
  if (pattern.kind === 'surface') {
    const { surface, feeds } = pattern.params
    const { minX, maxX, minY, maxY } = pattern.toolBounds
    // The "remaining stock" block's bottom now sits a further feeds.safeZ
    // below -totalDepth (see buildSurfacePatternObjects) — bounds must
    // reach that deep too, or the camera/grid would clip it.
    bounds.expandByPoint(toThree(minX, minY, -surface.totalDepth - feeds.safeZ))
    bounds.expandByPoint(toThree(maxX, maxY, feeds.safeZ))
    return
  }
  if (pattern.kind === 'holes') {
    const { geometry, feeds } = pattern.params
    for (const p of pattern.points) {
      bounds.expandByPoint(toThree(p.x - pattern.holeRadius, p.y - pattern.holeRadius, -geometry.totalDepth))
      bounds.expandByPoint(toThree(p.x + pattern.holeRadius, p.y + pattern.holeRadius, feeds.safeZ))
    }
    return
  }
  const { outline, feeds } = pattern.params
  if (pattern.kind === 'outlineLobed') {
    const { minX, maxX, minY, maxY } = pattern.bounds
    bounds.expandByPoint(toThree(minX, minY, -outline.totalDepth))
    bounds.expandByPoint(toThree(maxX, maxY, feeds.safeZ))
    return
  }
  if (pattern.kind === 'outlineCircle') {
    let r = Math.max(pattern.nominalRadius, pattern.toolRadius)
    // On-line's new outer wall (BL-28) reaches past the nominal radius —
    // today's toolRadius/nominalRadius alone (both equal to the nominal
    // radius for On-line) would under-count the bounds otherwise.
    if (outline.offsetMode === 'onLine') {
      r = Math.max(r, onLineCircleEdges(outline).outerRadius)
    }
    bounds.expandByPoint(toThree(pattern.center.x - r, pattern.center.y - r, -outline.totalDepth))
    bounds.expandByPoint(toThree(pattern.center.x + r, pattern.center.y + r, feeds.safeZ))
    return
  }
  const corners = [...pattern.nominalCorners, ...pattern.toolCorners]
  // Same on-line under-count fix as Circle above, for the new outer wall.
  // A rectangle shape always holds here (pattern.kind === 'outlineRect'
  // guarantees it), the check is only to narrow the type for rectCorners.
  if (outline.offsetMode === 'onLine' && (outline.shape === 'rectCornered' || outline.shape === 'rectCentered')) {
    const { outerWidth, outerHeight } = onLineRectDimensions(outline.width, outline.height, outline.toolDiameter)
    corners.push(
      ...rectCorners(outline.shape, outline.width, outline.height, outerWidth, outerHeight, outline.offsetX, outline.offsetY, 'ccw'),
    )
  }
  for (const p of corners) {
    bounds.expandByPoint(toThree(p.x, p.y, -outline.totalDepth))
    bounds.expandByPoint(toThree(p.x, p.y, feeds.safeZ))
  }
}

// Offset vector — amber, physical origin to the shifted pattern/shape.
// Hidden entirely at (0,0), same rule as the collapsed Step 2 summary
// annotation. Shared by every pattern kind below.
function buildOffsetVectorObjects(offsetX: number, offsetY: number, theme: Theme, arrowSize: number): THREE.Object3D[] {
  if (offsetX === 0 && offsetY === 0) return []
  const offsetTip = toThree(offsetX, offsetY, 0)
  const offsetDir = offsetTip.clone().normalize()
  return [
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([toThree(0, 0, 0), offsetTip]),
      new THREE.LineBasicMaterial({ color: theme.offset }),
    ),
    createArrowhead(theme.offset, arrowSize, offsetTip, offsetDir),
  ]
}

// Every tool-motion line (cutting, rapid, non-cutting vertical step) shares
// one color (theme.toolpath) — no separate "rapid" accent in 3D anymore —
// and is told apart purely by dash pattern: 'solid' for actual cutting
// (circles/arcs/raster/ramp), 'dashed' for G0 rapid (traverse, retract,
// reposition), 'dotted' for a G1 move that isn't cutting laterally (Standard
// Hole/Outline's straight step-down between passes, Surface's Plunge-mode
// Z-transition). Previously rapids used a separate theme.rapid color/dashed
// style and non-cutting G1 steps were silently merged into the same solid
// line as real cutting, indistinguishable from it — both fixed together
// here, since achieving three different styles along what was one
// continuous polyline per pattern requires splitting it into multiple
// THREE.Line objects (LineDashedMaterial can only apply one dash pattern to
// an entire line, per its own cumulative distance from computeLineDistances()).
// 'linking' — Pocket Adaptive's G1 moves through already-cleared area:
// dotted like 'dotted', but in the palette's own `linking` color.
type ToolpathLineStyle = 'solid' | 'dashed' | 'dotted' | 'linking'

interface ToolpathSegment3D {
  style: ToolpathLineStyle
  points: THREE.Vector3[]
}

function toolpathLineMaterial(style: ToolpathLineStyle, theme: Theme, span: number): THREE.Material {
  if (style === 'solid') return new THREE.LineBasicMaterial({ color: theme.toolpath })
  // 'dotted' uses a much shorter dash than 'dashed' (and a slightly larger
  // gap) so it reads as discrete dots instead of short dashes.
  const dashSize = style === 'dashed' ? span * 0.02 : span * 0.003
  const gapSize = style === 'dashed' ? span * 0.01 : span * 0.008
  return new THREE.LineDashedMaterial({ color: style === 'linking' ? theme.linking : theme.toolpath, dashSize, gapSize })
}

function buildToolpathLine3D(points: THREE.Vector3[], style: ToolpathLineStyle, theme: Theme, span: number): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const line = new THREE.Line(geometry, toolpathLineMaterial(style, theme, span))
  if (style !== 'solid') line.computeLineDistances()
  return line
}

// Turns a list of styled segments (each already including its own shared
// boundary point with the previous segment, so there's no visual gap
// between styles) into actual THREE.Line objects. Segments with fewer than
// 2 points (nothing was pushed onto them) are dropped.
function buildToolpathLines3D(segments: ToolpathSegment3D[], theme: Theme, span: number): THREE.Line[] {
  return segments.filter((s) => s.points.length > 1).map((s) => buildToolpathLine3D(s.points, s.style, theme, span))
}

// Accumulates styled segments where each new leg starts exactly where the
// previous one ended (shared vertex — no gap), mirroring how the old flat
// Vector3[] builders in this file used to just keep pushing onto one array.
function createSegmentBuilder3D(start: THREE.Vector3) {
  const segments: ToolpathSegment3D[] = []
  let cursor = start
  return {
    add(style: ToolpathLineStyle, points: THREE.Vector3[]) {
      if (points.length === 0) return
      segments.push({ style, points: [cursor, ...points] })
      cursor = points[points.length - 1]
    },
    segments,
  }
}

// Builds everything that's per-pattern (BL-3 overlay): offset vector, rapid
// XY traverse and per-hole toolpath lines. The material plane/grid/origin/
// axes and the stock (buildStockModelObjects()) are NOT per-pattern — built
// once by the caller.
function buildHolesPatternObjects(
  pattern: Extract<ResolvedPattern, { kind: 'holes' }>,
  theme: Theme,
  span: number,
  arrowSize: number,
  showToolpath: boolean,
): THREE.Object3D[] {
  const { points, params } = pattern
  const { geometry, feeds, method } = params
  const objects: THREE.Object3D[] = []

  objects.push(...buildOffsetVectorObjects(geometry.offsetX, geometry.offsetY, theme, arrowSize))
  const opts = holeCircleOptions(params)

  // Rapid traverse between holes, at Safe Z — through each hole's actual
  // descent-start XY (the toolpath's own start, center + radius on +X),
  // matching the real G-code (program.ts's assembleProgram no longer rapids
  // to the raw center first).
  if (showToolpath && points.length > 1) {
    const rapidPoints = points.map((p) => toThree(p.x + opts.radius, p.y, feeds.safeZ))
    objects.push(buildToolpathLine3D(rapidPoints, 'dashed', theme, span))
  }

  // The engine's own move list for each hole (BL-61) — rapid down to
  // Start Z, every turn/pass/tab exactly as the G-code has it — plus the
  // retract to Safe Z assembleProgram() appends after each hole.
  if (showToolpath) {
    for (const p of points) {
      const toolpath = method === 'helix' ? buildHelixCircleToolpath(p.x, p.y, opts) : buildStandardCircleToolpath(p.x, p.y, opts)
      objects.push(...toolpathLines3D(toolpath, theme, span, feeds.safeZ))
    }
  }

  return objects
}

// Lobed Circle Outline (OP-8): the engine's move list; its stock comes
// from the shared model like every Outline.
function buildOutlineLobedPatternObjects(
  pattern: Extract<ResolvedPattern, { kind: 'outlineLobed' }>,
  theme: Theme,
  span: number,
  arrowSize: number,
  showToolpath: boolean,
): THREE.Object3D[] {
  const { params } = pattern
  const { outline, feeds } = params
  const objects: THREE.Object3D[] = []
  objects.push(...buildOffsetVectorObjects(outline.offsetX, outline.offsetY, theme, arrowSize))
  if (showToolpath) objects.push(...toolpathLines3D(buildLobedToolpath(params), theme, span, feeds.safeZ))
  return objects
}

function buildOutlineCirclePatternObjects(
  pattern: Extract<ResolvedPattern, { kind: 'outlineCircle' }>,
  theme: Theme,
  span: number,
  arrowSize: number,
  showToolpath: boolean,
): THREE.Object3D[] {
  const { center, params } = pattern
  const { outline, feeds } = params
  const objects: THREE.Object3D[] = []

  objects.push(...buildOffsetVectorObjects(outline.offsetX, outline.offsetY, theme, arrowSize))

  // Engine move list (BL-61), same as Hole(s).
  if (showToolpath) {
    const opts = circleOutlineOptions(params)
    const build = outline.method === 'helix' ? buildHelixCircleToolpath : buildStandardCircleToolpath
    objects.push(...toolpathLines3D(build(center.x, center.y, opts), theme, span, feeds.safeZ))
  }

  return objects
}

function boundingCenter(points: Point2D[]): Point2D {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
}

// The stock's material, in its two looks (BL-95).
//
// Transparent (default): theme.hole at 0.3 — theme.material is the scene's
// own background color and barely shows over it. No lighting, so vertical
// faces are darkened instead (WALL_SHADE_FACTOR). depthWrite: false on all
// of it: translucent stock must never occlude what lies behind it (the
// toolpath inside a pocket, another overlaid preset's walls) — it would
// win or lose the depth test by camera-distance sort order and flip with
// tiny camera moves.
//
// Solid: opaque and lit (Scene3D's ambient + directional light), so every
// face takes its shade from its own orientation and the stock occludes the
// toolpath like a real part. polygonOffset pushes it a hair back in depth
// so the grid and toolpath lines lying on its surfaces don't flicker.
function stockMaterial(theme: Theme, kind: 'face' | 'wall', side: THREE.Side, solid: boolean): THREE.Material {
  if (solid) {
    return new THREE.MeshLambertMaterial({ color: theme.hole, side, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
  }
  const color = new THREE.Color(theme.hole)
  if (kind === 'wall') color.multiplyScalar(WALL_SHADE_FACTOR)
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, side, depthWrite: false })
}

// One semi-transparent box from a set of corners — aligned with CNC X/Y,
// so BoxGeometry needs no rotation (toThree() is a pure axis permutation +
// negation). Surface's stock block is its only user. `closed` hides the
// top/bottom faces when false (groups 2/3 of BoxGeometry's
// [+x,-x,+y,-y,+z,-z]); a closed box's top face gets SOLID_CAP_Z_LIFT.
//
// A closed box is FrontSide: WebGL doesn't depth-sort triangles within one
// draw call, so a transparent DoubleSide box blends its near and far faces
// in rasterization order and looks darker/lighter depending on the camera
// angle.
function buildRectWallMesh(
  corners: Point2D[],
  boreHeight: number,
  centerZ: number,
  closed: boolean,
  theme: Theme,
  solid: boolean,
): THREE.Mesh {
  const center = boundingCenter(corners)
  const width = Math.max(...corners.map((p) => p.x)) - Math.min(...corners.map((p) => p.x))
  const height = Math.max(...corners.map((p) => p.y)) - Math.min(...corners.map((p) => p.y))
  const side = closed ? THREE.FrontSide : THREE.DoubleSide
  const wallMaterial = stockMaterial(theme, 'wall', side, solid)
  const capMaterial = closed ? stockMaterial(theme, 'face', side, solid) : new THREE.MeshBasicMaterial({ visible: false })
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, boreHeight, height),
    [wallMaterial, wallMaterial, capMaterial, capMaterial, wallMaterial, wallMaterial],
  )
  mesh.position.copy(toThree(center.x, center.y, closed ? centerZ + SOLID_CAP_Z_LIFT : centerZ))
  return mesh
}

function buildOutlineRectPatternObjects(
  pattern: Extract<ResolvedPattern, { kind: 'outlineRect' }>,
  theme: Theme,
  span: number,
  arrowSize: number,
  showToolpath: boolean,
): THREE.Object3D[] {
  const { params } = pattern
  const { outline, feeds } = params
  const objects: THREE.Object3D[] = []

  objects.push(...buildOffsetVectorObjects(outline.offsetX, outline.offsetY, theme, arrowSize))

  // Engine move list (BL-61), same as every other operation.
  if (showToolpath) {
    const opts = rectOutlineOptions(params)
    const build = outline.method === 'ramp' ? buildRectRampToolpath : buildRectStandardToolpath
    objects.push(...toolpathLines3D(build(outline.offsetX, outline.offsetY, opts), theme, span, feeds.safeZ))
  }

  return objects
}

// Flat, semi-transparent "remaining stock" block spanning the whole
// nominal footprint — reuses buildRectWallMesh's box technique unmodified
// (it's agnostic to corner order, computing its own bounding box via
// min/max), just passed the Surface footprint's 4 corners instead of an
// Outline perimeter's. Closed (real top cap), matching Outline's Outside
// treatment — Surface always represents kept, solid material, never a
// void/pocket the way Hole(s)/Outline Inside do — and not part of the
// shared stock model (lib/stockModel.ts), which leaves Surface out.
//
// Unlike that model (which spans the actual cut, Z=0 down to
// -totalDepth), this block deliberately shows the
// RESULTING shape of the stock after facing, not the cut cavity: its top
// face sits at the new machined surface (-totalDepth, absolute — startZ
// only lengthens the approach from above and never shifts where cutting
// actually ends, so it plays no part in this block's position) and its
// walls extend an arbitrary further feeds.safeZ below that, standing in
// for "the rest of the material the app has no knowledge of" (that value
// was picked over a new constant/setting specifically because it already
// defaults to a visually reasonable few mm — see the /grill-me session
// this followed, 2026-09-12).
function buildSurfacePatternObjects(
  pattern: Extract<ResolvedPattern, { kind: 'surface' }>,
  theme: Theme,
  span: number,
  arrowSize: number,
  showStock: boolean,
  showToolpath: boolean,
  solidStock: boolean,
  stockEdges: boolean,
): THREE.Object3D[] {
  const { nominalBounds, params } = pattern
  const { surface, feeds } = params
  const objects: THREE.Object3D[] = []

  objects.push(...buildOffsetVectorObjects(surface.offsetX, surface.offsetY, theme, arrowSize))

  if (showStock) {
    const boreHeight = feeds.safeZ
    const boreCenterZ = -surface.totalDepth - feeds.safeZ / 2
    const corners: Point2D[] = [
      { x: nominalBounds.minX, y: nominalBounds.minY },
      { x: nominalBounds.maxX, y: nominalBounds.minY },
      { x: nominalBounds.maxX, y: nominalBounds.maxY },
      { x: nominalBounds.minX, y: nominalBounds.maxY },
    ]
    // closed=true — see the block comment above.
    const block = buildRectWallMesh(corners, boreHeight, boreCenterZ, true, theme, solidStock)
    // The block's own outline, like the stock model's (stockEdgeMesh()).
    const blockEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(block.geometry),
      new THREE.LineBasicMaterial({ color: theme.stockEdge }),
    )
    blockEdges.position.copy(block.position)
    objects.push(block)
    if (stockEdges) objects.push(blockEdges)
  }

  // The whole path — entry rapid, Z transitions, raster, final retract —
  // straight from the engine's move list (lib/surface.ts).
  if (showToolpath) objects.push(...toolpathLines3D(buildSurfaceToolpath(params), theme, span, feeds.safeZ))

  return objects
}

// Facing (OP-7): the part as the cut leaves it — a closed block from the
// finished edge into the material as far as the grid/plane reaches (the
// app doesn't know the part's other dimension), Z0 down to -totalDepth —
// plus the outline of the strip the cut removes, and the engine's move
// list. Not part of the shared stock model, like Surface.
function buildFacingPatternObjects(
  pattern: Extract<ResolvedPattern, { kind: 'facing' }>,
  theme: Theme,
  span: number,
  arrowSize: number,
  showStock: boolean,
  showToolpath: boolean,
  solidStock: boolean,
  stockEdges: boolean,
  sheet: FacingBounds,
): THREE.Object3D[] {
  const { params } = pattern
  const { facing, feeds } = params
  const objects: THREE.Object3D[] = []

  objects.push(...buildOffsetVectorObjects(facing.offsetX, facing.offsetY, theme, arrowSize))

  if (showStock && facing.totalDepth > 0) {
    const centerZ = -facing.totalDepth / 2
    const block = buildRectWallMesh(facingBlockCorners(facing, sheet), facing.totalDepth, centerZ, true, theme, solidStock)
    objects.push(block)
    if (stockEdges) {
      const blockEdges = new THREE.LineSegments(
        new THREE.EdgesGeometry(block.geometry),
        new THREE.LineBasicMaterial({ color: theme.stockEdge }),
      )
      blockEdges.position.copy(block.position)
      objects.push(blockEdges)
    }
    // The removed strip has no faces — only its outline, so the raw edge
    // stays visible next to the finished one.
    const strip = facingStripCorners(facing)
    const stripCenter = boundingCenter(strip)
    const stripWidth = Math.max(...strip.map((p) => p.x)) - Math.min(...strip.map((p) => p.x))
    const stripHeight = Math.max(...strip.map((p) => p.y)) - Math.min(...strip.map((p) => p.y))
    const stripEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(stripWidth, facing.totalDepth, stripHeight)),
      new THREE.LineDashedMaterial({ color: theme.stockEdge, dashSize: span * 0.008, gapSize: span * 0.012 }),
    )
    stripEdges.computeLineDistances()
    stripEdges.position.copy(toThree(stripCenter.x, stripCenter.y, centerZ))
    objects.push(stripEdges)
  }

  if (showToolpath) objects.push(...toolpathLines3D(buildFacingToolpath(params), theme, span, feeds.safeZ))

  return objects
}

function buildPocketPatternObjects(
  pattern: Extract<ResolvedPattern, { kind: 'pocket' }>,
  theme: Theme,
  span: number,
  arrowSize: number,
  showToolpath: boolean,
): THREE.Object3D[] {
  const { params } = pattern
  const { pocket, feeds } = params
  const objects: THREE.Object3D[] = []

  objects.push(...buildOffsetVectorObjects(pocket.offsetX, pocket.offsetY, theme, arrowSize))

  if (showToolpath) {
    // Entry rapid, Z entry, every level's clearing moves and the final
    // retract — straight from the engine's move list (lib/pocket.ts).
    objects.push(...toolpathLines3D(buildPocketToolpath(params), theme, span, feeds.safeZ))
  }

  return objects
}

function buildPatternObjects(
  pattern: ResolvedPattern,
  theme: Theme,
  span: number,
  arrowSize: number,
  showStock: boolean,
  showToolpath: boolean,
  solidStock: boolean,
  stockEdges: boolean,
  sheet: FacingBounds,
): THREE.Object3D[] {
  switch (pattern.kind) {
    case 'holes':
      return buildHolesPatternObjects(pattern, theme, span, arrowSize, showToolpath)
    case 'outlineCircle':
      return buildOutlineCirclePatternObjects(pattern, theme, span, arrowSize, showToolpath)
    case 'outlineRect':
      return buildOutlineRectPatternObjects(pattern, theme, span, arrowSize, showToolpath)
    case 'outlineLobed':
      return buildOutlineLobedPatternObjects(pattern, theme, span, arrowSize, showToolpath)
    case 'surface':
      return buildSurfacePatternObjects(pattern, theme, span, arrowSize, showStock, showToolpath, solidStock, stockEdges)
    case 'pocket':
      return buildPocketPatternObjects(pattern, theme, span, arrowSize, showToolpath)
    case 'facing':
      return buildFacingPatternObjects(pattern, theme, span, arrowSize, showStock, showToolpath, solidStock, stockEdges, sheet)
  }
}

// polygon-clipping closes every ring by repeating its first point.
function openRing(ring: Ring): Ring {
  const [fx, fy] = ring[0]
  const [lx, ly] = ring[ring.length - 1]
  return ring.length > 1 && fx === lx && fy === ly ? ring.slice(0, -1) : ring
}

// One horizontal face of the stock model (lib/stockModel.ts) at CNC Z = z.
// THREE.Shape points are raw CNC (x, y): after rotation.x = -PI/2 (the
// material plane's own rotation) local shape-X is world X and shape-Y is
// world -Z — exactly toThree(x, y, 0). Islands enclosed by voids come as
// separate polygons, so every shape has non-overlapping holes.
function stockFaceMesh(region: MultiPolygon, z: number, side: THREE.Side, theme: Theme, solid: boolean): THREE.Mesh {
  const shapes = region.map(([outerRing, ...holeRings]) => {
    const shape = new THREE.Shape(openRing(outerRing).map(([x, y]) => new THREE.Vector2(x, y)))
    shape.holes = holeRings.map((ring) => new THREE.Path(openRing(ring).map(([x, y]) => new THREE.Vector2(x, y))))
    return shape
  })
  const face = new THREE.Mesh(new THREE.ShapeGeometry(shapes), stockMaterial(theme, 'face', side, solid))
  face.rotation.x = -Math.PI / 2
  face.position.set(0, z, 0)
  return face
}

function signedArea(ring: Ring): number {
  return ring.reduce((sum, [x, y], i) => {
    const [nx, ny] = ring[(i + 1) % ring.length]
    return sum + x * ny - nx * y
  }, 0)
}

// The vertical faces of one band of the stock model: every ring of the
// band's region, from zTop down to zBottom. Rings are walked with the
// material on the left (outer rings counter-clockwise, holes clockwise),
// which makes every face's front point out of the material — what a
// FrontSide (closed solid) band needs, and what its lighting normals
// (flat, one per face) are computed from.
function stockWallMesh(band: StockModel['walls'][number], side: THREE.Side, theme: Theme, solid: boolean): THREE.Mesh {
  const positions: number[] = []
  for (const polygon of band.region) {
    polygon.forEach((closedRing, ringIndex) => {
      const ring = openRing(closedRing)
      const counterClockwise = signedArea(ring) > 0
      const points = counterClockwise === (ringIndex === 0) ? ring : [...ring].reverse()
      for (let i = 0; i < points.length; i++) {
        const [ax, ay] = points[i]
        const [bx, by] = points[(i + 1) % points.length]
        const at = toThree(ax, ay, band.zTop)
        const ab = toThree(ax, ay, band.zBottom)
        const bt = toThree(bx, by, band.zTop)
        const bb = toThree(bx, by, band.zBottom)
        positions.push(at.x, at.y, at.z, ab.x, ab.y, ab.z, bb.x, bb.y, bb.z, at.x, at.y, at.z, bb.x, bb.y, bb.z, bt.x, bt.y, bt.z)
      }
    })
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return new THREE.Mesh(geometry, stockMaterial(theme, 'wall', side, solid))
}

// The stock of everything drawn (BL-77) — one model for the live pattern
// or for all overlaid presets together, so nothing interpenetrates: the
// uncut face at Z=0 (regardless of Start Z, BL-37 — Start Z is where the
// feed-rate descent begins, not a material height), pocket floors, and
// walls along the resulting contour of each Z band. Tabs are ignored.
//
// A part (Outline Outside) is a closed solid: FrontSide everywhere, so a
// near and a far face never blend through each other, plus an underside
// seen only from below. The sheet is open: its faces and walls are
// DoubleSide, to be seen from inside a void and from underneath.
function edgeLines(positions: number[], theme: Theme): THREE.LineSegments {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: theme.stockEdge }))
}

// A wall corner sharper than this gets a vertical edge line; the 5° steps
// of a circle or an arc stay smooth.
const EDGE_CORNER_DEG = 20

// The stock model's edges (palette color `stockEdge`, Settings →
// Appearance), as a sketch-like outline that keeps a part readable where
// its faces share one tone: the rim of every
// horizontal face (top, pocket floors, underside) and a vertical line at
// every sharp corner of a wall. The sheet's own outer edge is not one —
// the sheet has no walls there.
function stockEdgeMesh(model: StockModel, theme: Theme): THREE.LineSegments {
  const positions: number[] = []
  const segment = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
    const a = toThree(ax, ay, az)
    const b = toThree(bx, by, bz)
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
  }
  const extent = (rings: Ring[]) => {
    const xs = rings.flatMap((ring) => ring.map(([x]) => x))
    return Math.max(...xs) - Math.min(...xs)
  }
  const sheetWidth = model.solid || model.top.length === 0 ? Infinity : extent(model.top.map(([outer]) => outer))

  const rim = (region: MultiPolygon, z: number) => {
    for (const polygon of region) {
      polygon.forEach((closedRing, ringIndex) => {
        const ring = openRing(closedRing)
        if (ringIndex === 0 && extent([ring]) >= sheetWidth) return
        ring.forEach(([x, y], i) => {
          const [nx, ny] = ring[(i + 1) % ring.length]
          segment(x, y, z, nx, ny, z)
        })
      })
    }
  }
  rim(model.top, SOLID_CAP_Z_LIFT)
  for (const floor of model.floors) rim(floor.region, floor.z)
  if (model.bottom) rim(model.bottom.region, model.bottom.z)

  const minTurn = (EDGE_CORNER_DEG * Math.PI) / 180
  for (const band of model.walls) {
    for (const polygon of band.region) {
      for (const closedRing of polygon) {
        const ring = openRing(closedRing)
        ring.forEach(([x, y], i) => {
          const [px, py] = ring[(i + ring.length - 1) % ring.length]
          const [nx, ny] = ring[(i + 1) % ring.length]
          const turn = Math.abs(Math.atan2((x - px) * (ny - y) - (y - py) * (nx - x), (x - px) * (nx - x) + (y - py) * (ny - y)))
          if (turn > minTurn) segment(x, y, band.zTop, x, y, band.zBottom)
        })
      }
    }
  }
  return edgeLines(positions, theme)
}

function buildStockModelObjects(model: StockModel, theme: Theme, solid: boolean, edges: boolean): THREE.Object3D[] {
  const side = model.solid ? THREE.FrontSide : THREE.DoubleSide
  // Lifted off the material plane and grid; while translucent, drawn
  // first, as a backdrop.
  const top = stockFaceMesh(model.top, SOLID_CAP_Z_LIFT, side, theme, solid)
  if (!solid) top.renderOrder = -1
  const objects: THREE.Object3D[] = [top]
  for (const floor of model.floors) objects.push(stockFaceMesh(floor.region, floor.z, side, theme, solid))
  for (const band of model.walls) objects.push(stockWallMesh(band, side, theme, solid))
  if (model.bottom) objects.push(stockFaceMesh(model.bottom.region, model.bottom.z, THREE.BackSide, theme, solid))
  if (edges) objects.push(stockEdgeMesh(model, theme))
  return objects
}

export function buildToolpathScene(
  params: WizardParams,
  isDark: boolean,
  paletteId: PaletteId,
  themeId: ThemeId,
  overlayParams: readonly WizardParams[] = [],
  showActivePattern = true,
  gridLabelsEnabled = true,
  gridLabelSize: Grid3DLabelSize = 'medium',
  showStock = true,
  showToolpath = true,
  solidStock = false,
  stockEdges = true,
  cutShape = false,
): BuiltScene {
  const theme = buildTheme(paletteId, isDark, themeId)

  // Overlay patterns first, active pattern last — cosmetically inert in 3D
  // (real depth-tested geometry, add-order doesn't affect occlusion) but
  // kept for consistency with the 2D preview, where draw order matters.
  // While comparing presets, the live pattern is left out entirely
  // (showActivePattern=false) — mixing it in made it hard to tell what was
  // being compared against what.
  const allPatterns = [
    ...overlayParams.map(resolvePattern),
    ...(showActivePattern ? [resolvePattern(params)] : []),
  ]

  const objects: THREE.Object3D[] = []
  const labels: THREE.Sprite[] = []
  const bounds = new THREE.Box3()
  bounds.expandByPoint(toThree(0, 0, 0))

  for (const pattern of allPatterns) {
    expandBoundsForPattern(bounds, pattern)
  }

  const size = new THREE.Vector3()
  bounds.getSize(size)
  // `bounds`/`size`/`span` (origin always forced in) stay exactly as
  // before — still the returned camera-framing bounds AND still what every
  // cosmetic scale factor below (arrow/label/origin-marker sizes,
  // edgeMargin) is proportional to. Fit View's own framing is unaffected
  // by the grid-sizing change below (/grill-me decision, follow-up to
  // BL-31), so nothing that scales relative to it should shrink either.
  const span = Math.max(size.x, size.z, 10)

  // Grid/plane footprint — data-only (no forced origin), padded around the
  // data itself, then extended just enough to reach the origin, made
  // square and snapped to a "nice" CNC step (niceStep(), same helper and
  // same ~8-divisions target as the 2D grid) so every grid line lands on a
  // real, nameable coordinate. NOT one flat symmetric padding around the
  // origin+data centroid (`bounds` above) — that bled space into empty
  // quadrants whenever the pattern sat entirely on one side of the origin.
  // stockSheetRect() (drawToolpath.ts) is the one implementation — the 2D
  // Preview's stock sheet uses it too, so both show the same plate
  // (BL-74). World Z is -CNC Y (toThree()).
  const dataBounds = new THREE.Box3()
  for (const pattern of allPatterns) {
    expandBoundsForPattern(dataBounds, pattern)
  }
  const sheet = stockSheetRect(
    dataBounds.isEmpty()
      ? null
      : { dataMinX: dataBounds.min.x, dataMaxX: dataBounds.max.x, dataMinY: -dataBounds.max.z, dataMaxY: -dataBounds.min.z },
  )
  const gridStep = sheet.step
  const gridCenterX = sheet.centerX
  const gridCenterZ = -sheet.centerY
  const gridHalfCells = sheet.halfCells
  const gridSize = sheet.size
  const gridDivisions = gridHalfCells * 2

  // Material surface (CNC Z = 0). This plane (and the grid below) is meant
  // purely as a translucent visual reference, never a real occluder — but
  // at 0.6 opacity in dark mode it's opaque enough that Three.js's
  // camera-distance transparent sort could, depending on camera angle and
  // where the pattern's own centroid lands (Offset X/Y shifts it), draw
  // the plane AFTER a transparent pattern mesh sitting behind it (e.g.
  // Surface's stock block, which sits at Z between -totalDepth and
  // -totalDepth-safeZ, below Y=0). Two things had to change together to
  // fully fix this (reported as the stock cleanly vanishing, then —
  // partway fixed — as it alternating darker/lighter by angle):
  // `depthWrite: false` so the plane can never win the depth buffer and
  // erase something behind it outright (depthTest stays on, so it still
  // correctly sits behind genuinely opaque objects like the origin
  // marker); and `renderOrder = -1` so the plane/grid are *always* drawn
  // first regardless of the camera-distance sort, making every pattern
  // mesh drawn after them blend consistently on top instead of the blend
  // order (and thus apparent brightness) flipping with camera angle.
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(gridSize, gridSize),
    new THREE.MeshBasicMaterial({
      color: theme.material,
      transparent: true,
      opacity: theme.materialOpacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  )
  plane.renderOrder = -1
  plane.rotation.x = -Math.PI / 2
  plane.position.set(gridCenterX, 0, gridCenterZ)
  // Left out under solid stock (BL-95): it lies 0.02 mm below the stock's
  // top face, whose polygonOffset pushes it behind the plane at any oblique
  // angle — the plane (the background color at partial opacity) then
  // veiled the top and every wall below Z0, flattening the lit stock into
  // one dark tone.
  if (!(showStock && solidStock)) objects.push(plane)

  const grid = new THREE.GridHelper(gridSize, gridDivisions, theme.grid, theme.grid)
  grid.renderOrder = -1
  // Below the translucent stock's top face; above it when the stock is
  // solid (BL-95), which would otherwise cover the whole grid.
  grid.position.set(gridCenterX, showStock && solidStock ? SOLID_CAP_Z_LIFT * 2 : 0.01, gridCenterZ)
  ;(grid.material as THREE.Material).transparent = true
  ;(grid.material as THREE.Material).opacity = 0.4
  ;(grid.material as THREE.Material).depthWrite = false
  objects.push(grid)

  // Stock: one model of everything drawn (lib/stockModel.ts), within the
  // grid/plane's own (step-snapped) extent — world Z is -CNC Y. Surface and
  // Facing are not part of it and draw their own blocks.
  if (showStock) {
    const half = gridSize / 2
    const model = stockModel(
      [...overlayParams, ...(showActivePattern ? [params] : [])],
      { minX: gridCenterX - half, minY: -gridCenterZ - half, maxX: gridCenterX + half, maxY: -gridCenterZ + half },
      cutShape,
    )
    if (model) objects.push(...buildStockModelObjects(model, theme, solidStock, stockEdges))
  }

  // Shared by origin/"X"/"Y" and, further below, every grid tick — one
  // Settings control (Small/Medium/Large) sizes all of them alike.
  const labelPixelHeight = GRID_LABEL_SIZE_PX[gridLabelSize]

  // Origin marker + label
  const origin = new THREE.Mesh(
    new THREE.SphereGeometry(span * 0.01, 12, 12),
    new THREE.MeshBasicMaterial({ color: theme.origin }),
  )
  objects.push(origin)

  const originLabel = createTextSprite('0,0', theme.origin, span * 0.08)
  originLabel.position.set(span * 0.02, span * 0.03, -span * 0.02)
  originLabel.userData.pixelHeight = labelPixelHeight
  objects.push(originLabel)
  labels.push(originLabel)

  // X/Y axes through the machine origin (not the geometry center — origin
  // is the fixed physical reference point, independent of where the holes
  // happen to sit). Each gets an arrowhead + text label at its positive end
  // to show direction, not just orientation.
  //
  // Each arm's length is computed separately, from the origin out to the
  // actual rendered grid edge in that direction (BL-31) — NOT one shared
  // scalar symmetric around the origin. A single symmetric length was only
  // correct when the pattern sat roughly centered on the origin; the
  // grid/plane above already recenters to gridCenterX/gridCenterZ (the
  // pattern's own bounding-box centroid), so e.g. Rectangle Cornered (whole
  // pattern in one quadrant) or a large Offset X/Y made one arm overshoot
  // past the visible grid while the opposite arm fell short of it. Reuses
  // the exact same edge boundaries the grid tick-labels below already
  // compute (gridHalfExtent ± gridCenterX/Z) — same edges, same math,
  // shared instead of duplicated. `Math.max(0, ...)` clamps an arm to zero
  // rather than negative if the origin sits entirely past that edge (grid
  // doesn't span across it at all in that direction).
  const gridHalfExtent = gridHalfCells * gridStep
  const minTickX = gridCenterX - gridHalfExtent
  const maxTickX = gridCenterX + gridHalfExtent
  const minTickY = -gridCenterZ - gridHalfExtent
  const maxTickY = -gridCenterZ + gridHalfExtent
  const xArmPos = Math.max(0, maxTickX) // +X, world X unchanged by toThree()
  const xArmNeg = Math.max(0, -minTickX) // -X
  const yArmPos = Math.max(0, maxTickY) // +Y (CNC), maps to world -Z
  const yArmNeg = Math.max(0, -minTickY) // -Y (CNC)
  const arrowSize = span * 0.05

  const xAxisGeometry = new THREE.BufferGeometry().setFromPoints([
    toThree(-xArmNeg, 0, 0),
    toThree(xArmPos, 0, 0),
  ])
  objects.push(new THREE.Line(xAxisGeometry, new THREE.LineBasicMaterial({ color: theme.axisX })))
  objects.push(
    createArrowhead(theme.axisX, arrowSize, toThree(xArmPos, 0, 0), new THREE.Vector3(1, 0, 0)),
  )
  const xLabel = createTextSprite('X', theme.axisX, span * 0.09)
  xLabel.position.copy(toThree(xArmPos + arrowSize * 1.5, 0, 0))
  xLabel.userData.pixelHeight = labelPixelHeight
  objects.push(xLabel)
  labels.push(xLabel)

  const yAxisGeometry = new THREE.BufferGeometry().setFromPoints([
    toThree(0, -yArmNeg, 0),
    toThree(0, yArmPos, 0),
  ])
  objects.push(new THREE.Line(yAxisGeometry, new THREE.LineBasicMaterial({ color: theme.axisY })))
  objects.push(
    createArrowhead(theme.axisY, arrowSize, toThree(0, yArmPos, 0), new THREE.Vector3(0, 0, -1)),
  )
  const yLabel = createTextSprite('Y', theme.axisY, span * 0.09)
  yLabel.position.copy(toThree(0, yArmPos + arrowSize * 1.5, 0))
  yLabel.userData.pixelHeight = labelPixelHeight
  objects.push(yLabel)
  labels.push(yLabel)

  // Grid coordinate-number labels, one ruler-style border per axis run
  // around all four edges of the grid square — mirrors drawToolpath.ts's
  // 2D grid labels (same niceStep() sequence), but placed just outside the
  // plane/grid footprint rather than on the axis lines themselves.
  // Duplicated on both opposite edges per axis (not just one side, like
  // 2D's bottom/left) because the 3D camera orbits freely — whichever edge
  // currently faces the camera should carry readable numbers. In
  // theme.text (a muted, non-axis color) so they read as secondary
  // reference numbers, though now the same configurable size as origin/
  // "X"/"Y" (labelPixelHeight above). Ranges come from the step-snapped
  // grid built above, so every label centers on a real grid line —
  // including the tick at zero: this border is a complete ruler in its
  // own right, not assumed to be covered by the origin's separate "0,0"
  // label (which sits inside the plane, not on this border, and may not
  // even be in view for a pattern offset far from the origin).
  // User-configurable via Settings > Appearance > Grid Labels
  // (gridLabelsEnabled) — skipped entirely, not just hidden, when
  // disabled; origin/"X"/"Y" above are unaffected by that checkbox.
  if (gridLabelsEnabled) {
    const tickLabelSize = span * 0.045
    const edgeMargin = span * 0.06
    const tickLiftY = span * 0.02

    // X ticks: the coordinate along the line (x) is unchanged; only the
    // cross-axis position (world Z) moves, to just outside the grid's near
    // and far edges. gridHalfExtent/minTickX/maxTickX are computed above,
    // shared with the axis-arm-length math (BL-31).
    const tickStartX = Math.ceil(minTickX / gridStep) * gridStep
    for (let x = tickStartX; x <= maxTickX; x += gridStep) {
      const label = String(Math.round(x))
      for (const z of [
        gridCenterZ - gridHalfExtent - edgeMargin,
        gridCenterZ + gridHalfExtent + edgeMargin,
      ]) {
        const tick = createTextSprite(label, theme.text, tickLabelSize)
        tick.position.set(x, tickLiftY, z)
        tick.userData.pixelHeight = labelPixelHeight
        objects.push(tick)
        labels.push(tick)
      }
    }

    // CNC-Y ticks run along world -Z (toThree(0, y, 0) → (0, 0, -y)) — see
    // the mapping note on toThree() above. Cross-axis position (world X)
    // moves to just outside the grid's left and right edges. minTickY/
    // maxTickY are computed above, shared with the axis-arm-length math
    // (BL-31).
    const tickStartY = Math.ceil(minTickY / gridStep) * gridStep
    for (let y = tickStartY; y <= maxTickY; y += gridStep) {
      const label = String(Math.round(y))
      for (const x of [
        gridCenterX - gridHalfExtent - edgeMargin,
        gridCenterX + gridHalfExtent + edgeMargin,
      ]) {
        const tick = createTextSprite(label, theme.text, tickLabelSize)
        tick.position.set(x, tickLiftY, -y)
        tick.userData.pixelHeight = labelPixelHeight
        objects.push(tick)
        labels.push(tick)
      }
    }
  }

  const sheetBounds = {
    minX: gridCenterX - gridSize / 2,
    maxX: gridCenterX + gridSize / 2,
    minY: -gridCenterZ - gridSize / 2,
    maxY: -gridCenterZ + gridSize / 2,
  }
  for (const pattern of allPatterns) {
    objects.push(...buildPatternObjects(pattern, theme, span, arrowSize, showStock, showToolpath, solidStock, stockEdges, sheetBounds))
  }

  return { objects, labels, bounds, background: theme.material }
}

export function disposeObject3D(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
      child.geometry.dispose()
      const material = child.material
      if (Array.isArray(material)) material.forEach((m) => m.dispose())
      else material.dispose()
    } else if (child instanceof THREE.Sprite) {
      child.material.map?.dispose()
      child.material.dispose()
    }
  })
}
