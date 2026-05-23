import type { MeshDocument } from '@/core/mesh/MeshDocument';
import type { Vec3 } from '@/core/math/Vec3';
import type { EditorSnapshot } from '@/core/commands/Command';

export type MirrorAxis = 'x' | 'y' | 'z';

export type MirrorPreviewState = {
  axis: MirrorAxis;
  beforeSnapshot: EditorSnapshot;
  offset: number;
  /** Face indices mirrored (fixed at preview start). */
  sourceFaceIndices: number[];
};

function mirrorPoint(v: Vec3, axis: MirrorAxis, pivot: Vec3): Vec3 {
  const out = { x: v.x, y: v.y, z: v.z };
  if (axis === 'x') out.x = pivot.x * 2 - v.x;
  if (axis === 'y') out.y = pivot.y * 2 - v.y;
  if (axis === 'z') out.z = pivot.z * 2 - v.z;
  return out;
}

function offsetMirroredVerts(doc: MeshDocument, vertIndices: Iterable<number>, axis: MirrorAxis, offset: number): void {
  if (Math.abs(offset) < 1e-8) return;
  for (const vi of vertIndices) {
    if (axis === 'x') doc.vertices[vi].x += offset;
    if (axis === 'y') doc.vertices[vi].y += offset;
    if (axis === 'z') doc.vertices[vi].z += offset;
  }
}

export function resolveMirrorSourceFaces(doc: MeshDocument, selFaces: Set<number>): number[] {
  if (selFaces.size > 0) {
    return [...selFaces].filter((fi) => doc.faces[fi] && doc.faces[fi]!.length >= 3);
  }
  return doc.faces.map((f, fi) => (f && f.length >= 3 ? fi : -1)).filter((fi) => fi >= 0);
}

/** Add a mirrored copy; optional gap offset along the mirror axis. Returns new face indices. */
export function mirrorGeometry(
  doc: MeshDocument,
  sourceFaceIndices: number[],
  axis: MirrorAxis,
  groupIndex: number,
  offset = 0,
): number[] {
  if (sourceFaceIndices.length === 0) return [];

  const vertsUsed = new Set<number>();
  sourceFaceIndices.forEach((fi) => doc.faces[fi]?.forEach((vi) => vertsUsed.add(vi)));

  let px = 0;
  let py = 0;
  let pz = 0;
  vertsUsed.forEach((vi) => {
    const v = doc.vertices[vi];
    px += v.x;
    py += v.y;
    pz += v.z;
  });
  const n = vertsUsed.size;
  const pivot = { x: px / n, y: py / n, z: pz / n };

  const vertMap = new Map<number, number>();
  vertsUsed.forEach((vi) => {
    const idx = doc.vertices.length;
    doc.vertices.push(mirrorPoint(doc.vertices[vi], axis, pivot));
    doc.vertexLayers.push(doc.vertexLayers[vi] ?? doc.activeLayerId);
    vertMap.set(vi, idx);
  });

  const newVertIndices = [...vertMap.values()];
  offsetMirroredVerts(doc, newVertIndices, axis, offset);

  const created: number[] = [];
  sourceFaceIndices.forEach((fi) => {
    const face = doc.faces[fi];
    if (!face) return;
    const mirrored = [...face].reverse().map((vi) => vertMap.get(vi)!);
    const nfi = doc.faces.length;
    doc.faces.push(mirrored);
    doc.faceLayers.push(doc.faceLayers[fi] ?? doc.activeLayerId);
    const group = doc.groups[groupIndex];
    if (group) group.faces.push(nfi);
    created.push(nfi);
  });

  return created;
}

export function mirrorOffsetFromDrag(dy: number, startOffset: number): number {
  return startOffset - dy * 0.15;
}
