import * as THREE from 'three';
import type { TransformControls } from 'three/addons/controls/TransformControls.js';
import { MS3D_GIZMO_HEX } from '@/systems/viewport/viewportColors';

function colorForGizmoPart(name: string): number | null {
  if (name === 'X') return MS3D_GIZMO_HEX.axisX;
  if (name === 'Y') return MS3D_GIZMO_HEX.axisY;
  if (name === 'Z') return MS3D_GIZMO_HEX.axisZ;
  if (name === 'XY') return MS3D_GIZMO_HEX.axisZ;
  if (name === 'YZ') return MS3D_GIZMO_HEX.axisX;
  if (name === 'XZ') return MS3D_GIZMO_HEX.axisY;
  if (name === 'XYZ') return MS3D_GIZMO_HEX.center;
  if (name === 'E' || name === 'XYZE') return MS3D_GIZMO_HEX.viewRing;
  return null;
}

/** Recolor Three.js TransformControls gizmo meshes to match the editor HUD palette. */
export function applyTransformControlsTheme(controls: TransformControls): void {
  const root = controls.getHelper();
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh || obj instanceof THREE.Line)) return;

    const tag = (obj as THREE.Object3D & { tag?: string }).tag;
    if (tag === 'helper') {
      const mat = obj.material;
      if (mat && !Array.isArray(mat) && 'color' in mat && mat.color instanceof THREE.Color) {
        mat.color.setHex(MS3D_GIZMO_HEX.helper);
      }
      return;
    }

    const hex = colorForGizmoPart(obj.name);
    if (hex === null) return;

    const apply = (mat: THREE.Material) => {
      if ('color' in mat && mat.color instanceof THREE.Color) {
        mat.color.setHex(hex);
      }
    };

    if (Array.isArray(obj.material)) obj.material.forEach(apply);
    else apply(obj.material);
  });
}
