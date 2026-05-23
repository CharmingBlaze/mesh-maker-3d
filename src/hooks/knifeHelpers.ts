import * as THREE from 'three';
import { VIEW2D_DEFS, type View2DKey } from '@/core/math/projection';
import type { Vec3 } from '@/core/math/Vec3';
import type { KnifeProject } from '@/systems/mesh/knifeCut';
import type { KnifeDrawState, KnifeDrawView, KnifePoint } from '@/systems/mesh/knifeDraw';
import {
  inverseTransformPoint,
  isIdentityTransform,
  transformPoint,
} from '@/systems/scene/sceneObjectHelpers';
import type { Transform } from '@/core/scene-graph/SceneNode';

export function knifePointToLocal(point: KnifePoint, transform: Transform): KnifePoint {
  if (isIdentityTransform(transform)) return point;
  return { ...point, position: inverseTransformPoint(point.position, transform) };
}

export function knifePointToWorld(point: KnifePoint, transform: Transform): KnifePoint {
  if (isIdentityTransform(transform)) return point;
  return { ...point, position: transformPoint(point.position, transform) };
}

export function knifeDrawForWorldPreview(
  draw: KnifeDrawState,
  transform: Transform,
): KnifeDrawState {
  if (isIdentityTransform(transform)) return draw;
  return {
    ...draw,
    points: draw.points.map((p) => knifePointToWorld(p, transform)),
    hover: draw.hover ? knifePointToWorld(draw.hover, transform) : null,
  };
}

/** Build a 2D projector for knife intersection tests (view-aligned cut). */
export function buildKnifeProjector(
  view: KnifeDrawView,
  p0: Vec3,
  camera?: THREE.PerspectiveCamera,
  viewBasis?: { viewRight?: Vec3; viewUp?: Vec3 },
): KnifeProject {
  if (view !== '3d') {
    const vd = VIEW2D_DEFS[view as View2DKey];
    return (v) => vd.proj(v);
  }

  if (viewBasis?.viewRight && viewBasis?.viewUp) {
    const right = viewBasis.viewRight;
    const up = viewBasis.viewUp;
    return (v) => ({
      x: (v.x - p0.x) * right.x + (v.y - p0.y) * right.y + (v.z - p0.z) * right.z,
      y: (v.x - p0.x) * up.x + (v.y - p0.y) * up.y + (v.z - p0.z) * up.z,
    });
  }

  const origin = new THREE.Vector3(p0.x, p0.y, p0.z);
  const forward = new THREE.Vector3();
  camera?.getWorldDirection(forward);
  if (!camera || forward.lengthSq() < 1e-8) {
    forward.set(0, 0, -1);
  }

  const worldUp = new THREE.Vector3(0, 1, 0);
  let right = new THREE.Vector3().crossVectors(forward, worldUp);
  if (right.lengthSq() < 1e-6) {
    right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(1, 0, 0));
  }
  right.normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();

  return (v) => {
    const p = new THREE.Vector3(v.x - origin.x, v.y - origin.y, v.z - origin.z);
    return { x: p.dot(right), y: p.dot(up) };
  };
}

export function captureKnifeViewBasis(camera: THREE.PerspectiveCamera): { viewRight: Vec3; viewUp: Vec3 } {
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  const worldUp = new THREE.Vector3(0, 1, 0);
  let right = new THREE.Vector3().crossVectors(forward, worldUp);
  if (right.lengthSq() < 1e-6) {
    right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(1, 0, 0));
  }
  right.normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  return {
    viewRight: { x: right.x, y: right.y, z: right.z },
    viewUp: { x: up.x, y: up.y, z: up.z },
  };
}
