import * as THREE from 'three';
import type { EditorSnapshot } from '@/core/commands/Command';
import type { ToolId } from '@/store/editorStore';
import { useEditorStore } from '@/store/editorStore';
import {
  applyExtrudeDistance,
  prepareExtrude,
  screenDragAlongAxis2D,
  screenDragAlongAxis3D,
  type ExtrudeSession,
} from '@/systems/mesh/extrudeBlender';
import { bevelEdgesBlender } from '@/systems/mesh/bevelBlender';
import * as meshOps from '@/systems/mesh/meshOperations';
import type { EdgeKey } from '@/systems/selection/selectionSystem';
import type { View2DKey } from '@/core/math/projection';

export const MODELING_DRAG_THRESHOLD = 4;

export type ModelingPointerCtx =
  | {
      kind: '3d';
      camera: THREE.PerspectiveCamera;
      canvas: HTMLCanvasElement;
    }
  | {
      kind: '2d';
      vpKey: View2DKey;
      pan: { x: number; y: number };
      zoom: number;
    };

export interface ModelingDragState {
  isDragging: boolean;
  transformPending: boolean;
  mouseDownPos: { x: number; y: number } | null;
  beforeSnapshot: EditorSnapshot | null;
  /** Mesh state right after extrude prepare (distance = 0). */
  preparedSnapshot: EditorSnapshot | null;
  extrudeSession: ExtrudeSession | null;
  /** Selection captured at drag start — applySnapshot clears live selection during preview. */
  targetFaces: Set<number>;
  targetEdges: Set<EdgeKey>;
  groupSel: number;
}

export function createModelingDragState(): ModelingDragState {
  return {
    isDragging: false,
    transformPending: false,
    mouseDownPos: null,
    beforeSnapshot: null,
    preparedSnapshot: null,
    extrudeSession: null,
    targetFaces: new Set(),
    targetEdges: new Set(),
    groupSel: 0,
  };
}

function captureModelingTargets(drag: ModelingDragState): void {
  const state = useEditorStore.getState();
  drag.targetFaces = new Set(state.selFaces);
  drag.targetEdges = new Set(state.selEdges);
  drag.groupSel = state.groupSel;
}

export function isModelingTool(tool: ToolId): boolean {
  return tool === 'extrude' || tool === 'bevel' || tool === 'inset';
}

export function canStartModelingDrag(tool: ToolId): boolean {
  const { selFaces, selEdges } = useEditorStore.getState();
  if (tool === 'extrude' || tool === 'inset') return selFaces.size > 0;
  if (tool === 'bevel') return selEdges.size > 0;
  return false;
}

export function beginModelingPending(
  drag: ModelingDragState,
  mouseDownPos: { x: number; y: number },
): void {
  drag.transformPending = canStartModelingDrag(useEditorStore.getState().tool);
  drag.isDragging = false;
  drag.mouseDownPos = mouseDownPos;
  drag.beforeSnapshot = null;
  drag.preparedSnapshot = null;
  drag.extrudeSession = null;
  drag.targetFaces = new Set();
  drag.targetEdges = new Set();
  drag.groupSel = 0;
}

export function tryStartModelingDrag(
  drag: ModelingDragState,
  tool: ToolId,
  sx: number,
  sy: number,
): boolean {
  if (!drag.transformPending || drag.isDragging || !drag.mouseDownPos) return false;
  if (Math.hypot(sx - drag.mouseDownPos.x, sy - drag.mouseDownPos.y) < MODELING_DRAG_THRESHOLD) {
    return false;
  }

  const state = useEditorStore.getState();
  drag.beforeSnapshot = state.getSnapshot();
  drag.isDragging = true;

  if (tool === 'extrude' && state.selFaces.size > 0) {
    const session = prepareExtrude(state.getActiveMesh(), state.selFaces, state.groupSel);
    if (!session) {
      drag.isDragging = false;
      drag.beforeSnapshot = null;
      return false;
    }
    drag.extrudeSession = session;
    captureModelingTargets(drag);
    drag.preparedSnapshot = state.getSnapshot();
    state.notifyChange();
    return true;
  }

  if (tool === 'inset' && state.selFaces.size === 0) {
    drag.isDragging = false;
    drag.beforeSnapshot = null;
    return false;
  }
  if (tool === 'bevel' && state.selEdges.size === 0) {
    drag.isDragging = false;
    drag.beforeSnapshot = null;
    return false;
  }

  captureModelingTargets(drag);
  drag.preparedSnapshot = state.getSnapshot();
  return true;
}

function dragAmount(
  tool: ToolId,
  drag: ModelingDragState,
  sx: number,
  sy: number,
  ctx: ModelingPointerCtx,
): number {
  if (!drag.mouseDownPos) return 0;
  const from = drag.mouseDownPos;
  const to = { x: sx, y: sy };

  if (tool === 'extrude' && drag.extrudeSession) {
    const { pivot, normal } = drag.extrudeSession;
    if (ctx.kind === '3d') {
      return screenDragAlongAxis3D(ctx.camera, ctx.canvas, pivot, normal, from, to);
    }
    return screenDragAlongAxis2D(ctx.vpKey, normal, ctx.pan, ctx.zoom, from, to);
  }

  if (tool === 'bevel') {
    const dy = drag.mouseDownPos.y - sy;
    return Math.max(0.02, dy * 0.05);
  }

  const dy = sy - drag.mouseDownPos.y;
  return Math.min(0.45, Math.max(0.02, dy * 0.0015));
}

/** Start extrude/bevel immediately on click (after E/B modal arm). */
export function startModalModelingDrag(
  drag: ModelingDragState,
  tool: ToolId,
  sx: number,
  sy: number,
): boolean {
  const state = useEditorStore.getState();
  if (tool === 'extrude' && state.selFaces.size > 0) {
    const session = prepareExtrude(state.getActiveMesh(), state.selFaces, state.groupSel);
    if (!session) return false;
    drag.beforeSnapshot = state.getSnapshot();
    drag.isDragging = true;
    drag.transformPending = false;
    drag.mouseDownPos = { x: sx, y: sy };
    captureModelingTargets(drag);
    drag.extrudeSession = session;
    drag.preparedSnapshot = state.getSnapshot();
    state.notifyChange();
    return true;
  }
  if (tool === 'bevel' && state.selEdges.size > 0) {
    drag.beforeSnapshot = state.getSnapshot();
    drag.isDragging = true;
    drag.transformPending = false;
    drag.mouseDownPos = { x: sx, y: sy };
    drag.extrudeSession = null;
    captureModelingTargets(drag);
    drag.preparedSnapshot = state.getSnapshot();
    state.notifyChange();
    return true;
  }
  if (tool === 'inset' && state.selFaces.size > 0) {
    drag.beforeSnapshot = state.getSnapshot();
    drag.isDragging = true;
    drag.transformPending = false;
    drag.mouseDownPos = { x: sx, y: sy };
    drag.extrudeSession = null;
    captureModelingTargets(drag);
    drag.preparedSnapshot = state.getSnapshot();
    state.notifyChange();
    return true;
  }
  return false;
}

export function applyModelingPreview(
  tool: ToolId,
  drag: ModelingDragState,
  sx: number,
  sy: number,
  ctx: ModelingPointerCtx,
): void {
  if (!drag.isDragging || !drag.mouseDownPos) return;
  const state = useEditorStore.getState();
  const amount = dragAmount(tool, drag, sx, sy, ctx);

  if (tool === 'extrude' && drag.extrudeSession && drag.preparedSnapshot) {
    state.applySnapshot(drag.preparedSnapshot);
    applyExtrudeDistance(state.getActiveMesh(), drag.extrudeSession, amount);
    state.notifyChange();
    return;
  }

  if (!drag.preparedSnapshot) return;
  state.applySnapshot(drag.preparedSnapshot);
  const mesh = state.getActiveMesh();

  if (tool === 'inset' && drag.targetFaces.size > 0) {
    meshOps.insetFaces(mesh, drag.targetFaces, drag.groupSel, amount);
    state.setSelFaces(new Set(drag.targetFaces));
  } else if (tool === 'bevel' && drag.targetEdges.size > 0) {
    bevelEdgesBlender(mesh, drag.targetEdges, amount, drag.groupSel);
    state.setSelEdges(new Set(drag.targetEdges));
  }
  state.notifyChange();
}
