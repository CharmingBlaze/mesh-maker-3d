import type { MeshDocument } from '@/core/mesh/MeshDocument';
import { makeEdgeKey } from '@/systems/selection/selectionSystem';

const EPS = 1e-4;
const NORMAL_EPS = 0.999;

function faceNormal(doc: MeshDocument, face: number[]): { nx: number; ny: number; nz: number } {
  const a = doc.vertices[face[0]];
  const b = doc.vertices[face[1]];
  const c = doc.vertices[face[2]];
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const uz = b.z - a.z;
  const vx = c.x - a.x;
  const vy = c.y - a.y;
  const vz = c.z - a.z;
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return { nx: nx / len, ny: ny / len, nz: nz / len };
}

function pointOnPlane(
  p: { x: number; y: number; z: number },
  origin: { x: number; y: number; z: number },
  normal: { nx: number; ny: number; nz: number },
): boolean {
  const d = (p.x - origin.x) * normal.nx + (p.y - origin.y) * normal.ny + (p.z - origin.z) * normal.nz;
  return Math.abs(d) < EPS;
}

function normalsAlign(
  a: { nx: number; ny: number; nz: number },
  b: { nx: number; ny: number; nz: number },
): boolean {
  return a.nx * b.nx + a.ny * b.ny + a.nz * b.nz >= NORMAL_EPS;
}

function boundaryLoop(faceIndices: number[], faces: (number[] | null)[]): number[] | null {
  const halfEdges = new Map<string, [number, number]>();

  for (const fi of faceIndices) {
    const face = faces[fi];
    if (!face || face.length < 3) continue;
    for (let i = 0; i < face.length; i++) {
      const a = face[i];
      const b = face[(i + 1) % face.length];
      const fwd = `${a}>${b}`;
      const rev = `${b}>${a}`;
      if (halfEdges.has(rev)) {
        halfEdges.delete(rev);
      } else {
        halfEdges.set(fwd, [a, b]);
      }
    }
  }

  if (halfEdges.size === 0) return null;

  const outgoing = new Map<number, number[]>();
  halfEdges.forEach(([a, b]) => {
    if (!outgoing.has(a)) outgoing.set(a, []);
    outgoing.get(a)!.push(b);
  });

  const start = halfEdges.values().next().value as [number, number];
  const loop: number[] = [start[0]];
  let curr = start[0];
  let next = start[1];
  const maxSteps = halfEdges.size + 4;

  for (let step = 0; step < maxSteps; step++) {
    loop.push(next);
    const candidates = outgoing.get(next);
    if (!candidates || candidates.length === 0) break;
    const nxt = candidates.find((v) => v !== curr) ?? candidates[0];
    curr = next;
    next = nxt;
    if (next === loop[0]) break;
  }

  if (loop.length < 4) return null;
  if (loop[loop.length - 1] === loop[0]) loop.pop();
  return loop.length >= 3 ? loop : null;
}

function connectedGroups(selected: Set<number>, adjacency: Map<number, Set<number>>): number[][] {
  const groups: number[][] = [];
  const seen = new Set<number>();

  selected.forEach((seed) => {
    if (seen.has(seed)) return;
    const group: number[] = [];
    const stack = [seed];
    while (stack.length) {
      const fi = stack.pop()!;
      if (seen.has(fi)) continue;
      seen.add(fi);
      group.push(fi);
      adjacency.get(fi)?.forEach((nfi) => {
        if (selected.has(nfi) && !seen.has(nfi)) stack.push(nfi);
      });
    }
    if (group.length) groups.push(group);
  });
  return groups;
}

/** Merge connected coplanar faces within the selection into single n-gons. Returns merged face indices. */
export function mergeCoplanarFaces(doc: MeshDocument, selFaces: Set<number>): number[] {
  if (selFaces.size < 2) return [];

  const adjacency = new Map<number, Set<number>>();
  const edgeToFaces = new Map<string, number[]>();

  doc.faces.forEach((face, fi) => {
    if (!face || face.length < 3) return;
    adjacency.set(fi, new Set());
    for (let i = 0; i < face.length; i++) {
      const a = face[i];
      const b = face[(i + 1) % face.length];
      const key = makeEdgeKey(a, b);
      if (!edgeToFaces.has(key)) edgeToFaces.set(key, []);
      edgeToFaces.get(key)!.push(fi);
    }
  });

  edgeToFaces.forEach((faces) => {
    if (faces.length !== 2) return;
    const [a, b] = faces;
    adjacency.get(a)?.add(b);
    adjacency.get(b)?.add(a);
  });

  const groups = connectedGroups(selFaces, adjacency);
  const mergedIndices: number[] = [];

  for (const group of groups) {
    if (group.length < 2) continue;

    const refFace = doc.faces[group[0]];
    if (!refFace) continue;
    const refNormal = faceNormal(doc, refFace);
    const origin = doc.vertices[refFace[0]];

    let coplanar = true;
    for (const fi of group) {
      const face = doc.faces[fi];
      if (!face) {
        coplanar = false;
        break;
      }
      const n = faceNormal(doc, face);
      if (!normalsAlign(refNormal, n)) {
        coplanar = false;
        break;
      }
      for (const vi of face) {
        if (!pointOnPlane(doc.vertices[vi], origin, refNormal)) {
          coplanar = false;
          break;
        }
      }
      if (!coplanar) break;
    }
    if (!coplanar) continue;

    const loop = boundaryLoop(group, doc.faces);
    if (!loop) continue;

    const keepFi = group[0];
    doc.faces[keepFi] = loop;
    const layer = doc.faceLayers[keepFi] ?? doc.activeLayerId;

    for (let i = 1; i < group.length; i++) {
      const removeFi = group[i];
      doc.faces[removeFi] = null;
      doc.groups.forEach((g) => {
        g.faces = g.faces.filter((f) => f !== removeFi);
      });
    }

    doc.groups.forEach((g) => {
      if (!g.faces.includes(keepFi)) g.faces.push(keepFi);
    });
    doc.faceLayers[keepFi] = layer;
    mergedIndices.push(keepFi);
  }

  if (mergedIndices.length === 0) return [];

  const newFaces: number[][] = [];
  const newFaceLayers: string[] = [];
  const remap: Record<number, number> = {};

  doc.faces.forEach((f, fi) => {
    if (f && f.length >= 3) {
      remap[fi] = newFaces.length;
      newFaces.push(f);
      newFaceLayers.push(doc.faceLayers[fi] ?? doc.activeLayerId);
    }
  });

  doc.faces = newFaces;
  doc.faceLayers = newFaceLayers;
  doc.groups.forEach((g) => {
    g.faces = g.faces.map((fi) => remap[fi]).filter((fi) => fi !== undefined);
  });

  return mergedIndices.map((fi) => remap[fi]).filter((fi) => fi !== undefined);
}
