import { VIEW2D_DEFS, s2w, type View2DKey } from '@/core/math/projection';
import type { Vec3 } from '@/core/math/Vec3';
import {
  applyBaseDrag,
  applyBaseDrag3D,
  applyExtentDrag,
  viewPlaneAxes,
  type PrimDrawState,
} from '@/systems/mesh/primDraw';
import type { useEditorStore } from '@/store/editorStore';

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
  return draw.bounds.max[axis] - draw.bounds.min[axis] >= min;
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

export type EditorGetState = ReturnType<typeof useEditorStore.getState>;
