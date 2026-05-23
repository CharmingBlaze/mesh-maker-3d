import type { MeshDocument } from '@/core/mesh/MeshDocument';
import { facesContainingEdge } from '@/systems/selection/edgeLoopRing';
import { parseEdgeKey, type EdgeKey } from '@/systems/selection/selectionSystem';

function replacementKey(faceIndex: number, vertIndex: number): string {
  return `${faceIndex},${vertIndex}`;
}

/** Split selected edges by duplicating verts on one side of each manifold edge pair. */
export function ripEdges(doc: MeshDocument, selEdges: Set<EdgeKey>): number {
  if (selEdges.size === 0) return 0;

  const replacements = new Map<string, number>();
  let ripped = 0;

  selEdges.forEach((edge) => {
    const faces = facesContainingEdge(doc, edge);
    if (faces.length !== 2) return;

    const [a, b] = parseEdgeKey(edge);
    const keepFace = faces[0];
    const ripFace = faces[1];

    for (const vi of [a, b]) {
      const key = replacementKey(ripFace, vi);
      if (replacements.has(key)) continue;
      const src = doc.vertices[vi];
      const idx = doc.vertices.length;
      doc.vertices.push({ x: src.x, y: src.y, z: src.z });
      doc.vertexLayers.push(doc.vertexLayers[vi] ?? doc.activeLayerId);
      replacements.set(key, idx);
    }

    ripped++;
    void keepFace;
  });

  if (replacements.size === 0) return 0;

  doc.faces = doc.faces.map((face, fi) => {
    if (!face) return face;
    return face.map((vi) => replacements.get(replacementKey(fi, vi)) ?? vi);
  });

  return ripped;
}
