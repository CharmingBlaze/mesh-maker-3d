import type { View2DKey } from '@/core/math/projection';

export type PrimDrawView = View2DKey | '3d';
import type { BoundingBox } from '@/core/math/BoundingBox';
import { boundsFromCorners } from '@/core/math/BoundingBox';
import type { Vec3 } from '@/core/math/Vec3';
import type { PrimitiveType } from '@/systems/mesh/primitives';

export type PrimDrawPhase = 'base' | 'extent';
export type PrimPlacementSource = 'click' | 'drag' | null;

export interface PrimDrawState {
  type: PrimitiveType;
  phase: PrimDrawPhase;
  /** Viewport where base was drawn */
  baseView: PrimDrawView;
  /** Third axis filled in extent phase */
  extentAxis: 'x' | 'y' | 'z';
  bounds: BoundingBox;
  anchor: Vec3 | null;
  cursor: Vec3 | null;
  placementSource: PrimPlacementSource;
}

export const PRIM_DRAW_HINTS: Record<PrimDrawPhase, string> = {
  base: 'Click = last size · Drag footprint · Shift = axis lock · Ctrl = square · Esc cancel',
  extent:
    'Scroll = height (Shift fine) · Drag handles · Shift/Ctrl constrain · Enter or Place · Esc cancel',
};

export const PRIM_DRAW_HINTS_3D: Record<PrimDrawPhase, string> = {
  base: 'Click = last size on ground · Drag XZ footprint · Shift/Ctrl constrain · Esc cancel',
  extent: 'Scroll = height (Shift fine) · Drag handles · Enter or Place · Esc cancel',
};

/** Full Shift/Ctrl modifier reference — shown in Shapes help while drawing. */
export const PRIM_DRAW_CONSTRAINT_HELP: readonly string[] = [
  'Shift + drag footprint — axis lock (dominant plane axis only)',
  'Ctrl + drag footprint — square footprint (equal spans)',
  'Ctrl + corner handle (base phase) — square resize',
  'Shift + face handle — symmetric resize from center on that axis',
  'Shift + center handle — move locked to one world axis',
  'Shift + scroll — fine height steps',
];

export function viewPlaneAxes(vp: View2DKey): ['x' | 'y' | 'z', 'x' | 'y' | 'z'] {
  if (vp === 'top') return ['x', 'z'];
  if (vp === 'front') return ['x', 'y'];
  return ['z', 'y'];
}

export function extentAxisForView(vp: View2DKey): 'x' | 'y' | 'z' {
  if (vp === 'top') return 'y';
  if (vp === 'front') return 'z';
  return 'x';
}

export function createPrimDrawState(type: PrimitiveType): PrimDrawState {
  return {
    type,
    phase: 'base',
    baseView: 'top',
    extentAxis: 'y',
    bounds: boundsFromCorners({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
    anchor: null,
    cursor: null,
    placementSource: null,
  };
}

export function applyBaseDrag(
  draw: PrimDrawState,
  vp: View2DKey,
  p0: Vec3,
  p1: Vec3,
): PrimDrawState {
  let bounds = boundsFromCorners(p0, p1);
  const third = extentAxisForView(vp);
  bounds.min[third] = 0;
  bounds.max[third] = 0;
  return {
    ...draw,
    baseView: vp,
    extentAxis: third,
    bounds,
    anchor: p0,
    cursor: p1,
  };
}

/** Base drag on perspective ground plane (Y = 0), extent axis is Y */
export function applyBaseDrag3D(draw: PrimDrawState, p0: Vec3, p1: Vec3): PrimDrawState {
  let bounds = boundsFromCorners(p0, p1);
  bounds.min.y = 0;
  bounds.max.y = 0;
  return {
    ...draw,
    baseView: '3d',
    extentAxis: 'y',
    bounds,
    anchor: p0,
    cursor: p1,
  };
}

export function applyExtentDrag(draw: PrimDrawState, p0: Vec3, p1: Vec3): PrimDrawState {
  const axis = draw.extentAxis;
  const minVal = draw.bounds.min[axis];
  const currentMax = draw.bounds.max[axis];
  const cursorMax = Math.max(minVal, p1[axis]);
  const startedFromTop = p0[axis] >= currentMax - 1e-3;
  let maxVal: number;
  if (cursorMax >= currentMax) {
    maxVal = cursorMax;
  } else if (startedFromTop) {
    maxVal = cursorMax;
  } else {
    maxVal = currentMax;
  }
  return {
    ...draw,
    bounds: {
      min: { ...draw.bounds.min, [axis]: minVal },
      max: { ...draw.bounds.max, [axis]: maxVal },
    },
    cursor: p1,
  };
}

export function previewBounds(draw: PrimDrawState): BoundingBox | null {
  if (!draw.anchor || !draw.cursor) return null;
  if (draw.phase === 'base') return draw.bounds;
  return draw.bounds;
}
