import type { Vec3 } from '@/core/math/Vec3';
import { boundsCenter, mergeBounds, type BoundingBox } from '@/core/math/BoundingBox';
import { useEditorStore } from '@/store/editorStore';
import {
  getNodeForMeshId,
  localMeshBounds,
  meshWorldBounds,
  transformPoint,
} from '@/systems/scene/sceneObjectHelpers';
import { visibleVertexIndices } from '@/systems/layers/layerSystem';

export type GizmoMode = 'move' | 'rotate' | 'scale';

/** Vertex indices affected by a component-mode transform gizmo drag. */
export function getTransformTargetVertIndices(): number[] {
  const state = useEditorStore.getState();
  const mesh = state.getActiveMesh();
  const selected = state.selectedTransformVerts();
  if (selected.size > 0) return [...selected];
  return [...visibleVertexIndices(mesh)];
}

/** World-space pivot for the transform gizmo (selection bounds center). */
export function computeSelectionWorldPivot(): Vec3 | null {
  const state = useEditorStore.getState();

  if (state.selectionMode === 'object') {
    if (state.selectedNodeIds.size === 0) return null;
    let merged: BoundingBox | null = null;
    state.selectedNodeIds.forEach((nodeId) => {
      const node = state.sceneGraph.getNode(nodeId);
      if (node?.type !== 'mesh' || !node.meshId) return;
      const mesh = state.meshes[node.meshId];
      if (!mesh) return;
      const wb = meshWorldBounds(mesh, node.transform);
      if (!wb) return;
      merged = merged ? mergeBounds(merged, wb.min, wb.max) : wb;
    });
    return merged ? boundsCenter(merged) : null;
  }

  const mesh = state.getActiveMesh();
  const node = getNodeForMeshId(state.sceneGraph, mesh.id);
  if (!node?.meshId || !state.meshes[node.meshId]) {
    const local = localMeshBounds(mesh);
    return local ? boundsCenter(local) : null;
  }

  const transform = node.transform;
  const selected = state.selectedTransformVerts();
  if (selected.size > 0) {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    let n = 0;
    selected.forEach((vi) => {
      const w = transformPoint(mesh.vertices[vi], transform);
      cx += w.x;
      cy += w.y;
      cz += w.z;
      n++;
    });
    if (n === 0) return null;
    return { x: cx / n, y: cy / n, z: cz / n };
  }

  const wb = meshWorldBounds(mesh, transform);
  return wb ? boundsCenter(wb) : null;
}
