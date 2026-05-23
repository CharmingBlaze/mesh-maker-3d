import type { MeshDocument } from '@/core/mesh/MeshDocument';

/** Split selected faces at shared boundary verts so they can move independently. */
export function separateFaces(doc: MeshDocument, selFaces: Set<number>): number {
  if (selFaces.size === 0) return 0;

  const vertsInSelected = new Set<number>();
  selFaces.forEach((fi) => {
    doc.faces[fi]?.forEach((vi) => vertsInSelected.add(vi));
  });

  const boundaryVerts = new Set<number>();
  doc.faces.forEach((face, fi) => {
    if (!face || selFaces.has(fi)) return;
    face.forEach((vi) => {
      if (vertsInSelected.has(vi)) boundaryVerts.add(vi);
    });
  });

  if (boundaryVerts.size === 0) return 0;

  const dup = new Map<number, number>();
  boundaryVerts.forEach((vi) => {
    const v = doc.vertices[vi];
    const idx = doc.vertices.length;
    doc.vertices.push({ x: v.x, y: v.y, z: v.z });
    doc.vertexLayers.push(doc.vertexLayers[vi] ?? doc.activeLayerId);
    dup.set(vi, idx);
  });

  selFaces.forEach((fi) => {
    const face = doc.faces[fi];
    if (!face) return;
    doc.faces[fi] = face.map((vi) => dup.get(vi) ?? vi);
  });

  return dup.size;
}
