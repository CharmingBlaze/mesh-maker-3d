import type { MeshDocument } from '@/core/mesh/MeshDocument';

function dedupeConsecutive(face: number[]): number[] {
  if (face.length === 0) return face;
  const out: number[] = [face[0]];
  for (let i = 1; i < face.length; i++) {
    if (face[i] !== out[out.length - 1]) out.push(face[i]);
  }
  if (out.length > 1 && out[0] === out[out.length - 1]) out.pop();
  return out;
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

/** Collapse selected vertices into one at their centroid. Returns the surviving index. */
export function mergeSelectedVertices(doc: MeshDocument, selVerts: Set<number>): number | null {
  if (selVerts.size < 2) return null;

  const indices = [...selVerts].sort((a, b) => a - b);
  const target = indices[0];
  const points = indices.map((i) => doc.vertices[i]);
  const cx = points.reduce((s, v) => s + v.x, 0) / points.length;
  const cy = points.reduce((s, v) => s + v.y, 0) / points.length;
  const cz = points.reduce((s, v) => s + v.z, 0) / points.length;

  const removeSet = new Set(indices.filter((i) => i !== target));
  const remap = new Array<number>(doc.vertices.length).fill(-1);
  const newVertices: typeof doc.vertices = [];
  const newVertexLayers: string[] = [];

  for (let i = 0; i < doc.vertices.length; i++) {
    if (removeSet.has(i)) continue;
    remap[i] = newVertices.length;
    if (i === target) {
      newVertices.push({ x: cx, y: cy, z: cz });
    } else {
      newVertices.push(doc.vertices[i]);
    }
    newVertexLayers.push(doc.vertexLayers[i] ?? doc.activeLayerId);
  }

  const targetNew = remap[target];
  removeSet.forEach((vi) => {
    remap[vi] = targetNew;
  });

  doc.vertices = newVertices;
  doc.vertexLayers = newVertexLayers;

  doc.faces = doc.faces.map((face) => {
    if (!face) return null;
    const mapped = dedupeConsecutive(
      face.map((vi) => remap[vi]).filter((vi) => vi !== undefined && vi >= 0),
    );
    return mapped.length >= 3 ? mapped : null;
  });

  compactFaces(doc);
  return targetNew;
}
