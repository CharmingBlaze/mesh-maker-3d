import type { Vec3 } from '@/core/math/Vec3';
import type { MeshDocument } from '@/core/mesh/MeshDocument';

export function meshEdgeKey(a: number, b: number): string {
  return a < b ? `${a},${b}` : `${b},${a}`;
}

export function sameMeshEdge(a: readonly [number, number], b: readonly [number, number]): boolean {
  return meshEdgeKey(a[0], a[1]) === meshEdgeKey(b[0], b[1]);
}

export function computeFaceNormal(mesh: MeshDocument, face: number[]): Vec3 {
  if (face.length < 3) return { x: 0, y: 1, z: 0 };
  const a = mesh.vertices[face[0]];
  const b = mesh.vertices[face[1]];
  const c = mesh.vertices[face[2]];
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const acx = c.x - a.x;
  const acy = c.y - a.y;
  const acz = c.z - a.z;
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return { x: nx / len, y: ny / len, z: nz / len };
}

export function computeFaceCenter(mesh: MeshDocument, face: number[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  face.forEach((vi) => {
    x += mesh.vertices[vi].x;
    y += mesh.vertices[vi].y;
    z += mesh.vertices[vi].z;
  });
  const n = face.length || 1;
  return { x: x / n, y: y / n, z: z / n };
}

export interface FaceFrame {
  origin: Vec3;
  normal: Vec3;
  project(v: Vec3): { x: number; y: number };
  projectIndex(mesh: MeshDocument, vi: number): { x: number; y: number };
}

export function buildFaceFrame(mesh: MeshDocument, face: number[]): FaceFrame {
  const origin = mesh.vertices[face[0]];
  const normal = computeFaceNormal(mesh, face);
  let ux = 1;
  let uy = 0;
  let uz = 0;
  if (Math.abs(normal.y) > 0.9) {
    ux = 0;
    uy = 0;
    uz = 1;
  }
  let rx = uy * normal.z - uz * normal.y;
  let ry = uz * normal.x - ux * normal.z;
  let rz = ux * normal.y - uy * normal.x;
  let rlen = Math.hypot(rx, ry, rz) || 1;
  rx /= rlen;
  ry /= rlen;
  rz /= rlen;
  const tx = normal.y * rz - normal.z * ry;
  const ty = normal.z * rx - normal.x * rz;
  const tz = normal.x * ry - normal.y * rx;

  const project = (v: Vec3) => ({
    x: (v.x - origin.x) * rx + (v.y - origin.y) * ry + (v.z - origin.z) * rz,
    y: (v.x - origin.x) * tx + (v.y - origin.y) * ty + (v.z - origin.z) * tz,
  });

  return {
    origin,
    normal,
    project,
    projectIndex: (doc, vi) => project(doc.vertices[vi]),
  };
}

export function faceEdges(vertices: number[]): [number, number][] {
  const edges: [number, number][] = [];
  for (let i = 0; i < vertices.length; i++) {
    edges.push([vertices[i], vertices[(i + 1) % vertices.length]]);
  }
  return edges;
}

export function pointInTriangle2D(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): boolean {
  const d1 = (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
  const d2 = (p.x - c.x) * (b.y - c.y) - (b.x - c.x) * (p.y - c.y);
  const d3 = (p.x - a.x) * (c.y - a.y) - (c.x - a.x) * (p.y - a.y);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

export function segmentsCross2D(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number },
): boolean {
  const s1x = a2.x - a1.x;
  const s1y = a2.y - a1.y;
  const s2x = b2.x - b1.x;
  const s2y = b2.y - b1.y;
  const denom = s1x * s2y - s1y * s2x;
  if (Math.abs(denom) < 1e-10) return false;
  const t = ((b1.x - a1.x) * s2y - (b1.y - a1.y) * s2x) / denom;
  const u = ((b1.x - a1.x) * s1y - (b1.y - a1.y) * s1x) / denom;
  return t > 1e-5 && t < 1 - 1e-5 && u > 1e-5 && u < 1 - 1e-5;
}

export function lineIntersectsTriangle2D(
  l1: { x: number; y: number },
  l2: { x: number; y: number },
  v1: { x: number; y: number },
  v2: { x: number; y: number },
  v3: { x: number; y: number },
): boolean {
  if (Math.hypot(l1.x - l2.x, l1.y - l2.y) < 1e-10) return false;
  const onEdge = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) < 1e-6;
  if (
    (onEdge(l1, v1, v2) && onEdge(l2, v1, v2)) ||
    (onEdge(l1, v2, v3) && onEdge(l2, v2, v3)) ||
    (onEdge(l1, v3, v1) && onEdge(l2, v3, v1))
  ) {
    return false;
  }
  const mid = { x: (l1.x + l2.x) / 2, y: (l1.y + l2.y) / 2 };
  return (
    segmentsCross2D(l1, l2, v1, v2) ||
    segmentsCross2D(l1, l2, v2, v3) ||
    segmentsCross2D(l1, l2, v3, v1) ||
    pointInTriangle2D(mid, v1, v2, v3)
  );
}

export function isConcaveQuad(mesh: MeshDocument, frame: FaceFrame, verts: number[]): boolean {
  if (verts.length !== 4) return false;
  const pts = verts.map((vi) => frame.projectIndex(mesh, vi));
  for (let i = 0; i < 4; i++) {
    const others = pts.filter((_, j) => j !== i);
    if (pointInTriangle2D(pts[i], others[0], others[1], others[2])) return true;
  }
  return false;
}

export function cornerAngleDeg(mesh: MeshDocument, verts: number[], index: number): number {
  const a = verts[index === 0 ? verts.length - 1 : index - 1];
  const b = verts[index];
  const c = verts[(index + 1) % verts.length];
  const va = mesh.vertices[a];
  const vb = mesh.vertices[b];
  const vc = mesh.vertices[c];
  const abx = va.x - vb.x;
  const aby = va.y - vb.y;
  const abz = va.z - vb.z;
  const cbx = vc.x - vb.x;
  const cby = vc.y - vb.y;
  const cbz = vc.z - vb.z;
  const dot = abx * cbx + aby * cby + abz * cbz;
  const la = Math.hypot(abx, aby, abz);
  const lc = Math.hypot(cbx, cby, cbz);
  if (la < 1e-10 || lc < 1e-10) return 0;
  const cos = Math.max(-1, Math.min(1, dot / (la * lc)));
  return (Math.acos(cos) * 180) / Math.PI;
}

export function facesAngleDiffDeg(mesh: MeshDocument, normalA: Vec3, faceVerts: number[]): number {
  const normalB = computeFaceNormal(mesh, faceVerts);
  const dot = normalA.x * normalB.x + normalA.y * normalB.y + normalA.z * normalB.z;
  return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
}

export function ensureFaceWinding(
  mesh: MeshDocument,
  referenceNormal: Vec3,
  verts: number[],
): number[] {
  if (facesAngleDiffDeg(mesh, referenceNormal, verts) > 90) {
    return [...verts].reverse();
  }
  return verts;
}
