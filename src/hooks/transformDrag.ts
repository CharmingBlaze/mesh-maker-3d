import * as THREE from 'three';
import { VIEW2D_DEFS, s2w, type View2DKey } from '@/core/math/projection';
import type { Vec3 } from '@/core/math/Vec3';
import type { EditorSnapshot } from '@/core/commands/Command';
import type { ToolId } from '@/store/editorStore';
import { useEditorStore } from '@/store/editorStore';
import { pickViewPlane } from '@/systems/viewport/pick3D';

export const TRANSFORM_DRAG_THRESHOLD = 4;

export type TransformDragBase = { vi: number } | { startX: number; startY: number };

export interface TransformDragState {
  isDragging: boolean;
  transformPending: boolean;
  dragVertBase: TransformDragBase | null;
  dragOrigVerts: { x: number; y: number; z: number }[];
  mouseDownPos: { x: number; y: number } | null;
  beforeSnapshot: EditorSnapshot | null;
  /** World point on view plane at drag start (3D move). */
  drag3dPlaneStart: Vec3 | null;
  /** Pivot for 3D view-plane drags. */
  drag3dPivot: Vec3 | null;
}

export function createTransformDragState(): TransformDragState {
  return {
    isDragging: false,
    transformPending: false,
    dragVertBase: null,
    dragOrigVerts: [],
    mouseDownPos: null,
    beforeSnapshot: null,
    drag3dPlaneStart: null,
    drag3dPivot: null,
  };
}

export function isTransformTool(tool: ToolId): boolean {
  return tool === 'move' || tool === 'rotate' || tool === 'scale';
}

export function beginTransformPending(
  drag: TransformDragState,
  mouseDownPos: { x: number; y: number },
  dragVertBase: TransformDragBase | null,
  dragOrigVerts: { x: number; y: number; z: number }[],
): void {
  drag.transformPending = dragVertBase !== null;
  drag.isDragging = false;
  drag.mouseDownPos = mouseDownPos;
  drag.dragVertBase = dragVertBase;
  drag.dragOrigVerts = dragOrigVerts;
  drag.beforeSnapshot = null;
  drag.drag3dPlaneStart = null;
  drag.drag3dPivot = null;
}

export function tryStartTransformDrag(
  drag: TransformDragState,
  sx: number,
  sy: number,
): boolean {
  if (!drag.transformPending || drag.isDragging || !drag.mouseDownPos || !drag.dragVertBase) {
    return false;
  }
  if (Math.hypot(sx - drag.mouseDownPos.x, sy - drag.mouseDownPos.y) < TRANSFORM_DRAG_THRESHOLD) {
    return false;
  }
  drag.isDragging = true;
  drag.beforeSnapshot = useEditorStore.getState().getSnapshot();
  return true;
}

export function applyTransformDrag2D(
  tool: ToolId,
  drag: TransformDragState,
  vpKey: View2DKey,
  sx: number,
  sy: number,
  vpPan: { x: number; y: number },
  vpZoom: number,
): void {
  if (!drag.isDragging || !drag.mouseDownPos || !drag.dragVertBase) return;

  const state = useEditorStore.getState();
  const vd = VIEW2D_DEFS[vpKey];

  if (tool === 'move' && 'vi' in drag.dragVertBase) {
    const origW = s2w(drag.mouseDownPos.x, drag.mouseDownPos.y, vpPan, vpZoom);
    const curW = s2w(sx, sy, vpPan, vpZoom);
    const deltaWorld = vd.unproj(curW.x - origW.x, curW.y - origW.y);
    state.selectedTransformVerts().forEach((vi) => {
      state.mesh.vertices[vi].x = drag.dragOrigVerts[vi].x + deltaWorld.x;
      state.mesh.vertices[vi].y = drag.dragOrigVerts[vi].y + deltaWorld.y;
      state.mesh.vertices[vi].z = drag.dragOrigVerts[vi].z + deltaWorld.z;
    });
  } else if (tool === 'rotate' && 'startX' in drag.dragVertBase) {
    const dx = sx - drag.dragVertBase.startX;
    const angle = dx * 0.01;
    const sel = [...state.selectedTransformVerts()];
    const cx = sel.reduce((s, vi) => s + drag.dragOrigVerts[vi].x, 0) / sel.length;
    const cz = sel.reduce((s, vi) => s + drag.dragOrigVerts[vi].z, 0) / sel.length;
    sel.forEach((vi) => {
      const v = drag.dragOrigVerts[vi];
      const rx = v.x - cx;
      const rz = v.z - cz;
      state.mesh.vertices[vi].x = cx + rx * Math.cos(angle) - rz * Math.sin(angle);
      state.mesh.vertices[vi].z = cz + rx * Math.sin(angle) + rz * Math.cos(angle);
      state.mesh.vertices[vi].y = v.y;
    });
  } else if (tool === 'scale' && 'startX' in drag.dragVertBase) {
    const dx = sx - drag.dragVertBase.startX;
    const factor = Math.max(0.05, 1 + dx * 0.005);
    const sel = [...state.selectedTransformVerts()];
    const cx = sel.reduce((s, vi) => s + drag.dragOrigVerts[vi].x, 0) / sel.length;
    const cy = sel.reduce((s, vi) => s + drag.dragOrigVerts[vi].y, 0) / sel.length;
    const cz = sel.reduce((s, vi) => s + drag.dragOrigVerts[vi].z, 0) / sel.length;
    sel.forEach((vi) => {
      state.mesh.vertices[vi].x = cx + (drag.dragOrigVerts[vi].x - cx) * factor;
      state.mesh.vertices[vi].y = cy + (drag.dragOrigVerts[vi].y - cy) * factor;
      state.mesh.vertices[vi].z = cz + (drag.dragOrigVerts[vi].z - cz) * factor;
    });
  }
  state.notifyChange();
}

/** Move/rotate/scale in the 3D perspective view. */
export function applyTransformDrag3D(
  tool: ToolId,
  drag: TransformDragState,
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  sx: number,
  sy: number,
): void {
  if (!drag.isDragging || !drag.mouseDownPos || !drag.dragVertBase) return;

  const state = useEditorStore.getState();

  if (tool === 'move' && drag.drag3dPivot && drag.drag3dPlaneStart) {
    const cur = pickViewPlane(camera, canvas, sx, sy, drag.drag3dPivot);
    if (!cur) return;
    const dx = cur.x - drag.drag3dPlaneStart.x;
    const dy = cur.y - drag.drag3dPlaneStart.y;
    const dz = cur.z - drag.drag3dPlaneStart.z;
    state.selectedTransformVerts().forEach((vi) => {
      state.mesh.vertices[vi].x = drag.dragOrigVerts[vi].x + dx;
      state.mesh.vertices[vi].y = drag.dragOrigVerts[vi].y + dy;
      state.mesh.vertices[vi].z = drag.dragOrigVerts[vi].z + dz;
    });
  } else if (tool === 'rotate' && 'startX' in drag.dragVertBase) {
    const dx = sx - drag.dragVertBase.startX;
    const angle = dx * 0.01;
    const sel = [...state.selectedTransformVerts()];
    const cx = sel.reduce((s, vi) => s + drag.dragOrigVerts[vi].x, 0) / sel.length;
    const cz = sel.reduce((s, vi) => s + drag.dragOrigVerts[vi].z, 0) / sel.length;
    sel.forEach((vi) => {
      const v = drag.dragOrigVerts[vi];
      const rx = v.x - cx;
      const rz = v.z - cz;
      state.mesh.vertices[vi].x = cx + rx * Math.cos(angle) - rz * Math.sin(angle);
      state.mesh.vertices[vi].z = cz + rx * Math.sin(angle) + rz * Math.cos(angle);
      state.mesh.vertices[vi].y = v.y;
    });
  } else if (tool === 'scale' && 'startX' in drag.dragVertBase) {
    const dx = sx - drag.dragVertBase.startX;
    const factor = Math.max(0.05, 1 + dx * 0.005);
    const sel = [...state.selectedTransformVerts()];
    const cx = sel.reduce((s, vi) => s + drag.dragOrigVerts[vi].x, 0) / sel.length;
    const cy = sel.reduce((s, vi) => s + drag.dragOrigVerts[vi].y, 0) / sel.length;
    const cz = sel.reduce((s, vi) => s + drag.dragOrigVerts[vi].z, 0) / sel.length;
    sel.forEach((vi) => {
      state.mesh.vertices[vi].x = cx + (drag.dragOrigVerts[vi].x - cx) * factor;
      state.mesh.vertices[vi].y = cy + (drag.dragOrigVerts[vi].y - cy) * factor;
      state.mesh.vertices[vi].z = cz + (drag.dragOrigVerts[vi].z - cz) * factor;
    });
  }
  state.notifyChange();
}

export function init3dMovePlane(
  drag: TransformDragState,
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  sx: number,
  sy: number,
  vertIndices?: Iterable<number>,
): void {
  const state = useEditorStore.getState();
  const sel = vertIndices ? [...vertIndices] : [...state.selectedTransformVerts()];
  if (sel.length === 0) return;
  const pivot: Vec3 = {
    x: sel.reduce((s, vi) => s + state.mesh.vertices[vi].x, 0) / sel.length,
    y: sel.reduce((s, vi) => s + state.mesh.vertices[vi].y, 0) / sel.length,
    z: sel.reduce((s, vi) => s + state.mesh.vertices[vi].z, 0) / sel.length,
  };
  drag.drag3dPivot = pivot;
  drag.drag3dPlaneStart = pickViewPlane(camera, canvas, sx, sy, pivot);
}

export function buildTransformDragBase(
  tool: ToolId,
  sx: number,
  sy: number,
  moveAnchorVi: number | null,
): TransformDragBase | null {
  if (tool === 'move' && moveAnchorVi !== null) return { vi: moveAnchorVi };
  if (tool === 'rotate' || tool === 'scale') return { startX: sx, startY: sy };
  return null;
}

/** Start a move/rotate/scale drag for the current selection (click need not hit a handle). */
export function beginTransformDragFromSelection(
  drag: TransformDragState,
  tool: ToolId,
  sx: number,
  sy: number,
  nearestVertIndex: number,
  transformVerts: Set<number>,
  origVerts: { x: number; y: number; z: number }[],
): boolean {
  if (transformVerts.size === 0) return false;

  let dragBase: TransformDragBase | null = null;
  if (tool === 'move') {
    const anchorVi =
      nearestVertIndex >= 0 && transformVerts.has(nearestVertIndex)
        ? nearestVertIndex
        : [...transformVerts][0];
    dragBase = { vi: anchorVi };
  } else if (tool === 'rotate' || tool === 'scale') {
    dragBase = { startX: sx, startY: sy };
  }

  if (!dragBase) return false;
  beginTransformPending(drag, { x: sx, y: sy }, dragBase, origVerts);
  return true;
}
