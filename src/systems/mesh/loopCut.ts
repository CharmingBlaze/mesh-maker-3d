import type { MeshDocument } from '@/core/mesh/MeshDocument';
import { makeEdgeKey, parseEdgeKey, type EdgeKey } from '@/systems/selection/selectionSystem';

/** Insert vertices along selected edges and return the new parallel edge loop. */
export function loopCutEdges(
  doc: MeshDocument,
  selEdges: Set<EdgeKey>,
  t = 0.5,
): Set<EdgeKey> {
  if (selEdges.size === 0) return new Set();

  const clamped = Math.min(1 - 1e-4, Math.max(1e-4, t));
  const splitMap = new Map<string, number>();

  const splitEdge = (a: number, b: number): number => {
    const key = makeEdgeKey(a, b);
    const existing = splitMap.get(key);
    if (existing !== undefined) return existing;
    const va = doc.vertices[a];
    const vb = doc.vertices[b];
    const idx = doc.vertices.length;
    doc.vertices.push({
      x: va.x + (vb.x - va.x) * clamped,
      y: va.y + (vb.y - va.y) * clamped,
      z: va.z + (vb.z - va.z) * clamped,
    });
    doc.vertexLayers.push(doc.vertexLayers[a] ?? doc.vertexLayers[b] ?? doc.activeLayerId);
    splitMap.set(key, idx);
    return idx;
  };

  selEdges.forEach((edge) => {
    const [a, b] = parseEdgeKey(edge);
    splitEdge(a, b);
  });

  doc.faces = doc.faces.map((face) => {
    if (!face || face.length < 3) return face;
    const next: number[] = [];
    for (let i = 0; i < face.length; i++) {
      const a = face[i];
      const b = face[(i + 1) % face.length];
      next.push(a);
      if (selEdges.has(makeEdgeKey(a, b))) {
        const mid = splitMap.get(makeEdgeKey(a, b));
        if (mid !== undefined) next.push(mid);
      }
    }
    return next.length >= 3 ? next : face;
  });

  const splitVerts = new Set(splitMap.values());
  const newLoop = new Set<EdgeKey>();
  doc.faces.forEach((face) => {
    if (!face || face.length < 2) return;
    for (let i = 0; i < face.length; i++) {
      const a = face[i];
      const b = face[(i + 1) % face.length];
      if (splitVerts.has(a) && splitVerts.has(b)) {
        newLoop.add(makeEdgeKey(a, b));
      }
    }
  });
  return newLoop;
}
