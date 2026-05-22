import { useEditorStore } from '@/store/editorStore';
import type { MeshDocument } from '@/core/mesh/MeshDocument';

/** Increments on every `notifyChange()` — use when mesh is mutated in place. */
export function useSceneRevision(): number {
  return useEditorStore((s) => s.renderTick);
}

/** Mesh document that re-renders when geometry/selection-driven edits occur. */
export function useMeshDocument(): MeshDocument {
  useSceneRevision();
  return useEditorStore((s) => s.mesh);
}
