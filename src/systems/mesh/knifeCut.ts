import type { Vec3 } from '@/core/math/Vec3';
import type { MeshDocument } from '@/core/mesh/MeshDocument';

export type KnifeProject = (v: Vec3) => { x: number; y: number };

const EPS = 1e-7;
const MIN_FACE_AREA = 1e-10;

function edgeKey(a: number, b: number): string {
  return `${Math.min(a, b)},${Math.max(a, b)}`;
}

function cross2d(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

function sideOfCut(
  p: { x: number; y: number },
  cutA: { x: number; y: number },
  cutB: { x: number; y: number },
): number {
  const c = cross2d(cutB.x - cutA.x, cutB.y - cutA.y, p.x - cutA.x, p.y - cutA.y);
  if (Math.abs(c) < EPS) return 0;
  return c > 0 ? 1 : -1;
}

/** Segment-segment intersection; returns param t on segment ab. */
function segIntersect2D(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): { t: number; u: number } | null {
  const rdx = bx - ax;
  const rdy = by - ay;
  const sdx = dx - cx;
  const sdy = dy - cy;
  const denom = rdx * sdy - rdy * sdx;
  if (Math.abs(denom) < EPS) return null;
  const t = ((cx - ax) * sdy - (cy - ay) * sdx) / denom;
  const u = ((cx - ax) * rdy - (cy - ay) * rdx) / denom;
  if (t <= EPS || t >= 1 - EPS || u <= EPS || u >= 1 - EPS) return null;
  return { t, u };
}

function dedupeConsecutive(face: number[]): number[] {
  if (face.length === 0) return face;
  const out: number[] = [face[0]];
  for (let i = 1; i < face.length; i++) {
    if (face[i] !== out[out.length - 1]) out.push(face[i]);
  }
  if (out.length > 1 && out[0] === out[out.length - 1]) out.pop();
  return out;
}

function expandFaceWithSplits(face: number[], edgeSplitMap: Map<string, number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < face.length; i++) {
    const a = face[i];
    const b = face[(i + 1) % face.length];
    out.push(a);
    const split = edgeSplitMap.get(edgeKey(a, b));
    if (split !== undefined) out.push(split);
  }
  return dedupeConsecutive(out);
}

function splitVertexOnEdge(
  curr: number,
  next: number,
  edgeSplitMap: Map<string, number>,
): number | undefined {
  const direct = edgeSplitMap.get(edgeKey(curr, next));
  if (direct !== undefined) return direct;
  for (const [key, splitIdx] of edgeSplitMap) {
    if (splitIdx !== next) continue;
    const [a, b] = key.split(',').map(Number);
    if (a === curr || b === curr) return splitIdx;
  }
  return undefined;
}

/** Clip a polygon ring to one side of the cut line, preserving boundary order. */
function clipPolygonToHalfPlane(
  verts: number[],
  doc: MeshDocument,
  cutA: { x: number; y: number },
  cutB: { x: number; y: number },
  project: KnifeProject,
  edgeSplitMap: Map<string, number>,
  keepPositive: boolean,
): number[] {
  if (verts.length < 3) return [];

  const inside = (side: number) => (keepPositive ? side >= -EPS : side <= EPS);
  const output: number[] = [];

  for (let i = 0; i < verts.length; i++) {
    const curr = verts[i];
    const next = verts[(i + 1) % verts.length];
    const sc = sideOfCut(project(doc.vertices[curr]), cutA, cutB);
    const sn = sideOfCut(project(doc.vertices[next]), cutA, cutB);
    const currIn = inside(sc);
    const nextIn = inside(sn);

    if (currIn) output.push(curr);

    if (currIn !== nextIn) {
      const boundary = splitVertexOnEdge(curr, next, edgeSplitMap);
      if (boundary !== undefined && !output.includes(boundary)) {
        output.push(boundary);
      }
    }
  }

  return dedupeConsecutive(output);
}

function polygonArea3D(doc: MeshDocument, face: number[]): number {
  if (face.length < 3) return 0;
  let area = 0;
  const o = doc.vertices[face[0]];
  for (let i = 1; i < face.length - 1; i++) {
    const a = doc.vertices[face[i]];
    const b = doc.vertices[face[i + 1]];
    const abx = a.x - o.x;
    const aby = a.y - o.y;
    const abz = a.z - o.z;
    const acx = b.x - o.x;
    const acy = b.y - o.y;
    const acz = b.z - o.z;
    const cx = aby * acz - abz * acy;
    const cy = abz * acx - abx * acz;
    const cz = abx * acy - aby * acx;
    area += Math.hypot(cx, cy, cz);
  }
  return area * 0.5;
}

function splitFaceByCut(
  verts: number[],
  doc: MeshDocument,
  cutA: { x: number; y: number },
  cutB: { x: number; y: number },
  project: KnifeProject,
  edgeSplitMap: Map<string, number>,
): number[][] {
  if (verts.length < 3) return verts.length ? [verts] : [];

  const sides = verts.map((vi) => sideOfCut(project(doc.vertices[vi]), cutA, cutB));
  const hasStrictPos = sides.some((s) => s > EPS);
  const hasStrictNeg = sides.some((s) => s < -EPS);
  if (!hasStrictPos || !hasStrictNeg) return [verts];

  const polyA = clipPolygonToHalfPlane(verts, doc, cutA, cutB, project, edgeSplitMap, true);
  const polyB = clipPolygonToHalfPlane(verts, doc, cutA, cutB, project, edgeSplitMap, false);

  return [polyA, polyB].filter((p) => p.length >= 3 && polygonArea3D(doc, p) > MIN_FACE_AREA);
}

/**
 * Cut the active mesh along a view-aligned line (infinite cut extruded through depth).
 * Returns true if topology changed.
 */
export function knifeCut(
  doc: MeshDocument,
  p0: Vec3,
  p1: Vec3,
  project: KnifeProject,
  faceFilter?: Set<number>,
): boolean {
  const cutA = project(p0);
  const cutB = project(p1);
  if (Math.hypot(cutB.x - cutA.x, cutB.y - cutA.y) < EPS) return false;

  const onlySelected = faceFilter !== undefined && faceFilter.size > 0;
  const edgeSplitMap = new Map<string, number>();

  const insertSplit = (a: number, b: number, t: number): number => {
    const key = edgeKey(a, b);
    const existing = edgeSplitMap.get(key);
    if (existing !== undefined) return existing;
    const va = doc.vertices[a];
    const vb = doc.vertices[b];
    const idx = doc.vertices.length;
    doc.vertices.push({
      x: va.x + (vb.x - va.x) * t,
      y: va.y + (vb.y - va.y) * t,
      z: va.z + (vb.z - va.z) * t,
    });
    doc.vertexLayers.push(doc.vertexLayers[a] ?? doc.vertexLayers[b] ?? doc.activeLayerId);
    edgeSplitMap.set(key, idx);
    return idx;
  };

  doc.faces.forEach((face, fi) => {
    if (!face || face.length < 2) return;
    if (onlySelected && !faceFilter!.has(fi)) return;
    for (let i = 0; i < face.length; i++) {
      const a = face[i];
      const b = face[(i + 1) % face.length];
      const pa = project(doc.vertices[a]);
      const pb = project(doc.vertices[b]);
      const hit = segIntersect2D(cutA.x, cutA.y, cutB.x, cutB.y, pa.x, pa.y, pb.x, pb.y);
      if (hit) insertSplit(a, b, hit.t);
    }
  });

  if (edgeSplitMap.size === 0) return false;

  const newFaces: number[][] = [];
  const newFaceLayers: string[] = [];
  const faceRemap: number[][] = [];

  doc.faces.forEach((face, fi) => {
    if (!face || face.length < 3) {
      faceRemap[fi] = [];
      return;
    }
    if (onlySelected && !faceFilter!.has(fi)) {
      faceRemap[fi] = [newFaces.length];
      newFaces.push([...face]);
      newFaceLayers.push(doc.faceLayers[fi] ?? doc.activeLayerId);
      return;
    }
    const expanded = expandFaceWithSplits(face, edgeSplitMap);
    const parts = splitFaceByCut(expanded, doc, cutA, cutB, project, edgeSplitMap);
    faceRemap[fi] = [];
    if (parts.length === 0) {
      faceRemap[fi] = [newFaces.length];
      newFaces.push(expanded.length >= 3 ? expanded : [...face]);
      newFaceLayers.push(doc.faceLayers[fi] ?? doc.activeLayerId);
      return;
    }
    parts.forEach((part) => {
      if (part.length < 3 || polygonArea3D(doc, part) <= MIN_FACE_AREA) return;
      faceRemap[fi].push(newFaces.length);
      newFaces.push(part);
      newFaceLayers.push(doc.faceLayers[fi] ?? doc.activeLayerId);
    });
    if (faceRemap[fi].length === 0) {
      faceRemap[fi] = [newFaces.length];
      newFaces.push(expanded.length >= 3 ? expanded : [...face]);
      newFaceLayers.push(doc.faceLayers[fi] ?? doc.activeLayerId);
    }
  });

  if (newFaces.length === 0) return false;

  doc.faces = newFaces;
  doc.faceLayers = newFaceLayers;
  doc.groups.forEach((g) => {
    g.faces = g.faces.flatMap((fi) => faceRemap[fi] ?? []);
  });

  return true;
}
