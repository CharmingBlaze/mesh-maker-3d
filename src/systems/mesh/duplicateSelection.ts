import type { MeshDocument } from '@/core/mesh/MeshDocument';
import type { Vec3 } from '@/core/math/Vec3';
import { makeEdgeKey, parseEdgeKey, type EdgeKey } from '@/systems/selection/selectionSystem';

/** Duplicate selected faces with remapped verts shifted by offset. */
export function duplicateFaceSelection(
  doc: MeshDocument,
  selFaces: Set<number>,
  groupIndex: number,
  offset: Vec3,
): number[] {
  if (selFaces.size === 0) return [];

  const vertMap = new Map<number, number>();
  selFaces.forEach((fi) => {
    const face = doc.faces[fi];
    if (!face) return;
    face.forEach((vi) => {
      if (vertMap.has(vi)) return;
      const v = doc.vertices[vi];
      const idx = doc.vertices.length;
      doc.vertices.push({
        x: v.x + offset.x,
        y: v.y + offset.y,
        z: v.z + offset.z,
      });
      doc.vertexLayers.push(doc.vertexLayers[vi] ?? doc.activeLayerId);
      vertMap.set(vi, idx);
    });
  });

  const created: number[] = [];
  selFaces.forEach((fi) => {
    const face = doc.faces[fi];
    if (!face) return;
    const dup = face.map((vi) => vertMap.get(vi)!);
    const nfi = doc.faces.length;
    doc.faces.push(dup);
    doc.faceLayers.push(doc.faceLayers[fi] ?? doc.activeLayerId);
    const group = doc.groups[groupIndex];
    if (group) group.faces.push(nfi);
    created.push(nfi);
  });

  return created;
}

/** Duplicate selected vertices. Returns new vertex indices. */
export function duplicateVertexSelection(
  doc: MeshDocument,
  selVerts: Set<number>,
  offset: Vec3,
): Set<number> {
  const vertMap = new Map<number, number>();
  const created = new Set<number>();

  selVerts.forEach((vi) => {
    const v = doc.vertices[vi];
    const idx = doc.vertices.length;
    doc.vertices.push({
      x: v.x + offset.x,
      y: v.y + offset.y,
      z: v.z + offset.z,
    });
    doc.vertexLayers.push(doc.vertexLayers[vi] ?? doc.activeLayerId);
    vertMap.set(vi, idx);
    created.add(idx);
  });

  doc.faces.forEach((face, fi) => {
    if (!face) return;
    let touched = false;
    const next = face.map((vi) => {
      const mapped = vertMap.get(vi);
      if (mapped !== undefined) touched = true;
      return mapped ?? vi;
    });
    if (touched) doc.faces[fi] = next;
  });

  return created;
}

/** Duplicate selected edges by splitting verts on incident faces. */
export function duplicateEdgeSelection(
  doc: MeshDocument,
  selEdges: Set<EdgeKey>,
  offset: Vec3,
): Set<EdgeKey> {
  const edgeVerts = new Set<number>();
  selEdges.forEach((edge) => {
    const [a, b] = parseEdgeKey(edge);
    edgeVerts.add(a);
    edgeVerts.add(b);
  });

  const vertMap = new Map<number, number>();
  edgeVerts.forEach((vi) => {
    const v = doc.vertices[vi];
    const idx = doc.vertices.length;
    doc.vertices.push({
      x: v.x + offset.x,
      y: v.y + offset.y,
      z: v.z + offset.z,
    });
    doc.vertexLayers.push(doc.vertexLayers[vi] ?? doc.activeLayerId);
    vertMap.set(vi, idx);
  });

  const faceSet = new Set<number>();
  doc.faces.forEach((face, fi) => {
    if (!face) return;
    for (let i = 0; i < face.length; i++) {
      const ek = makeEdgeKey(face[i], face[(i + 1) % face.length]);
      if (selEdges.has(ek)) faceSet.add(fi);
    }
  });

  faceSet.forEach((fi) => {
    const face = doc.faces[fi];
    if (!face) return;
    doc.faces[fi] = face.map((vi) => vertMap.get(vi) ?? vi);
  });

  const newEdges = new Set<EdgeKey>();
  selEdges.forEach((edge) => {
    const [a, b] = parseEdgeKey(edge);
    const na = vertMap.get(a);
    const nb = vertMap.get(b);
    if (na !== undefined && nb !== undefined) newEdges.add(makeEdgeKey(na, nb));
  });

  return newEdges;
}
