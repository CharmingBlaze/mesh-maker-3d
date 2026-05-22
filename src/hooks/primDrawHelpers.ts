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
import { defaultPlacementSize } from '@/systems/mesh/primitives';
import type { useEditorStore } from '@/store/editorStore';

export const CLICK_DRAG_THRESHOLD = 4;

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
): PrimDrawState {
  if (draw.phase === 'base') return applyBaseDrag(draw, vpKey, p0, p1);
  return applyExtentDrag(draw, p0, p1);
}

export function updatePrimDrag3D(draw: PrimDrawState, p0: Vec3, p1: Vec3): PrimDrawState {
  if (draw.phase === 'base') return applyBaseDrag3D(draw, p0, p1);
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
): BoundingBox {
  const { footprint, height } = defaultPlacementSize(draw.type, snapSize);
  const half = footprint / 2;

  if (baseView === '3d') {
    return {
      min: { x: point.x - half, y: 0, z: point.z - half },
      max: { x: point.x + half, y: height, z: point.z + half },
    };
  }

  const vp = baseView as View2DKey;
  const [a, b] = viewPlaneAxes(vp);
  const ext = extentAxisForView(vp);
  const min: Vec3 = { ...point };
  const max: Vec3 = { ...point };

  min[a] = point[a] - half;
  max[a] = point[a] + half;
  min[b] = point[b] - half;
  max[b] = point[b] + half;

  const growFromGround = GROUND_ALIGNED.has(draw.type) || ext === 'y';
  if (growFromGround) {
    if (ext === 'y') {
      min.y = 0;
      max.y = height;
    } else if (ext === 'z') {
      min.z = Math.min(point.z, 0);
      max.z = min.z + height;
    } else {
      min.x = Math.min(point.x, 0);
      max.x = min.x + height;
    }
  } else {
    min[ext] = point[ext] - height / 2;
    max[ext] = point[ext] + height / 2;
  }

  if (draw.type === 'plane' || draw.type === 'disc') {
    const thin = Math.max(snapSize * 0.25, 1);
    const mid = (min[ext] + max[ext]) / 2;
    min[ext] = mid - thin / 2;
    max[ext] = mid + thin / 2;
  }

  return { min, max };
}

export function applyQuickPlace(
  draw: PrimDrawState,
  point: Vec3,
  snapSize: number,
  baseView: PrimDrawView,
): PrimDrawState {
  const extentAxis = baseView === '3d' ? 'y' : extentAxisForView(baseView as View2DKey);
  return {
    ...draw,
    phase: 'extent',
    baseView,
    extentAxis,
    bounds: defaultBoundsAtPoint(draw, point, snapSize, baseView),
    anchor: null,
    cursor: null,
    placementSource: 'click',
  };
}

export function seedMinExtentHeight(draw: PrimDrawState, snapSize: number): PrimDrawState {
  const axis = draw.extentAxis;
  if (draw.bounds.max[axis] - draw.bounds.min[axis] >= snapSize * 0.25) return draw;
  const { height } = defaultPlacementSize(draw.type, snapSize);
  const minExtent = Math.max(height, snapSize * 0.25);
  return {
    ...draw,
    bounds: {
      ...draw.bounds,
      max: { ...draw.bounds.max, [axis]: draw.bounds.min[axis] + minExtent },
    },
  };
}

export function advanceBaseToExtent(draw: PrimDrawState, snapSize: number): PrimDrawState {
  return seedMinExtentHeight(
    {
      ...draw,
      phase: 'extent',
      anchor: null,
      cursor: null,
      placementSource: draw.placementSource ?? 'drag',
    },
    snapSize,
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
): PrimDrawState | null {
  if (mode === 'create-base' && draw.phase === 'base') {
    if (hasMinBaseSize(draw, snapSize)) {
      return advanceBaseToExtent(draw, snapSize);
    }
    if (!pointerMoved) {
      return applyQuickPlace(draw, clickPoint, snapSize, baseView);
    }
    return null;
  }

  if (mode === 'handle' && draw.phase === 'base' && hasMinBaseSize(draw, snapSize)) {
    return advanceBaseToExtent(draw, snapSize);
  }

  return null;
}

export type EditorGetState = ReturnType<typeof useEditorStore.getState>;
