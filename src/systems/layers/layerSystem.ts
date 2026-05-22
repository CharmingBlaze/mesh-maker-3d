import { GROUP_COLORS, type MeshDocument, type MeshLayer } from '@/core/mesh/MeshDocument';
import { generateId } from '@/core/utils/id';

export function createLayer(name: string, index: number): MeshLayer {
  return {
    id: generateId('layer'),
    name,
    visible: true,
    locked: false,
    color: GROUP_COLORS[index % GROUP_COLORS.length],
  };
}

export function ensureLayerData(mesh: MeshDocument): MeshDocument {
  if (!mesh.layers?.length) {
    const baseLayer = createLayer('Base Mesh', 0);
    mesh.layers = [baseLayer];
    mesh.activeLayerId = baseLayer.id;
  }
  if (!mesh.activeLayerId || !mesh.layers.some((layer) => layer.id === mesh.activeLayerId)) {
    mesh.activeLayerId = mesh.layers[0].id;
  }

  mesh.vertexLayers = mesh.vertices.map((_, index) => mesh.vertexLayers?.[index] ?? mesh.activeLayerId);
  mesh.faceLayers = mesh.faces.map((_, index) => mesh.faceLayers?.[index] ?? mesh.activeLayerId);
  return mesh;
}

export function activeLayer(mesh: MeshDocument): MeshLayer {
  ensureLayerData(mesh);
  return mesh.layers.find((layer) => layer.id === mesh.activeLayerId) ?? mesh.layers[0];
}

export function isLayerVisible(mesh: MeshDocument, layerId: string | undefined): boolean {
  ensureLayerData(mesh);
  return mesh.layers.find((layer) => layer.id === layerId)?.visible ?? true;
}

export function isLayerLocked(mesh: MeshDocument, layerId: string | undefined): boolean {
  ensureLayerData(mesh);
  return mesh.layers.find((layer) => layer.id === layerId)?.locked ?? false;
}

export function assignNewGeometryToActiveLayer(
  mesh: MeshDocument,
  beforeVertexCount: number,
  beforeFaceCount: number,
): void {
  ensureLayerData(mesh);
  for (let i = beforeVertexCount; i < mesh.vertices.length; i++) {
    mesh.vertexLayers[i] = mesh.activeLayerId;
  }
  for (let i = beforeFaceCount; i < mesh.faces.length; i++) {
    mesh.faceLayers[i] = mesh.activeLayerId;
  }
}

export function visibleVertexIndices(mesh: MeshDocument): Set<number> {
  ensureLayerData(mesh);
  return new Set(
    mesh.vertices
      .map((_, index) => index)
      .filter((index) => isLayerVisible(mesh, mesh.vertexLayers[index])),
  );
}

export function visibleFaceIndices(mesh: MeshDocument): Set<number> {
  ensureLayerData(mesh);
  return new Set(
    mesh.faces
      .map((_, index) => index)
      .filter((index) => isLayerVisible(mesh, mesh.faceLayers[index])),
  );
}

export function editableVertexIndices(mesh: MeshDocument, vertices: Iterable<number>): Set<number> {
  ensureLayerData(mesh);
  return new Set([...vertices].filter((index) => !isLayerLocked(mesh, mesh.vertexLayers[index])));
}

export function editableFaceIndices(mesh: MeshDocument, faces: Iterable<number>): Set<number> {
  ensureLayerData(mesh);
  return new Set([...faces].filter((index) => !isLayerLocked(mesh, mesh.faceLayers[index])));
}

export function layerGeometryCounts(mesh: MeshDocument, layerId: string): { verts: number; faces: number } {
  ensureLayerData(mesh);
  let verts = 0;
  let faces = 0;
  mesh.vertexLayers.forEach((id) => {
    if (id === layerId) verts++;
  });
  mesh.faceLayers.forEach((id, fi) => {
    if (id === layerId && mesh.faces[fi] && mesh.faces[fi]!.length >= 3) faces++;
  });
  return { verts, faces };
}
