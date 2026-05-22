import { VIEW2D_DEFS, w2s, type View2DKey } from '@/core/math/projection';
import { boundsCenter, boundsCorners, type BoundingBox } from '@/core/math/BoundingBox';
import type { PrimDrawState } from '@/systems/mesh/primDraw';
import { formatPrimDrawDimensions } from '@/hooks/primDrawHelpers';
import {
  buildPrimDrawHandles,
  projectHandleToScreen,
  type PrimDrawHandle,
} from '@/systems/mesh/primDrawHandles';
import { buildPrimitiveMeshInBounds } from '@/systems/mesh/primitiveFromBounds';

const BOX_EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

/** Draw a world-axis-aligned box wireframe in an orthographic viewport. */
export function drawBoundsWireframe2D(
  ctx: CanvasRenderingContext2D,
  vpKey: View2DKey,
  bounds: BoundingBox,
  pan: { x: number; y: number },
  zoom: number,
  style: { stroke: string; lineWidth: number; dash?: number[] } = {
    stroke: '#e85a1a',
    lineWidth: 2,
  },
): void {
  const vd = VIEW2D_DEFS[vpKey];
  const corners = boundsCorners(bounds);
  const pts = corners.map((c) => {
    const p = vd.proj(c);
    return w2s(p.x, p.y, pan, zoom);
  });

  ctx.save();
  ctx.strokeStyle = style.stroke;
  ctx.lineWidth = style.lineWidth;
  if (style.dash) ctx.setLineDash(style.dash);

  BOX_EDGES.forEach(([a, b]) => {
    ctx.beginPath();
    ctx.moveTo(pts[a].x, pts[a].y);
    ctx.lineTo(pts[b].x, pts[b].y);
    ctx.stroke();
  });

  ctx.setLineDash([]);
  ctx.restore();
}

const BOX_FACE_LOOPS: number[][] = [
  [0, 1, 2, 3],
  [4, 5, 6, 7],
  [0, 1, 5, 4],
  [2, 3, 7, 6],
  [0, 3, 7, 4],
  [1, 2, 6, 5],
];

/** Orange CAD construction box wireframe. */
export function drawBoundsPreview2D(
  ctx: CanvasRenderingContext2D,
  vpKey: View2DKey,
  bounds: BoundingBox,
  pan: { x: number; y: number },
  zoom: number,
) {
  const vd = VIEW2D_DEFS[vpKey];
  const corners = boundsCorners(bounds);
  const pts = corners.map((c) => {
    const p = vd.proj(c);
    return w2s(p.x, p.y, pan, zoom);
  });

  ctx.save();
  ctx.strokeStyle = '#e85a1a';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.fillStyle = 'rgba(232, 90, 26, 0.06)';

  BOX_FACE_LOOPS.forEach((loop) => {
    ctx.beginPath();
    ctx.moveTo(pts[loop[0]].x, pts[loop[0]].y);
    for (let i = 1; i < loop.length; i++) ctx.lineTo(pts[loop[i]].x, pts[loop[i]].y);
    ctx.closePath();
    ctx.fill();
  });

  ctx.setLineDash([]);
  drawBoundsWireframe2D(ctx, vpKey, bounds, pan, zoom, {
    stroke: '#e85a1a',
    lineWidth: 2,
  });
  ctx.restore();
}

/** W×H×D label at the CAD box center (world units). */
export function drawPrimDimensions2D(
  ctx: CanvasRenderingContext2D,
  draw: PrimDrawState,
  vpKey: View2DKey,
  pan: { x: number; y: number },
  zoom: number,
) {
  const center = boundsCenter(draw.bounds);
  const vd = VIEW2D_DEFS[vpKey];
  const p = vd.proj(center);
  const pt = w2s(p.x, p.y, pan, zoom);
  const text = formatPrimDrawDimensions(draw);

  ctx.save();
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  const padX = 6;
  const padY = 3;
  const metrics = ctx.measureText(text);
  const w = metrics.width + padX * 2;
  const h = 14 + padY * 2;
  const top = pt.y - h - 6;
  ctx.fillStyle = 'rgba(32, 38, 46, 0.88)';
  ctx.fillRect(pt.x - w / 2, top, w, h);
  ctx.fillStyle = '#e8eef4';
  ctx.fillText(text, pt.x, top + h - padY - 2);
  ctx.restore();
}

function drawHandleSquare(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  fill: string,
  stroke: string,
  lineWidth = 1.5,
) {
  const half = size / 2;
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.fillRect(x - half, y - half, size, size);
  ctx.strokeRect(x - half, y - half, size, size);
}

/** Level-editor style resize/move handles on the CAD box. */
export function drawPrimDrawHandles2D(
  ctx: CanvasRenderingContext2D,
  vpKey: View2DKey,
  draw: PrimDrawState,
  pan: { x: number; y: number },
  zoom: number,
  activeHandleId: string | null = null,
) {
  const handles = buildPrimDrawHandles(draw.bounds, draw.phase, draw.extentAxis);
  if (handles.length === 0) return;

  ctx.save();
  handles.forEach((handle) => {
    const pt = projectHandleToScreen(handle, vpKey, pan, zoom);
    const active = handle.id === activeHandleId;
    drawOneHandle2D(ctx, handle, pt.x, pt.y, zoom, active);
  });
  ctx.restore();
}

function drawOneHandle2D(
  ctx: CanvasRenderingContext2D,
  handle: PrimDrawHandle,
  x: number,
  y: number,
  zoom: number,
  active: boolean,
) {
  const scale = Math.max(0.75, Math.min(1.25, zoom / 8));
  if (handle.kind === 'center') {
    const r = 4 * scale;
    ctx.strokeStyle = active ? '#fff' : '#e8e8e8';
    ctx.lineWidth = active ? 2 : 1.5;
    ctx.beginPath();
    ctx.moveTo(x - r, y);
    ctx.lineTo(x + r, y);
    ctx.moveTo(x, y - r);
    ctx.lineTo(x, y + r);
    ctx.stroke();
    ctx.fillStyle = active ? '#e85a1a' : '#667a90';
    ctx.beginPath();
    ctx.arc(x, y, 2.5 * scale, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (handle.kind === 'extent') {
    const size = (active ? 14 : 12) * scale;
    drawHandleSquare(ctx, x, y, size, active ? '#9ee4ef' : '#6ec4d0', '#fff', active ? 2 : 1.5);
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.round(9 * scale)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('↑', x, y - 0.5);
    return;
  }

  const isCorner = handle.kind === 'corner';
  const size = (isCorner ? (active ? 10 : 8) : active ? 8 : 6) * scale;
  drawHandleSquare(
    ctx,
    x,
    y,
    size,
    active ? '#e85a1a' : '#e8eef4',
    active ? '#fff' : '#e85a1a',
    active ? 2 : 1.25,
  );
}

/** Semi-transparent primitive mesh inside the CAD box. */
export function drawPrimitiveInside2D(
  ctx: CanvasRenderingContext2D,
  vpKey: View2DKey,
  draw: PrimDrawState,
  pan: { x: number; y: number },
  zoom: number,
) {
  const vd = VIEW2D_DEFS[vpKey];
  const primitive = buildPrimitiveMeshInBounds(draw.type, draw.bounds, draw.baseView, { preview: true });
  if (primitive.vertices.length === 0) return;

  ctx.save();
  ctx.fillStyle = 'rgba(110, 196, 208, 0.18)';
  ctx.strokeStyle = 'rgba(158, 228, 239, 0.9)';
  ctx.lineWidth = 1.25;

  primitive.faces.forEach((face) => {
    if (face.length < 2) return;
    const pts = face.map((vi) => {
      const p = vd.proj(primitive.vertices[vi]);
      return w2s(p.x, p.y, pan, zoom);
    });
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (face.length >= 3) {
      ctx.closePath();
      ctx.fill();
    }
    ctx.stroke();
  });

  ctx.restore();
}

/** CAD box + primitive preview (always show both). */
export function drawCadPrimPreview2D(
  ctx: CanvasRenderingContext2D,
  vpKey: View2DKey,
  draw: PrimDrawState,
  pan: { x: number; y: number },
  zoom: number,
  activeHandleId: string | null = null,
) {
  drawBoundsPreview2D(ctx, vpKey, draw.bounds, pan, zoom);
  drawPrimitiveInside2D(ctx, vpKey, draw, pan, zoom);
  drawPrimDrawHandles2D(ctx, vpKey, draw, pan, zoom, activeHandleId);
  if (draw.phase === 'extent') {
    drawPrimDimensions2D(ctx, draw, vpKey, pan, zoom);
  }
}

/** @deprecated Use drawCadPrimPreview2D */
export function drawPrimitivePreview2D(
  ctx: CanvasRenderingContext2D,
  vpKey: View2DKey,
  draw: PrimDrawState,
  pan: { x: number; y: number },
  zoom: number,
) {
  drawCadPrimPreview2D(ctx, vpKey, draw, pan, zoom);
}
