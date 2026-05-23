import * as THREE from 'three';
import { VIEW2D_DEFS, w2s, type View2DKey } from '@/core/math/projection';
import type { Vec3 } from '@/core/math/Vec3';
import type { GizmoMode } from '@/systems/viewport/transformGizmo3D';
import { MS3D_VIEW } from '@/systems/viewport/viewportColors';

export type GizmoAxis = 'x' | 'y' | 'z';

const AXES: GizmoAxis[] = ['x', 'y', 'z'];
const AXIS_COLORS: Record<GizmoAxis, string> = {
  x: MS3D_VIEW.gizmoAxisX,
  y: MS3D_VIEW.gizmoAxisY,
  z: MS3D_VIEW.gizmoAxisZ,
};
const AXIS_WORLD: Record<GizmoAxis, Vec3> = {
  x: { x: 1, y: 0, z: 0 },
  y: { x: 0, y: 1, z: 0 },
  z: { x: 0, y: 0, z: 1 },
};

const GIZMO_WORLD_LEN = 10;
const PICK_RADIUS = 10;

export function worldPivotToScreen(
  vpKey: View2DKey,
  pivot: Vec3,
  pan: { x: number; y: number },
  zoom: number,
): { x: number; y: number } {
  const pj = VIEW2D_DEFS[vpKey].proj(pivot);
  return w2s(pj.x, pj.y, pan, zoom);
}

function axisScreenVector(
  vpKey: View2DKey,
  axis: GizmoAxis,
  pan: { x: number; y: number },
  zoom: number,
  origin: Vec3,
): { dx: number; dy: number; len: number } {
  const vd = VIEW2D_DEFS[vpKey];
  const o = vd.proj(origin);
  const w = AXIS_WORLD[axis];
  const tip = vd.proj({
    x: origin.x + w.x * GIZMO_WORLD_LEN,
    y: origin.y + w.y * GIZMO_WORLD_LEN,
    z: origin.z + w.z * GIZMO_WORLD_LEN,
  });
  const s0 = w2s(o.x, o.y, pan, zoom);
  const s1 = w2s(tip.x, tip.y, pan, zoom);
  const dx = s1.x - s0.x;
  const dy = s1.y - s0.y;
  const len = Math.hypot(dx, dy);
  return { dx, dy, len };
}

/** Axis pointing into/out of the ortho view (shows as a center handle). */
export function viewDepthAxis(vpKey: View2DKey): GizmoAxis {
  if (vpKey === 'top') return 'y';
  if (vpKey === 'front') return 'z';
  return 'x';
}

function drawMoveArrow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  len: number,
  color: string,
  active: boolean,
): void {
  if (len < 4) return;
  const ux = dx / len;
  const uy = dy / len;
  const shaft = len * 0.78;
  const head = len * 0.22;
  ctx.strokeStyle = active ? MS3D_VIEW.gizmoActive : color;
  ctx.fillStyle = active ? MS3D_VIEW.gizmoActive : color;
  ctx.lineWidth = active ? 2.5 : 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + ux * shaft, cy + uy * shaft);
  ctx.stroke();
  const tx = cx + ux * len;
  const ty = cy + uy * len;
  const px = -uy;
  const py = ux;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx - ux * head + px * head * 0.45, ty - uy * head + py * head * 0.45);
  ctx.lineTo(tx - ux * head - px * head * 0.45, ty - uy * head - py * head * 0.45);
  ctx.closePath();
  ctx.fill();
}

function drawScaleHandle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  len: number,
  color: string,
  active: boolean,
): void {
  if (len < 4) return;
  const ux = dx / len;
  const uy = dy / len;
  const shaft = len * 0.72;
  const box = Math.max(5, len * 0.14);
  ctx.strokeStyle = active ? MS3D_VIEW.gizmoActive : color;
  ctx.fillStyle = active ? MS3D_VIEW.gizmoActive : color;
  ctx.lineWidth = active ? 2.5 : 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + ux * shaft, cy + uy * shaft);
  ctx.stroke();
  const tx = cx + ux * (shaft + box * 0.5);
  const ty = cy + uy * (shaft + box * 0.5);
  ctx.fillRect(tx - box / 2, ty - box / 2, box, box);
}

function drawDepthHandle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  color: string,
  active: boolean,
  mode: GizmoMode,
): void {
  const r = mode === 'scale' ? 5 : 4;
  ctx.fillStyle = active ? MS3D_VIEW.gizmoActive : color;
  ctx.beginPath();
  if (mode === 'scale') {
    ctx.rect(cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
  }
  ctx.fill();
}

function drawRotateRing(
  ctx: CanvasRenderingContext2D,
  vpKey: View2DKey,
  axis: GizmoAxis,
  pivot: Vec3,
  pan: { x: number; y: number },
  zoom: number,
  color: string,
  active: boolean,
): void {
  const depth = viewDepthAxis(vpKey);
  const radius = GIZMO_WORLD_LEN * zoom * 0.88;
  ctx.strokeStyle = active ? MS3D_VIEW.gizmoActive : color;
  ctx.lineWidth = active ? 2.5 : 2;

  if (axis === depth) {
    const c = worldPivotToScreen(vpKey, pivot, pan, zoom);
    ctx.beginPath();
    ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }

  const segments = 48;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    let p: Vec3;
    if (axis === 'x') p = { x: pivot.x, y: pivot.y + c * GIZMO_WORLD_LEN * 0.88, z: pivot.z + s * GIZMO_WORLD_LEN * 0.88 };
    else if (axis === 'y') p = { x: pivot.x + c * GIZMO_WORLD_LEN * 0.88, y: pivot.y, z: pivot.z + s * GIZMO_WORLD_LEN * 0.88 };
    else p = { x: pivot.x + c * GIZMO_WORLD_LEN * 0.88, y: pivot.y + s * GIZMO_WORLD_LEN * 0.88, z: pivot.z };
    points.push(worldPivotToScreen(vpKey, p, pan, zoom));
  }
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
}

export function drawTransformGizmo2D(
  ctx: CanvasRenderingContext2D,
  vpKey: View2DKey,
  mode: GizmoMode,
  pivot: Vec3,
  pan: { x: number; y: number },
  zoom: number,
  activeAxis: GizmoAxis | null = null,
): void {
  const center = worldPivotToScreen(vpKey, pivot, pan, zoom);
  const depth = viewDepthAxis(vpKey);

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';

  if (mode === 'rotate') {
    AXES.forEach((axis) => {
      drawRotateRing(ctx, vpKey, axis, pivot, pan, zoom, AXIS_COLORS[axis], activeAxis === axis);
    });
  } else {
    AXES.forEach((axis) => {
      const { dx, dy, len } = axisScreenVector(vpKey, axis, pan, zoom, pivot);
      if (axis === depth && len < 6) {
        drawDepthHandle(ctx, center.x, center.y, AXIS_COLORS[axis], activeAxis === axis, mode);
        return;
      }
      if (mode === 'scale') {
        drawScaleHandle(ctx, center.x, center.y, dx, dy, len, AXIS_COLORS[axis], activeAxis === axis);
      } else {
        drawMoveArrow(ctx, center.x, center.y, dx, dy, len, AXIS_COLORS[axis], activeAxis === axis);
      }
    });
  }

  ctx.fillStyle = MS3D_VIEW.gizmoCenter;
  ctx.beginPath();
  ctx.arc(center.x, center.y, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function distToSegment(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) return Math.hypot(px - x0, py - y0);
  let t = ((px - x0) * dx + (py - y0) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

export function hitTestTransformGizmo2D(
  vpKey: View2DKey,
  mode: GizmoMode,
  pivot: Vec3,
  pan: { x: number; y: number },
  zoom: number,
  sx: number,
  sy: number,
): GizmoAxis | null {
  const center = worldPivotToScreen(vpKey, pivot, pan, zoom);
  const depth = viewDepthAxis(vpKey);
  let best: GizmoAxis | null = null;
  let bestDist = PICK_RADIUS;

  if (mode === 'rotate') {
    for (const axis of AXES) {
      const radius = GIZMO_WORLD_LEN * zoom * 0.88;
      if (axis === depth) {
        const d = Math.abs(Math.hypot(sx - center.x, sy - center.y) - radius);
        if (d < bestDist) {
          bestDist = d;
          best = axis;
        }
        continue;
      }
      const segments = 40;
      for (let i = 0; i <= segments; i++) {
        const t = (i / segments) * Math.PI * 2;
        const c = Math.cos(t);
        const s = Math.sin(t);
        let p: Vec3;
        if (axis === 'x') p = { x: pivot.x, y: pivot.y + c * GIZMO_WORLD_LEN * 0.88, z: pivot.z + s * GIZMO_WORLD_LEN * 0.88 };
        else if (axis === 'y') p = { x: pivot.x + c * GIZMO_WORLD_LEN * 0.88, y: pivot.y, z: pivot.z + s * GIZMO_WORLD_LEN * 0.88 };
        else p = { x: pivot.x + c * GIZMO_WORLD_LEN * 0.88, y: pivot.y + s * GIZMO_WORLD_LEN * 0.88, z: pivot.z };
        const sp = worldPivotToScreen(vpKey, p, pan, zoom);
        const d = Math.hypot(sp.x - sx, sp.y - sy);
        if (d < bestDist) {
          bestDist = d;
          best = axis;
        }
      }
    }
    return best;
  }

  for (const axis of AXES) {
    const { dx, dy, len } = axisScreenVector(vpKey, axis, pan, zoom, pivot);
    if (axis === depth && len < 6) {
      const d = Math.hypot(sx - center.x, sy - center.y);
      if (d < bestDist) {
        bestDist = d;
        best = axis;
      }
      continue;
    }
    if (len < 4) continue;
    const ux = dx / len;
    const uy = dy / len;
    const tipLen = mode === 'scale' ? len * 0.86 : len;
    const d = distToSegment(sx, sy, center.x, center.y, center.x + ux * tipLen, center.y + uy * tipLen);
    if (d < bestDist) {
      bestDist = d;
      best = axis;
    }
  }
  return best;
}

const _axisVec = new THREE.Vector3();
const _deltaQuat = new THREE.Quaternion();

/** Apply a 2D gizmo drag to a pivot object (feeds transformControlsBridge). */
export function applyGizmoDragToPivot2D(
  pivot: THREE.Object3D,
  mode: GizmoMode,
  axis: GizmoAxis,
  vpKey: View2DKey,
  pivotWorld: Vec3,
  pan: { x: number; y: number },
  zoom: number,
  startScreen: { x: number; y: number },
  sx: number,
  sy: number,
  startPosition: THREE.Vector3,
  startQuaternion: THREE.Quaternion,
  startScale: THREE.Vector3,
): void {
  pivot.position.copy(startPosition);
  pivot.quaternion.copy(startQuaternion);
  pivot.scale.copy(startScale);

  if (mode === 'move') {
    const { dx, dy, len } = axisScreenVector(vpKey, axis, pan, zoom, pivotWorld);
    if (len < 1e-3) return;
    const ux = dx / len;
    const uy = dy / len;
    const deltaScreen = (sx - startScreen.x) * ux + (sy - startScreen.y) * uy;
    const worldPerPixel = len / (GIZMO_WORLD_LEN * zoom);
    const worldDelta = worldPerPixel > 1e-6 ? deltaScreen / worldPerPixel : 0;
    _axisVec.set(
      axis === 'x' ? worldDelta : 0,
      axis === 'y' ? worldDelta : 0,
      axis === 'z' ? worldDelta : 0,
    );
    pivot.position.copy(startPosition).add(_axisVec);
  } else if (mode === 'rotate') {
    const center = worldPivotToScreen(vpKey, pivotWorld, pan, zoom);
    const a0 = Math.atan2(startScreen.y - center.y, startScreen.x - center.x);
    const a1 = Math.atan2(sy - center.y, sx - center.x);
    let angle = a1 - a0;
    if (axis === viewDepthAxis(vpKey)) {
      /* full ring — screen angle matches rotation */
    } else {
      const facing = axis === 'x' ? 1 : axis === 'y' ? (vpKey === 'top' ? -1 : 1) : 1;
      angle *= facing;
    }
    _axisVec.set(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);
    _deltaQuat.setFromAxisAngle(_axisVec, angle);
    pivot.quaternion.copy(startQuaternion).multiply(_deltaQuat);
  } else if (mode === 'scale') {
    const { dx, dy, len } = axisScreenVector(vpKey, axis, pan, zoom, pivotWorld);
    if (len < 1e-3) return;
    const ux = dx / len;
    const uy = dy / len;
    const deltaScreen = (sx - startScreen.x) * ux + (sy - startScreen.y) * uy;
    const factor = Math.max(0.05, 1 + deltaScreen / Math.max(len * 0.5, 8));
    pivot.scale.set(startScale.x, startScale.y, startScale.z);
    if (axis === 'x') pivot.scale.x = startScale.x * factor;
    else if (axis === 'y') pivot.scale.y = startScale.y * factor;
    else pivot.scale.z = startScale.z * factor;
  }

  pivot.updateMatrixWorld(true);
}

export function capturePivotTransform(pivot: THREE.Object3D): {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
} {
  return {
    position: pivot.position.clone(),
    quaternion: pivot.quaternion.clone(),
    scale: pivot.scale.clone(),
  };
}

export function syncPivotToWorld(pivot: THREE.Object3D, world: Vec3): void {
  pivot.position.set(world.x, world.y, world.z);
  pivot.rotation.set(0, 0, 0);
  pivot.scale.set(1, 1, 1);
  pivot.updateMatrixWorld(true);
}

export function gizmoModeToControlsMode(mode: GizmoMode): 'translate' | 'rotate' | 'scale' {
  return mode === 'move' ? 'translate' : mode;
}
