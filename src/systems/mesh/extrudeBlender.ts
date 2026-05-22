import * as THREE from 'three';
import type { MeshDocument } from '@/core/mesh/MeshDocument';
import type { Vec3 } from '@/core/math/Vec3';
import { pickViewPlane } from '@/systems/viewport/pick3D';
import { VIEW2D_DEFS, s2w, type View2DKey } from '@/core/math/projection';

function faceNormal(doc: MeshDocument, fi: number): THREE.Vector3 {
  const f = doc.faces[fi];
  const n = new THREE.Vector3();
  if (!f || f.length < 3) return n.set(0, 1, 0);
  const v0 = new THREE.Vector3(
    doc.vertices[f[0]].x,
    doc.vertices[f[0]].y,
    doc.vertices[f[0]].z,
  );
  for (let i = 1; i < f.length - 1; i++) {
    const v1 = new THREE.Vector3(
      doc.vertices[f[i]].x,
      doc.vertices[f[i]].y,
      doc.vertices[f[i]].z,
    );
    const v2 = new THREE.Vector3(
      doc.vertices[f[i + 1]].x,
      doc.vertices[f[i + 1]].y,
      doc.vertices[f[i + 1]].z,
    );
    n.add(new THREE.Vector3().crossVectors(v1.clone().sub(v0), v2.clone().sub(v0)));
  }
  return n.lengthSq() > 1e-12 ? n.normalize() : n.set(0, 1, 0);
}

function faceCentroid(doc: MeshDocument, fi: number): THREE.Vector3 {
  const f = doc.faces[fi];
  if (!f?.length) return new THREE.Vector3();
  const c = new THREE.Vector3();
  f.forEach((vi) => {
    const v = doc.vertices[vi];
    c.x += v.x;
    c.y += v.y;
    c.z += v.z;
  });
  return c.multiplyScalar(1 / f.length);
}

/** Blender-style region extrude: duplicate top verts in place, add side walls; drag moves top ring. */
export interface ExtrudeSession {
  topVerts: number[];
  origins: Map<number, Vec3>;
  normal: THREE.Vector3;
  pivot: THREE.Vector3;
}

export function prepareExtrude(
  doc: MeshDocument,
  selFaces: Set<number>,
  groupIndex: number,
): ExtrudeSession | null {
  if (selFaces.size === 0) return null;

  const topVerts: number[] = [];
  const origins = new Map<number, Vec3>();
  const normalSum = new THREE.Vector3();
  const pivot = new THREE.Vector3();
  let pivotCount = 0;

  selFaces.forEach((fi) => {
    const f = doc.faces[fi];
    if (!f || f.length < 3) return;
    const n = faceNormal(doc, fi);
    normalSum.add(n);
    const c = faceCentroid(doc, fi);
    pivot.add(c);
    pivotCount++;

    const topRing: number[] = [];
    f.forEach((vi) => {
      const v = doc.vertices[vi];
      const ni = doc.vertices.length;
      doc.vertices.push({ x: v.x, y: v.y, z: v.z });
      doc.vertexLayers.push(doc.vertexLayers[vi] ?? doc.activeLayerId);
      origins.set(ni, { x: v.x, y: v.y, z: v.z });
      topRing.push(ni);
      topVerts.push(ni);
    });

    for (let i = 0; i < f.length; i++) {
      const side = [f[i], f[(i + 1) % f.length], topRing[(i + 1) % topRing.length], topRing[i]];
      doc.groups[groupIndex].faces.push(doc.faces.length);
      doc.faces.push(side);
      doc.faceLayers.push(doc.faceLayers[fi] ?? doc.activeLayerId);
    }
    doc.faces[fi] = topRing;
  });

  if (topVerts.length === 0) return null;

  const normal =
    normalSum.lengthSq() > 1e-12 ? normalSum.normalize() : new THREE.Vector3(0, 1, 0);
  if (pivotCount > 0) pivot.multiplyScalar(1 / pivotCount);

  return { topVerts, origins, normal, pivot };
}

export function applyExtrudeDistance(doc: MeshDocument, session: ExtrudeSession, distance: number): void {
  const offset = session.normal.clone().multiplyScalar(distance);
  session.topVerts.forEach((vi) => {
    const o = session.origins.get(vi);
    if (!o) return;
    doc.vertices[vi].x = o.x + offset.x;
    doc.vertices[vi].y = o.y + offset.y;
    doc.vertices[vi].z = o.z + offset.z;
  });
}

export function screenDragAlongAxis3D(
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  pivot: THREE.Vector3,
  axis: THREE.Vector3,
  from: { x: number; y: number },
  to: { x: number; y: number },
): number {
  const p0 = pickViewPlane(camera, canvas, from.x, from.y, {
    x: pivot.x,
    y: pivot.y,
    z: pivot.z,
  });
  const p1 = pickViewPlane(camera, canvas, to.x, to.y, {
    x: pivot.x,
    y: pivot.y,
    z: pivot.z,
  });
  if (!p0 || !p1) return 0;
  const delta = new THREE.Vector3(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z);
  return delta.dot(axis);
}

export function screenDragAlongAxis2D(
  vpKey: View2DKey,
  axis: THREE.Vector3,
  pan: { x: number; y: number },
  zoom: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
): number {
  const vd = VIEW2D_DEFS[vpKey];
  const w0 = s2w(from.x, from.y, pan, zoom);
  const w1 = s2w(to.x, to.y, pan, zoom);
  const d1 = vd.unproj(w1.x - w0.x, w1.y - w0.y);
  const delta = new THREE.Vector3(d1.x, d1.y, d1.z);
  return delta.dot(axis);
}
