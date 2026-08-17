import * as THREE from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'

// `direction` is where the camera sits relative to the target (camera looks
// back toward center), so its viewing direction is the negation of this.
// All values below are expressed directly in Three.js space, but each was
// derived from a plain-CNC-space starting point (e.g. "camera above,
// looking down, screen-right = CNC+X, screen-up = CNC+Y") and converted
// through buildScene's `toThree(x,y,z) = (x, z, -y)` mapping — see the
// comment on `toThree` for why the sign flip is required (handedness).
// Every preset here was verified by direct substitution into the
// lookAt cross-product formulas, not just visually — see CHANGELOG 0.6.7.
//
// `front`'s numbers are unchanged from before that mapping fix (its old,
// pre-fix rendering already happened to be correct, by coincidence of which
// side of the handedness flip it landed on) — `top`, `side`, and `isometric`
// all needed new values.
//
// `isometric` sits over CNC quadrant III (-X,-Y), above, still looking
// toward +Y (the 0.6.3 decision) — chosen so the camera looks *across* the
// work area instead of from behind it, since parts typically sit in
// quadrant I (+X,+Y).
export const VIEW_PRESETS = {
  isometric: { direction: new THREE.Vector3(-1, 0.85, 1).normalize(), up: new THREE.Vector3(0, 1, 0) },
  top: { direction: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, -1) },
  front: { direction: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) },
  side: { direction: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
} as const

export type ViewPresetName = keyof typeof VIEW_PRESETS

function fitDistance(camera: THREE.PerspectiveCamera, bounds: THREE.Box3): number {
  const size = new THREE.Vector3()
  bounds.getSize(size)
  const radius = Math.max(size.x, size.y, size.z, 10) * 0.75
  return radius / Math.sin((camera.fov * Math.PI) / 360)
}

// Points the camera at `bounds`'s center from along `direction`, at a
// distance that fits the whole box in view.
export function frameCamera(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  bounds: THREE.Box3,
  direction: THREE.Vector3,
  up: THREE.Vector3,
) {
  const center = new THREE.Vector3()
  bounds.getCenter(center)
  const distance = fitDistance(camera, bounds)

  camera.up.copy(up)
  camera.position.copy(center).addScaledVector(direction, distance)
  camera.near = distance / 100
  camera.far = distance * 20
  camera.updateProjectionMatrix()
  camera.lookAt(center)

  controls.target.copy(center)
  controls.update()
}
