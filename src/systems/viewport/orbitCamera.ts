import * as THREE from 'three';
import { VIEWPORT_FRAME_PADDING } from '@/systems/viewport/viewportFrame';

/** Min/max polar angle (phi) — keep camera off the poles. */
const PHI_EPS = 0.08;
const DIST_MIN = 2;
const DIST_MAX = 8000;

/**
 * Y-up orbit camera around a pivot (MilkShape / Blender style).
 * - Horizontal drag: yaw around world Y
 * - Vertical drag: pitch around camera right
 * - Pan: slide pivot in the view plane
 */
export class OrbitCamera {
  readonly target = new THREE.Vector3(0, 0, 0);

  private readonly spherical = new THREE.Spherical();
  private readonly offset = new THREE.Vector3();
  private readonly panScratch = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly camUp = new THREE.Vector3();

  /** Match legacy default view (≈ old t=0.6, p=1.1, r=380). */
  constructor() {
    this.spherical.radius = 380;
    this.spherical.theta = 0.6;
    this.spherical.phi = 1.1;
  }

  get distance(): number {
    return this.spherical.radius;
  }

  setDistance(r: number): void {
    this.spherical.radius = THREE.MathUtils.clamp(r, DIST_MIN, DIST_MAX);
  }

  /** Apply spherical state to a perspective camera. */
  applyTo(camera: THREE.PerspectiveCamera): void {
    this.offset.setFromSpherical(this.spherical);
    camera.position.copy(this.target).add(this.offset);
    camera.lookAt(this.target);
  }

  /**
   * Orbit from screen drag (pixels).
   * Drag right → view rotates right; drag up → tilt up (scene moves with cursor).
   */
  rotate(deltaX: number, deltaY: number, viewportHeight: number): void {
    const h = Math.max(1, viewportHeight);
    const rotateSpeed = 0.5;
    const dTheta = ((2 * Math.PI * rotateSpeed) / h) * deltaX;
    const dPhi = ((2 * Math.PI * rotateSpeed) / h) * deltaY;

    this.spherical.theta -= dTheta;
    this.spherical.phi -= dPhi;
    this.spherical.phi = THREE.MathUtils.clamp(
      this.spherical.phi,
      PHI_EPS,
      Math.PI - PHI_EPS,
    );
  }

  /** Pan pivot in the camera view plane (MMB drag). */
  pan(deltaX: number, deltaY: number, camera: THREE.PerspectiveCamera): void {
    const h = camera.position.distanceTo(this.target);
    const panSpeed = 0.001 * Math.max(1, h);

    camera.updateMatrixWorld(true);
    this.right.setFromMatrixColumn(camera.matrixWorld, 0);
    this.camUp.setFromMatrixColumn(camera.matrixWorld, 1);

    this.panScratch.copy(this.right).multiplyScalar(-deltaX * panSpeed);
    this.camUp.setFromMatrixColumn(camera.matrixWorld, 1);
    this.panScratch.addScaledVector(this.camUp, deltaY * panSpeed);
    this.target.add(this.panScratch);
  }

  /** Scroll wheel dolly toward/away from pivot. */
  zoom(deltaY: number): void {
    const dollySpeed = 1.05;
    if (deltaY > 0) {
      this.spherical.radius *= dollySpeed;
    } else if (deltaY < 0) {
      this.spherical.radius /= dollySpeed;
    }
    this.spherical.radius = THREE.MathUtils.clamp(
      this.spherical.radius,
      DIST_MIN,
      DIST_MAX,
    );
  }

  /** Frame an axis-aligned bounds box. */
  frameBox(min: THREE.Vector3, max: THREE.Vector3): void {
    const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
    const size = new THREE.Vector3().subVectors(max, min);
    const radius = Math.max(size.x, size.y, size.z) * 0.5;
    this.target.copy(center);
    this.spherical.radius = THREE.MathUtils.clamp(
      Math.max(80, radius * 2.08 * VIEWPORT_FRAME_PADDING),
      DIST_MIN,
      DIST_MAX,
    );
    this.spherical.phi = Math.PI * 0.38;
    this.spherical.theta = Math.PI * 0.22;
  }

  reset(): void {
    this.target.set(0, 0, 0);
    this.spherical.radius = 380;
    this.spherical.theta = 0.6;
    this.spherical.phi = 1.1;
  }
}
