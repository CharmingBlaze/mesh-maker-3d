import type { Vec3 } from '../math/Vec3';
import { cloneVec3 } from '../math/Vec3';
import { generateId } from '../utils/id';

export const GROUP_COLORS = ['#6f9df6', '#7ec7a2', '#d6a657', '#9b8cf2', '#e27d7d', '#7db9d9', '#c98fbf'];

export interface MeshLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  color: string;
}

export interface FaceGroup {
  name: string;
  faces: number[];
  color: string;
}

export interface MaterialDef {
  name: string;
  color: string;
  opacity: number;
}

export interface BoneDef {
  name: string;
  pos: Vec3;
}

export interface MeshDocument {
  id: string;
  name: string;
  vertices: Vec3[];
  faces: (number[] | null)[];
  vertexLayers: string[];
  faceLayers: string[];
  layers: MeshLayer[];
  activeLayerId: string;
  groups: FaceGroup[];
  materials: MaterialDef[];
  bones: BoneDef[];
}

export function createMeshDocument(name = 'Mesh'): MeshDocument {
  const baseLayer: MeshLayer = {
    id: generateId('layer'),
    name: 'Base Mesh',
    visible: true,
    locked: false,
    color: GROUP_COLORS[0],
  };
  return {
    id: generateId('mesh'),
    name,
    vertices: [],
    faces: [],
    vertexLayers: [],
    faceLayers: [],
    layers: [baseLayer],
    activeLayerId: baseLayer.id,
    groups: [{ name: 'Group 1', faces: [], color: GROUP_COLORS[0] }],
    materials: [{ name: 'Material 1', color: GROUP_COLORS[0], opacity: 0.9 }],
    bones: [],
  };
}

export function cloneMeshDocument(doc: MeshDocument): MeshDocument {
  return {
    ...doc,
    vertices: doc.vertices.map(cloneVec3),
    faces: doc.faces.map((f) => (f ? [...f] : null)),
    vertexLayers: [...(doc.vertexLayers ?? [])],
    faceLayers: [...(doc.faceLayers ?? [])],
    layers: (doc.layers ?? []).map((layer) => ({ ...layer })),
    activeLayerId: doc.activeLayerId,
    groups: doc.groups.map((g) => ({ ...g, faces: [...g.faces] })),
    materials: doc.materials.map((m) => ({ ...m })),
    bones: doc.bones.map((b) => ({ ...b, pos: cloneVec3(b.pos) })),
  };
}

export function faceGroupIndex(doc: MeshDocument, fi: number): number {
  for (let gi = 0; gi < doc.groups.length; gi++) {
    if (doc.groups[gi].faces.includes(fi)) return gi;
  }
  return -1;
}

export function meshStats(doc: MeshDocument) {
  const faceCount = doc.faces.filter((f) => f && f.length >= 3).length;
  const tris = doc.faces.reduce((s, f) => s + (f ? Math.max(0, f.length - 2) : 0), 0);
  return { verts: doc.vertices.length, faces: faceCount, tris, groups: doc.groups.length };
}
