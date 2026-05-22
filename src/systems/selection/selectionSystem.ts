import { VIEW2D_DEFS, pointInPoly, w2s, type View2DKey } from '@/core/math/projection';
import type { MeshDocument } from '@/core/mesh/MeshDocument';
import { editableFaceIndices, editableVertexIndices } from '@/systems/layers/layerSystem';

export type SelectionMode = 'object' | 'vertex' | 'edge' | 'face';
export type EdgeKey = `${number},${number}`;

/** Shift or Ctrl held — add/toggle selection instead of replace. */
export function isAdditiveSelection(shiftKey: boolean, ctrlKey = false): boolean {
  return shiftKey || ctrlKey;
}

/** Vertex drag on select tool only in object/vertex modes (not face/edge pick modes). */
export function allowsVertexComponentDrag(selectionMode: SelectionMode): boolean {
  return selectionMode === 'vertex' || selectionMode === 'object';
}

/** Click/drag existing vertices in vertex (or object) selection mode (not move/rotate/scale). */
export function supportsVertexPickDrag(tool: string, selectionMode: SelectionMode): boolean {
  if (!allowsVertexComponentDrag(selectionMode)) return false;
  if (tool === 'move' || tool === 'rotate' || tool === 'scale') return false;
  return tool === 'select' || tool === 'vertex';
}

/** Update vertex selection when pressing on a handle (MilkShape-style). */
export function vertexPickSelection(
  selVerts: Set<number>,
  vi: number,
  shiftKey: boolean,
  ctrlKey = false,
): Set<number> {
  const additive = isAdditiveSelection(shiftKey, ctrlKey);
  if (additive) {
    const next = new Set(selVerts);
    if (next.has(vi)) next.delete(vi);
    else next.add(vi);
    return next;
  }
  return new Set([vi]);
}

export interface ViewportSelectionState {
  pan: { x: number; y: number };
  zoom: number;
}

export function makeEdgeKey(a: number, b: number): EdgeKey {
  return `${Math.min(a, b)},${Math.max(a, b)}` as EdgeKey;
}

export function parseEdgeKey(edge: EdgeKey): [number, number] {
  return edge.split(',').map(Number) as [number, number];
}

export function uniqueMeshEdges(mesh: MeshDocument): EdgeKey[] {
  const edges = new Set<EdgeKey>();
  mesh.faces.forEach((face) => {
    if (!face || face.length < 2) return;
    face.forEach((vertex, index) => {
      edges.add(makeEdgeKey(vertex, face[(index + 1) % face.length]));
    });
  });
  return [...edges];
}

export interface SelectionFilter {
  visibleVertices?: Set<number>;
  visibleFaces?: Set<number>;
}

export function nearestVertex2D(
  sx: number,
  sy: number,
  vpKey: View2DKey,
  mesh: MeshDocument,
  vpState: ViewportSelectionState,
  filter: SelectionFilter = {},
): number {
  const vd = VIEW2D_DEFS[vpKey];
  for (let i = mesh.vertices.length - 1; i >= 0; i--) {
    if (filter.visibleVertices && !filter.visibleVertices.has(i)) continue;
    const pj = vd.proj(mesh.vertices[i]);
    const sc = w2s(pj.x, pj.y, vpState.pan, vpState.zoom);
    if (Math.hypot(sc.x - sx, sc.y - sy) < 9) return i;
  }
  return -1;
}

export function nearestFace2D(
  sx: number,
  sy: number,
  vpKey: View2DKey,
  mesh: MeshDocument,
  vpState: ViewportSelectionState,
  filter: SelectionFilter = {},
  threshold = 14,
): number {
  const vd = VIEW2D_DEFS[vpKey];
  for (let fi = mesh.faces.length - 1; fi >= 0; fi--) {
    if (filter.visibleFaces && !filter.visibleFaces.has(fi)) continue;
    const f = mesh.faces[fi];
    if (!f || f.length < 3) continue;
    const pts = f.map((vi) => {
      const pj = vd.proj(mesh.vertices[vi]);
      return w2s(pj.x, pj.y, vpState.pan, vpState.zoom);
    });
    if (pointInPoly(sx, sy, pts)) return fi;
  }

  let best = -1;
  let bestD = threshold;
  for (let fi = mesh.faces.length - 1; fi >= 0; fi--) {
    if (filter.visibleFaces && !filter.visibleFaces.has(fi)) continue;
    const f = mesh.faces[fi];
    if (!f || f.length < 3) continue;
    let cx = 0;
    let cy = 0;
    f.forEach((vi) => {
      const pj = vd.proj(mesh.vertices[vi]);
      const sc = w2s(pj.x, pj.y, vpState.pan, vpState.zoom);
      cx += sc.x;
      cy += sc.y;
    });
    cx /= f.length;
    cy /= f.length;
    const d = Math.hypot(cx - sx, cy - sy);
    if (d < bestD) {
      bestD = d;
      best = fi;
    }
  }
  return best;
}

export function nearestEdge2D(
  sx: number,
  sy: number,
  vpKey: View2DKey,
  mesh: MeshDocument,
  vpState: ViewportSelectionState,
  filter: SelectionFilter = {},
): EdgeKey | null {
  const vd = VIEW2D_DEFS[vpKey];
  let bestEdge: EdgeKey | null = null;
  let bestDistance = Infinity;

  for (let fi = 0; fi < mesh.faces.length; fi++) {
    if (filter.visibleFaces && !filter.visibleFaces.has(fi)) continue;
    const face = mesh.faces[fi];
    if (!face || face.length < 2) continue;
    for (let index = 0; index < face.length; index++) {
      const vertex = face[index];
      const next = face[(index + 1) % face.length];
      if (filter.visibleVertices && (!filter.visibleVertices.has(vertex) || !filter.visibleVertices.has(next))) continue;
      const a = vd.proj(mesh.vertices[vertex]);
      const b = vd.proj(mesh.vertices[next]);
      const sa = w2s(a.x, a.y, vpState.pan, vpState.zoom);
      const sb = w2s(b.x, b.y, vpState.pan, vpState.zoom);
      const distance = distanceToSegment(sx, sy, sa.x, sa.y, sb.x, sb.y);
      if (distance <= 8 && distance < bestDistance) {
        bestDistance = distance;
        bestEdge = makeEdgeKey(vertex, next);
      }
    }
  }

  return bestEdge;
}

function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export interface ClickSelectionInput {
  mesh: MeshDocument;
  vpKey: View2DKey;
  vpState: ViewportSelectionState;
  sx: number;
  sy: number;
  selectionMode: SelectionMode;
  selVerts: Set<number>;
  selEdges: Set<EdgeKey>;
  selFaces: Set<number>;
  shiftKey: boolean;
  ctrlKey?: boolean;
  visibleVerts: Set<number>;
  visibleFaces: Set<number>;
}

export interface ClickSelectionResult {
  selVerts: Set<number>;
  selEdges: Set<EdgeKey>;
  selFaces: Set<number>;
}

/** MilkShape-style click pick: updates selection from a 2D viewport click. */
export function applyClickSelection2D(input: ClickSelectionInput): ClickSelectionResult {
  const {
    mesh,
    vpKey,
    vpState,
    sx,
    sy,
    selectionMode,
    selVerts,
    selEdges,
    selFaces,
    shiftKey,
    ctrlKey = false,
    visibleVerts,
    visibleFaces,
  } = input;
  const additive = isAdditiveSelection(shiftKey, ctrlKey);

  if (selectionMode === 'object') {
    if (mesh.vertices.length || mesh.faces.length) {
      if (!additive) {
        return { selVerts: new Set(visibleVerts), selEdges: new Set(), selFaces: new Set(visibleFaces) };
      }
      return { selVerts: new Set(selVerts), selEdges: new Set(selEdges), selFaces: new Set(selFaces) };
    }
    return { selVerts: new Set(), selEdges: new Set(), selFaces: new Set() };
  }

  if (selectionMode === 'vertex') {
    const vi = nearestVertex2D(sx, sy, vpKey, mesh, vpState, { visibleVertices: visibleVerts });
    if (vi >= 0) {
      const newSel = new Set(selVerts);
      if (additive) {
        if (newSel.has(vi)) newSel.delete(vi);
        else newSel.add(vi);
      } else {
        newSel.clear();
        newSel.add(vi);
      }
      return { selVerts: newSel, selEdges: new Set(), selFaces: new Set() };
    }
    if (!additive) return { selVerts: new Set(), selEdges: new Set(), selFaces: new Set() };
    return { selVerts: new Set(selVerts), selEdges: new Set(selEdges), selFaces: new Set(selFaces) };
  }

  if (selectionMode === 'edge') {
    const edge = nearestEdge2D(sx, sy, vpKey, mesh, vpState, { visibleVertices: visibleVerts, visibleFaces });
    if (edge) {
      const newSel = new Set(selEdges);
      if (additive) {
        if (newSel.has(edge)) newSel.delete(edge);
        else newSel.add(edge);
      } else {
        newSel.clear();
        newSel.add(edge);
      }
      return { selVerts: new Set(), selEdges: newSel, selFaces: new Set() };
    }
    if (!additive) return { selVerts: new Set(), selEdges: new Set(), selFaces: new Set() };
    return { selVerts: new Set(selVerts), selEdges: new Set(selEdges), selFaces: new Set(selFaces) };
  }

  const fi = nearestFace2D(sx, sy, vpKey, mesh, vpState, { visibleFaces });
  if (fi >= 0) {
    const newSel = new Set(selFaces);
    if (additive) {
      if (newSel.has(fi)) newSel.delete(fi);
      else newSel.add(fi);
    } else {
      newSel.clear();
      newSel.add(fi);
    }
    return { selVerts: new Set(), selEdges: new Set(), selFaces: newSel };
  }
  if (!additive) return { selVerts: new Set(), selEdges: new Set(), selFaces: new Set() };
  return { selVerts: new Set(selVerts), selEdges: new Set(selEdges), selFaces: new Set(selFaces) };
}

export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function normalizeScreenRect(rect: ScreenRect): ScreenRect {
  if (rect.w >= 0 && rect.h >= 0) return rect;
  return {
    x: rect.w < 0 ? rect.x + rect.w : rect.x,
    y: rect.h < 0 ? rect.y + rect.h : rect.y,
    w: Math.abs(rect.w),
    h: Math.abs(rect.h),
  };
}

export function inScreenRect(px: number, py: number, rect: ScreenRect): boolean {
  const r = normalizeScreenRect(rect);
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

function segmentIntersectsScreenRect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  rect: ScreenRect,
): boolean {
  if (inScreenRect(ax, ay, rect) || inScreenRect(bx, by, rect)) return true;
  const r = normalizeScreenRect(rect);
  const minX = Math.min(ax, bx);
  const maxX = Math.max(ax, bx);
  const minY = Math.min(ay, by);
  const maxY = Math.max(ay, by);
  if (maxX < r.x || minX > r.x + r.w || maxY < r.y || minY > r.y + r.h) return false;
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  return inScreenRect(mx, my, rect);
}

export interface BoxSelectInput {
  mesh: MeshDocument;
  rect: ScreenRect;
  selectionMode: SelectionMode;
  selVerts: Set<number>;
  selEdges: Set<EdgeKey>;
  selFaces: Set<number>;
  shiftKey: boolean;
  ctrlKey?: boolean;
  visibleVerts: Set<number>;
  visibleFaces: Set<number>;
  projectVertex: (vi: number) => { x: number; y: number };
}

/** Marquee selection in screen space (2D ortho or 3D perspective). */
export function boxSelectByMode(input: BoxSelectInput): ClickSelectionResult {
  const {
    mesh,
    rect,
    selectionMode,
    selVerts,
    selEdges,
    selFaces,
    shiftKey,
    ctrlKey = false,
    visibleVerts,
    visibleFaces,
    projectVertex,
  } = input;
  const additive = isAdditiveSelection(shiftKey, ctrlKey);

  const r = normalizeScreenRect(rect);
  if (r.w < 2 && r.h < 2) {
    if (!additive) return { selVerts: new Set(), selEdges: new Set(), selFaces: new Set() };
    return { selVerts: new Set(selVerts), selEdges: new Set(selEdges), selFaces: new Set(selFaces) };
  }

  if (selectionMode === 'object') {
    const newVerts = additive ? new Set(selVerts) : new Set<number>();
    const newFaces = additive ? new Set(selFaces) : new Set<number>();
    mesh.vertices.forEach((_, vi) => {
      if (!visibleVerts.has(vi)) return;
      const sc = projectVertex(vi);
      if (inScreenRect(sc.x, sc.y, r)) newVerts.add(vi);
    });
    mesh.faces.forEach((face, fi) => {
      if (!visibleFaces.has(fi) || !face) return;
      const hit = face.some((vi) => {
        if (!visibleVerts.has(vi)) return false;
        const sc = projectVertex(vi);
        return inScreenRect(sc.x, sc.y, r);
      });
      if (hit) newFaces.add(fi);
    });
    return { selVerts: newVerts, selEdges: new Set(), selFaces: newFaces };
  }

  if (selectionMode === 'vertex') {
    const newSel = additive ? new Set(selVerts) : new Set<number>();
    mesh.vertices.forEach((_, vi) => {
      if (!visibleVerts.has(vi)) return;
      const sc = projectVertex(vi);
      if (inScreenRect(sc.x, sc.y, r)) newSel.add(vi);
    });
    return { selVerts: newSel, selEdges: new Set(), selFaces: new Set() };
  }

  if (selectionMode === 'edge') {
    const edges = additive ? new Set(selEdges) : new Set<EdgeKey>();
    mesh.faces.forEach((face, fi) => {
      if (!visibleFaces.has(fi) || !face) return;
      face.forEach((vi, index) => {
        const next = face[(index + 1) % face.length];
        if (!visibleVerts.has(vi) || !visibleVerts.has(next)) return;
        const sa = projectVertex(vi);
        const sb = projectVertex(next);
        if (segmentIntersectsScreenRect(sa.x, sa.y, sb.x, sb.y, r)) {
          edges.add(makeEdgeKey(vi, next));
        }
      });
    });
    return { selVerts: new Set(), selEdges: edges, selFaces: new Set() };
  }

  const faces = additive ? new Set(selFaces) : new Set<number>();
  mesh.faces.forEach((face, fi) => {
    if (!visibleFaces.has(fi) || !face) return;
    let cx = 0;
    let cy = 0;
    let count = 0;
    let anyIn = false;
    face.forEach((vi) => {
      if (!visibleVerts.has(vi)) return;
      const sc = projectVertex(vi);
      cx += sc.x;
      cy += sc.y;
      count++;
      if (inScreenRect(sc.x, sc.y, r)) anyIn = true;
    });
    if (count === 0) return;
    const centroidIn = inScreenRect(cx / count, cy / count, r);
    if (anyIn || centroidIn) faces.add(fi);
  });
  return { selVerts: new Set(), selEdges: new Set(), selFaces: faces };
}

export interface BoxSelect2DInput {
  mesh: MeshDocument;
  vpKey: View2DKey;
  vpState: ViewportSelectionState;
  rect: ScreenRect;
  selectionMode: SelectionMode;
  selVerts: Set<number>;
  selEdges: Set<EdgeKey>;
  selFaces: Set<number>;
  shiftKey: boolean;
  ctrlKey?: boolean;
  visibleVerts: Set<number>;
  visibleFaces: Set<number>;
}

export interface DeleteTargets {
  verts: Set<number>;
  faces: Set<number>;
}

function facesContainingVertex(mesh: MeshDocument, vi: number): number[] {
  const out: number[] = [];
  mesh.faces.forEach((f, fi) => {
    if (f?.includes(vi)) out.push(fi);
  });
  return out;
}

function facesContainingEdge(mesh: MeshDocument, edge: EdgeKey): number[] {
  const [a, b] = parseEdgeKey(edge);
  const out: number[] = [];
  mesh.faces.forEach((f, fi) => {
    if (!f || f.length < 2) return;
    for (let i = 0; i < f.length; i++) {
      const v0 = f[i];
      const v1 = f[(i + 1) % f.length];
      if ((v0 === a && v1 === b) || (v0 === b && v1 === a)) {
        out.push(fi);
        break;
      }
    }
  });
  return out;
}

/** Resolve verts/faces to remove for Del based on the active selection mode. */
export function getDeleteTargets(
  mesh: MeshDocument,
  selectionMode: SelectionMode,
  selVerts: Set<number>,
  selEdges: Set<EdgeKey>,
  selFaces: Set<number>,
): DeleteTargets {
  const faces = new Set<number>();
  const verts = new Set<number>();

  if (selectionMode === 'face') {
    editableFaceIndices(mesh, selFaces).forEach((fi) => faces.add(fi));
    return { verts, faces };
  }

  if (selectionMode === 'edge') {
    selEdges.forEach((edge) => {
      facesContainingEdge(mesh, edge).forEach((fi) => faces.add(fi));
    });
    return { verts, faces: editableFaceIndices(mesh, faces) };
  }

  if (selectionMode === 'vertex') {
    const editableVerts = editableVertexIndices(mesh, selVerts);
    editableVerts.forEach((vi) => {
      verts.add(vi);
      facesContainingVertex(mesh, vi).forEach((fi) => faces.add(fi));
    });
    return { verts, faces: editableFaceIndices(mesh, faces) };
  }

  editableFaceIndices(mesh, selFaces).forEach((fi) => faces.add(fi));
  editableVertexIndices(mesh, selVerts).forEach((vi) => verts.add(vi));
  return { verts, faces };
}

export function hasDeletableSelection(targets: DeleteTargets): boolean {
  return targets.verts.size > 0 || targets.faces.size > 0;
}

/** Face/edge/object mode used for picking while modeling tools are active. */
export function effectiveSelectionMode(
  tool: string,
  selectionMode: SelectionMode,
): SelectionMode {
  if (tool === 'extrude' || tool === 'inset') return 'face';
  if (tool === 'bevel') return 'edge';
  return selectionMode;
}

/** Tools that support click + marquee selection in viewports. */
export function supportsSelectionMarquee(tool: string): boolean {
  return (
    tool === 'select' ||
    tool === 'move' ||
    tool === 'rotate' ||
    tool === 'scale' ||
    tool === 'extrude' ||
    tool === 'inset' ||
    tool === 'bevel'
  );
}

export function boxSelect2D(input: BoxSelect2DInput): ClickSelectionResult {
  const { mesh, vpKey, vpState, rect, ...rest } = input;
  const vd = VIEW2D_DEFS[vpKey];
  return boxSelectByMode({
    mesh,
    rect,
    ...rest,
    projectVertex: (vi) => {
      const pj = vd.proj(mesh.vertices[vi]);
      return w2s(pj.x, pj.y, vpState.pan, vpState.zoom);
    },
  });
}
