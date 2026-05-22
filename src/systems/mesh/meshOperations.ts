import type { MeshDocument } from '@/core/mesh/MeshDocument';
import { cloneVec3 } from '@/core/math/Vec3';
import type { EdgeKey } from '@/systems/selection/selectionSystem';
import { applyExtrudeDistance, prepareExtrude } from '@/systems/mesh/extrudeBlender';
import { bevelEdgesBlender } from '@/systems/mesh/bevelBlender';
import { fillHole as fillHoleImpl } from '@/systems/mesh/fillHole';

export function fillHole(
  doc: MeshDocument,
  selVerts: Set<number>,
  selEdges: Set<EdgeKey>,
  groupIndex: number,
  doubleSided = false,
): number[] | null {
  return fillHoleImpl(doc, selVerts, selEdges, groupIndex, doubleSided);
}

export function deleteSelection(
  doc: MeshDocument,
  selVerts: Set<number>,
  selFaces: Set<number>,
): void {
  selFaces.forEach((fi) => {
    doc.faces[fi] = null;
    doc.groups.forEach((g) => {
      g.faces = g.faces.filter((f) => f !== fi);
    });
  });

  const newFaces: (number[] | null)[] = [];
  const newFaceLayers: string[] = [];
  const remapIdx: Record<number, number> = {};
  doc.faces.forEach((f, fi) => {
    if (f !== null) {
      remapIdx[fi] = newFaces.length;
      newFaces.push(f);
      newFaceLayers.push(doc.faceLayers[fi]);
    }
  });
  doc.faces = newFaces;
  doc.faceLayers = newFaceLayers;
  doc.groups.forEach((g) => {
    g.faces = g.faces.map((fi) => remapIdx[fi]).filter((fi) => fi !== undefined);
  });

  if (selVerts.size > 0) {
    const toRemove = [...selVerts].sort((a, b) => b - a);
    toRemove.forEach((vi) => {
      doc.vertices.splice(vi, 1);
      doc.vertexLayers.splice(vi, 1);
      doc.faces = doc.faces.map((f) => (f ? f.map((fvi) => (fvi > vi ? fvi - 1 : fvi)) : null));
    });
    const compactFaces: number[][] = [];
    const compactFaceLayers: string[] = [];
    const remapFaces: Record<number, number> = {};
    doc.faces.forEach((f, fi) => {
      if (!f) return;
      const unique = [...new Set(f)];
      if (unique.length >= 2) {
        remapFaces[fi] = compactFaces.length;
        compactFaces.push(unique);
        compactFaceLayers.push(doc.faceLayers[fi]);
      }
    });
    doc.faces = compactFaces;
    doc.faceLayers = compactFaceLayers;
    doc.groups.forEach((g) => {
      g.faces = g.faces.map((fi) => remapFaces[fi]).filter((fi) => fi !== undefined);
    });
  }
}

export function weldVertices(doc: MeshDocument, thresh = 4): void {
  const remap = new Array(doc.vertices.length).fill(-1);
  const newV: typeof doc.vertices = [];
  const newVertexLayers: string[] = [];
  const cell = thresh;
  const grid = new Map<string, number[]>();

  const cellKey = (x: number, y: number, z: number) =>
    `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;

  const findNear = (v: (typeof doc.vertices)[0]): number => {
    const cx = Math.floor(v.x / cell);
    const cy = Math.floor(v.y / cell);
    const cz = Math.floor(v.z / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
          if (!bucket) continue;
          for (const j of bucket) {
            const u = newV[j];
            if (Math.hypot(v.x - u.x, v.y - u.y, v.z - u.z) < thresh) return j;
          }
        }
      }
    }
    return -1;
  };

  doc.vertices.forEach((v, i) => {
    let found = findNear(v);
    if (found < 0) {
      found = newV.length;
      remap[i] = found;
      newV.push(v);
      newVertexLayers.push(doc.vertexLayers[i]);
      const key = cellKey(v.x, v.y, v.z);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key)!.push(found);
    } else {
      remap[i] = found;
    }
  });
  doc.vertices = newV;
  doc.vertexLayers = newVertexLayers;
  doc.faces = doc.faces
    .map((f) =>
      f ? [...new Set(f.map((vi) => remap[vi]))].filter((vi) => vi >= 0) : null,
    )
    .filter((f) => f && f.length >= 2) as number[][];
}

export function snapVerticesToGrid(
  doc: MeshDocument,
  selVerts: Set<number>,
  snap: (v: number) => number,
): void {
  selVerts.forEach((vi) => {
    doc.vertices[vi].x = snap(doc.vertices[vi].x);
    doc.vertices[vi].y = snap(doc.vertices[vi].y);
    doc.vertices[vi].z = snap(doc.vertices[vi].z);
  });
}

export function averageVertices(doc: MeshDocument, selVerts: Set<number>): void {
  if (selVerts.size < 2) return;
  const arr = [...selVerts].map((i) => doc.vertices[i]);
  const cx = arr.reduce((s, v) => s + v.x, 0) / arr.length;
  const cy = arr.reduce((s, v) => s + v.y, 0) / arr.length;
  const cz = arr.reduce((s, v) => s + v.z, 0) / arr.length;
  selVerts.forEach((vi) => {
    doc.vertices[vi].x = cx;
    doc.vertices[vi].y = cy;
    doc.vertices[vi].z = cz;
  });
}

export function flipNormals(doc: MeshDocument, selFaces: Set<number>): void {
  const target = selFaces.size > 0 ? selFaces : new Set(doc.faces.map((_, i) => i));
  target.forEach((fi) => {
    if (doc.faces[fi]) doc.faces[fi] = [...doc.faces[fi]!].reverse();
  });
}

export function subdivide(doc: MeshDocument, selFaces: Set<number>, groupIndex: number): void {
  const edgeMap: Record<string, number> = {};
  const midVert = (a: number, b: number) => {
    const key = `${Math.min(a, b)},${Math.max(a, b)}`;
    if (edgeMap[key] !== undefined) return edgeMap[key];
    const va = doc.vertices[a],
      vb = doc.vertices[b],
      idx = doc.vertices.length;
    doc.vertices.push({
      x: (va.x + vb.x) / 2,
      y: (va.y + vb.y) / 2,
      z: (va.z + vb.z) / 2,
    });
    edgeMap[key] = idx;
    return idx;
  };

  const target = selFaces.size > 0 ? [...selFaces] : doc.faces.map((_, i) => i);
  const newFaces: number[][] = [];
  const removedFaces = new Set<number>();

  target.forEach((fi) => {
    const f = doc.faces[fi];
    if (!f || f.length < 3) return;
    removedFaces.add(fi);
    if (f.length === 3) {
      const m01 = midVert(f[0], f[1]),
        m12 = midVert(f[1], f[2]),
        m20 = midVert(f[2], f[0]);
      newFaces.push([f[0], m01, m20], [m01, f[1], m12], [m20, m12, f[2]], [m01, m12, m20]);
    } else if (f.length === 4) {
      const m01 = midVert(f[0], f[1]),
        m12 = midVert(f[1], f[2]),
        m23 = midVert(f[2], f[3]),
        m30 = midVert(f[3], f[0]);
      const ci = doc.vertices.length;
      doc.vertices.push({
        x: (doc.vertices[f[0]].x + doc.vertices[f[1]].x + doc.vertices[f[2]].x + doc.vertices[f[3]].x) / 4,
        y: (doc.vertices[f[0]].y + doc.vertices[f[1]].y + doc.vertices[f[2]].y + doc.vertices[f[3]].y) / 4,
        z: (doc.vertices[f[0]].z + doc.vertices[f[1]].z + doc.vertices[f[2]].z + doc.vertices[f[3]].z) / 4,
      });
      newFaces.push(
        [f[0], m01, ci, m30],
        [m01, f[1], m12, ci],
        [ci, m12, f[2], m23],
        [m30, ci, m23, f[3]],
      );
    }
  });

  const remapFI: Record<number, number> = {};
  const cleanFaces: number[][] = [];
  doc.faces.forEach((f, fi) => {
    if (!removedFaces.has(fi) && f) {
      remapFI[fi] = cleanFaces.length;
      cleanFaces.push(f);
    }
  });
  doc.groups.forEach((g) => {
    g.faces = g.faces.map((fi) => remapFI[fi]).filter((fi) => fi !== undefined);
  });
  newFaces.forEach((f) => {
    doc.groups[groupIndex].faces.push(cleanFaces.length);
    cleanFaces.push(f);
  });
  doc.faces = cleanFaces;
}

export function triangulate(doc: MeshDocument, selFaces: Set<number>, groupIndex: number): void {
  const target = selFaces.size > 0 ? [...selFaces] : doc.faces.map((_, i) => i);
  const newFaces: number[][] = [];
  const removeSet = new Set<number>();

  target.forEach((fi) => {
    const f = doc.faces[fi];
    if (!f || f.length <= 3) return;
    removeSet.add(fi);
    for (let i = 1; i < f.length - 1; i++) newFaces.push([f[0], f[i], f[i + 1]]);
  });

  const remapFI: Record<number, number> = {};
  const cleanFaces: number[][] = [];
  doc.faces.forEach((f, fi) => {
    if (!removeSet.has(fi) && f) {
      remapFI[fi] = cleanFaces.length;
      cleanFaces.push(f);
    }
  });
  doc.groups.forEach((g) => {
    g.faces = g.faces.map((fi) => remapFI[fi]).filter((fi) => fi !== undefined);
  });
  newFaces.forEach((f) => {
    doc.groups[groupIndex].faces.push(cleanFaces.length);
    cleanFaces.push(f);
  });
  doc.faces = cleanFaces;
}

export function extrudeFaces(
  doc: MeshDocument,
  selFaces: Set<number>,
  groupIndex: number,
  distance = 12,
): void {
  const session = prepareExtrude(doc, selFaces, groupIndex);
  if (session) applyExtrudeDistance(doc, session, Math.max(0.01, distance));
}

/** Inset selected faces: shrink toward centroid and add side walls. */
export function insetFaces(
  doc: MeshDocument,
  selFaces: Set<number>,
  groupIndex: number,
  factor: number,
): void {
  const t = Math.min(0.45, Math.max(0.01, factor));
  selFaces.forEach((fi) => {
    const f = doc.faces[fi];
    if (!f || f.length < 3) return;
    const verts = f.map((vi) => doc.vertices[vi]);
    const cx = verts.reduce((s, v) => s + v.x, 0) / verts.length;
    const cy = verts.reduce((s, v) => s + v.y, 0) / verts.length;
    const cz = verts.reduce((s, v) => s + v.z, 0) / verts.length;
    const inner: number[] = [];
    f.forEach((vi) => {
      const v = doc.vertices[vi];
      const ni = doc.vertices.length;
      doc.vertices.push({
        x: v.x + (cx - v.x) * t,
        y: v.y + (cy - v.y) * t,
        z: v.z + (cz - v.z) * t,
      });
      doc.vertexLayers.push(doc.vertexLayers[vi] ?? doc.activeLayerId);
      inner.push(ni);
    });
    for (let i = 0; i < f.length; i++) {
      const a = f[i];
      const b = f[(i + 1) % f.length];
      const na = inner[i];
      const nb = inner[(i + 1) % inner.length];
      doc.groups[groupIndex].faces.push(doc.faces.length);
      doc.faces.push([a, b, nb, na]);
      doc.faceLayers.push(doc.faceLayers[fi] ?? doc.activeLayerId);
    }
    doc.faces[fi] = inner;
  });
}

/** Blender-style edge bevel (width in world units). */
export function bevelEdges(
  doc: MeshDocument,
  selEdges: Set<EdgeKey>,
  amount: number,
  groupIndex = 0,
): void {
  bevelEdgesBlender(doc, selEdges, amount, groupIndex);
}

export function smoothMesh(doc: MeshDocument, selVerts: Set<number>): void {
  const target = selVerts.size > 0 ? selVerts : new Set(doc.vertices.map((_, i) => i));
  const adjMap: Record<number, number[]> = {};
  doc.vertices.forEach((_, i) => (adjMap[i] = []));
  doc.faces.forEach((f) => {
    if (!f) return;
    f.forEach((vi, i) => {
      const ni = f[(i + 1) % f.length];
      adjMap[vi].push(ni);
      adjMap[ni].push(vi);
    });
  });
  const newVerts = doc.vertices.map(cloneVec3);
  target.forEach((vi) => {
    const adj = adjMap[vi];
    if (!adj.length) return;
    const cx = adj.reduce((s, ai) => s + doc.vertices[ai].x, 0) / adj.length;
    const cy = adj.reduce((s, ai) => s + doc.vertices[ai].y, 0) / adj.length;
    const cz = adj.reduce((s, ai) => s + doc.vertices[ai].z, 0) / adj.length;
    newVerts[vi] = {
      x: (doc.vertices[vi].x + cx) / 2,
      y: (doc.vertices[vi].y + cy) / 2,
      z: (doc.vertices[vi].z + cz) / 2,
    };
  });
  doc.vertices = newVerts;
}
