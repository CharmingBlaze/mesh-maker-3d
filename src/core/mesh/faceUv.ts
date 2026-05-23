import type { MeshDocument } from '@/core/mesh/MeshDocument';
import { buildFaceFrame } from '@/systems/mesh/meshFace';

export type FaceUvMap = Record<number, { u: number; v: number }>;

export function ensureFaceUvsArray(mesh: MeshDocument): void {
  if (!mesh.faceUvs) mesh.faceUvs = [];
  while (mesh.faceUvs.length < mesh.faces.length) mesh.faceUvs.push(null);
  if (mesh.faceUvs.length > mesh.faces.length) mesh.faceUvs.length = mesh.faces.length;
}

export function getFaceUvMap(mesh: MeshDocument, fi: number): FaceUvMap {
  ensureFaceUvsArray(mesh);
  return mesh.faceUvs[fi] ?? {};
}

export function setFaceUvMap(mesh: MeshDocument, fi: number, uv: FaceUvMap): void {
  ensureFaceUvsArray(mesh);
  mesh.faceUvs[fi] = uv;
}

/** Planar-project face verts into a UV rectangle (v increases downward, canvas-style). */
export function planarFaceUvInRect(
  mesh: MeshDocument,
  face: number[],
  uMin: number,
  uMax: number,
  vMin: number,
  vMax: number,
): FaceUvMap {
  const frame = buildFaceFrame(mesh, face);
  const pts = face.map((vi) => frame.project(mesh.vertices[vi]));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  pts.forEach((p) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  });
  const dx = maxX - minX || 1;
  const dy = maxY - minY || 1;
  const pad = 0.06;
  const u0 = uMin + (uMax - uMin) * pad;
  const u1 = uMax - (uMax - uMin) * pad;
  const v0 = vMin + (vMax - vMin) * pad;
  const v1 = vMax - (vMax - vMin) * pad;
  const uv: FaceUvMap = {};
  face.forEach((vi, i) => {
    const p = pts[i];
    const tu = (p.x - minX) / dx;
    const tv = (p.y - minY) / dy;
    uv[vi] = { u: u0 + tu * (u1 - u0), v: v0 + tv * (v1 - v0) };
  });
  return uv;
}

/** Pack all faces into a grid on the 0–1 atlas (PicoCAD-style auto layout). */
export function autoLayoutFaceUvs(mesh: MeshDocument): void {
  ensureFaceUvsArray(mesh);
  const indices = mesh.faces
    .map((face, fi) => ({ face, fi }))
    .filter((x): x is { face: number[]; fi: number } => !!x.face && x.face.length >= 3);
  const count = indices.length || 1;
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const cellW = 1 / cols;
  const cellH = 1 / rows;
  indices.forEach(({ face, fi }, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    mesh.faceUvs[fi] = planarFaceUvInRect(
      mesh,
      face,
      col * cellW,
      (col + 1) * cellW,
      row * cellH,
      (row + 1) * cellH,
    );
  });
}

export interface FaceUvPolygon {
  fi: number;
  points: { u: number; v: number; vi: number }[];
}

/** Cheap signature for render-cache invalidation when UV layouts change. */
export function faceUvsContentHash(mesh: MeshDocument): string {
  ensureFaceUvsArray(mesh);
  let sig = `${mesh.faceUvs.length}`;
  mesh.faceUvs.forEach((uvMap, fi) => {
    if (!uvMap) return;
    const face = mesh.faces[fi];
    if (!face) return;
    for (const vi of face) {
      const uv = uvMap[vi];
      if (uv) sig += `|${fi}:${vi}:${uv.u.toFixed(4)},${uv.v.toFixed(4)}`;
    }
  });
  return sig;
}

export function cloneFaceUvMap(uv: FaceUvMap): FaceUvMap {
  const out: FaceUvMap = {};
  for (const [k, v] of Object.entries(uv)) out[Number(k)] = { u: v.u, v: v.v };
  return out;
}

export function translateFaceUvMap(uvMap: FaceUvMap, du: number, dv: number): FaceUvMap {
  const out: FaceUvMap = {};
  for (const [k, uv] of Object.entries(uvMap)) {
    out[Number(k)] = {
      u: Math.max(0, Math.min(1, uv.u + du)),
      v: Math.max(0, Math.min(1, uv.v + dv)),
    };
  }
  return out;
}

export function setFaceUvCorner(uvMap: FaceUvMap, vi: number, u: number, v: number): FaceUvMap {
  return {
    ...uvMap,
    [vi]: { u: Math.max(0, Math.min(1, u)), v: Math.max(0, Math.min(1, v)) },
  };
}

/** Lay out only faces that lack UVs — preserves hand-edited islands. */
export function layoutMissingFaceUvs(mesh: MeshDocument): boolean {
  if (!mesh.texture) return false;
  ensureFaceUvsArray(mesh);
  const missing = mesh.faces
    .map((face, fi) => ({ face, fi }))
    .filter(
      ({ face, fi }) =>
        !!face &&
        face.length >= 3 &&
        (!mesh.faceUvs[fi] || Object.keys(mesh.faceUvs[fi]!).length === 0),
    );
  if (missing.length === 0) return false;

  const total = Math.max(mesh.faces.filter((f) => f && f.length >= 3).length, 1);
  const cols = Math.ceil(Math.sqrt(total));
  const cellW = 1 / cols;
  const cellH = 1 / cols;

  let nextIdx = 0;
  mesh.faceUvs.forEach((uvMap) => {
    if (!uvMap || Object.keys(uvMap).length === 0) return;
    let cu = 0;
    let cv = 0;
    for (const uv of Object.values(uvMap)) {
      cu += uv.u;
      cv += uv.v;
    }
    const n = Object.keys(uvMap).length || 1;
    const col = Math.min(cols - 1, Math.max(0, Math.floor((cu / n) / cellW)));
    const row = Math.min(cols - 1, Math.max(0, Math.floor((cv / n) / cellH)));
    nextIdx = Math.max(nextIdx, row * cols + col + 1);
  });

  missing.forEach(({ face, fi }, i) => {
    const idx = nextIdx + i;
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    mesh.faceUvs[fi] = planarFaceUvInRect(
      mesh,
      face!,
      col * cellW,
      (col + 1) * cellW,
      row * cellH,
      (row + 1) * cellH,
    );
  });
  return true;
}

export function faceUvPolygons(
  mesh: MeshDocument,
  uvOverride?: ReadonlyMap<number, FaceUvMap>,
): FaceUvPolygon[] {
  ensureFaceUvsArray(mesh);
  const polys: FaceUvPolygon[] = [];
  mesh.faces.forEach((face, fi) => {
    if (!face || face.length < 3) return;
    const uvMap = uvOverride?.get(fi) ?? mesh.faceUvs[fi];
    if (!uvMap) return;
    const points = face
      .map((vi) => {
        const uv = uvMap[vi];
        if (!uv) return null;
        return { u: uv.u, v: uv.v, vi };
      })
      .filter((p): p is { u: number; v: number; vi: number } => p !== null);
    if (points.length >= 3) polys.push({ fi, points });
  });
  return polys;
}

export function pointInPolygon2D(
  p: { u: number; v: number },
  poly: { u: number; v: number }[],
): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].u;
    const yi = poly[i].v;
    const xj = poly[j].u;
    const yj = poly[j].v;
    const intersect =
      yi > p.v !== yj > p.v && p.u < ((xj - xi) * (p.v - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function faceAtTextureCoord(
  mesh: MeshDocument,
  u: number,
  v: number,
): number | null {
  for (const poly of faceUvPolygons(mesh)) {
    if (pointInPolygon2D({ u, v }, poly.points)) return poly.fi;
  }
  return null;
}

/** Three.js expects v=0 at bottom; our editor uses canvas coords (v down). */
export function uvForThree(u: number, v: number): { u: number; v: number } {
  return { u, v: 1 - v };
}
