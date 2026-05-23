import type { View2DKey } from '@/core/math/projection';
import type { Vec3 } from '@/core/math/Vec3';

export type KnifeDrawView = View2DKey | '3d';
export type KnifePointKind = 'vertex' | 'edge' | 'face' | 'node';

/** Cut control point — geometry snap metadata is for preview only. */
export interface KnifePoint {
  position: Vec3;
  kind: KnifePointKind;
  snapped: boolean;
  faceIndex?: number;
  vertexIndex?: number;
  edge?: readonly [number, number];
  reuseOf?: number;
}

export interface KnifeDrawState {
  view: KnifeDrawView;
  points: KnifePoint[];
  hover: KnifePoint | null;
  /** Locked 3D view basis for view-aligned cuts (captured when the path starts). */
  viewRight?: Vec3;
  viewUp?: Vec3;
}

export const KNIFE_DRAW_HINT =
  'Surface cut · snaps to nodes/verts/edges · Enter confirm · Esc cancel · Backspace undo';

export function isKnifeActive(tool: string, knifeDraw: KnifeDrawState | null): boolean {
  return tool === 'knife' || knifeDraw !== null;
}

export function createKnifeDrawState(
  view: KnifeDrawView,
  viewBasis?: { viewRight: Vec3; viewUp: Vec3 },
): KnifeDrawState {
  return {
    view,
    points: [],
    hover: null,
    viewRight: viewBasis?.viewRight,
    viewUp: viewBasis?.viewUp,
  };
}

export function canCommitKnifeCut(draw: KnifeDrawState): boolean {
  return draw.points.length >= 2;
}

export function knifePreviewPoints(draw: KnifeDrawState): KnifePoint[] {
  if (!draw.hover) return draw.points;
  return [...draw.points, draw.hover];
}

export function pointsNearlyEqual(a: Vec3, b: Vec3, eps = 0.001): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < eps;
}

export function addKnifePoint(state: KnifeDrawState, point: KnifePoint): KnifeDrawState | null {
  const resolved =
    point.reuseOf !== undefined && state.points[point.reuseOf]
      ? { ...point, position: { ...state.points[point.reuseOf].position }, kind: 'node' as const, snapped: true }
      : point;
  const last = state.points[state.points.length - 1];
  if (last && pointsNearlyEqual(last.position, resolved.position)) return null;
  if (resolved.reuseOf !== undefined && last?.reuseOf === resolved.reuseOf) return null;
  return { ...state, points: [...state.points, resolved], hover: null };
}

export function popKnifePoint(state: KnifeDrawState): KnifeDrawState {
  if (state.points.length === 0) return state;
  return { ...state, points: state.points.slice(0, -1), hover: null };
}

export function withKnifeHover(state: KnifeDrawState, hover: KnifePoint | null): KnifeDrawState {
  return { ...state, hover };
}
