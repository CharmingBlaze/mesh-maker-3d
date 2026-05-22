import type { BoundingBox } from '@/core/math/BoundingBox';
import { boundsCenter, boundsSize } from '@/core/math/BoundingBox';
import type { MeshDocument } from '@/core/mesh/MeshDocument';
import { createMeshDocument } from '@/core/mesh/MeshDocument';
import type { PrimitiveType } from '@/systems/mesh/primitives';
import type { PrimDrawView } from '@/systems/mesh/primDraw';
import type { Vec3 } from '@/core/math/Vec3';

export interface PrimitiveMeshData {
  vertices: Vec3[];
  faces: number[][];
}

function toCanonicalBounds(bounds: BoundingBox, baseView: PrimDrawView): BoundingBox {
  const { min, max } = bounds;
  if (baseView === 'front') {
    return {
      min: { x: min.x, y: min.z, z: min.y },
      max: { x: max.x, y: max.z, z: max.y },
    };
  }
  if (baseView === 'side') {
    return {
      min: { x: min.z, y: min.x, z: min.y },
      max: { x: max.z, y: max.x, z: max.y },
    };
  }
  return bounds;
}

function fromCanonicalVertex(v: Vec3, baseView: PrimDrawView): Vec3 {
  if (baseView === 'front') return { x: v.x, y: v.z, z: v.y };
  if (baseView === 'side') return { x: v.y, y: v.z, z: v.x };
  return { ...v };
}

function visiblePreviewBounds(bounds: BoundingBox, baseView: PrimDrawView): BoundingBox {
  const canonical = toCanonicalBounds(bounds, baseView);
  const size = boundsSize(canonical);
  if (size.y > 0.01) return canonical;
  const previewDepth = Math.max(4, Math.max(size.x, size.z) * 0.45);
  return {
    min: { ...canonical.min },
    max: { ...canonical.max, y: canonical.min.y + previewDepth },
  };
}

export function buildPrimitiveMeshInBounds(
  type: PrimitiveType,
  bounds: BoundingBox,
  baseView: PrimDrawView,
  opts: { preview?: boolean } = {},
): PrimitiveMeshData {
  const temp = createMeshDocument('Primitive Preview');
  const drawBounds = opts.preview ? visiblePreviewBounds(bounds, baseView) : toCanonicalBounds(bounds, baseView);
  addPrimitiveInBounds(temp, type, drawBounds, 0);
  return {
    vertices: temp.vertices.map((v) => fromCanonicalVertex(v, baseView)),
    faces: temp.faces.filter((face): face is number[] => Array.isArray(face) && face.length >= 2),
  };
}

import { ensureLayerData } from '@/systems/layers/layerSystem';
import { centerMeshAtOrigin } from '@/systems/scene/sceneObjectHelpers';

export function createPrimitiveMeshDocument(
  type: PrimitiveType,
  bounds: BoundingBox,
  baseView: PrimDrawView,
  name: string,
): { mesh: MeshDocument; worldCenter: Vec3 } {
  const mesh = createMeshDocument(name);
  addPrimitiveForDraw(mesh, type, bounds, baseView, 0);
  ensureLayerData(mesh);
  const worldCenter = centerMeshAtOrigin(mesh);
  return { mesh, worldCenter };
}

export function addPrimitiveForDraw(
  doc: MeshDocument,
  type: PrimitiveType,
  bounds: BoundingBox,
  baseView: PrimDrawView,
  groupIndex: number,
): void {
  const primitive = buildPrimitiveMeshInBounds(type, bounds, baseView);
  const group = doc.groups[groupIndex];
  const offset = doc.vertices.length;
  primitive.vertices.forEach((v) => doc.vertices.push(v));
  primitive.faces.forEach((face) => {
    if (group) group.faces.push(doc.faces.length);
    doc.faces.push(face.map((vi) => vi + offset));
  });
}

export function addPrimitiveInBounds(
  doc: MeshDocument,
  type: PrimitiveType,
  bounds: BoundingBox,
  groupIndex: number,
): void {
  const g = doc.groups[groupIndex];
  const pushFace = (indices: number[]) => {
    g.faces.push(doc.faces.length);
    doc.faces.push(indices);
  };

  const { min, max } = bounds;
  const size = boundsSize(bounds);
  const center = boundsCenter(bounds);
  const halfX = size.x / 2;
  const halfY = size.y / 2;
  const halfZ = size.z / 2;

  if (type === 'box') {
    const o = doc.vertices.length;
    const corners: [number, number, number][] = [
      [min.x, min.y, min.z],
      [max.x, min.y, min.z],
      [max.x, max.y, min.z],
      [min.x, max.y, min.z],
      [min.x, min.y, max.z],
      [max.x, min.y, max.z],
      [max.x, max.y, max.z],
      [min.x, max.y, max.z],
    ];
    corners.forEach(([x, y, z]) => doc.vertices.push({ x, y, z }));
    [
      [0, 1, 2, 3],
      [4, 7, 6, 5],
      [0, 4, 5, 1],
      [2, 6, 7, 3],
      [0, 3, 7, 4],
      [1, 5, 6, 2],
    ].forEach((f) => pushFace(f.map((i) => i + o)));
    return;
  }

  if (type === 'plane') {
    const o = doc.vertices.length;
    const div = 4;
    for (let v = 0; v <= div; v++)
      for (let u = 0; u <= div; u++) {
        const uu = u / div;
        const vv = v / div;
        doc.vertices.push({
          x: min.x + (max.x - min.x) * uu,
          y: min.y,
          z: min.z + (max.z - min.z) * vv,
        });
      }
    for (let v = 0; v < div; v++)
      for (let u = 0; u < div; u++)
        pushFace([
          o + v * (div + 1) + u,
          o + v * (div + 1) + u + 1,
          o + (v + 1) * (div + 1) + u + 1,
          o + (v + 1) * (div + 1) + u,
        ]);
    return;
  }

  if (type === 'wedge') {
    const o = doc.vertices.length;
    doc.vertices.push(
      { x: min.x, y: min.y, z: min.z },
      { x: max.x, y: min.y, z: min.z },
      { x: max.x, y: min.y, z: max.z },
      { x: min.x, y: min.y, z: max.z },
      { x: min.x, y: max.y, z: min.z },
      { x: max.x, y: max.y, z: min.z },
    );
    pushFace([o, o + 1, o + 2, o + 3]);
    pushFace([o, o + 1, o + 5, o + 4]);
    pushFace([o, o + 3, o + 4]);
    pushFace([o + 1, o + 5, o + 2]);
    pushFace([o + 4, o + 5, o + 2, o + 3]);
    return;
  }

  if (type === 'pyramid') {
    const o = doc.vertices.length;
    doc.vertices.push(
      { x: min.x, y: min.y, z: min.z },
      { x: max.x, y: min.y, z: min.z },
      { x: max.x, y: min.y, z: max.z },
      { x: min.x, y: min.y, z: max.z },
    );
    const apex = doc.vertices.length;
    doc.vertices.push({ x: center.x, y: max.y, z: center.z });
    pushFace([o, o + 1, o + 2, o + 3]);
    pushFace([o, o + 1, apex]);
    pushFace([o + 1, o + 2, apex]);
    pushFace([o + 2, o + 3, apex]);
    pushFace([o + 3, o, apex]);
    return;
  }

  if (type === 'octahedron') {
    const o = doc.vertices.length;
    doc.vertices.push(
      { x: center.x, y: max.y, z: center.z },
      { x: center.x, y: min.y, z: center.z },
      { x: max.x, y: center.y, z: center.z },
      { x: min.x, y: center.y, z: center.z },
      { x: center.x, y: center.y, z: max.z },
      { x: center.x, y: center.y, z: min.z },
    );
    const [t, b, r, l, f, bk] = [o, o + 1, o + 2, o + 3, o + 4, o + 5];
    pushFace([t, f, r]);
    pushFace([t, r, bk]);
    pushFace([t, bk, l]);
    pushFace([t, l, f]);
    pushFace([b, r, f]);
    pushFace([b, bk, r]);
    pushFace([b, l, bk]);
    pushFace([b, f, l]);
    return;
  }

  if (type === 'disc') {
    const r = Math.min(halfX, halfZ);
    const segs = 16;
    const o = doc.vertices.length;
    doc.vertices.push({ x: center.x, y: min.y, z: center.z });
    for (let i = 0; i < segs; i++) {
      const a = (2 * Math.PI * i) / segs;
      doc.vertices.push({
        x: center.x + r * Math.cos(a),
        y: min.y,
        z: center.z + r * Math.sin(a),
      });
    }
    for (let i = 0; i < segs; i++) pushFace([o, o + 1 + i, o + 1 + ((i + 1) % segs)]);
    return;
  }

  if (type === 'stairs') {
    const steps = Math.max(2, Math.min(16, Math.round(size.z / 8) || 2));
    const stepH = size.y / steps;
    const stepD = size.z / steps;
    for (let i = 0; i < steps; i++) {
      const o = doc.vertices.length;
      const y1 = min.y + i * stepH;
      const y2 = min.y + (i + 1) * stepH;
      const z1 = min.z + i * stepD;
      const z2 = min.z + (i + 1) * stepD;
      doc.vertices.push(
        { x: min.x, y: y1, z: z1 },
        { x: max.x, y: y1, z: z1 },
        { x: max.x, y: y1, z: z2 },
        { x: min.x, y: y1, z: z2 },
        { x: min.x, y: y2, z: z1 },
        { x: max.x, y: y2, z: z1 },
        { x: max.x, y: y2, z: z2 },
        { x: min.x, y: y2, z: z2 },
      );
      [
        [0, 1, 2, 3],
        [4, 7, 6, 5],
        [0, 4, 5, 1],
        [2, 6, 7, 3],
        [0, 3, 7, 4],
        [1, 5, 6, 2],
      ].forEach((f) => pushFace(f.map((vi) => vi + o)));
    }
    return;
  }

  if (type === 'sphere') {
    const r = Math.min(halfX, halfY, halfZ);
    const segs = 12;
    const rings = 8;
    const o = doc.vertices.length;
    for (let ri = 0; ri <= rings; ri++)
      for (let si = 0; si < segs; si++) {
        const phi = (Math.PI * ri) / rings;
        const theta = (2 * Math.PI * si) / segs;
        doc.vertices.push({
          x: center.x + r * Math.sin(phi) * Math.cos(theta),
          y: center.y + r * Math.cos(phi),
          z: center.z + r * Math.sin(phi) * Math.sin(theta),
        });
      }
    for (let ri = 0; ri < rings; ri++)
      for (let si = 0; si < segs; si++) {
        const a = o + ri * segs + si;
        const b = o + ri * segs + ((si + 1) % segs);
        const c = o + (ri + 1) * segs + ((si + 1) % segs);
        const d = o + (ri + 1) * segs + si;
        pushFace([a, b, c, d]);
      }
    return;
  }

  if (type === 'hemisphere') {
    const r = Math.min(halfX, halfY, halfZ);
    const segs = 12;
    const rings = 6;
    const o = doc.vertices.length;
    doc.vertices.push({ x: center.x, y: min.y, z: center.z });
    for (let ri = 0; ri <= rings; ri++)
      for (let si = 0; si < segs; si++) {
        const phi = (Math.PI * 0.5 * ri) / rings;
        const theta = (2 * Math.PI * si) / segs;
        doc.vertices.push({
          x: center.x + r * Math.sin(phi) * Math.cos(theta),
          y: min.y + r * (1 - Math.cos(phi)),
          z: center.z + r * Math.sin(phi) * Math.sin(theta),
        });
      }
    for (let si = 0; si < segs; si++) pushFace([o, o + 1 + si, o + 1 + ((si + 1) % segs)]);
    for (let ri = 0; ri < rings; ri++)
      for (let si = 0; si < segs; si++) {
        const a = o + 1 + ri * segs + si;
        const b = o + 1 + ri * segs + ((si + 1) % segs);
        const c = o + 1 + (ri + 1) * segs + ((si + 1) % segs);
        const d = o + 1 + (ri + 1) * segs + si;
        pushFace([a, b, c, d]);
      }
    return;
  }

  if (type === 'cylinder') {
    const r = Math.min(halfX, halfZ);
    const segs = 12;
    const o = doc.vertices.length;
    for (let i = 0; i < segs; i++) {
      const a = (2 * Math.PI * i) / segs;
      doc.vertices.push({
        x: center.x + r * Math.cos(a),
        y: min.y,
        z: center.z + r * Math.sin(a),
      });
    }
    for (let i = 0; i < segs; i++) {
      const a = (2 * Math.PI * i) / segs;
      doc.vertices.push({
        x: center.x + r * Math.cos(a),
        y: max.y,
        z: center.z + r * Math.sin(a),
      });
    }
    for (let i = 0; i < segs; i++)
      pushFace([o + i, o + ((i + 1) % segs), o + segs + ((i + 1) % segs), o + segs + i]);
    const bot: number[] = [];
    const top: number[] = [];
    for (let i = 0; i < segs; i++) {
      bot.push(o + i);
      top.push(o + segs + i);
    }
    pushFace(bot);
    pushFace([...top].reverse());
    return;
  }

  if (type === 'tube') {
    const outer = Math.min(halfX, halfZ);
    const inner = outer * 0.55;
    const segs = 12;
    const o = doc.vertices.length;
    for (let i = 0; i < segs; i++) {
      const a = (2 * Math.PI * i) / segs;
      const c = Math.cos(a);
      const s = Math.sin(a);
      doc.vertices.push({ x: center.x + outer * c, y: min.y, z: center.z + outer * s });
      doc.vertices.push({ x: center.x + inner * c, y: min.y, z: center.z + inner * s });
    }
    for (let i = 0; i < segs; i++) {
      const a = (2 * Math.PI * i) / segs;
      const c = Math.cos(a);
      const s = Math.sin(a);
      doc.vertices.push({ x: center.x + outer * c, y: max.y, z: center.z + outer * s });
      doc.vertices.push({ x: center.x + inner * c, y: max.y, z: center.z + inner * s });
    }
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % segs;
      const bo = o + i * 2;
      const bo2 = o + j * 2;
      const bi = o + i * 2 + 1;
      const bi2 = o + j * 2 + 1;
      const to = o + segs * 2 + i * 2;
      const to2 = o + segs * 2 + j * 2;
      const ti = o + segs * 2 + i * 2 + 1;
      const ti2 = o + segs * 2 + j * 2 + 1;
      pushFace([bo, bo2, to2, to]);
      pushFace([bi2, bi, ti, ti2]);
    }
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % segs;
      pushFace([o + i * 2, o + j * 2, o + j * 2 + 1, o + i * 2 + 1]);
      pushFace([
        o + segs * 2 + i * 2,
        o + segs * 2 + i * 2 + 1,
        o + segs * 2 + j * 2 + 1,
        o + segs * 2 + j * 2,
      ]);
    }
    return;
  }

  if (type === 'capsule') {
    const r = Math.min(halfX, halfZ);
    const cylHalf = Math.max(0, halfY - r);
    const segs = 12;
    const capRings = 4;

    if (cylHalf <= 0.01) {
      const o = doc.vertices.length;
      const rings = capRings * 2;
      for (let ri = 0; ri <= rings; ri++)
        for (let si = 0; si < segs; si++) {
          const phi = (Math.PI * ri) / rings;
          const theta = (2 * Math.PI * si) / segs;
          doc.vertices.push({
            x: center.x + r * Math.sin(phi) * Math.cos(theta),
            y: center.y + r * Math.cos(phi),
            z: center.z + r * Math.sin(phi) * Math.sin(theta),
          });
        }
      for (let ri = 0; ri < rings; ri++)
        for (let si = 0; si < segs; si++) {
          const a = o + ri * segs + si;
          const b = o + ri * segs + ((si + 1) % segs);
          const c = o + (ri + 1) * segs + ((si + 1) % segs);
          const d = o + (ri + 1) * segs + si;
          pushFace([a, b, c, d]);
        }
      return;
    }

    const o = doc.vertices.length;
    for (let ri = 0; ri <= capRings; ri++)
      for (let si = 0; si < segs; si++) {
        const phi = (Math.PI * 0.5 * ri) / capRings;
        const theta = (2 * Math.PI * si) / segs;
        doc.vertices.push({
          x: center.x + r * Math.sin(phi) * Math.cos(theta),
          y: center.y - cylHalf - r * Math.cos(phi),
          z: center.z + r * Math.sin(phi) * Math.sin(theta),
        });
      }

    const mid = doc.vertices.length;
    if (cylHalf > 0.01) {
      for (let i = 0; i < segs; i++) {
        const a = (2 * Math.PI * i) / segs;
        doc.vertices.push({
          x: center.x + r * Math.cos(a),
          y: center.y - cylHalf,
          z: center.z + r * Math.sin(a),
        });
      }
      for (let i = 0; i < segs; i++) {
        const a = (2 * Math.PI * i) / segs;
        doc.vertices.push({
          x: center.x + r * Math.cos(a),
          y: center.y + cylHalf,
          z: center.z + r * Math.sin(a),
        });
      }
      for (let i = 0; i < segs; i++)
        pushFace([mid + i, mid + ((i + 1) % segs), mid + segs + ((i + 1) % segs), mid + segs + i]);
    }

    const topStart = doc.vertices.length;
    for (let ri = 0; ri <= capRings; ri++)
      for (let si = 0; si < segs; si++) {
        const phi = (Math.PI * 0.5 * ri) / capRings;
        const theta = (2 * Math.PI * si) / segs;
        doc.vertices.push({
          x: center.x + r * Math.sin(phi) * Math.cos(theta),
          y: center.y + cylHalf + r * Math.cos(phi),
          z: center.z + r * Math.sin(phi) * Math.sin(theta),
        });
      }

    for (let ri = 0; ri < capRings; ri++)
      for (let si = 0; si < segs; si++) {
        const a = o + ri * segs + si;
        const b = o + ri * segs + ((si + 1) % segs);
        const c = o + (ri + 1) * segs + ((si + 1) % segs);
        const d = o + (ri + 1) * segs + si;
        pushFace([a, b, c, d]);
      }

    if (cylHalf > 0.01) {
      const botRing = o + capRings * segs;
      for (let si = 0; si < segs; si++) {
        const a = botRing + si;
        const b = botRing + ((si + 1) % segs);
        const c = mid + ((si + 1) % segs);
        const d = mid + si;
        pushFace([a, b, c, d]);
      }
      const topRing = topStart;
      const topCyl = mid + segs;
      for (let si = 0; si < segs; si++) {
        const a = topCyl + si;
        const b = topCyl + ((si + 1) % segs);
        const c = topRing + ((si + 1) % segs);
        const d = topRing + si;
        pushFace([a, b, c, d]);
      }
    }

    for (let ri = 0; ri < capRings; ri++)
      for (let si = 0; si < segs; si++) {
        const a = topStart + ri * segs + si;
        const b = topStart + ri * segs + ((si + 1) % segs);
        const c = topStart + (ri + 1) * segs + ((si + 1) % segs);
        const d = topStart + (ri + 1) * segs + si;
        pushFace([a, b, c, d]);
      }
    return;
  }

  if (type === 'cone') {
    const r = Math.min(halfX, halfZ);
    const segs = 12;
    const o = doc.vertices.length;
    for (let i = 0; i < segs; i++) {
      const a = (2 * Math.PI * i) / segs;
      doc.vertices.push({
        x: center.x + r * Math.cos(a),
        y: min.y,
        z: center.z + r * Math.sin(a),
      });
    }
    const apex = doc.vertices.length;
    doc.vertices.push({ x: center.x, y: max.y, z: center.z });
    for (let i = 0; i < segs; i++) pushFace([o + i, o + ((i + 1) % segs), apex]);
    const bot: number[] = [];
    for (let i = 0; i < segs; i++) bot.push(o + i);
    pushFace(bot);
    return;
  }

  if (type === 'torus') {
    const tubeR = Math.min(halfX, halfY, halfZ) * 0.25;
    const majorR = Math.min(halfX, halfZ) - tubeR;
    const segs = 14;
    const rings = 10;
    const o = doc.vertices.length;
    for (let ri = 0; ri < rings; ri++)
      for (let si = 0; si < segs; si++) {
        const theta = (2 * Math.PI * ri) / rings;
        const phi = (2 * Math.PI * si) / segs;
        doc.vertices.push({
          x: center.x + (majorR + tubeR * Math.cos(phi)) * Math.cos(theta),
          y: center.y + tubeR * Math.sin(phi),
          z: center.z + (majorR + tubeR * Math.cos(phi)) * Math.sin(theta),
        });
      }
    for (let ri = 0; ri < rings; ri++)
      for (let si = 0; si < segs; si++) {
        const a = o + ri * segs + si;
        const b = o + ri * segs + ((si + 1) % segs);
        const c = o + ((ri + 1) % rings) * segs + ((si + 1) % segs);
        const d = o + ((ri + 1) % rings) * segs + si;
        pushFace([a, b, c, d]);
      }
  }
}
