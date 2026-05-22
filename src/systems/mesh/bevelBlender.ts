import * as THREE from 'three';
import type { MeshDocument } from '@/core/mesh/MeshDocument';
import { parseEdgeKey, type EdgeKey } from '@/systems/selection/selectionSystem';

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
  const c = new THREE.Vector3();
  if (!f?.length) return c;
  f.forEach((vi) => {
    const v = doc.vertices[vi];
    c.x += v.x;
    c.y += v.y;
    c.z += v.z;
  });
  return c.multiplyScalar(1 / f.length);
}

function vertVec(doc: MeshDocument, vi: number): THREE.Vector3 {
  const v = doc.vertices[vi];
  return new THREE.Vector3(v.x, v.y, v.z);
}

/** In-face direction pointing toward face interior at vertex `at` on edge toward `toward`. */
function inwardOffsetDir(
  doc: MeshDocument,
  fi: number,
  at: number,
  toward: number,
): THREE.Vector3 {
  const n = faceNormal(doc, fi);
  const a = vertVec(doc, at);
  const b = vertVec(doc, toward);
  const edge = b.clone().sub(a);
  if (edge.lengthSq() < 1e-12) return new THREE.Vector3();
  edge.normalize();
  let perp = new THREE.Vector3().crossVectors(n, edge);
  if (perp.lengthSq() < 1e-12) return new THREE.Vector3();
  perp.normalize();
  const center = faceCentroid(doc, fi);
  if (perp.dot(center.clone().sub(a)) < 0) perp.negate();
  return perp;
}

function addVertex(doc: MeshDocument, pos: THREE.Vector3, layerFrom: number): number {
  const vi = doc.vertices.length;
  doc.vertices.push({ x: pos.x, y: pos.y, z: pos.z });
  doc.vertexLayers.push(doc.vertexLayers[layerFrom] ?? doc.activeLayerId);
  return vi;
}

interface EdgeFaceUse {
  fi: number;
  iA: number;
  iB: number;
  a: number;
  b: number;
}

function collectEdgeFaces(doc: MeshDocument, a: number, b: number): EdgeFaceUse[] {
  const uses: EdgeFaceUse[] = [];
  doc.faces.forEach((f, fi) => {
    if (!f) return;
    for (let i = 0; i < f.length; i++) {
      const v0 = f[i];
      const v1 = f[(i + 1) % f.length];
      if (v0 === a && v1 === b) uses.push({ fi, iA: i, iB: (i + 1) % f.length, a, b });
      else if (v0 === b && v1 === a) uses.push({ fi, iA: i, iB: (i + 1) % f.length, a: b, b: a });
    }
  });
  return uses;
}

function maxBevelWidth(doc: MeshDocument, a: number, b: number): number {
  const pa = vertVec(doc, a);
  const pb = vertVec(doc, b);
  return pa.distanceTo(pb) * 0.48;
}

/**
 * Blender-style edge bevel: offset edge endpoints in each adjacent face plane and stitch chamfers.
 */
export function bevelEdgesBlender(
  doc: MeshDocument,
  selEdges: Set<EdgeKey>,
  width: number,
  groupIndex = 0,
): void {
  if (selEdges.size === 0 || width <= 1e-6) return;

  type CornerKey = `${number}|${number}|${number}`;
  const cornerVert = new Map<CornerKey, number>();

  const getCorner = (fi: number, corner: number, toward: number, w: number): number => {
    const key = `${fi}|${corner}|${toward}` as CornerKey;
    const existing = cornerVert.get(key);
    if (existing !== undefined) return existing;
    const dir = inwardOffsetDir(doc, fi, corner, toward);
    const pos = vertVec(doc, corner).add(dir.multiplyScalar(w));
    const vi = addVertex(doc, pos, corner);
    cornerVert.set(key, vi);
    return vi;
  };

  const facePatches: { fi: number; insertAfter: number; sequence: number[] }[] = [];
  const chamfers: number[][] = [];

  selEdges.forEach((edgeKey) => {
    const [lo, hi] = parseEdgeKey(edgeKey);
    const w = Math.min(width, maxBevelWidth(doc, lo, hi));
    if (w <= 1e-6) return;

    const uses = collectEdgeFaces(doc, lo, hi);
    if (uses.length === 0) return;

    const cornerOnFace = new Map<number, { atLo: number; atHi: number }>();

    uses.forEach((use) => {
      const va = getCorner(use.fi, use.a, use.b, w);
      const vb = getCorner(use.fi, use.b, use.a, w);
      facePatches.push({ fi: use.fi, insertAfter: use.iA, sequence: [use.a, va, vb, use.b] });
      const entry = cornerOnFace.get(use.fi) ?? { atLo: -1, atHi: -1 };
      if (use.a === lo) entry.atLo = va;
      else if (use.a === hi) entry.atHi = va;
      if (use.b === lo) entry.atLo = vb;
      else if (use.b === hi) entry.atHi = vb;
      cornerOnFace.set(use.fi, entry);
    });

    if (uses.length === 2) {
      const e0 = cornerOnFace.get(uses[0].fi);
      const e1 = cornerOnFace.get(uses[1].fi);
      if (e0 && e1 && e0.atLo >= 0 && e0.atHi >= 0 && e1.atLo >= 0 && e1.atHi >= 0) {
        chamfers.push([e0.atLo, e0.atHi, e1.atHi, e1.atLo]);
      }
    }
  });

  const byFace = new Map<number, { insertAfter: number; sequence: number[] }[]>();
  facePatches.forEach((p) => {
    const list = byFace.get(p.fi) ?? [];
    list.push(p);
    byFace.set(p.fi, list);
  });

  byFace.forEach((list, fi) => {
    const f = doc.faces[fi];
    if (!f) return;
    list.sort((a, b) => b.insertAfter - a.insertAfter);
    list.forEach(({ insertAfter, sequence }) => {
      f.splice(insertAfter, 2, ...sequence);
    });
  });

  chamfers.forEach((quad) => {
    const fi = doc.faces.length;
    doc.faces.push(quad);
    doc.faceLayers.push(doc.activeLayerId);
    doc.groups[groupIndex]?.faces.push(fi);
  });
}
