import type { Vec3 } from '@/core/math/Vec3';
import type { MeshDocument } from '@/core/mesh/MeshDocument';
import type { KnifePoint } from '@/systems/mesh/knifeDraw';
import {
  buildFaceFrame,
  computeFaceNormal,
  cornerAngleDeg,
  ensureFaceWinding,
  faceEdges,
  isConcaveQuad,
  lineIntersectsTriangle2D,
  meshEdgeKey,
  pointInTriangle2D,
  sameMeshEdge,
} from '@/systems/mesh/meshFace';

type MappedPoint = KnifePoint & { vertexKey: number };

function addMeshVertex(doc: MeshDocument, position: Vec3): number {
  const vi = doc.vertices.length;
  doc.vertices.push({ ...position });
  doc.vertexLayers.push(doc.activeLayerId);
  return vi;
}

function mapKnifePointsToVertices(doc: MeshDocument, points: KnifePoint[]): MappedPoint[] {
  const mapped: MappedPoint[] = points.map((p) => ({ ...p, vertexKey: -1 }));
  for (let i = 0; i < mapped.length; i++) {
    const p = mapped[i];
    if (p.vertexKey >= 0) continue;
    if (p.kind === 'vertex' && p.vertexIndex !== undefined) {
      p.vertexKey = p.vertexIndex;
    } else if (p.reuseOf !== undefined && mapped[p.reuseOf]?.vertexKey >= 0) {
      p.vertexKey = mapped[p.reuseOf].vertexKey;
    } else {
      p.vertexKey = addMeshVertex(doc, p.position);
    }
  }
  return mapped;
}

function pointOnFace(p: MappedPoint, fi: number, face: number[], allPoints: MappedPoint[]): boolean {
  if (p.faceIndex !== undefined && p.faceIndex === fi) return true;
  if (p.vertexIndex !== undefined && face.includes(p.vertexIndex)) return true;
  if (p.edge && face.includes(p.edge[0]) && face.includes(p.edge[1])) return true;
  if (p.reuseOf !== undefined) {
    const reused = allPoints[p.reuseOf];
    if (reused && pointOnFace(reused, fi, face, allPoints)) return true;
  }
  return false;
}

function includedPointsOnFace(
  fi: number,
  face: number[],
  allPoints: MappedPoint[],
): (MappedPoint | null)[] {
  return allPoints.map((p) => (pointOnFace(p, fi, face, allPoints) ? p : null));
}

function cutSingleFace(
  doc: MeshDocument,
  fi: number,
  face: number[],
  allPoints: MappedPoint[],
): number[][] | null {
  const onFace = includedPointsOnFace(fi, face, allPoints);
  const included = onFace.filter((p): p is MappedPoint => p !== null);
  const perimeterPoints = included.filter((p) => p.kind !== 'face');
  const midPoints = included.filter((p) => p.kind === 'face');

  const vertexOnly = included.filter((p) => p.kind === 'vertex');
  if (included.length === 0 || (vertexOnly.length === 1 && included.length === 1)) {
    return null;
  }

  const oldNormal = computeFaceNormal(doc, face);
  const frame = buildFaceFrame(doc, face);

  const plannedEdges: [number, number][] = [];
  for (let i = 1; i < onFace.length; i++) {
    const a = onFace[i - 1];
    const b = onFace[i];
    if (a && b) plannedEdges.push([a.vertexKey, b.vertexKey]);
  }

  const perimeterVertices: number[] = [];
  for (let i = 0; i < face.length; i++) {
    const v1 = face[i];
    const v2 = face[(i + 1) % face.length];
    perimeterVertices.push(v1);
    const edgePoints = perimeterPoints.filter(
      (p) => p.kind === 'edge' && p.edge && sameMeshEdge(p.edge, [v1, v2]),
    );
    if (edgePoints.length > 0) {
      const v1p = doc.vertices[v1];
      edgePoints.sort(
        (a, b) =>
          Math.hypot(b.position.x - v1p.x, b.position.y - v1p.y, b.position.z - v1p.z) -
          Math.hypot(a.position.x - v1p.x, a.position.y - v1p.y, a.position.z - v1p.z),
      );
      perimeterVertices.push(...edgePoints.map((p) => p.vertexKey));
    }
  }

  const perimeterEdges: [number, number][] = [];
  for (let i = 0; i < perimeterVertices.length; i++) {
    perimeterEdges.push([perimeterVertices[i], perimeterVertices[(i + 1) % perimeterVertices.length]]);
  }

  let midEdges = plannedEdges.filter(([a, b]) => {
    const aPerim = perimeterPoints.some((p) => p.vertexKey === a);
    const bPerim = perimeterPoints.some((p) => p.vertexKey === b);
    return !aPerim || !bPerim;
  });
  const generatedEdges: [number, number][] = [];
  const edgeFaceConnections: Record<string, number> = {};
  const coveredPerimeterEdges: Record<string, boolean> = {};
  const createdFaceVerts: number[][] = [];
  const newFaces: number[][] = [];

  const flat = (vi: number) => frame.projectIndex(doc, vi);

  function thingsInTri(v1: number, v2: number, v3: number): boolean {
    const t1 = flat(v1);
    const t2 = flat(v2);
    const t3 = flat(v3);
    for (const p of midPoints) {
      if (p.vertexKey === v1 || p.vertexKey === v2 || p.vertexKey === v3) continue;
      if (pointInTriangle2D(flat(p.vertexKey), t1, t2, t3)) return true;
    }
    const testEdges = [...midEdges, ...generatedEdges];
    for (const edge of testEdges) {
      if (
        sameMeshEdge(edge, [v1, v2]) ||
        sameMeshEdge(edge, [v2, v3]) ||
        sameMeshEdge(edge, [v3, v1])
      ) {
        continue;
      }
      if (lineIntersectsTriangle2D(flat(edge[0]), flat(edge[1]), t1, t2, t3)) return true;
    }
    return false;
  }

  function edgeOccupied(edge: [number, number]): boolean {
    const key = meshEdgeKey(edge[0], edge[1]);
    if (coveredPerimeterEdges[key]) return true;
    if ((edgeFaceConnections[key] ?? 0) >= 2) return true;
    return false;
  }

  function faceExists(verts: number[]): boolean {
    return createdFaceVerts.some((existing) => verts.every((v) => existing.includes(v)));
  }

  function tryMakeTri(v1: number, v2: number, v3: number): number[] | null {
    if (v1 === undefined || v2 === undefined || v3 === undefined) return null;
    const verts = [v1, v2, v3];
    if (faceExists(verts)) return null;
    if (thingsInTri(v1, v2, v3)) return null;
    for (const edge of faceEdges(verts)) {
      if (edgeOccupied(edge)) return null;
    }
    for (let i = 0; i < verts.length; i++) {
      const angle = cornerAngleDeg(doc, verts, i);
      if (angle < 2 || angle > 178) return null;
    }
    return ensureFaceWinding(doc, oldNormal, verts);
  }

  function tryMakeQuad(v1: number, v2: number, v3: number, v4: number): number[] | null {
    if (v1 === undefined || v2 === undefined || v3 === undefined || v4 === undefined) return null;
    let verts = [v1, v2, v3, v4];
    if (isConcaveQuad(doc, frame, verts)) return null;
    verts = ensureFaceWinding(doc, oldNormal, verts);
    const diag1: [number, number] = [verts[0], verts[2]];
    const diag2: [number, number] = [verts[1], verts[3]];
    if (midEdges.some((e) => sameMeshEdge(e, diag1) || sameMeshEdge(e, diag2))) return null;
    for (const edge of faceEdges(verts)) {
      if (edgeOccupied(edge)) return null;
    }
    if (faceExists(verts)) return null;
    if (thingsInTri(verts[0], verts[1], verts[2])) return null;
    if (thingsInTri(verts[0], verts[2], verts[3])) return null;
    if (thingsInTri(verts[0], verts[1], verts[3])) return null;
    if (thingsInTri(verts[1], verts[2], verts[3])) return null;
    for (let i = 0; i < verts.length; i++) {
      const angle = cornerAngleDeg(doc, verts, i);
      if (angle < 1 || angle > 178) return null;
    }
    return verts;
  }

  function initFace(verts: number[]): void {
    const wound = ensureFaceWinding(doc, oldNormal, verts);
    createdFaceVerts.push(wound);
    newFaces.push(wound);

    for (const edge of faceEdges(wound)) {
      const key = meshEdgeKey(edge[0], edge[1]);
      const isMid = midEdges.some((e) => sameMeshEdge(e, edge));
      const isPerim = perimeterEdges.some((e) => sameMeshEdge(e, edge));
      const isPlanned = plannedEdges.some((e) => sameMeshEdge(e, edge));
      if (!isMid && !isPerim && !isPlanned && !generatedEdges.some((e) => sameMeshEdge(e, edge))) {
        generatedEdges.push(edge);
      }
      edgeFaceConnections[key] = (edgeFaceConnections[key] ?? 0) + 1;
    }
  }

  const sortByDistanceToEdgeCenter = (edge: [number, number], items: number[]) => {
    const cx = (doc.vertices[edge[0]].x + doc.vertices[edge[1]].x) / 2;
    const cy = (doc.vertices[edge[0]].y + doc.vertices[edge[1]].y) / 2;
    const cz = (doc.vertices[edge[0]].z + doc.vertices[edge[1]].z) / 2;
    return [...items].sort((a, b) => {
      const va = doc.vertices[a];
      const vb = doc.vertices[b];
      const da = (va.x - cx) ** 2 + (va.y - cy) ** 2 + (va.z - cz) ** 2;
      const db = (vb.x - cx) ** 2 + (vb.y - cy) ** 2 + (vb.z - cz) ** 2;
      return da - db;
    });
  };

  const tryFillFromEdge = (edge: [number, number], candidates: number[]): number[] | null => {
    const nearest = sortByDistanceToEdgeCenter(edge, candidates);
    return (
      tryMakeQuad(edge[0], edge[1], nearest[0], nearest[1]) ||
      tryMakeQuad(edge[0], edge[1], nearest[0], nearest[2]) ||
      tryMakeQuad(edge[0], edge[1], nearest[1], nearest[2]) ||
      tryMakeQuad(edge[0], edge[1], nearest[0], nearest[3]) ||
      tryMakeQuad(edge[0], edge[1], nearest[1], nearest[3]) ||
      tryMakeQuad(edge[0], edge[1], nearest[2], nearest[3]) ||
      nearest.reduce<number[] | null>((found, _v, idx) => found ?? tryMakeTri(edge[0], edge[1], nearest[idx]), null)
    );
  };

  for (const edge of perimeterEdges) {
    const candidates = [
      ...sortByDistanceToEdgeCenter(
        edge,
        midPoints.map((p) => p.vertexKey),
      ),
      ...perimeterVertices.filter((v) => !edge.includes(v)),
    ];
    const faceVerts = tryFillFromEdge(edge, candidates);
    if (faceVerts) {
      initFace(faceVerts);
      coveredPerimeterEdges[meshEdgeKey(edge[0], edge[1])] = true;
      for (const e of faceEdges(faceVerts)) {
        if (perimeterEdges.some((pe) => sameMeshEdge(pe, e))) {
          coveredPerimeterEdges[meshEdgeKey(e[0], e[1])] = true;
        }
      }
    }
  }

  for (const edge of [...midEdges]) {
    const key = meshEdgeKey(edge[0], edge[1]);
    let limiter = 0;
    while ((edgeFaceConnections[key] ?? 0) !== 2 && limiter < 8) {
      const candidates = [
        ...midPoints.map((p) => p.vertexKey).filter((v) => !edge.includes(v)),
        ...perimeterVertices,
      ];
      const faceVerts = tryFillFromEdge(edge, candidates);
      if (!faceVerts) break;
      initFace(faceVerts);
      for (const e of faceEdges(faceVerts)) {
        const eKey = meshEdgeKey(e[0], e[1]);
        const isMid = midEdges.some((me) => sameMeshEdge(me, e));
        if (eKey !== key && !isMid && !perimeterEdges.some((pe) => sameMeshEdge(pe, e))) {
          midEdges.push(e);
        }
      }
      limiter++;
    }
  }

  if (newFaces.length === 0) return null;
  return newFaces;
}

/**
 * Blockbench-style knife: cut paths on face surfaces, delete affected faces,
 * and refill with new tris/quads along the cut.
 */
export function knifeSurfacePathMesh(doc: MeshDocument, points: KnifePoint[]): boolean {
  if (points.length < 2) return false;

  const mapped = mapKnifePointsToVertices(doc, points);
  const replacements = new Map<number, number[][]>();

  doc.faces.forEach((face, fi) => {
    if (!face || face.length < 3) return;
    const result = cutSingleFace(doc, fi, face, mapped);
    if (result && result.length > 0) replacements.set(fi, result);
  });

  if (replacements.size === 0) return false;

  const newFaces: number[][] = [];
  const newFaceLayers: string[] = [];
  const faceRemap: number[][] = [];

  doc.faces.forEach((face, fi) => {
    if (!face || face.length < 3) {
      faceRemap[fi] = [];
      return;
    }
    const repl = replacements.get(fi);
    if (repl) {
      faceRemap[fi] = [];
      const layer = doc.faceLayers[fi] ?? doc.activeLayerId;
      repl.forEach((loop) => {
        faceRemap[fi].push(newFaces.length);
        newFaces.push(loop);
        newFaceLayers.push(layer);
      });
    } else {
      faceRemap[fi] = [newFaces.length];
      newFaces.push([...face]);
      newFaceLayers.push(doc.faceLayers[fi] ?? doc.activeLayerId);
    }
  });

  doc.faces = newFaces;
  doc.faceLayers = newFaceLayers;
  doc.groups.forEach((g) => {
    g.faces = g.faces.flatMap((fi) => faceRemap[fi] ?? []);
  });

  return true;
}

/** Whether consecutive knife points share at least one face (Blockbench segment check). */
export function knifeSegmentOnSharedFace(
  mesh: MeshDocument,
  a: KnifePoint,
  b: KnifePoint,
): boolean {
  if (a.faceIndex !== undefined && a.faceIndex === b.faceIndex) return true;

  const pointInFace = (p: KnifePoint, fi: number, face: number[]) => {
    if (p.faceIndex === fi) return true;
    if (p.vertexIndex !== undefined && face.includes(p.vertexIndex)) return true;
    if (p.edge && face.includes(p.edge[0]) && face.includes(p.edge[1])) return true;
    return false;
  };

  for (let fi = 0; fi < mesh.faces.length; fi++) {
    const face = mesh.faces[fi];
    if (!face || face.length < 3) continue;
    if (pointInFace(a, fi, face) && pointInFace(b, fi, face)) return true;
  }
  return false;
}

export function knifePointFaceIndex(mesh: MeshDocument, p: KnifePoint): number | undefined {
  if (p.faceIndex !== undefined) return p.faceIndex;
  if (p.vertexIndex !== undefined) {
    for (let fi = 0; fi < mesh.faces.length; fi++) {
      const face = mesh.faces[fi];
      if (face?.includes(p.vertexIndex)) return fi;
    }
  }
  if (p.edge) {
    for (let fi = 0; fi < mesh.faces.length; fi++) {
      const face = mesh.faces[fi];
      if (face?.includes(p.edge[0]) && face?.includes(p.edge[1])) return fi;
    }
  }
  return undefined;
}
