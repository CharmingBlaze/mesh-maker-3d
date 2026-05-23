import { VIEW2D_DEFS, s2w, type View2DKey } from '@/core/math/projection';
import type { BoundingBox } from '@/core/math/BoundingBox';
import type { Vec3 } from '@/core/math/Vec3';
import {
  applyBaseDrag,
  applyBaseDrag3D,
  applyExtentDrag,
  viewPlaneAxes,
  extentAxisForView,
  type PrimDrawState,
  type PrimDrawView,
} from '@/systems/mesh/primDraw';
import { defaultPlacementSize, type PrimitiveType } from '@/systems/mesh/primitives';

export const CLICK_DRAG_THRESHOLD = 4;

export interface PrimSize {
  w: number;
  h: number;
  d: number;
}

export type PrimDragModifiers = { shiftKey?: boolean; ctrlKey?: boolean };

export function boundsToPrimSize(bounds: BoundingBox): PrimSize {
  const { min, max } = bounds;
  return { w: max.x - min.x, h: max.y - min.y, d: max.z - min.z };
}

export function extentSpanFromPrimSize(size: PrimSize, axis: 'x' | 'y' | 'z'): number {
  if (axis === 'x') return size.w;
  if (axis === 'y') return size.h;
  return size.d;
}

/** Shift = lock to dominant plane axis; Ctrl = square footprint. */
export function applyFootprintConstraints(
  p0: Vec3,
  p1: Vec3,
  axisA: 'x' | 'y' | 'z',
  axisB: 'x' | 'y' | 'z',
  modifiers?: PrimDragModifiers,
): Vec3 {
  if (!modifiers?.shiftKey && !modifiers?.ctrlKey) return p1;
  const dA = p1[axisA] - p0[axisA];
  const dB = p1[axisB] - p0[axisB];
  if (modifiers.ctrlKey) {
    const span = Math.max(Math.abs(dA), Math.abs(dB));
    const signA = dA === 0 ? 1 : Math.sign(dA);
    const signB = dB === 0 ? 1 : Math.sign(dB);
    return {
      ...p1,
      [axisA]: p0[axisA] + signA * span,
      [axisB]: p0[axisB] + signB * span,
    };
  }
  if (Math.abs(dA) >= Math.abs(dB)) {
    return { ...p1, [axisB]: p0[axisB] };
  }
  return { ...p1, [axisA]: p0[axisA] };
}

export function screenToWorld(
  vpKey: View2DKey,
  sx: number,
  sy: number,
  vpState: { pan: { x: number; y: number }; zoom: number },
  snap: (v: number) => number,
): Vec3 {
  const wc = s2w(sx, sy, vpState.pan, vpState.zoom);
  const wx = snap(wc.x);
  const wy = snap(wc.y);
  return VIEW2D_DEFS[vpKey].unproj(wx, wy);
}

export function hasMinBaseSize(draw: PrimDrawState, min: number): boolean {
  if (draw.baseView === '3d') {
    return (
      draw.bounds.max.x - draw.bounds.min.x >= min && draw.bounds.max.z - draw.bounds.min.z >= min
    );
  }
  const [a, b] = viewPlaneAxes(draw.baseView);
  return draw.bounds.max[a] - draw.bounds.min[a] >= min && draw.bounds.max[b] - draw.bounds.min[b] >= min;
}

export function hasMinExtentSize(draw: PrimDrawState, min: number): boolean {
  const axis = draw.extentAxis;
  const span = draw.bounds.max[axis] - draw.bounds.min[axis];
  const thinMin = Math.max(min * 0.25, 1);
  return span >= thinMin;
}

export function updatePrimDrag(
  draw: PrimDrawState,
  vpKey: View2DKey,
  p0: Vec3,
  p1: Vec3,
  modifiers?: PrimDragModifiers,
): PrimDrawState {
  if (draw.phase === 'base') {
    const [a, b] = viewPlaneAxes(vpKey);
    const cursor = applyFootprintConstraints(p0, p1, a, b, modifiers);
    return applyBaseDrag(draw, vpKey, p0, cursor);
  }
  return applyExtentDrag(draw, p0, p1);
}

export function updatePrimDrag3D(
  draw: PrimDrawState,
  p0: Vec3,
  p1: Vec3,
  modifiers?: PrimDragModifiers,
): PrimDrawState {
  if (draw.phase === 'base') {
    const cursor = applyFootprintConstraints(p0, p1, 'x', 'z', modifiers);
    return applyBaseDrag3D(draw, p0, cursor);
  }
  return applyExtentDrag(draw, p0, p1);
}

/** Keep footprint flat during base-phase handle edits. */
export function constrainPrimDrawBounds(draw: PrimDrawState): PrimDrawState {
  if (draw.phase !== 'base') return draw;
  const b = draw.bounds;
  if (draw.baseView === '3d') {
    return {
      ...draw,
      bounds: { min: { ...b.min, y: 0 }, max: { ...b.max, y: 0 } },
    };
  }
  const third = extentAxisForView(draw.baseView);
  return {
    ...draw,
    bounds: { min: { ...b.min, [third]: 0 }, max: { ...b.max, [third]: 0 } },
  };
}

export function canCommitPrimDraw(draw: PrimDrawState, min: number): boolean {
  return draw.phase === 'extent' && hasMinBaseSize(draw, min) && hasMinExtentSize(draw, min);
}

export function isClickNotDrag(
  start: { x: number; y: number } | null,
  endX: number,
  endY: number,
): boolean {
  if (!start) return false;
  return Math.hypot(endX - start.x, endY - start.y) < CLICK_DRAG_THRESHOLD;
}

const GROUND_ALIGNED = new Set(['cone', 'pyramid', 'hemisphere', 'stairs', 'plane', 'disc']);

export function defaultBoundsAtPoint(
  draw: PrimDrawState,
  point: Vec3,
  snapSize: number,
  baseView: PrimDrawView,
  lastSize?: PrimSize,
): BoundingBox {
  const size = lastSize ?? primSizeFromDefaults(draw.type, snapSize);
  const halfW = size.w / 2;
  const halfD = size.d / 2;

  if (baseView === '3d') {
    return {
      min: { x: point.x - halfW, y: 0, z: point.z - halfD },
      max: { x: point.x + halfW, y: size.h, z: point.z + halfD },
    };
  }

  const vp = baseView as View2DKey;
  const [a, b] = viewPlaneAxes(vp);
  const ext = extentAxisForView(vp);
  const min: Vec3 = { ...point };
  const max: Vec3 = { ...point };

  const spanA = a === 'x' ? size.w : a === 'y' ? size.h : size.d;
  const spanB = b === 'x' ? size.w : b === 'y' ? size.h : size.d;
  const halfA = spanA / 2;
  const halfB = spanB / 2;

  min[a] = point[a] - halfA;
  max[a] = point[a] + halfA;
  min[b] = point[b] - halfB;
  max[b] = point[b] + halfB;

  const extSpan = extentSpanFromPrimSize(size, ext);
  const growFromGround = GROUND_ALIGNED.has(draw.type) || ext === 'y';
  if (growFromGround) {
    if (ext === 'y') {
      min.y = 0;
      max.y = extSpan;
    } else if (ext === 'z') {
      min.z = Math.min(point.z, 0);
      max.z = min.z + extSpan;
    } else {
      min.x = Math.min(point.x, 0);
      max.x = min.x + extSpan;
    }
  } else {
    min[ext] = point[ext] - extSpan / 2;
    max[ext] = point[ext] + extSpan / 2;
  }

  if (draw.type === 'plane' || draw.type === 'disc') {
    const thin = Math.max(snapSize * 0.25, 1);
    const mid = (min[ext] + max[ext]) / 2;
    min[ext] = mid - thin / 2;
    max[ext] = mid + thin / 2;
  }

  return { min, max };
}

function primSizeFromDefaults(type: PrimDrawState['type'], snapSize: number): PrimSize {
  const { footprint, height } = defaultPlacementSize(type, snapSize);
  return { w: footprint, h: height, d: footprint };
}

export function applyQuickPlace(
  draw: PrimDrawState,
  point: Vec3,
  snapSize: number,
  baseView: PrimDrawView,
  lastSize?: PrimSize,
): PrimDrawState {
  const extentAxis = baseView === '3d' ? 'y' : extentAxisForView(baseView as View2DKey);
  return {
    ...draw,
    phase: 'extent',
    baseView,
    extentAxis,
    bounds: defaultBoundsAtPoint(draw, point, snapSize, baseView, lastSize),
    anchor: null,
    cursor: null,
    placementSource: 'click',
  };
}

export function seedMinExtentHeight(
  draw: PrimDrawState,
  snapSize: number,
  lastSize?: PrimSize,
): PrimDrawState {
  const axis = draw.extentAxis;
  if (draw.bounds.max[axis] - draw.bounds.min[axis] >= snapSize * 0.25) return draw;
  const fallback = primSizeFromDefaults(draw.type, snapSize);
  const size = lastSize ?? fallback;
  const minExtent = Math.max(extentSpanFromPrimSize(size, axis), snapSize * 0.25);
  return {
    ...draw,
    bounds: {
      ...draw.bounds,
      max: { ...draw.bounds.max, [axis]: draw.bounds.min[axis] + minExtent },
    },
  };
}

export function advanceBaseToExtent(
  draw: PrimDrawState,
  snapSize: number,
  lastSize?: PrimSize,
): PrimDrawState {
  return seedMinExtentHeight(
    {
      ...draw,
      phase: 'extent',
      anchor: null,
      cursor: null,
      placementSource: draw.placementSource ?? 'drag',
    },
    snapSize,
    lastSize,
  );
}

export function adjustPrimDrawExtentByWheel(
  draw: PrimDrawState,
  deltaY: number,
  snapSize: number,
  fine: boolean,
): PrimDrawState {
  if (draw.phase !== 'extent') return draw;
  const step = (fine ? snapSize * 0.25 : snapSize) * (deltaY > 0 ? -1 : 1);
  const axis = draw.extentAxis;
  const thinMin = Math.max(snapSize * 0.25, 1);
  const minSpan = draw.type === 'plane' || draw.type === 'disc' ? thinMin : snapSize * 0.25;
  const newMax = draw.bounds.max[axis] + step;
  if (newMax < draw.bounds.min[axis] + minSpan) return draw;
  return {
    ...draw,
    bounds: {
      ...draw.bounds,
      max: { ...draw.bounds.max, [axis]: newMax },
    },
  };
}

export function formatPrimDrawDimensions(draw: PrimDrawState): string {
  const { min, max } = draw.bounds;
  const w = Math.round(max.x - min.x);
  const h = Math.round(max.y - min.y);
  const d = Math.round(max.z - min.z);
  return `${w} × ${h} × ${d}`;
}

export type PrimDragMode = 'create-base' | 'create-extent' | 'handle';

/** Resolve prim drag release — returns updated draw state or null if unchanged. */
export function resolvePrimDragRelease(
  draw: PrimDrawState,
  mode: PrimDragMode,
  snapSize: number,
  baseView: PrimDrawView,
  clickPoint: Vec3,
  pointerMoved: boolean,
  lastSize?: PrimSize,
): PrimDrawState | null {
  if (mode === 'create-base' && draw.phase === 'base') {
    if (hasMinBaseSize(draw, snapSize)) {
      return advanceBaseToExtent(draw, snapSize, lastSize);
    }
    if (!pointerMoved) {
      return applyQuickPlace(draw, clickPoint, snapSize, baseView, lastSize);
    }
    return null;
  }

  if (mode === 'handle' && draw.phase === 'base' && hasMinBaseSize(draw, snapSize)) {
    return advanceBaseToExtent(draw, snapSize, lastSize);
  }

  return null;
}

export function footprintSquareAxes(
  draw: PrimDrawState,
): ['x' | 'y' | 'z', 'x' | 'y' | 'z'] | undefined {
  if (draw.baseView === '3d') return ['x', 'z'];
  if (draw.baseView === 'top' || draw.baseView === 'front' || draw.baseView === 'side') {
    return viewPlaneAxes(draw.baseView);
  }
  return undefined;
}

export function lastPrimSizeForDraw(
  lastPrimSizes: Partial<Record<PrimitiveType, PrimSize>>,
  type: PrimitiveType,
): PrimSize | undefined {
  return lastPrimSizes[type];
}
