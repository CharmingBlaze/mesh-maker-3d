import { VIEW2D_DEFS, w2s, type View2DKey } from '@/core/math/projection';
import type { Vec3 } from '@/core/math/Vec3';
import { faceGroupIndex, type MeshDocument } from '@/core/mesh/MeshDocument';
import type { PrimDrawState } from '@/systems/mesh/primDraw';
import type { KnifeDrawState } from '@/systems/mesh/knifeDraw';
import { drawBoundsWireframe2D, drawCadPrimPreview2D } from '@/systems/viewport/drawBoundsPreview';
import { parseEdgeKey, type EdgeKey } from '@/systems/selection/selectionSystem';
import { MS3D_VIEW } from '@/systems/viewport/viewportColors';
import { ORTHO_MAJOR_EVERY, orthoGridScreenStep } from '@/systems/viewport/snapGrid';
import {
  meshInWorldSpace,
  meshWorldBounds,
  type SceneRenderEntry,
} from '@/systems/scene/sceneObjectHelpers';
import { knifeDrawForWorldPreview } from '@/hooks/knifeHelpers';
import type { Transform } from '@/core/scene-graph/SceneNode';
import { visibleFaceIndices, visibleVertexIndices } from '@/systems/layers/layerSystem';
import { drawTransformGizmo2D } from '@/systems/viewport/transformGizmo2D';
import type { GizmoMode } from '@/systems/viewport/transformGizmo3D';
import type { GizmoAxis } from '@/systems/viewport/transformGizmo2D';

export interface SelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DrawView2DOptions {
  skipBackground?: boolean;
  skipPrim?: boolean;
  skipMarquee?: boolean;
}

function drawOrthoBackground(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  state: { pan: { x: number; y: number }; zoom: number },
  grid: { snapSize: number; showGrid: boolean },
): void {
  ctx.fillStyle = MS3D_VIEW.orthoBg;
  ctx.fillRect(0, 0, W, H);

  if (!grid.showGrid) return;

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

  const origin = w2s(0, 0, state.pan, state.zoom);
  ctx.strokeStyle = MS3D_VIEW.orthoGridCenter;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, origin.y);
  ctx.lineTo(W, origin.y);
  ctx.moveTo(origin.x, 0);
  ctx.lineTo(origin.x, H);
  ctx.stroke();
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
  primActiveHandleId: string | null = null,
  options: DrawView2DOptions = {},
) {
  const vd = VIEW2D_DEFS[vpKey];

  if (!options.skipBackground) {
    drawOrthoBackground(ctx, W, H, state, grid);
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
        ctx.strokeStyle = 'rgba(232, 90, 26, 0.65)';
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
    ctx.strokeStyle = isSel ? '#fff1e8' : '#0a1018';
    ctx.lineWidth = 1;
    ctx.strokeRect(sc.x - half, sc.y - half, size, size);
  });

  if (!options.skipPrim && primDraw) {
    drawCadPrimPreview2D(ctx, vpKey, primDraw, state.pan, state.zoom, primActiveHandleId);
  }

  if (!options.skipMarquee && selRect) {
    ctx.strokeStyle = MS3D_VIEW.selection;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(selRect.x, selRect.y, selRect.w, selRect.h);
    ctx.fillStyle = 'rgba(110, 196, 208, 0.1)';
    ctx.fillRect(selRect.x, selRect.y, selRect.w, selRect.h);
    ctx.setLineDash([]);
  }
}

function drawObjectBounds2D(
  ctx: CanvasRenderingContext2D,
  vpKey: View2DKey,
  entry: SceneRenderEntry,
  state: { pan: { x: number; y: number }; zoom: number },
  selected: boolean,
): void {
  const bounds = meshWorldBounds(entry.mesh, entry.transform);
  if (!bounds) return;
  drawBoundsWireframe2D(ctx, vpKey, bounds, state.pan, state.zoom, {
    stroke: selected ? MS3D_VIEW.faceSelected : MS3D_VIEW.selection,
    lineWidth: selected ? 2 : 1,
    dash: selected ? undefined : [4, 3],
  });
}

/** Draw all scene objects in an orthographic viewport. */
export function drawSceneView2D(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  vpKey: View2DKey,
  entries: SceneRenderEntry[],
  activeMeshId: string,
  selectionMode: 'object' | 'vertex' | 'edge' | 'face',
  vpState: { pan: { x: number; y: number }; zoom: number },
  selVerts: Set<number>,
  selEdges: Set<EdgeKey>,
  selFaces: Set<number>,
  wipFace: number[],
  selRect: SelRect | null,
  primDraw: PrimDrawState | null = null,
  grid: { snapSize: number; showGrid: boolean } = { snapSize: 5, showGrid: true },
  primActiveHandleId: string | null = null,
  knifeDraw: KnifeDrawState | null = null,
  gizmo: { mode: GizmoMode; pivot: Vec3; hoverAxis: GizmoAxis | null } | null = null,
): void {
  drawOrthoBackground(ctx, W, H, vpState, grid);

  const visibleEntries = entries.filter((e) => e.visible);
  const inactive = visibleEntries.filter((e) => e.mesh.id !== activeMeshId);
  const active = visibleEntries.find((e) => e.mesh.id === activeMeshId);
  const meshOpts: DrawView2DOptions = {
    skipBackground: true,
    skipPrim: true,
    skipMarquee: true,
  };

  inactive.forEach((entry) => {
    const worldMesh = meshInWorldSpace(entry.mesh, entry.transform);
    drawView2D(
      ctx,
      W,
      H,
      vpKey,
      worldMesh,
      vpState,
      new Set(),
      new Set(),
      new Set(),
      visibleVertexIndices(entry.mesh),
      visibleFaceIndices(entry.mesh),
      [],
      null,
      null,
      grid,
      null,
      meshOpts,
    );
    if (selectionMode === 'object' && entry.selected) {
      drawObjectBounds2D(ctx, vpKey, entry, vpState, true);
    }
  });

  if (active) {
    const worldMesh = meshInWorldSpace(active.mesh, active.transform);
    const showMeshSelection = selectionMode !== 'object';
    drawView2D(
      ctx,
      W,
      H,
      vpKey,
      worldMesh,
      vpState,
      showMeshSelection ? selVerts : new Set(),
      showMeshSelection ? selEdges : new Set(),
      showMeshSelection ? selFaces : new Set(),
      visibleVertexIndices(active.mesh),
      visibleFaceIndices(active.mesh),
      showMeshSelection ? wipFace : [],
      null,
      null,
      grid,
      null,
      meshOpts,
    );
    if (selectionMode === 'object' && active.selected) {
      drawObjectBounds2D(ctx, vpKey, active, vpState, true);
    }
  }

  if (primDraw) {
    drawCadPrimPreview2D(ctx, vpKey, primDraw, vpState.pan, vpState.zoom, primActiveHandleId);
  }

  if (knifeDraw && knifeDraw.view === vpKey) {
    drawKnifePreview2D(ctx, vpKey, knifeDraw, vpState.pan, vpState.zoom, active?.transform);
  }

  if (gizmo) {
    drawTransformGizmo2D(
      ctx,
      vpKey,
      gizmo.mode,
      gizmo.pivot,
      vpState.pan,
      vpState.zoom,
      gizmo.hoverAxis,
    );
  }

  if (selRect) {
    ctx.strokeStyle = MS3D_VIEW.selection;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(selRect.x, selRect.y, selRect.w, selRect.h);
    ctx.fillStyle = 'rgba(110, 196, 208, 0.1)';
    ctx.fillRect(selRect.x, selRect.y, selRect.w, selRect.h);
    ctx.setLineDash([]);
  }
}

export function drawKnifePreview2D(
  ctx: CanvasRenderingContext2D,
  vpKey: View2DKey,
  draw: KnifeDrawState,
  pan: { x: number; y: number },
  zoom: number,
  transform?: Transform,
): void {
  const vd = VIEW2D_DEFS[vpKey];
  const preview = transform
    ? knifeDrawForWorldPreview(draw, transform)
    : draw;

  const toScreen = (pt: { position: Vec3 }) => {
    const p = vd.proj(pt.position);
    return w2s(p.x, p.y, pan, zoom);
  };

  const confirmed = preview.points.map(toScreen);
  const hover = preview.hover ? toScreen(preview.hover) : null;
  const linePts = hover ? [...confirmed, hover] : confirmed;

  if (linePts.length >= 2) {
    ctx.strokeStyle = 'rgba(232, 90, 26, 0.95)';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(linePts[0].x, linePts[0].y);
    for (let i = 1; i < linePts.length; i++) {
      ctx.lineTo(linePts[i].x, linePts[i].y);
    }
    ctx.stroke();
  }

  confirmed.forEach((s, i) => {
    const pt = preview.points[i];
    const isNode = pt?.kind === 'node';
    ctx.beginPath();
    ctx.arc(s.x, s.y, isNode ? 5 : 4, 0, Math.PI * 2);
    ctx.fillStyle = isNode ? '#38bdf8' : '#4ade80';
    ctx.fill();
    ctx.strokeStyle = isNode ? '#0c4a6e' : '#14532d';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  if (hover) {
    const h = preview.hover!;
    const snapColor =
      h.kind === 'node' || h.reuseOf !== undefined
        ? '#38bdf8'
        : h.kind === 'vertex'
          ? '#93c5fd'
          : h.kind === 'edge'
            ? '#fbbf24'
            : '#ffffff';
    const snapStroke =
      h.kind === 'node' || h.reuseOf !== undefined
        ? '#0c4a6e'
        : h.kind === 'vertex'
          ? '#1e3a8a'
          : h.kind === 'edge'
            ? '#92400e'
            : '#e85a1a';
    ctx.beginPath();
    ctx.arc(hover.x, hover.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = snapColor;
    ctx.fill();
    ctx.strokeStyle = snapStroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}
