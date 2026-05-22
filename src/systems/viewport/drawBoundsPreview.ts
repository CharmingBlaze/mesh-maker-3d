import { VIEW2D_DEFS, w2s, type View2DKey } from '@/core/math/projection';
import { boundsCorners, type BoundingBox } from '@/core/math/BoundingBox';
import type { PrimDrawState } from '@/systems/mesh/primDraw';
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
  ctx.strokeStyle = '#ff6b35';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.fillStyle = 'rgba(255, 107, 53, 0.06)';

  BOX_FACE_LOOPS.forEach((loop) => {
    ctx.beginPath();
    ctx.moveTo(pts[loop[0]].x, pts[loop[0]].y);
    for (let i = 1; i < loop.length; i++) ctx.lineTo(pts[loop[i]].x, pts[loop[i]].y);
    ctx.closePath();
    ctx.fill();
  });

  BOX_EDGES.forEach(([a, b]) => {
    ctx.beginPath();
    ctx.moveTo(pts[a].x, pts[a].y);
    ctx.lineTo(pts[b].x, pts[b].y);
    ctx.stroke();
  });

  ctx.setLineDash([]);
  ctx.fillStyle = '#ff6b35';
  corners.forEach((_, i) => {
    ctx.beginPath();
    ctx.arc(pts[i].x, pts[i].y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
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
  ctx.fillStyle = 'rgba(79, 157, 198, 0.18)';
  ctx.strokeStyle = 'rgba(126, 219, 231, 0.9)';
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
) {
  drawBoundsPreview2D(ctx, vpKey, draw.bounds, pan, zoom);
  drawPrimitiveInside2D(ctx, vpKey, draw, pan, zoom);
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
