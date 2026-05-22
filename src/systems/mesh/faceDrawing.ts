import type { FaceDrawMode } from '@/store/editorStore';

export function targetFaceVertexCount(mode: FaceDrawMode): number | null {
  if (mode === 'tri') return 3;
  if (mode === 'quad') return 4;
  return null;
}

export function shouldAutoCommitFace(mode: FaceDrawMode, vertexCount: number): boolean {
  const target = targetFaceVertexCount(mode);
  return target !== null && vertexCount === target;
}

export function appendFaceVertex(wipFace: number[], vertexIndex: number): number[] {
  return wipFace.includes(vertexIndex) ? wipFace : [...wipFace, vertexIndex];
}

export interface VertexToolPlacementResult {
  wipFace: number[];
  committed: boolean;
}

/** Extend wip chain / auto-face after placing or re-using a vertex index. */
export function applyVertexToolPlacement(
  placedVertex: number,
  faceDrawMode: FaceDrawMode,
  wipFace: number[],
): VertexToolPlacementResult {
  if (placedVertex < 0) return { wipFace, committed: false };

  if (faceDrawMode !== 'none') {
    const wip = appendFaceVertex(wipFace, placedVertex);
    if (shouldAutoCommitFace(faceDrawMode, wip.length)) {
      return { wipFace: wip, committed: true };
    }
    return { wipFace: wip, committed: false };
  }

  if (wipFace.length >= 3 && wipFace[0] === placedVertex) {
    return { wipFace, committed: true };
  }

  return { wipFace: appendFaceVertex(wipFace, placedVertex), committed: false };
}
