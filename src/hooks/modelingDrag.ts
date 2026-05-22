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
}

export function createModelingDragState(): ModelingDragState {
  return {
    isDragging: false,
    transformPending: false,
    mouseDownPos: null,
    beforeSnapshot: null,
    preparedSnapshot: null,
    extrudeSession: null,
  };
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
    const session = prepareExtrude(state.mesh, state.selFaces, state.groupSel);
    if (!session) {
      drag.isDragging = false;
      drag.beforeSnapshot = null;
      return false;
    }
    drag.extrudeSession = session;
    drag.preparedSnapshot = state.getSnapshot();
    state.notifyChange();
    return true;
  }

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
    applyExtrudeDistance(state.mesh, drag.extrudeSession, amount);
    state.notifyChange();
    return;
  }

  if (!drag.preparedSnapshot) return;
  state.applySnapshot(drag.preparedSnapshot);
  const { mesh, groupSel, selFaces, selEdges } = state;

  if (tool === 'inset' && selFaces.size > 0) {
    meshOps.insetFaces(mesh, selFaces, groupSel, amount);
  } else if (tool === 'bevel' && selEdges.size > 0) {
    bevelEdgesBlender(mesh, selEdges, amount, groupSel);
  }
  state.notifyChange();
}
