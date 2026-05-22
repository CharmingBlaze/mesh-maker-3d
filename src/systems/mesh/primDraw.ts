import type { View2DKey } from '@/core/math/projection';

export type PrimDrawView = View2DKey | '3d';
import type { BoundingBox } from '@/core/math/BoundingBox';
import { boundsFromCorners } from '@/core/math/BoundingBox';
import type { Vec3 } from '@/core/math/Vec3';
import type { PrimitiveType } from '@/systems/mesh/primitives';

export type PrimDrawPhase = 'base' | 'extent';

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
}

export const PRIM_DRAW_HINTS: Record<PrimDrawPhase, string> = {
  base: 'Drag base box on view · shape shown inside · Esc cancel',
  extent: 'Drag height/depth · box + shape update · Esc cancel',
};

export const PRIM_DRAW_HINTS_3D: Record<PrimDrawPhase, string> = {
  base: 'Drag base on ground (XZ) · CAD box + shape inside',
  extent: 'Drag height (Y) · box + shape inside · Esc cancel',
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
  const lo = Math.min(p0[axis], p1[axis]);
  const hi = Math.max(p0[axis], p1[axis]);
  const bounds = {
    min: { ...draw.bounds.min, [axis]: lo },
    max: { ...draw.bounds.max, [axis]: hi },
  };
  return { ...draw, bounds, cursor: p1 };
}

export function previewBounds(draw: PrimDrawState): BoundingBox | null {
  if (!draw.anchor || !draw.cursor) return null;
  if (draw.phase === 'base') return draw.bounds;
  return draw.bounds;
}
