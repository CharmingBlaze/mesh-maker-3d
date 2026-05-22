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
  base: 'Click = default size · Drag = custom footprint · Esc cancel',
  extent: 'Scroll = height · Drag handles to adjust · Enter or Place to commit · Esc cancel',
};

export const PRIM_DRAW_HINTS_3D: Record<PrimDrawPhase, string> = {
  base: 'Click = default on ground · Drag footprint on XZ · Esc cancel',
  extent: 'Scroll = height · Drag handles · Enter or Place to commit · Esc cancel',
};

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
