import { VIEW2D_DEFS, w2s, type View2DKey } from '@/core/math/projection';
import { faceGroupIndex, type MeshDocument } from '@/core/mesh/MeshDocument';
import type { PrimDrawState } from '@/systems/mesh/primDraw';
import { drawCadPrimPreview2D } from '@/systems/viewport/drawBoundsPreview';
import { parseEdgeKey, type EdgeKey } from '@/systems/selection/selectionSystem';
import { MS3D_VIEW } from '@/systems/viewport/viewportColors';
import { ORTHO_MAJOR_EVERY, orthoGridScreenStep } from '@/systems/viewport/snapGrid';

export interface SelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function drawView2D(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  vpKey: View2DKey,
  mesh: MeshDocument,
  state: { pan: { x: number; y: number }; zoom: number },
  selVerts: Set<number>,
  selEdges: Set<EdgeKey>,
  selFaces: Set<number>,
  visibleVerts: Set<number>,
  visibleFaces: Set<number>,
  wipFace: number[],
  selRect: SelRect | null,
  primDraw: PrimDrawState | null = null,
  grid: { snapSize: number; showGrid: boolean } = { snapSize: 5, showGrid: true },
) {
  const vd = VIEW2D_DEFS[vpKey];

  ctx.fillStyle = MS3D_VIEW.orthoBg;
  ctx.fillRect(0, 0, W, H);

  if (grid.showGrid) {
    const gs = orthoGridScreenStep(grid.snapSize, state.zoom);
    const ox = ((state.pan.x % gs) + gs) % gs;
    const oy = ((state.pan.y % gs) + gs) % gs;
    ctx.strokeStyle = MS3D_VIEW.orthoGrid;
    ctx.lineWidth = 0.5;
    for (let x = ox; x < W; x += gs) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = oy; y < H; y += gs) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    const bgs = gs * ORTHO_MAJOR_EVERY;
    const box = ((state.pan.x % bgs) + bgs) % bgs;
    const boy = ((state.pan.y % bgs) + bgs) % bgs;
    ctx.strokeStyle = MS3D_VIEW.orthoGridMajor;
    ctx.lineWidth = 1;
    for (let x = box; x < W; x += bgs) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = boy; y < H; y += bgs) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
  }

  mesh.faces.forEach((f, fi) => {
    if (!visibleFaces.has(fi)) return;
    if (!f || f.length < 2) return;
    const pts = f.map((vi) => {
      const pj = vd.proj(mesh.vertices[vi]);
      return w2s(pj.x, pj.y, state.pan, state.zoom);
    });
    const isSel = selFaces.has(fi);
    const gi = faceGroupIndex(mesh, fi);
    const col = gi >= 0 ? mesh.groups[gi].color : MS3D_VIEW.faceFill;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (f.length >= 3) ctx.closePath();
    ctx.fillStyle = col + (isSel ? '55' : '22');
    ctx.fill();
    ctx.strokeStyle = isSel ? MS3D_VIEW.faceSelected : col;
    ctx.lineWidth = isSel ? 2 : 1;
    ctx.stroke();
    if (isSel && f.length >= 2) {
      ctx.strokeStyle = MS3D_VIEW.faceSelected;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      if (f.length >= 3) ctx.closePath();
      ctx.stroke();
    }
  });

  if (wipFace.length > 0) {
    wipFace.forEach((vi, i) => {
      const pj = vd.proj(mesh.vertices[vi]);
      const sc = w2s(pj.x, pj.y, state.pan, state.zoom);
      ctx.beginPath();
      ctx.rect(sc.x - 5.5, sc.y - 5.5, 11, 11);
      ctx.strokeStyle = MS3D_VIEW.faceSelected;
      ctx.lineWidth = 2;
      ctx.stroke();
      if (i > 0) {
        const pj0 = vd.proj(mesh.vertices[wipFace[i - 1]]);
        const sc0 = w2s(pj0.x, pj0.y, state.pan, state.zoom);
        ctx.beginPath();
        ctx.moveTo(sc0.x, sc0.y);
        ctx.lineTo(sc.x, sc.y);
        ctx.strokeStyle = 'rgba(216,162,76,0.65)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });
  }

  selEdges.forEach((edge) => {
    const [a, b] = parseEdgeKey(edge);
    if (!visibleVerts.has(a) || !visibleVerts.has(b)) return;
    const va = mesh.vertices[a];
    const vb = mesh.vertices[b];
    if (!va || !vb) return;
    const pa = vd.proj(va);
    const pb = vd.proj(vb);
    const sa = w2s(pa.x, pa.y, state.pan, state.zoom);
    const sb = w2s(pb.x, pb.y, state.pan, state.zoom);
    ctx.strokeStyle = MS3D_VIEW.edgeSelected;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.stroke();
  });

  mesh.vertices.forEach((v, vi) => {
    if (!visibleVerts.has(vi)) return;
    const pj = vd.proj(v);
    const sc = w2s(pj.x, pj.y, state.pan, state.zoom);
    const isSel = selVerts.has(vi);
    const size = isSel ? 8 : 5;
    const half = size / 2;
    ctx.fillStyle = isSel ? MS3D_VIEW.vertexSelected : MS3D_VIEW.vertex;
    ctx.fillRect(sc.x - half, sc.y - half, size, size);
    ctx.strokeStyle = isSel ? '#fff1bd' : '#0d141d';
    ctx.lineWidth = 1;
    ctx.strokeRect(sc.x - half, sc.y - half, size, size);
  });

  if (primDraw) {
    drawCadPrimPreview2D(ctx, vpKey, primDraw, state.pan, state.zoom);
  }

  if (selRect) {
    ctx.strokeStyle = MS3D_VIEW.selection;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(selRect.x, selRect.y, selRect.w, selRect.h);
    ctx.fillStyle = 'rgba(79,143,216,0.10)';
    ctx.fillRect(selRect.x, selRect.y, selRect.w, selRect.h);
    ctx.setLineDash([]);
  }
}
