import * as THREE from 'three';
import type { Vec3 } from '@/core/math/Vec3';
import type { MeshDocument } from '@/core/mesh/MeshDocument';
import {
  boxSelectByMode,
  isAdditiveSelection,
  makeEdgeKey,
  type ClickSelectionResult,
  type EdgeKey,
  type ScreenRect,
  type SelectionMode,
} from '@/systems/selection/selectionSystem';

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const hit = new THREE.Vector3();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const proj = new THREE.Vector3();

function ndcFromCanvas(
  canvas: HTMLCanvasElement,
  sx: number,
  sy: number,
  out: THREE.Vector2,
): void {
  const rect = canvas.getBoundingClientRect();
  out.x = (sx / rect.width) * 2 - 1;
  out.y = -(sy / rect.height) * 2 + 1;
}

export function vertexToScreen(
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  v: Vec3,
): { x: number; y: number } {
  proj.set(v.x, v.y, v.z);
  proj.project(camera);
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((proj.x + 1) / 2) * rect.width,
    y: ((-proj.y + 1) / 2) * rect.height,
  };
}

export function nearestVertexScreen(
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  mesh: MeshDocument,
  sx: number,
  sy: number,
  visibleVerts: Set<number>,
  threshold = 10,
): number {
  let best = -1;
  let bestD = threshold;
  mesh.vertices.forEach((v, vi) => {
    if (!visibleVerts.has(vi)) return;
    const sc = vertexToScreen(camera, canvas, v);
    const d = Math.hypot(sc.x - sx, sc.y - sy);
    if (d < bestD) {
      bestD = d;
      best = vi;
    }
  });
  return best;
}

function rayTriangleHit(
  ray: THREE.Ray,
  a: Vec3,
  b: Vec3,
  c: Vec3,
): number | null {
  const orig = ray.origin;
  const dir = ray.direction;
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const acx = c.x - a.x;
  const acy = c.y - a.y;
  const acz = c.z - a.z;
  const pvecx = dir.y * acz - dir.z * acy;
  const pvecy = dir.z * acx - dir.x * acz;
  const pvecz = dir.x * acy - dir.y * acx;
  const det = abx * pvecx + aby * pvecy + abz * pvecz;
  if (Math.abs(det) < 1e-10) return null;
  const invDet = 1 / det;
  const tvecx = orig.x - a.x;
  const tvecy = orig.y - a.y;
  const tvecz = orig.z - a.z;
  const u = (tvecx * pvecx + tvecy * pvecy + tvecz * pvecz) * invDet;
  if (u < 0 || u > 1) return null;
  const qvecx = tvecy * abz - tvecz * aby;
  const qvecy = tvecz * abx - tvecx * abz;
  const qvecz = tvecx * aby - tvecy * abx;
  const v = (dir.x * qvecx + dir.y * qvecy + dir.z * qvecz) * invDet;
  if (v < 0 || u + v > 1) return null;
  const t = (acx * qvecx + acy * qvecy + acz * qvecz) * invDet;
  return t > 1e-6 ? t : null;
}

/** Raycast pick — returns front-most visible face under the cursor. */
export function pickFaceMesh3D(
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  mesh: MeshDocument,
  sx: number,
  sy: number,
  visibleFaces: Set<number>,
): number {
  ndcFromCanvas(canvas, sx, sy, ndc);
  raycaster.setFromCamera(ndc, camera);
  let best = -1;
  let bestT = Infinity;
  mesh.faces.forEach((face, fi) => {
    if (!visibleFaces.has(fi) || !face || face.length < 3) return;
    const v0 = mesh.vertices[face[0]];
    for (let i = 1; i < face.length - 1; i++) {
      const t = rayTriangleHit(
        raycaster.ray,
        v0,
        mesh.vertices[face[i]],
        mesh.vertices[face[i + 1]],
      );
      if (t !== null && t < bestT) {
        bestT = t;
        best = fi;
      }
    }
  });
  return best;
}

export function nearestFaceScreen(
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  mesh: MeshDocument,
  sx: number,
  sy: number,
  visibleFaces: Set<number>,
  threshold = 12,
): number {
  const rayHit = pickFaceMesh3D(camera, canvas, mesh, sx, sy, visibleFaces);
  if (rayHit >= 0) return rayHit;

  let best = -1;
  let bestD = threshold;
  mesh.faces.forEach((face, fi) => {
    if (!visibleFaces.has(fi) || !face?.length) return;
    let cx = 0,
      cy = 0,
      cz = 0;
    face.forEach((vi) => {
      const v = mesh.vertices[vi];
      cx += v.x;
      cy += v.y;
      cz += v.z;
    });
    cx /= face.length;
    cy /= face.length;
    cz /= face.length;
    const sc = vertexToScreen(camera, canvas, { x: cx, y: cy, z: cz });
    const d = Math.hypot(sc.x - sx, sc.y - sy);
    if (d < bestD) {
      bestD = d;
      best = fi;
    }
  });
  return best;
}

export function nearestEdgeScreen(
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  mesh: MeshDocument,
  sx: number,
  sy: number,
  visibleVerts: Set<number>,
  visibleFaces: Set<number>,
  threshold = 10,
): EdgeKey | null {
  let best: EdgeKey | null = null;
  let bestD = threshold;
  mesh.faces.forEach((face, fi) => {
    if (!visibleFaces.has(fi) || !face) return;
    face.forEach((vi, index) => {
      const next = face[(index + 1) % face.length];
      if (!visibleVerts.has(vi) || !visibleVerts.has(next)) return;
      const a = mesh.vertices[vi];
      const b = mesh.vertices[next];
      const sa = vertexToScreen(camera, canvas, a);
      const sb = vertexToScreen(camera, canvas, b);
      const mx = (sa.x + sb.x) / 2;
      const my = (sa.y + sb.y) / 2;
      const d = Math.hypot(mx - sx, my - sy);
      if (d < bestD) {
        bestD = d;
        best = makeEdgeKey(vi, next);
      }
    });
  });
  return best;
}

export interface ClickSelection3DInput {
  mesh: MeshDocument;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  sx: number;
  sy: number;
  selectionMode: SelectionMode;
  selVerts: Set<number>;
  selEdges: Set<`${number},${number}`>;
  selFaces: Set<number>;
  shiftKey: boolean;
  ctrlKey?: boolean;
  visibleVerts: Set<number>;
  visibleFaces: Set<number>;
}

export function applyClickSelection3D(input: ClickSelection3DInput): ClickSelectionResult {
  const {
    mesh,
    camera,
    canvas,
    sx,
    sy,
    selectionMode,
    selVerts,
    selEdges,
    selFaces,
    shiftKey,
    ctrlKey = false,
    visibleVerts,
    visibleFaces,
  } = input;
  const additive = isAdditiveSelection(shiftKey, ctrlKey);

  if (selectionMode === 'object') {
    if (mesh.vertices.length || mesh.faces.length) {
      if (!additive) {
        return { selVerts: new Set(visibleVerts), selEdges: new Set(), selFaces: new Set(visibleFaces) };
      }
      return { selVerts: new Set(selVerts), selEdges: new Set(selEdges), selFaces: new Set(selFaces) };
    }
    return { selVerts: new Set(), selEdges: new Set(), selFaces: new Set() };
  }

  if (selectionMode === 'vertex') {
    const vi = nearestVertexScreen(camera, canvas, mesh, sx, sy, visibleVerts);
    if (vi >= 0) {
      const newSel = new Set(selVerts);
      if (additive) {
        if (newSel.has(vi)) newSel.delete(vi);
        else newSel.add(vi);
      } else {
        newSel.clear();
        newSel.add(vi);
      }
      return { selVerts: newSel, selEdges: new Set(), selFaces: new Set() };
    }
    if (!additive) return { selVerts: new Set(), selEdges: new Set(), selFaces: new Set() };
    return { selVerts: new Set(selVerts), selEdges: new Set(selEdges), selFaces: new Set(selFaces) };
  }

  if (selectionMode === 'edge') {
    const edge = nearestEdgeScreen(camera, canvas, mesh, sx, sy, visibleVerts, visibleFaces);
    if (edge) {
      const newSel = new Set(selEdges);
      if (additive) {
        if (newSel.has(edge)) newSel.delete(edge);
        else newSel.add(edge);
      } else {
        newSel.clear();
        newSel.add(edge);
      }
      return { selVerts: new Set(), selEdges: newSel, selFaces: new Set() };
    }
    if (!additive) return { selVerts: new Set(), selEdges: new Set(), selFaces: new Set() };
    return { selVerts: new Set(selVerts), selEdges: new Set(selEdges), selFaces: new Set(selFaces) };
  }

  const fi = nearestFaceScreen(camera, canvas, mesh, sx, sy, visibleFaces);
  if (fi >= 0) {
    const newSel = new Set(selFaces);
    if (additive) {
      if (newSel.has(fi)) newSel.delete(fi);
      else newSel.add(fi);
    } else {
      newSel.clear();
      newSel.add(fi);
    }
    return { selVerts: new Set(), selEdges: new Set(), selFaces: newSel };
  }
  if (!additive) return { selVerts: new Set(), selEdges: new Set(), selFaces: new Set() };
  return { selVerts: new Set(selVerts), selEdges: new Set(selEdges), selFaces: new Set(selFaces) };
}

/** Pick ground plane (Y = 0) for footprint/base drawing */
export function pickGroundPlane(
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  sx: number,
  sy: number,
): Vec3 | null {
  ndcFromCanvas(canvas, sx, sy, ndc);
  raycaster.setFromCamera(ndc, camera);
  const pt = raycaster.ray.intersectPlane(groundPlane, hit);
  if (!pt) return null;
  return { x: pt.x, y: 0, z: pt.z };
}

/** Pick vertical plane for height/extent drawing */
export function pickVerticalPlane(
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  sx: number,
  sy: number,
  origin: Vec3,
): Vec3 | null {
  const cam = camera.position;
  const viewH = new THREE.Vector3(cam.x - origin.x, 0, cam.z - origin.z);
  if (viewH.lengthSq() < 1e-6) viewH.set(1, 0, 0);
  viewH.normalize();

  const plane = new THREE.Plane();
  plane.setFromNormalAndCoplanarPoint(viewH, new THREE.Vector3(origin.x, origin.y, origin.z));

  ndcFromCanvas(canvas, sx, sy, ndc);
  raycaster.setFromCamera(ndc, camera);
  const pt = raycaster.ray.intersectPlane(plane, hit);
  if (!pt) return null;
  return { x: pt.x, y: pt.y, z: pt.z };
}

export function snapVec3(v: Vec3, snap: (n: number) => number): Vec3 {
  return { x: snap(v.x), y: snap(v.y), z: snap(v.z) };
}

/** Raycast to a plane facing the camera through `through` (for move / select drag). */
export function pickViewPlane(
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  sx: number,
  sy: number,
  through: Vec3,
): Vec3 | null {
  const normal = new THREE.Vector3();
  camera.getWorldDirection(normal);
  const plane = new THREE.Plane();
  plane.setFromNormalAndCoplanarPoint(
    normal,
    new THREE.Vector3(through.x, through.y, through.z),
  );
  ndcFromCanvas(canvas, sx, sy, ndc);
  raycaster.setFromCamera(ndc, camera);
  const pt = raycaster.ray.intersectPlane(plane, hit);
  if (!pt) return null;
  return { x: pt.x, y: pt.y, z: pt.z };
}

export type { ScreenRect } from '@/systems/selection/selectionSystem';

/** Box-select in screen space (same rules as 2D orthographic views). */
export function boxSelect3D(input: {
  mesh: MeshDocument;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  rect: ScreenRect;
  selectionMode: SelectionMode;
  selVerts: Set<number>;
  selEdges: Set<EdgeKey>;
  selFaces: Set<number>;
  shiftKey: boolean;
  ctrlKey?: boolean;
  visibleVerts: Set<number>;
  visibleFaces: Set<number>;
}): ClickSelectionResult {
  const { mesh, camera, canvas, rect, ...rest } = input;
  return boxSelectByMode({
    mesh,
    rect,
    ...rest,
    projectVertex: (vi) => vertexToScreen(camera, canvas, mesh.vertices[vi]),
  });
}