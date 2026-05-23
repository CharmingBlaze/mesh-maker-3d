import type { EdgeKey } from '@/systems/selection/selectionSystem';

export const LOOP_CUT_DRAG_THRESHOLD = 2;

export interface LoopCutDragState {
  isDragging: boolean;
  mouseDownPos: { x: number; y: number } | null;
  startT: number;
}

export function createLoopCutDragState(): LoopCutDragState {
  return {
    isDragging: false,
    mouseDownPos: null,
    startT: 0.5,
  };
}

export function clampLoopCutT(t: number): number {
  return Math.min(0.95, Math.max(0.05, t));
}

/** Map vertical screen drag to cut parameter t. Drag up → higher t. */
export function loopCutTFromDrag(dy: number, startT: number): number {
  return clampLoopCutT(startT - dy * 0.004);
}

export function beginLoopCutDrag(
  drag: LoopCutDragState,
  sx: number,
  sy: number,
  startT: number,
): void {
  drag.isDragging = true;
  drag.mouseDownPos = { x: sx, y: sy };
  drag.startT = startT;
}

export function resetLoopCutDrag(drag: LoopCutDragState): void {
  drag.isDragging = false;
  drag.mouseDownPos = null;
  drag.startT = 0.5;
}

export type LoopCutPreviewState = {
  edges: EdgeKey[];
  beforeSnapshot: import('@/core/commands/Command').EditorSnapshot;
  t: number;
};
