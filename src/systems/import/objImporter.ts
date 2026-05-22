import { createMeshDocument, GROUP_COLORS, type MeshDocument } from '@/core/mesh/MeshDocument';
import { ensureLayerData } from '@/systems/layers/layerSystem';

interface ObjParseResult {
  positions: [number, number, number][];
  faces: number[][];
  groups: { name: string; faces: number[] }[];
}

function parseOBJ(text: string): ObjParseResult {
  const positions: [number, number, number][] = [];
  const faces: number[][] = [];
  const groups: { name: string; faces: number[] }[] = [];
  let currentGroup = 'default';
  const groupMap = new Map<string, number>();

  const getGroupIndex = (name: string) => {
    if (!groupMap.has(name)) {
      groupMap.set(name, groups.length);
      groups.push({ name, faces: [] });
    }
    return groupMap.get(name)!;
  };

  getGroupIndex(currentGroup);

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    const cmd = parts[0];

    if (cmd === 'v' && parts.length >= 4) {
      positions.push([+parts[1], +parts[2], +parts[3]]);
    } else if (cmd === 'f' && parts.length >= 4) {
      const indices: number[] = [];
      for (let i = 1; i < parts.length; i++) {
        const tok = parts[i].split('/')[0];
        let vi = parseInt(tok, 10);
        if (Number.isNaN(vi)) continue;
        if (vi < 0) vi = positions.length + vi + 1;
        indices.push(vi - 1);
      }
      if (indices.length >= 3) {
        const fi = faces.length;
        faces.push(indices);
        groups[getGroupIndex(currentGroup)].faces.push(fi);
      }
    } else if (cmd === 'g' || cmd === 'o') {
      currentGroup = parts.slice(1).join(' ') || `group_${groups.length}`;
      getGroupIndex(currentGroup);
    }
  }

  return { positions, faces, groups };
}

export function importOBJ(text: string, name?: string): MeshDocument {
  const parsed = parseOBJ(text);
  const doc = createMeshDocument(name ?? 'Imported OBJ');
  doc.vertices = parsed.positions.map(([x, y, z]) => ({ x, y, z }));
  doc.faces = parsed.faces;
  ensureLayerData(doc);

  if (parsed.groups.length > 0 && parsed.groups.some((g) => g.faces.length > 0)) {
    doc.groups = parsed.groups
      .filter((g) => g.faces.length > 0)
      .map((g, i) => ({
        name: g.name,
        faces: [...g.faces],
        color: GROUP_COLORS[i % GROUP_COLORS.length],
      }));
  } else {
    doc.groups[0].faces = doc.faces.map((_, i) => i).filter((i) => doc.faces[i] && doc.faces[i]!.length >= 3);
  }

  return doc;
}
