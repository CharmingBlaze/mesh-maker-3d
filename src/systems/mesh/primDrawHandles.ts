import type { BoundingBox } from '@/core/math/BoundingBox';
import { boundsCenter, boundsCorners, boundsFromCorners, boundsSize } from '@/core/math/BoundingBox';
import type { View2DKey } from '@/core/math/projection';
import { VIEW2D_DEFS, w2s } from '@/core/math/projection';
import type { Vec3 } from '@/core/math/Vec3';
import type { PrimDrawPhase } from '@/systems/mesh/primDraw';

export type PrimHandleKind = 'corner' | 'face' | 'center' | 'extent';

export interface PrimDrawHandle {
  id: string;
  kind: PrimHandleKind;
  position: Vec3;
  /** Corner index in boundsCorners order */
  cornerIndex?: number;
  /** Face axis for face/extent handles */
  axis?: 'x' | 'y' | 'z';
  /** +1 = max face, -1 = min face */
  sign?: 1 | -1;
}

const OPPOSITE_CORNER = [6, 7, 4, 5, 2, 3, 0, 1];

export function boundsHasVisibleSize(bounds: BoundingBox, min = 0.001): boolean {
  const size = boundsSize(bounds);
  return size.x > min || size.y > min || size.z > min;
}

export function buildPrimDrawHandles(
  bounds: BoundingBox,
  phase: PrimDrawPhase,
  extentAxis: 'x' | 'y' | 'z',
): PrimDrawHandle[] {
  if (!boundsHasVisibleSize(bounds)) return [];

  const corners = boundsCorners(bounds);
  const center = boundsCenter(bounds);
  const handles: PrimDrawHandle[] = [];

  corners.forEach((c, i) => {
    handles.push({ id: `c${i}`, kind: 'corner', position: c, cornerIndex: i });
  });

  const { min, max } = bounds;
  const faceDefs: { axis: 'x' | 'y' | 'z'; sign: 1 | -1; pos: Vec3 }[] = [
    { axis: 'x', sign: -1, pos: { x: min.x, y: center.y, z: center.z } },
    { axis: 'x', sign: 1, pos: { x: max.x, y: center.y, z: center.z } },
    { axis: 'y', sign: -1, pos: { x: center.x, y: min.y, z: center.z } },
    { axis: 'y', sign: 1, pos: { x: center.x, y: max.y, z: center.z } },
    { axis: 'z', sign: -1, pos: { x: center.x, y: center.y, z: min.z } },
    { axis: 'z', sign: 1, pos: { x: center.x, y: center.y, z: max.z } },
  ];

  faceDefs.forEach(({ axis, sign, pos }) => {
    const isExtentFace = phase === 'extent' && axis === extentAxis && sign === 1;
    handles.push({
      id: isExtentFace ? 'extent' : `f-${axis}${sign > 0 ? '+' : '-'}`,
      kind: isExtentFace ? 'extent' : 'face',
      position: pos,
      axis,
      sign,
    });
  });

  handles.push({ id: 'center', kind: 'center', position: center });
  return handles;
}

export function projectHandleToScreen(
  handle: PrimDrawHandle,
  vpKey: View2DKey,
  pan: { x: number; y: number },
  zoom: number,
): { x: number; y: number } {
  const p = VIEW2D_DEFS[vpKey].proj(handle.position);
  return w2s(p.x, p.y, pan, zoom);
}

export function hitTestPrimDrawHandle2D(
  sx: number,
  sy: number,
  handles: PrimDrawHandle[],
  vpKey: View2DKey,
  pan: { x: number; y: number },
  zoom: number,
): PrimDrawHandle | null {
  let best: PrimDrawHandle | null = null;
  let bestDist = Infinity;
  const baseRadius = 9;

  for (const handle of handles) {
    const pt = projectHandleToScreen(handle, vpKey, pan, zoom);
    const radius =
      handle.kind === 'extent' ? baseRadius + 3 : handle.kind === 'center' ? baseRadius - 1 : baseRadius;
    const dist = Math.hypot(sx - pt.x, sy - pt.y);
    if (dist <= radius && dist < bestDist) {
      best = handle;
      bestDist = dist;
    }
  }
  return best;
}

/** Screen-space hit test for 3D view (handles projected with same math as vertex picking). */
export function hitTestPrimDrawHandleScreen(
  sx: number,
  sy: number,
  handles: PrimDrawHandle[],
  project: (v: Vec3) => { x: number; y: number } | null,
): PrimDrawHandle | null {
  let best: PrimDrawHandle | null = null;
  let bestDist = Infinity;
  const baseRadius = 12;

  for (const handle of handles) {
    const p = project(handle.position);
    if (!p) continue;
    const radius =
      handle.kind === 'extent' ? baseRadius + 4 : handle.kind === 'center' ? baseRadius - 2 : baseRadius;
    const dist = Math.hypot(sx - p.x, sy - p.y);
    if (dist <= radius && dist < bestDist) {
      best = handle;
      bestDist = dist;
    }
  }
  return best;
}

function snapVec3(v: Vec3, snap: (n: number) => number): Vec3 {
  return { x: snap(v.x), y: snap(v.y), z: snap(v.z) };
}

export function oppositeCornerIndex(i: number): number {
  return OPPOSITE_CORNER[i];
}

export function applyCornerHandleDrag(
  bounds: BoundingBox,
  cornerIndex: number,
  world: Vec3,
  snap: (n: number) => number,
): BoundingBox {
  const corners = boundsCorners(bounds);
  const fixed = corners[oppositeCornerIndex(cornerIndex)];
  return boundsFromCorners(fixed, snapVec3(world, snap));
}

export function applyFaceHandleDrag(
  bounds: BoundingBox,
  axis: 'x' | 'y' | 'z',
  sign: 1 | -1,
  world: Vec3,
  snap: (n: number) => number,
): BoundingBox {
  const out = { min: { ...bounds.min }, max: { ...bounds.max } };
  const val = snap(world[axis]);
  if (sign > 0) out.max[axis] = val;
  else out.min[axis] = val;
  if (out.min[axis] > out.max[axis]) {
    const t = out.min[axis];
    out.min[axis] = out.max[axis];
    out.max[axis] = t;
  }
  return out;
}

export function applyCenterHandleDrag(
  startBounds: BoundingBox,
  startWorld: Vec3,
  world: Vec3,
  snap: (n: number) => number,
): BoundingBox {
  const sw = snapVec3(startWorld, snap);
  const cw = snapVec3(world, snap);
  const dx = cw.x - sw.x;
  const dy = cw.y - sw.y;
  const dz = cw.z - sw.z;
  return {
    min: { x: startBounds.min.x + dx, y: startBounds.min.y + dy, z: startBounds.min.z + dz },
    max: { x: startBounds.max.x + dx, y: startBounds.max.y + dy, z: startBounds.max.z + dz },
  };
}

export function applyHandleDrag(
  bounds: BoundingBox,
  handle: PrimDrawHandle,
  world: Vec3,
  snap: (n: number) => number,
  dragStart?: { bounds: BoundingBox; world: Vec3 },
): BoundingBox {
  if (handle.kind === 'corner' && handle.cornerIndex !== undefined) {
    return applyCornerHandleDrag(bounds, handle.cornerIndex, world, snap);
  }
  if ((handle.kind === 'face' || handle.kind === 'extent') && handle.axis && handle.sign) {
    return applyFaceHandleDrag(bounds, handle.axis, handle.sign, world, snap);
  }
  if (handle.kind === 'center' && dragStart) {
    return applyCenterHandleDrag(dragStart.bounds, dragStart.world, world, snap);
  }
  return bounds;
}

export function handleCursor(handle: PrimDrawHandle | null): string {
  if (!handle) return 'crosshair';
  if (handle.kind === 'center') return 'move';
  if (handle.kind === 'extent') {
    if (handle.axis === 'x') return 'ew-resize';
    if (handle.axis === 'z') return 'ns-resize';
    return 'ns-resize';
  }
  if (handle.kind === 'corner') return 'nwse-resize';
  return 'pointer';
}
