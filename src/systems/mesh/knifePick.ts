import { VIEW2D_DEFS, pointInPoly, s2w, w2s, type View2DKey } from '@/core/math/projection';
import type { Vec3 } from '@/core/math/Vec3';
import type { MeshDocument } from '@/core/mesh/MeshDocument';
import type { KnifePoint } from '@/systems/mesh/knifeDraw';
import {
  closestPointOnSegment,
  raycastMeshSurface,
  nearestVertexScreen,
  nearestEdgeRay,
  vertexToScreen,
} from '@/systems/viewport/pick3D';
import {
  makeEdgeKey,
  nearestEdge2D,
  nearestFace2D,
  nearestVertex2D,
  type ViewportSelectionState,
} from '@/systems/selection/selectionSystem';
import type * as THREE from 'three';

const KNIFE_NODE_SNAP_PX = 12;
const KNIFE_PATH_SNAP_PX = 10;
const KNIFE_VERTEX_SNAP_PX = 10;
const KNIFE_EDGE_SNAP_PX = 12;

function faceCenter(mesh: MeshDocument, fi: number): Vec3 {
  const face = mesh.faces[fi];
  if (!face?.length) return { x: 0, y: 0, z: 0 };
  let x = 0;
  let y = 0;
  let z = 0;
  face.forEach((vi) => {
    const v = mesh.vertices[vi];
    x += v.x;
    y += v.y;
    z += v.z;
  });
  const n = face.length;
  return { x: x / n, y: y / n, z: z / n };
}

function faceNormal(mesh: MeshDocument, face: number[]): Vec3 {
  if (face.length < 3) return { x: 0, y: 1, z: 0 };
  const a = mesh.vertices[face[0]];
  const b = mesh.vertices[face[1]];
  const c = mesh.vertices[face[2]];
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const acx = c.x - a.x;
  const acy = c.y - a.y;
  const acz = c.z - a.z;
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return { x: nx / len, y: ny / len, z: nz / len };
}

function projectOntoFacePlane(p: Vec3, planePoint: Vec3, normal: Vec3): Vec3 {
  const d = normal.x * planePoint.x + normal.y * planePoint.y + normal.z * planePoint.z;
  const dist = normal.x * p.x + normal.y * p.y + normal.z * p.z - d;
  return {
    x: p.x - normal.x * dist,
    y: p.y - normal.y * dist,
    z: p.z - normal.z * dist,
  };
}

function snapOnFaceGrid(
  position: Vec3,
  faceIndex: number,
  mesh: MeshDocument,
  snap: (n: number) => number,
): Vec3 {
  const face = mesh.faces[faceIndex];
  if (!face?.length) return position;
  const normal = faceNormal(mesh, face);
  const origin = mesh.vertices[face[0]];
  const projected = projectOntoFacePlane(position, origin, normal);
  return {
    x: snap(projected.x),
    y: snap(projected.y),
    z: snap(projected.z),
  };
}

function closestScreenPointOnSegment(
  sx: number,
  sy: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { t: number; dist: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-8) {
    return { t: 0, dist: Math.hypot(sx - ax, sy - ay) };
  }
  let t = ((sx - ax) * dx + (sy - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const px = ax + dx * t;
  const py = ay + dy * t;
  return { t, dist: Math.hypot(sx - px, sy - py) };
}

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function knifeNodePoint(existingPoints: KnifePoint[], index: number): KnifePoint {
  const reused = existingPoints[index];
  return {
    position: { ...reused.position },
    kind: 'node',
    snapped: true,
    reuseOf: index,
    faceIndex: reused.faceIndex,
    vertexIndex: reused.vertexIndex,
    edge: reused.edge,
  };
}

function nearestKnifeNode3D(
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  points: KnifePoint[],
  sx: number,
  sy: number,
  thresholdPx = KNIFE_NODE_SNAP_PX,
): number | null {
  let best = -1;
  let bestD = thresholdPx;
  for (let i = 0; i < points.length; i++) {
    const sc = vertexToScreen(camera, canvas, points[i].position);
    const d = Math.hypot(sc.x - sx, sc.y - sy);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best >= 0 ? best : null;
}

function nearestKnifeNode2D(
  vpKey: View2DKey,
  vpState: ViewportSelectionState,
  points: KnifePoint[],
  sx: number,
  sy: number,
  thresholdPx = KNIFE_NODE_SNAP_PX,
): number | null {
  const vd = VIEW2D_DEFS[vpKey];
  let best = -1;
  let bestD = thresholdPx;
  for (let i = 0; i < points.length; i++) {
    const pj = vd.proj(points[i].position);
    const sc = w2s(pj.x, pj.y, vpState.pan, vpState.zoom);
    const d = Math.hypot(sc.x - sx, sc.y - sy);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best >= 0 ? best : null;
}

function nearestKnifePathPoint3D(
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  points: KnifePoint[],
  sx: number,
  sy: number,
  thresholdPx = KNIFE_PATH_SNAP_PX,
): Vec3 | null {
  let best: Vec3 | null = null;
  let bestD = thresholdPx;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i].position;
    const b = points[i + 1].position;
    const sa = vertexToScreen(camera, canvas, a);
    const sb = vertexToScreen(camera, canvas, b);
    const { t, dist } = closestScreenPointOnSegment(sx, sy, sa.x, sa.y, sb.x, sb.y);
    if (dist < bestD && t > 0.04 && t < 0.96) {
      bestD = dist;
      best = lerpVec3(a, b, t);
    }
  }
  return best;
}

function nearestKnifePathPoint2D(
  vpKey: View2DKey,
  vpState: ViewportSelectionState,
  points: KnifePoint[],
  sx: number,
  sy: number,
  thresholdPx = KNIFE_PATH_SNAP_PX,
): Vec3 | null {
  const vd = VIEW2D_DEFS[vpKey];
  let best: Vec3 | null = null;
  let bestD = thresholdPx;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i].position;
    const b = points[i + 1].position;
    const sa = w2s(vd.proj(a).x, vd.proj(a).y, vpState.pan, vpState.zoom);
    const sb = w2s(vd.proj(b).x, vd.proj(b).y, vpState.pan, vpState.zoom);
    const { t, dist } = closestScreenPointOnSegment(sx, sy, sa.x, sa.y, sb.x, sb.y);
    if (dist < bestD && t > 0.04 && t < 0.96) {
      bestD = dist;
      best = lerpVec3(a, b, t);
    }
  }
  return best;
}

function faceIndexForVertex(mesh: MeshDocument, vi: number, visibleFaces: Set<number>): number {
  for (let fi = 0; fi < mesh.faces.length; fi++) {
    const face = mesh.faces[fi];
    if (face && face.includes(vi) && visibleFaces.has(fi)) return fi;
  }
  return [...visibleFaces][0] ?? 0;
}

function faceIndexForEdge(
  mesh: MeshDocument,
  a: number,
  b: number,
  visibleFaces: Set<number>,
): number {
  for (let fi = 0; fi < mesh.faces.length; fi++) {
    const face = mesh.faces[fi];
    if (face && face.includes(a) && face.includes(b) && visibleFaces.has(fi)) return fi;
  }
  return [...visibleFaces][0] ?? 0;
}

function depthAtPoint(camera: THREE.PerspectiveCamera, p: Vec3): number {
  const dx = p.x - camera.position.x;
  const dy = p.y - camera.position.y;
  const dz = p.z - camera.position.z;
  return Math.hypot(dx, dy, dz);
}

function screenWorldThreshold(
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  depth: number,
  thresholdPx: number,
): number {
  const fovRad = (camera.fov * Math.PI) / 180;
  const rect = canvas.getBoundingClientRect();
  return (thresholdPx / rect.height) * depth * 2 * Math.tan(fovRad / 2);
}

function depthNearSurface(
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  point: Vec3,
  surfaceDepth: number,
  thresholdPx: number,
): boolean {
  const depth = depthAtPoint(camera, point);
  const slack = screenWorldThreshold(camera, canvas, surfaceDepth, thresholdPx);
  return Math.abs(depth - surfaceDepth) <= slack;
}

export interface KnifePickModifiers {
  shiftKey: boolean;
  ctrlKey: boolean;
  snap: (n: number) => number;
}

export function pickKnifePoint3D(
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  mesh: MeshDocument,
  sx: number,
  sy: number,
  visibleVerts: Set<number>,
  visibleFaces: Set<number>,
  existingPoints: KnifePoint[],
  modifiers: KnifePickModifiers,
): KnifePoint | null {
  const nodeIndex = nearestKnifeNode3D(camera, canvas, existingPoints, sx, sy);
  if (nodeIndex !== null) {
    return knifeNodePoint(existingPoints, nodeIndex);
  }

  const pathPoint = nearestKnifePathPoint3D(camera, canvas, existingPoints, sx, sy);
  if (pathPoint) {
    const hit = raycastMeshSurface(camera, canvas, mesh, sx, sy, visibleFaces);
    return {
      position: pathPoint,
      kind: 'face',
      faceIndex: hit?.faceIndex,
      snapped: true,
    };
  }

  const hit = raycastMeshSurface(camera, canvas, mesh, sx, sy, visibleFaces);
  if (!hit) return null;

  const surfaceDepth = depthAtPoint(camera, hit.position);

  const vi = nearestVertexScreen(
    camera,
    canvas,
    mesh,
    sx,
    sy,
    visibleVerts,
    KNIFE_VERTEX_SNAP_PX,
  );
  if (vi >= 0) {
    const v = mesh.vertices[vi];
    if (depthNearSurface(camera, canvas, v, surfaceDepth, KNIFE_VERTEX_SNAP_PX + 2)) {
      return {
        position: { ...v },
        kind: 'vertex',
        faceIndex: faceIndexForVertex(mesh, vi, visibleFaces),
        vertexIndex: vi,
        snapped: true,
      };
    }
  }

  const edge = nearestEdgeRay(
    camera,
    canvas,
    mesh,
    sx,
    sy,
    visibleVerts,
    visibleFaces,
    KNIFE_EDGE_SNAP_PX,
  );
  if (edge) {
    const [a, b] = edge.split(',').map(Number) as [number, number];
    const va = mesh.vertices[a];
    const vb = mesh.vertices[b];
    const mid = {
      x: (va.x + vb.x) / 2,
      y: (va.y + vb.y) / 2,
      z: (va.z + vb.z) / 2,
    };
    if (depthNearSurface(camera, canvas, mid, surfaceDepth, KNIFE_EDGE_SNAP_PX + 2)) {
      let { point, t } = closestPointOnSegment(va, vb, hit.position);
      if (modifiers.shiftKey) {
        t = Math.round(t * 4) / 4;
        point = lerpVec3(va, vb, t);
      }
      return {
        position: point,
        kind: 'edge',
        faceIndex: hit.faceIndex,
        edge: [a, b],
        snapped: true,
      };
    }
  }

  let position = { ...hit.position };
  if (modifiers.shiftKey) {
    position = faceCenter(mesh, hit.faceIndex);
  } else if (modifiers.ctrlKey) {
    position = snapOnFaceGrid(position, hit.faceIndex, mesh, modifiers.snap);
  }

  return {
    position,
    kind: 'face',
    faceIndex: hit.faceIndex,
    snapped: modifiers.shiftKey || modifiers.ctrlKey,
  };
}

export function pickKnifePoint2D(
  vpKey: View2DKey,
  mesh: MeshDocument,
  sx: number,
  sy: number,
  vpState: ViewportSelectionState,
  visibleVerts: Set<number>,
  visibleFaces: Set<number>,
  existingPoints: KnifePoint[],
  modifiers: KnifePickModifiers,
): KnifePoint | null {
  const vd = VIEW2D_DEFS[vpKey];

  const nodeIndex = nearestKnifeNode2D(vpKey, vpState, existingPoints, sx, sy);
  if (nodeIndex !== null) {
    return knifeNodePoint(existingPoints, nodeIndex);
  }

  const pathPoint = nearestKnifePathPoint2D(vpKey, vpState, existingPoints, sx, sy);
  if (pathPoint) {
    const targetFace = nearestFace2D(sx, sy, vpKey, mesh, vpState, { visibleFaces }, 14);
    return {
      position: pathPoint,
      kind: 'face',
      faceIndex: targetFace >= 0 ? targetFace : undefined,
      snapped: true,
    };
  }

  const targetFace = nearestFace2D(sx, sy, vpKey, mesh, vpState, { visibleFaces }, 14);
  if (targetFace < 0) return null;

  const vi = nearestVertex2D(sx, sy, vpKey, mesh, vpState, { visibleVertices: visibleVerts });
  if (vi >= 0) {
    return {
      position: { ...mesh.vertices[vi] },
      kind: 'vertex',
      faceIndex: faceIndexForVertex(mesh, vi, visibleFaces),
      vertexIndex: vi,
      snapped: true,
    };
  }

  const edgeKey = nearestEdge2D(sx, sy, vpKey, mesh, vpState, {
    visibleVertices: visibleVerts,
    visibleFaces,
  });
  if (edgeKey) {
    const [a, b] = edgeKey.split(',').map(Number) as [number, number];
    const va = mesh.vertices[a];
    const vb = mesh.vertices[b];
    const sa = w2s(vd.proj(va).x, vd.proj(va).y, vpState.pan, vpState.zoom);
    const sb = w2s(vd.proj(vb).x, vd.proj(vb).y, vpState.pan, vpState.zoom);
    const dx = sb.x - sa.x;
    const dy = sb.y - sa.y;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq > 1e-8 ? ((sx - sa.x) * dx + (sy - sa.y) * dy) / lenSq : 0.5;
    t = Math.max(0, Math.min(1, t));
    if (modifiers.shiftKey) t = Math.round(t * 4) / 4;
    const position = lerpVec3(va, vb, t);
    return {
      position,
      kind: 'edge',
      faceIndex: faceIndexForEdge(mesh, a, b, visibleFaces),
      edge: makeEdgeKey(a, b).split(',').map(Number) as [number, number],
      snapped: true,
    };
  }

  const face = mesh.faces[targetFace];
  if (!face?.length) return null;

  const wx = s2w(sx, sy, vpState.pan, vpState.zoom).x;
  const wy = s2w(sx, sy, vpState.pan, vpState.zoom).y;
  let position = vd.unproj(wx, wy);
  const normal = faceNormal(mesh, face);
  const origin = mesh.vertices[face[0]];
  position = projectOntoFacePlane(position, origin, normal);

  if (modifiers.shiftKey) {
    position = faceCenter(mesh, targetFace);
  } else if (modifiers.ctrlKey) {
    position = snapOnFaceGrid(position, targetFace, mesh, modifiers.snap);
  } else {
    const pts = face.map((vertex) => {
      const pj = vd.proj(mesh.vertices[vertex]);
      return w2s(pj.x, pj.y, vpState.pan, vpState.zoom);
    });
    if (!pointInPoly(sx, sy, pts)) return null;
  }

  return {
    position,
    kind: 'face',
    faceIndex: targetFace,
    snapped: modifiers.shiftKey || modifiers.ctrlKey,
  };
}
