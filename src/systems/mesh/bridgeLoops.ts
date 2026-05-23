import type { MeshDocument } from '@/core/mesh/MeshDocument';
import { parseEdgeKey, type EdgeKey } from '@/systems/selection/selectionSystem';

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
    if (next === start) return loop.length >= 3 ? loop : null;
    loop.push(next);
    prev = cur;
    cur = next;
  }

  return loop.length >= 3 ? loop : null;
}

function splitEdgeComponents(edges: Set<EdgeKey>): Set<EdgeKey>[] {
  const components: Set<EdgeKey>[] = [];
  const visited = new Set<EdgeKey>();

  const neighbors = (edge: EdgeKey): EdgeKey[] => {
    const [a, b] = parseEdgeKey(edge);
    const out: EdgeKey[] = [];
    edges.forEach((other) => {
      if (other === edge) return;
      const [c, d] = parseEdgeKey(other);
      if (a === c || a === d || b === c || b === d) out.push(other);
    });
    return out;
  };

  edges.forEach((seed) => {
    if (visited.has(seed)) return;
    const comp = new Set<EdgeKey>();
    const stack = [seed];
    while (stack.length) {
      const e = stack.pop()!;
      if (visited.has(e)) continue;
      visited.add(e);
      comp.add(e);
      neighbors(e).forEach((n) => {
        if (!visited.has(n)) stack.push(n);
      });
    }
    components.push(comp);
  });

  return components;
}

function loopDistanceScore(
  doc: MeshDocument,
  loopA: number[],
  loopB: number[],
): number {
  let score = 0;
  for (let i = 0; i < loopA.length; i++) {
    const va = doc.vertices[loopA[i]];
    const vb = doc.vertices[loopB[i]];
    score += Math.hypot(va.x - vb.x, va.y - vb.y, va.z - vb.z);
  }
  return score;
}

function reverseLoop(loop: number[]): number[] {
  if (loop.length <= 1) return [...loop];
  return [loop[0], ...loop.slice(1).reverse()];
}

function addBridgeFace(doc: MeshDocument, a0: number, a1: number, b1: number, b0: number, groupIndex: number): number {
  const fi = doc.faces.length;
  doc.faces.push([a0, a1, b1, b0]);
  doc.faceLayers.push(doc.activeLayerId);
  const group = doc.groups[groupIndex];
  if (group) group.faces.push(fi);
  return fi;
}

/**
 * Bridge two closed edge loops in the selection with quad faces.
 * Selection must contain exactly two disjoint edge loops of equal length.
 */
export function bridgeEdgeLoops(
  doc: MeshDocument,
  selEdges: Set<EdgeKey>,
  groupIndex: number,
): number[] | null {
  if (selEdges.size < 6) return null;

  const components = splitEdgeComponents(selEdges);
  if (components.length !== 2) return null;

  const loops: number[][] = [];
  for (const comp of components) {
    const pairs = [...comp].map((key) => parseEdgeKey(key));
    const loop = orderEdgeLoop(pairs);
    if (!loop) return null;
    loops.push(loop);
  }

  const [loopA, loopBRaw] = loops;
  if (loopA.length !== loopBRaw.length || loopA.length < 3) return null;

  const loopBRev = reverseLoop(loopBRaw);
  const loopB =
    loopDistanceScore(doc, loopA, loopBRaw) <= loopDistanceScore(doc, loopA, loopBRev)
      ? loopBRaw
      : loopBRev;

  const created: number[] = [];
  const n = loopA.length;
  for (let i = 0; i < n; i++) {
    created.push(
      addBridgeFace(
        doc,
        loopA[i],
        loopA[(i + 1) % n],
        loopB[(i + 1) % n],
        loopB[i],
        groupIndex,
      ),
    );
  }
  return created;
}
