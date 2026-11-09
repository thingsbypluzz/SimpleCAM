import * as THREE from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'

// Points the camera at the box from the given direction (from the target
// towards the camera), far enough back for all of it to fit.
export function frameBox(camera: THREE.PerspectiveCamera, controls: OrbitControls, box: THREE.Box3, direction: THREE.Vector3, minRadius = 1) {
  if (box.isEmpty()) return
  const center = box.getCenter(new THREE.Vector3())
  const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, minRadius)
  controls.target.copy(center)
  camera.position.copy(center).addScaledVector(direction.clone().normalize(), (radius * 1.15) / Math.sin((camera.fov * Math.PI) / 360))
}

// Fit View as in OnlyPaths' 3D preview: the current angle, refitted.
export function refitBox(camera: THREE.PerspectiveCamera, controls: OrbitControls, box: THREE.Box3, fallback: THREE.Vector3, minRadius = 1) {
  const direction = camera.position.clone().sub(controls.target)
  frameBox(camera, controls, box, direction.lengthSq() > 0 ? direction : fallback, minRadius)
}
