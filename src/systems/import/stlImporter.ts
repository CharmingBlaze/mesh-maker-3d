import { createMeshDocument, type MeshDocument } from '@/core/mesh/MeshDocument';
import { ensureLayerData } from '@/systems/layers/layerSystem';

function importAsciiSTL(text: string, name?: string): MeshDocument {
  const doc = createMeshDocument(name ?? 'Imported STL');
  const vertMap = new Map<string, number>();
  const key = (x: number, y: number, z: number) => `${x.toFixed(5)},${y.toFixed(5)},${z.toFixed(5)}`;

  const addVert = (x: number, y: number, z: number) => {
    const k = key(x, y, z);
    const existing = vertMap.get(k);
    if (existing !== undefined) return existing;
    const idx = doc.vertices.length;
    doc.vertices.push({ x, y, z });
    vertMap.set(k, idx);
    return idx;
  };

  const lines = text.split(/\r?\n/);
  let tri: number[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('vertex')) {
      const p = t.split(/\s+/);
      if (p.length >= 4) tri.push(addVert(+p[1], +p[2], +p[3]));
    } else if (t.startsWith('endloop') || t.startsWith('endfacet')) {
      if (tri.length === 3) {
        const fi = doc.faces.length;
        doc.faces.push(tri);
        doc.groups[0].faces.push(fi);
      }
      tri = [];
    }
  }

  ensureLayerData(doc);
  return doc;
}

function importBinarySTL(buffer: ArrayBuffer, name?: string): MeshDocument {
  const doc = createMeshDocument(name ?? 'Imported STL');
  if (buffer.byteLength < 84) throw new Error('STL file too small');
  const view = new DataView(buffer);
  const triCount = view.getUint32(80, true);
  const vertMap = new Map<string, number>();
  const key = (x: number, y: number, z: number) => `${x.toFixed(5)},${y.toFixed(5)},${z.toFixed(5)}`;

  const addVert = (x: number, y: number, z: number) => {
    const k = key(x, y, z);
    const existing = vertMap.get(k);
    if (existing !== undefined) return existing;
    const idx = doc.vertices.length;
    doc.vertices.push({ x, y, z });
    vertMap.set(k, idx);
    return idx;
  };

  let offset = 84;
  for (let i = 0; i < triCount; i++) {
    if (offset + 50 > buffer.byteLength) break;
    offset += 12;
    const a = addVert(view.getFloat32(offset, true), view.getFloat32(offset + 4, true), view.getFloat32(offset + 8, true));
    offset += 12;
    const b = addVert(view.getFloat32(offset, true), view.getFloat32(offset + 4, true), view.getFloat32(offset + 8, true));
    offset += 12;
    const c = addVert(view.getFloat32(offset, true), view.getFloat32(offset + 4, true), view.getFloat32(offset + 8, true));
    offset += 14;
    const fi = doc.faces.length;
    doc.faces.push([a, b, c]);
    doc.groups[0].faces.push(fi);
  }

  ensureLayerData(doc);
  return doc;
}

export function importSTL(data: string | ArrayBuffer, name?: string): MeshDocument {
  if (typeof data === 'string') {
    const trimmed = data.trim().toLowerCase();
    if (trimmed.startsWith('solid')) return importAsciiSTL(data, name);
    throw new Error('Unrecognized STL text format');
  }
  const isBinary =
    data.byteLength >= 84 &&
    !new TextDecoder().decode(new Uint8Array(data, 0, Math.min(5, data.byteLength))).toLowerCase().startsWith('solid');
  if (isBinary) return importBinarySTL(data, name);
  return importAsciiSTL(new TextDecoder().decode(data), name);
}
