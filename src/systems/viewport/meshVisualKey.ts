import type { MeshDocument } from '@/core/mesh/MeshDocument';
import type { EdgeKey } from '@/systems/selection/selectionSystem';

/** Cheap signature so the 3D renderer skips rebuilds when nothing visual changed. */
export function meshVisualKey(
  mesh: MeshDocument,
  selVerts: Set<number>,
  selEdges: Set<EdgeKey>,
  selFaces: Set<number>,
  wireframe: boolean,
  flatShading: boolean,
  revision = 0,
): string {
  const n = mesh.vertices.length;
  const f = mesh.faces.length;
  let sig = `${revision}|${n}|${f}|${wireframe}|${flatShading}|${selVerts.size}|${selEdges.size}|${selFaces.size}`;
  if (n > 0) {
    const a = mesh.vertices[0];
    const m = mesh.vertices[n >> 1];
    const z = mesh.vertices[n - 1];
    sig += `|${a.x.toFixed(2)},${a.y.toFixed(2)},${m.z.toFixed(2)},${z.x.toFixed(2)}`;
  }
  return sig;
}
