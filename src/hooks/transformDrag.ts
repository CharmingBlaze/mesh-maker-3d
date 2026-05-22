import * as THREE from 'three';
import { VIEW2D_DEFS, s2w, type View2DKey } from '@/core/math/projection';
import type { Vec3 } from '@/core/math/Vec3';
import type { EditorSnapshot } from '@/core/commands/Command';
import type { ToolId } from '@/store/editorStore';
import { useEditorStore } from '@/store/editorStore';
import { pickViewPlane } from '@/systems/viewport/pick3D';

export const TRANSFORM_DRAG_THRESHOLD = 4;

export type TransformDragBase = { vi: number } | { startX: number; startY: number };

export interface ObjectTransformOrig {
  nodeId: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
}

export interface TransformDragState {
  isDragging: boolean;
  transformPending: boolean;
  dragVertBase: TransformDragBase | null;
  dragOrigVerts: { x: number; y: number; z: number }[];
  dragOrigObjects: ObjectTransformOrig[] | null;
  mouseDownPos: { x: number; y: number } | null;
  beforeSnapshot: EditorSnapshot | null;
  drag3dPlaneStart: Vec3 | null;
  drag3dPivot: Vec3 | null;
}

export function createTransformDragState(): TransformDragState {
  return {
    isDragging: false,
    transformPending: false,
    dragVertBase: null,
    dragOrigVerts: [],
    dragOrigObjects: null,
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
  drag.dragOrigObjects = null;
  drag.beforeSnapshot = null;
  drag.drag3dPlaneStart = null;
  drag.drag3dPivot = null;
}

export function beginObjectTransformDrag(
  drag: TransformDragState,
  tool: ToolId,
  sx: number,
  sy: number,
): boolean {
  const state = useEditorStore.getState();
  if (state.selectionMode !== 'object' || state.selectedNodeIds.size === 0) return false;

  const dragBase: TransformDragBase =
    tool === 'move' ? { vi: 0 } : { startX: sx, startY: sy };

  const origObjects: ObjectTransformOrig[] = [];
  state.selectedNodeIds.forEach((nodeId) => {
    const node = state.sceneGraph.getNode(nodeId);
    if (node?.type === 'mesh') {
      origObjects.push({
        nodeId,
        position: { ...node.transform.position },
        rotation: { ...node.transform.rotation },
        scale: { ...node.transform.scale },
      });
    }
  });
  if (origObjects.length === 0) return false;

  drag.transformPending = true;
  drag.isDragging = false;
  drag.mouseDownPos = { x: sx, y: sy };
  drag.dragVertBase = dragBase;
  drag.dragOrigVerts = [];
  drag.dragOrigObjects = origObjects;
  drag.beforeSnapshot = null;
  drag.drag3dPlaneStart = null;
  drag.drag3dPivot = null;
  return true;
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

function applyObjectTransform2D(
  tool: ToolId,
  drag: TransformDragState,
  vpKey: View2DKey,
  sx: number,
  sy: number,
  vpPan: { x: number; y: number },
  vpZoom: number,
): void {
  if (!drag.dragOrigObjects?.length || !drag.mouseDownPos || !drag.dragVertBase) return;
  const state = useEditorStore.getState();
  const vd = VIEW2D_DEFS[vpKey];

  if (tool === 'move' && 'vi' in drag.dragVertBase) {
    const origW = s2w(drag.mouseDownPos.x, drag.mouseDownPos.y, vpPan, vpZoom);
    const curW = s2w(sx, sy, vpPan, vpZoom);
    const deltaWorld = vd.unproj(curW.x - origW.x, curW.y - origW.y);
    drag.dragOrigObjects.forEach((orig) => {
      const node = state.sceneGraph.getNode(orig.nodeId);
      if (!node) return;
      node.transform.position.x = orig.position.x + deltaWorld.x;
      node.transform.position.y = orig.position.y + deltaWorld.y;
      node.transform.position.z = orig.position.z + deltaWorld.z;
    });
  } else if (tool === 'rotate' && 'startX' in drag.dragVertBase) {
    const angle = (sx - drag.dragVertBase.startX) * 0.01 * (180 / Math.PI);
    drag.dragOrigObjects.forEach((orig) => {
      const node = state.sceneGraph.getNode(orig.nodeId);
      if (!node) return;
      node.transform.rotation.y = orig.rotation.y + angle;
    });
  } else if (tool === 'scale' && 'startX' in drag.dragVertBase) {
    const factor = Math.max(0.05, 1 + (sx - drag.dragVertBase.startX) * 0.005);
    drag.dragOrigObjects.forEach((orig) => {
      const node = state.sceneGraph.getNode(orig.nodeId);
      if (!node) return;
      node.transform.scale.x = orig.scale.x * factor;
      node.transform.scale.y = orig.scale.y * factor;
      node.transform.scale.z = orig.scale.z * factor;
    });
  }
}

function applyObjectTransform3D(
  tool: ToolId,
  drag: TransformDragState,
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  sx: number,
  sy: number,
): void {
  if (!drag.dragOrigObjects?.length || !drag.mouseDownPos || !drag.dragVertBase) return;
  const state = useEditorStore.getState();

  if (tool === 'move' && drag.drag3dPivot && drag.drag3dPlaneStart) {
    const cur = pickViewPlane(camera, canvas, sx, sy, drag.drag3dPivot);
    if (!cur) return;
    const dx = cur.x - drag.drag3dPlaneStart.x;
    const dy = cur.y - drag.drag3dPlaneStart.y;
    const dz = cur.z - drag.drag3dPlaneStart.z;
    drag.dragOrigObjects.forEach((orig) => {
      const node = state.sceneGraph.getNode(orig.nodeId);
      if (!node) return;
      node.transform.position.x = orig.position.x + dx;
      node.transform.position.y = orig.position.y + dy;
      node.transform.position.z = orig.position.z + dz;
    });
  } else if (tool === 'rotate' && 'startX' in drag.dragVertBase) {
    const angle = (sx - drag.dragVertBase.startX) * 0.01 * (180 / Math.PI);
    drag.dragOrigObjects.forEach((orig) => {
      const node = state.sceneGraph.getNode(orig.nodeId);
      if (!node) return;
      node.transform.rotation.y = orig.rotation.y + angle;
    });
  } else if (tool === 'scale' && 'startX' in drag.dragVertBase) {
    const factor = Math.max(0.05, 1 + (sx - drag.dragVertBase.startX) * 0.005);
    drag.dragOrigObjects.forEach((orig) => {
      const node = state.sceneGraph.getNode(orig.nodeId);
      if (!node) return;
      node.transform.scale.x = orig.scale.x * factor;
      node.transform.scale.y = orig.scale.y * factor;
      node.transform.scale.z = orig.scale.z * factor;
    });
  }
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

  if (drag.dragOrigObjects?.length) {
    applyObjectTransform2D(tool, drag, vpKey, sx, sy, vpPan, vpZoom);
    useEditorStore.getState().notifyChange();
    return;
  }

  const state = useEditorStore.getState();
  const mesh = state.getActiveMesh();
  const vd = VIEW2D_DEFS[vpKey];

  if (tool === 'move' && 'vi' in drag.dragVertBase) {
    const origW = s2w(drag.mouseDownPos.x, drag.mouseDownPos.y, vpPan, vpZoom);
    const curW = s2w(sx, sy, vpPan, vpZoom);
    const deltaWorld = vd.unproj(curW.x - origW.x, curW.y - origW.y);
    state.selectedTransformVerts().forEach((vi) => {
      mesh.vertices[vi].x = drag.dragOrigVerts[vi].x + deltaWorld.x;
      mesh.vertices[vi].y = drag.dragOrigVerts[vi].y + deltaWorld.y;
      mesh.vertices[vi].z = drag.dragOrigVerts[vi].z + deltaWorld.z;
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
      mesh.vertices[vi].x = cx + rx * Math.cos(angle) - rz * Math.sin(angle);
      mesh.vertices[vi].z = cz + rx * Math.sin(angle) + rz * Math.cos(angle);
      mesh.vertices[vi].y = v.y;
    });
  } else if (tool === 'scale' && 'startX' in drag.dragVertBase) {
    const dx = sx - drag.dragVertBase.startX;
    const factor = Math.max(0.05, 1 + dx * 0.005);
    const sel = [...state.selectedTransformVerts()];
    const cx = sel.reduce((s, vi) => s + drag.dragOrigVerts[vi].x, 0) / sel.length;
    const cy = sel.reduce((s, vi) => s + drag.dragOrigVerts[vi].y, 0) / sel.length;
    const cz = sel.reduce((s, vi) => s + drag.dragOrigVerts[vi].z, 0) / sel.length;
    sel.forEach((vi) => {
      mesh.vertices[vi].x = cx + (drag.dragOrigVerts[vi].x - cx) * factor;
      mesh.vertices[vi].y = cy + (drag.dragOrigVerts[vi].y - cy) * factor;
      mesh.vertices[vi].z = cz + (drag.dragOrigVerts[vi].z - cz) * factor;
    });
  }
  state.notifyChange();
}

export function applyTransformDrag3D(
  tool: ToolId,
  drag: TransformDragState,
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  sx: number,
  sy: number,
): void {
  if (!drag.isDragging || !drag.mouseDownPos || !drag.dragVertBase) return;

  if (drag.dragOrigObjects?.length) {
    applyObjectTransform3D(tool, drag, camera, canvas, sx, sy);
    useEditorStore.getState().notifyChange();
    return;
  }

  const state = useEditorStore.getState();
  const mesh = state.getActiveMesh();

  if (tool === 'move' && drag.drag3dPivot && drag.drag3dPlaneStart) {
    const cur = pickViewPlane(camera, canvas, sx, sy, drag.drag3dPivot);
    if (!cur) return;
    const dx = cur.x - drag.drag3dPlaneStart.x;
    const dy = cur.y - drag.drag3dPlaneStart.y;
    const dz = cur.z - drag.drag3dPlaneStart.z;
    state.selectedTransformVerts().forEach((vi) => {
      mesh.vertices[vi].x = drag.dragOrigVerts[vi].x + dx;
      mesh.vertices[vi].y = drag.dragOrigVerts[vi].y + dy;
      mesh.vertices[vi].z = drag.dragOrigVerts[vi].z + dz;
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
      mesh.vertices[vi].x = cx + rx * Math.cos(angle) - rz * Math.sin(angle);
      mesh.vertices[vi].z = cz + rx * Math.sin(angle) + rz * Math.cos(angle);
      mesh.vertices[vi].y = v.y;
    });
  } else if (tool === 'scale' && 'startX' in drag.dragVertBase) {
    const dx = sx - drag.dragVertBase.startX;
    const factor = Math.max(0.05, 1 + dx * 0.005);
    const sel = [...state.selectedTransformVerts()];
    const cx = sel.reduce((s, vi) => s + drag.dragOrigVerts[vi].x, 0) / sel.length;
    const cy = sel.reduce((s, vi) => s + drag.dragOrigVerts[vi].y, 0) / sel.length;
    const cz = sel.reduce((s, vi) => s + drag.dragOrigVerts[vi].z, 0) / sel.length;
    sel.forEach((vi) => {
      mesh.vertices[vi].x = cx + (drag.dragOrigVerts[vi].x - cx) * factor;
      mesh.vertices[vi].y = cy + (drag.dragOrigVerts[vi].y - cy) * factor;
      mesh.vertices[vi].z = cz + (drag.dragOrigVerts[vi].z - cz) * factor;
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
  const mesh = state.getActiveMesh();
  const sel = vertIndices ? [...vertIndices] : [...state.selectedTransformVerts()];
  if (sel.length === 0) return;
  const pivot: Vec3 = {
    x: sel.reduce((s, vi) => s + mesh.vertices[vi].x, 0) / sel.length,
    y: sel.reduce((s, vi) => s + mesh.vertices[vi].y, 0) / sel.length,
    z: sel.reduce((s, vi) => s + mesh.vertices[vi].z, 0) / sel.length,
  };
  drag.drag3dPivot = pivot;
  drag.drag3dPlaneStart = pickViewPlane(camera, canvas, sx, sy, pivot);
}

export function init3dObjectMovePlane(
  drag: TransformDragState,
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  sx: number,
  sy: number,
): void {
  if (!drag.dragOrigObjects?.length) return;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  drag.dragOrigObjects.forEach((orig) => {
    cx += orig.position.x;
    cy += orig.position.y;
    cz += orig.position.z;
  });
  const n = drag.dragOrigObjects.length;
  const pivot = { x: cx / n, y: cy / n, z: cz / n };
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
