import type { MeshDocument } from '@/core/mesh/MeshDocument';
import type { Vec3 } from '@/core/math/Vec3';
import { parseEdgeKey, type EdgeKey } from '@/systems/selection/selectionSystem';

function addVec(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scaleVec(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function normalizeVec(v: Vec3): Vec3 | null {
  const len = Math.hypot(v.x, v.y, v.z);
  if (len < 1e-8) return null;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function slideDirectionsForVertex(
  doc: MeshDocument,
  vi: number,
  edgePartner: number,
): Vec3[] {
  const dirs: Vec3[] = [];
  doc.faces.forEach((face) => {
    if (!face || face.length < 3) return;
    const idx = face.indexOf(vi);
    if (idx < 0) return;
    const prev = face[(idx + face.length - 1) % face.length];
    const next = face[(idx + 1) % face.length];
    const v = doc.vertices[vi];

    if (next === edgePartner && prev !== edgePartner) {
      const p = doc.vertices[prev];
      const dir = normalizeVec({ x: v.x - p.x, y: v.y - p.y, z: v.z - p.z });
      if (dir) dirs.push(dir);
    }
    if (prev === edgePartner && next !== edgePartner) {
      const n = doc.vertices[next];
      const dir = normalizeVec({ x: v.x - n.x, y: v.y - n.y, z: v.z - n.z });
      if (dir) dirs.push(dir);
    }
  });
  return dirs;
}

function averageDirection(dirs: Vec3[]): Vec3 | null {
  if (dirs.length === 0) return null;
  let sum = { x: 0, y: 0, z: 0 };
  dirs.forEach((d) => {
    sum = addVec(sum, d);
  });
  return normalizeVec(scaleVec(sum, 1 / dirs.length));
}

/** Slide selected edge vertices along adjacent face edges. Amount in world units. */
export function edgeSlide(doc: MeshDocument, selEdges: Set<EdgeKey>, amount: number): void {
  if (selEdges.size === 0 || Math.abs(amount) < 1e-8) return;

  const moved = new Map<number, Vec3>();

  selEdges.forEach((edge) => {
    const [a, b] = parseEdgeKey(edge);
    for (const [vi, partner] of [
      [a, b],
      [b, a],
    ] as const) {
      const dirs = slideDirectionsForVertex(doc, vi, partner);
      const dir = averageDirection(dirs);
      if (!dir) continue;
      const base = moved.get(vi) ?? doc.vertices[vi];
      moved.set(vi, addVec(base, scaleVec(dir, amount)));
    }
  });

  moved.forEach((pos, vi) => {
    doc.vertices[vi] = pos;
  });
}

export function edgeSlideAmountFromDrag(dy: number, startAmount: number): number {
  return startAmount - dy * 0.08;
}

export type EdgeSlidePreviewState = {
  edges: EdgeKey[];
  beforeSnapshot: import('@/core/commands/Command').EditorSnapshot;
  amount: number;
};
