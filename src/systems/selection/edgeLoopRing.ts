import type { MeshDocument } from '@/core/mesh/MeshDocument';
import type { EdgeKey } from '@/systems/selection/selectionSystem';
import { EDGE_LOOP_RING_HELP_TOPIC } from '@/systems/help/editorHelp';

function makeEdgeKey(a: number, b: number): EdgeKey {
  return `${Math.min(a, b)},${Math.max(a, b)}` as EdgeKey;
}

function parseEdgeKey(edge: EdgeKey): [number, number] {
  return edge.split(',').map(Number) as [number, number];
}

const MAX_WALK = 8192;

export function facesContainingEdge(mesh: MeshDocument, edge: EdgeKey): number[] {
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

function indexOfDirectedEdge(face: number[], prev: number, curr: number): number {
  const n = face.length;
  for (let i = 0; i < n; i++) {
    if (face[i] === prev && face[(i + 1) % n] === curr) return i;
  }
  return -1;
}

function indexOfUndirectedEdge(face: number[], edge: EdgeKey): number {
  const [a, b] = parseEdgeKey(edge);
  const n = face.length;
  for (let i = 0; i < n; i++) {
    const v0 = face[i];
    const v1 = face[(i + 1) % n];
    if ((v0 === a && v1 === b) || (v0 === b && v1 === a)) return i;
  }
  return -1;
}

/** Next vertex when walking an edge loop through `curr`, having arrived from `prev`. */
function nextLoopVertex(mesh: MeshDocument, prev: number, curr: number): number | null {
  const candidates = new Set<number>();

  for (const fi of facesContainingEdge(mesh, makeEdgeKey(prev, curr))) {
    const face = mesh.faces[fi];
    if (!face || face.length < 3) continue;
    const n = face.length;
    const i = indexOfDirectedEdge(face, prev, curr);
    if (i >= 0) {
      candidates.add(face[(i + 2) % n]);
    }
  }

  if (candidates.size === 0) return null;
  if (candidates.size === 1) return [...candidates][0];
  return [...candidates].find((v) => v !== prev) ?? [...candidates][0];
}

function walkLoopDirection(
  mesh: MeshDocument,
  prev: number,
  curr: number,
  out: Set<EdgeKey>,
): void {
  let from = prev;
  let at = curr;
  for (let step = 0; step < MAX_WALK; step++) {
    const next = nextLoopVertex(mesh, from, at);
    if (next === null) break;
    const ek = makeEdgeKey(at, next);
    if (out.has(ek)) break;
    out.add(ek);
    from = at;
    at = next;
  }
}

/** All edges in the loop through `seed` (quad-friendly; stops at poles / boundaries). */
export function selectEdgeLoop(mesh: MeshDocument, seed: EdgeKey): Set<EdgeKey> {
  const [a, b] = parseEdgeKey(seed);
  const loop = new Set<EdgeKey>([seed]);
  walkLoopDirection(mesh, a, b, loop);
  walkLoopDirection(mesh, b, a, loop);
  return loop;
}

function oppositeEdgeOnFace(face: number[], edgeIndex: number): EdgeKey | null {
  const n = face.length;
  if (n < 4) return null;
  return makeEdgeKey(face[(edgeIndex + 2) % n], face[(edgeIndex + 3) % n]);
}

/** Step one ring edge across the quad face adjacent to `fi` along `edge`. */
function nextRingEdgeAcrossFace(
  mesh: MeshDocument,
  edge: EdgeKey,
  fi: number,
): { nextEdge: EdgeKey; nextFi: number } | null {
  const face = mesh.faces[fi];
  if (!face || face.length < 4) return null;

  const idx = indexOfUndirectedEdge(face, edge);
  if (idx < 0) return null;

  const opp = oppositeEdgeOnFace(face, idx);
  if (!opp) return null;

  const n = face.length;
  const perp = makeEdgeKey(face[(idx + 1) % n], face[(idx + 2) % n]);
  const nextFaces = facesContainingEdge(mesh, perp).filter((f) => f !== fi);
  if (nextFaces.length === 0) return null;

  return { nextEdge: opp, nextFi: nextFaces[0] };
}

function walkRingDirection(
  mesh: MeshDocument,
  seed: EdgeKey,
  startFi: number,
  out: Set<EdgeKey>,
): void {
  let edge = seed;
  let fi = startFi;

  for (let step = 0; step < MAX_WALK; step++) {
    const stepResult = nextRingEdgeAcrossFace(mesh, edge, fi);
    if (!stepResult) break;
    const { nextEdge, nextFi } = stepResult;
    if (out.has(nextEdge)) break;
    out.add(nextEdge);
    edge = nextEdge;
    fi = nextFi;
  }
}

/** All parallel ring edges through `seed` on quad-dominant meshes. */
export function selectEdgeRing(mesh: MeshDocument, seed: EdgeKey): Set<EdgeKey> {
  const ring = new Set<EdgeKey>([seed]);
  const faces = facesContainingEdge(mesh, seed);
  faces.forEach((fi) => walkRingDirection(mesh, seed, fi, ring));
  return ring;
}

export function filterVisibleEdges(edges: Set<EdgeKey>, visibleVerts: Set<number>): Set<EdgeKey> {
  const out = new Set<EdgeKey>();
  edges.forEach((edge) => {
    const [a, b] = parseEdgeKey(edge);
    if (visibleVerts.has(a) && visibleVerts.has(b)) out.add(edge);
  });
  return out;
}

export function edgeClickSelection(
  mesh: MeshDocument,
  edge: EdgeKey,
  selEdges: Set<EdgeKey>,
  shiftKey: boolean,
  ctrlKey: boolean,
  altKey: boolean,
  visibleVerts: Set<number>,
): Set<EdgeKey> {
  if (altKey) {
    const picked = filterVisibleEdges(
      shiftKey ? selectEdgeRing(mesh, edge) : selectEdgeLoop(mesh, edge),
      visibleVerts,
    );
    if (ctrlKey) {
      const next = new Set(selEdges);
      picked.forEach((ek) => {
        if (next.has(ek)) next.delete(ek);
        else next.add(ek);
      });
      return next;
    }
    return picked;
  }

  const additive = shiftKey || ctrlKey;
  const newSel = new Set(selEdges);
  if (additive) {
    if (newSel.has(edge)) newSel.delete(edge);
    else newSel.add(edge);
  } else {
    newSel.clear();
    newSel.add(edge);
  }
  return newSel;
}

export const EDGE_LOOP_RING_HELP_TITLE = EDGE_LOOP_RING_HELP_TOPIC.title;
export const EDGE_LOOP_RING_HELP_INTRO = EDGE_LOOP_RING_HELP_TOPIC.intro ?? '';
export const EDGE_LOOP_RING_HELP = EDGE_LOOP_RING_HELP_TOPIC.lines;
