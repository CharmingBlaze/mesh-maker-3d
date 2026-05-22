import { useEditorStore } from '@/store/editorStore';
import type { MeshDocument } from '@/core/mesh/MeshDocument';
import {
  buildSceneRenderEntries,
  type SceneRenderEntry,
} from '@/systems/scene/sceneObjectHelpers';

/** Increments on every `notifyChange()` — use when mesh is mutated in place. */
export function useSceneRevision(): number {
  return useEditorStore((s) => s.renderTick);
}

/** Active mesh document (for mesh-editing panels and tools). */
export function useMeshDocument(): MeshDocument {
  useSceneRevision();
  return useEditorStore((s) => s.getActiveMesh());
}

/** All placed objects with transforms for viewport rendering. */
export function useSceneRenderEntries(): SceneRenderEntry[] {
  useSceneRevision();
  return useEditorStore((s) =>
    buildSceneRenderEntries(s.sceneGraph, s.meshes, s.activeMeshId, s.selectedNodeIds),
  );
}

export function useSceneObjectCount(): number {
  useSceneRevision();
  return useEditorStore((s) => s.sceneGraph.getAllNodes().filter((n) => n.type === 'mesh').length);
}
