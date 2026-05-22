import type { MeshDocument } from '@/core/mesh/MeshDocument';
import { makeEdgeKey, parseEdgeKey, type EdgeKey } from '@/systems/selection/selectionSystem';

function edgeUseCount(doc: MeshDocument): Map<EdgeKey, number> {
  const counts = new Map<EdgeKey, number>();
  doc.faces.forEach((face) => {
    if (!face || face.length < 2) return;
    for (let i = 0; i < face.length; i++) {
      const key = makeEdgeKey(face[i], face[(i + 1) % face.length]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  });
  return counts;
}

/** Walk a closed loop from undirected edge pairs. */
function orderEdgeLoop(edges: [number, number][]): number[] | null {
  if (edges.length < 3) return null;

  const adj = new Map<number, number[]>();
  for (const [a, b] of edges) {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a)!.push(b);
    adj.get(b)!.push(a);
  }

  for (const [, neighbors] of adj) {
    if (neighbors.length !== 2) return null;
  }

  const start = edges[0][0];
  const loop: number[] = [start];
  let prev = -1;
  let cur = start;

  for (let step = 0; step < edges.length; step++) {
    const next = adj.get(cur)!.find((n) => n !== prev);
    if (next === undefined) return null;
    if (next === start) {
      return loop.length >= 3 ? loop : null;
    }
    loop.push(next);
    prev = cur;
    cur = next;
  }

  return loop.length >= 3 ? loop : null;
}

function loopFromEdgeKeys(edges: Set<EdgeKey>): number[] | null {
  const pairs = [...edges].map((key) => parseEdgeKey(key));
  return orderEdgeLoop(pairs);
}

/** Boundary edges with both endpoints in the vertex set. */
function boundaryEdgesInVertexSet(verts: Set<number>, counts: Map<EdgeKey, number>): [number, number][] {
  const edges: [number, number][] = [];
  counts.forEach((use, key) => {
    if (use !== 1) return;
    const [a, b] = parseEdgeKey(key);
    if (verts.has(a) && verts.has(b)) edges.push([a, b]);
  });
  return edges;
}

function faceWithVerticesExists(doc: MeshDocument, loop: number[]): boolean {
  const want = new Set(loop);
  return doc.faces.some(
    (face) =>
      face &&
      face.length === loop.length &&
      face.every((vi) => want.has(vi)) &&
      loop.every((vi) => face.includes(vi)),
  );
}

function faceWithExactWindingExists(doc: MeshDocument, loop: number[]): boolean {
  const n = loop.length;
  return doc.faces.some((face) => {
    if (!face || face.length !== n) return false;
    for (let offset = 0; offset < n; offset++) {
      let match = true;
      for (let i = 0; i < n; i++) {
        if (face[i] !== loop[(i + offset) % n]) {
          match = false;
          break;
        }
      }
      if (match) return true;
    }
    return false;
  });
}

function addFaceLoop(doc: MeshDocument, loop: number[], groupIndex: number): number {
  const fi = doc.faces.length;
  doc.faces.push([...loop]);
  doc.faceLayers.push(doc.activeLayerId);
  const group = doc.groups[groupIndex];
  if (group) group.faces.push(fi);
  return fi;
}

function fillLoop(
  doc: MeshDocument,
  loop: number[],
  groupIndex: number,
  doubleSided: boolean,
): number[] | null {
  if (faceWithVerticesExists(doc, loop)) return null;

  const created: number[] = [addFaceLoop(doc, loop, groupIndex)];

  if (doubleSided) {
    const reversed = [...loop].reverse();
    if (!faceWithExactWindingExists(doc, reversed)) {
      created.push(addFaceLoop(doc, reversed, groupIndex));
    }
  }

  return created;
}

/** All boundary edge loops in the mesh (each edge used by exactly one face). */
function allBoundaryLoops(doc: MeshDocument): number[][] {
  const counts = edgeUseCount(doc);
  const boundaryPairs: [number, number][] = [];
  counts.forEach((use, key) => {
    if (use === 1) boundaryPairs.push(parseEdgeKey(key));
  });

  const visited = new Set<string>();
  const loops: number[][] = [];

  const pairKey = (a: number, b: number) => makeEdgeKey(a, b);

  while (true) {
    const startPair = boundaryPairs.find(([a, b]) => !visited.has(pairKey(a, b)));
    if (!startPair) break;

    const component: [number, number][] = [];
    const stack: [number, number][] = [startPair];
    const verts = new Set<number>();

    while (stack.length > 0) {
      const [a, b] = stack.pop()!;
      const k = pairKey(a, b);
      if (visited.has(k)) continue;
      visited.add(k);
      component.push([a, b]);
      verts.add(a);
      verts.add(b);
      for (const [ea, eb] of boundaryPairs) {
        const ek = pairKey(ea, eb);
        if (visited.has(ek)) continue;
        if (ea === a || ea === b || eb === a || eb === b) stack.push([ea, eb]);
      }
    }

    const loop = orderEdgeLoop(component);
    if (loop && loop.length >= 3) loops.push(loop);
  }

  return loops;
}

function loopMatchesSelection(loop: number[], selVerts: Set<number>): boolean {
  if (selVerts.size === 0) return true;
  return loop.every((vi) => selVerts.has(vi));
}

/**
 * Fill an open hole with a new face.
 * Priority: selected edge loop → boundary edges on selected verts → smallest boundary loop touching selection.
 */
export function fillHole(
  doc: MeshDocument,
  selVerts: Set<number>,
  selEdges: Set<EdgeKey>,
  groupIndex: number,
  doubleSided = false,
): number[] | null {
  const counts = edgeUseCount(doc);

  if (selEdges.size >= 3) {
    const loop = loopFromEdgeKeys(selEdges);
    if (loop) {
      const faces = fillLoop(doc, loop, groupIndex, doubleSided);
      if (faces) return faces;
    }
  }

  if (selVerts.size >= 3) {
    const pairs = boundaryEdgesInVertexSet(selVerts, counts);
    const loop = orderEdgeLoop(pairs);
    if (loop) {
      const faces = fillLoop(doc, loop, groupIndex, doubleSided);
      if (faces) return faces;
    }

    if (selVerts.size === 3 || selVerts.size === 4) {
      const simple = [...selVerts];
      const faces = fillLoop(doc, simple, groupIndex, doubleSided);
      if (faces) return faces;
    }
  }

  const loops = allBoundaryLoops(doc);
  const candidates = loops.filter((loop) => loopMatchesSelection(loop, selVerts));
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.length - b.length);
  for (const loop of candidates) {
    const faces = fillLoop(doc, loop, groupIndex, doubleSided);
    if (faces) return faces;
  }

  return null;
}
