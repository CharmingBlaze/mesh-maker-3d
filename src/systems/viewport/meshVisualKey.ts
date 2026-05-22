import type { MeshDocument } from '@/core/mesh/MeshDocument';
import type { EdgeKey } from '@/systems/selection/selectionSystem';
import type { SceneRenderEntry } from '@/systems/scene/sceneObjectHelpers';

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

/** Cache key for multi-object scene rendering. */
export function sceneVisualKey(
  entries: SceneRenderEntry[],
  activeMeshId: string,
  selVerts: Set<number>,
  selEdges: Set<EdgeKey>,
  selFaces: Set<number>,
  wireframe: boolean,
  flatShading: boolean,
  revision = 0,
  selectionMode = 'object',
): string {
  let sig = `${revision}|${activeMeshId}|${wireframe}|${flatShading}|${selectionMode}|${selVerts.size}|${selEdges.size}|${selFaces.size}|${entries.length}`;
  for (const entry of entries) {
    const mesh = entry.mesh;
    const t = entry.transform;
    sig += `|${entry.nodeId}:${entry.visible}:${entry.selected}:${mesh.vertices.length}:${mesh.faces.length}:${t.position.x.toFixed(1)},${t.position.y.toFixed(1)},${t.position.z.toFixed(1)}`;
  }
  return sig;
}
