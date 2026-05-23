import type { MeshDocument } from '@/core/mesh/MeshDocument';
import { facesContainingEdge } from '@/systems/selection/edgeLoopRing';
import { parseEdgeKey, type EdgeKey } from '@/systems/selection/selectionSystem';

function findDirectedEdgeIndex(face: number[], from: number, to: number): number {
  for (let i = 0; i < face.length; i++) {
    if (face[i] === from && face[(i + 1) % face.length] === to) return i;
  }
  return -1;
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

function mergeFacesAtEdge(f0: number[], f1: number[], a: number, b: number): number[] | null {
  const i0 = findDirectedEdgeIndex(f0, a, b);
  const i1 = findDirectedEdgeIndex(f1, b, a);
  if (i0 < 0 || i1 < 0) return null;

  const merged: number[] = [];
  let vi = (i0 + 2) % f0.length;
  while (vi !== i0) {
    merged.push(f0[vi]);
    vi = (vi + 1) % f0.length;
  }
  vi = (i1 + 2) % f1.length;
  while (vi !== i1) {
    merged.push(f1[vi]);
    vi = (vi + 1) % f1.length;
  }

  const clean = dedupeConsecutive(merged);
  return clean.length >= 3 ? clean : null;
}

function compactFaces(doc: MeshDocument): void {
  const newFaces: number[][] = [];
  const newFaceLayers: string[] = [];
  const remap: Record<number, number> = {};

  doc.faces.forEach((face, fi) => {
    if (!face || face.length < 3) return;
    const clean = dedupeConsecutive(face);
    if (clean.length < 3) return;
    remap[fi] = newFaces.length;
    newFaces.push(clean);
    newFaceLayers.push(doc.faceLayers[fi] ?? doc.activeLayerId);
  });

  doc.faces = newFaces;
  doc.faceLayers = newFaceLayers;
  doc.groups.forEach((g) => {
    g.faces = g.faces.map((fi) => remap[fi]).filter((fi) => fi !== undefined);
  });
}

/** Dissolve internal edges (merge the two adjacent faces). Returns count dissolved. */
export function dissolveEdges(doc: MeshDocument, selEdges: Set<EdgeKey>): number {
  if (selEdges.size === 0) return 0;

  let dissolved = 0;
  for (const edge of selEdges) {
    const [a, b] = parseEdgeKey(edge);
    const faceIndices = facesContainingEdge(doc, edge);
    if (faceIndices.length !== 2) continue;

    const f0 = doc.faces[faceIndices[0]];
    const f1 = doc.faces[faceIndices[1]];
    if (!f0 || !f1) continue;

    const merged = mergeFacesAtEdge(f0, f1, a, b);
    if (!merged) continue;

    doc.faces[faceIndices[0]] = merged;
    doc.faces[faceIndices[1]] = null;
    dissolved++;
  }

  if (dissolved > 0) compactFaces(doc);
  return dissolved;
}
