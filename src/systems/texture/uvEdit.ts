import type { FaceUvMap } from '@/core/mesh/faceUv';
import { cloneFaceUvMap, faceUvPolygons } from '@/core/mesh/faceUv';
import type { MeshDocument } from '@/core/mesh/MeshDocument';
import type { TextureMap } from '@/core/mesh/textureMap';
import { textureViewLayout, type TextureEditorView } from '@/systems/texture/textureEditorDraw';

export type UvHandleKind = 'corner' | 'move';

export interface UvHandleHit {
  kind: UvHandleKind;
  fi: number;
  vi?: number;
}

export function hitTestUvHandles(
  sx: number,
  sy: number,
  w: number,
  h: number,
  texture: TextureMap,
  view: TextureEditorView,
  mesh: MeshDocument,
  selFaces: Set<number>,
  handleRadius = 7,
): UvHandleHit | null {
  const { drawW, drawH, ox, oy } = textureViewLayout(w, h, texture, view);
  const r2 = handleRadius * handleRadius;

  for (const poly of faceUvPolygons(mesh)) {
    if (!selFaces.has(poly.fi)) continue;
    for (const p of poly.points) {
      const hx = ox + p.u * drawW;
      const hy = oy + p.v * drawH;
      const dx = sx - hx;
      const dy = sy - hy;
      if (dx * dx + dy * dy <= r2) {
        return { kind: 'corner', fi: poly.fi, vi: p.vi };
      }
    }
  }

  for (const poly of faceUvPolygons(mesh)) {
    if (!selFaces.has(poly.fi)) continue;
    let inside = false;
    for (let i = 0, j = poly.points.length - 1; i < poly.points.length; j = i++) {
      const a = poly.points[i];
      const b = poly.points[j];
      const ax = ox + a.u * drawW;
      const ay = oy + a.v * drawH;
      const bx = ox + b.u * drawW;
      const by = oy + b.v * drawH;
      const hit =
        ay > sy !== by > sy && sx < ((bx - ax) * (sy - ay)) / (by - ay + 1e-12) + ax;
      if (hit) inside = !inside;
    }
    if (inside) return { kind: 'move', fi: poly.fi };
  }

  return null;
}

export function snapshotFaceUvs(mesh: MeshDocument, faceIndices: Iterable<number>): Map<number, FaceUvMap> {
  const snap = new Map<number, FaceUvMap>();
  for (const fi of faceIndices) {
    const uv = mesh.faceUvs[fi];
    if (uv) snap.set(fi, cloneFaceUvMap(uv));
  }
  return snap;
}

export function screenDeltaToUvDelta(
  dx: number,
  dy: number,
  drawW: number,
  drawH: number,
): { du: number; dv: number } {
  return {
    du: drawW > 0 ? dx / drawW : 0,
    dv: drawH > 0 ? dy / drawH : 0,
  };
}

export function applyUvMovePreview(
  start: Map<number, FaceUvMap>,
  du: number,
  dv: number,
): Map<number, FaceUvMap> {
  const out = new Map<number, FaceUvMap>();
  start.forEach((uvMap, fi) => {
    const next: FaceUvMap = {};
    for (const [k, uv] of Object.entries(uvMap)) {
      next[Number(k)] = {
        u: Math.max(0, Math.min(1, uv.u + du)),
        v: Math.max(0, Math.min(1, uv.v + dv)),
      };
    }
    out.set(fi, next);
  });
  return out;
}

export function applyUvCornerPreview(
  start: Map<number, FaceUvMap>,
  fi: number,
  vi: number,
  u: number,
  v: number,
): Map<number, FaceUvMap> {
  const out = new Map<number, FaceUvMap>();
  start.forEach((uvMap, idx) => {
    if (idx === fi) {
      out.set(idx, {
        ...uvMap,
        [vi]: { u: Math.max(0, Math.min(1, u)), v: Math.max(0, Math.min(1, v)) },
      });
    } else {
      out.set(idx, { ...uvMap });
    }
  });
  return out;
}
