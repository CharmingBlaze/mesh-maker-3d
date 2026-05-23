import type { BoundingBox } from '@/core/math/BoundingBox';
import { boundsCenter, boundsFromCorners, emptyBounds, mergeBounds } from '@/core/math/BoundingBox';
import type { Vec3 } from '@/core/math/Vec3';
import type { MeshDocument } from '@/core/mesh/MeshDocument';
import { cloneMeshDocument, createMeshDocument } from '@/core/mesh/MeshDocument';
import { meshBounds } from '@/core/mesh/meshBounds';
import { SceneGraph } from '@/core/scene-graph/SceneGraph';
import { createSceneNode, type SceneNodeData, type Transform } from '@/core/scene-graph/SceneNode';
import { ensureLayerData } from '@/systems/layers/layerSystem';

export type MeshesRecord = Record<string, MeshDocument>;

export interface SceneRenderEntry {
  nodeId: string;
  mesh: MeshDocument;
  transform: Transform;
  visible: boolean;
  locked: boolean;
  selected: boolean;
  isActive: boolean;
}

export function cloneMeshesRecord(meshes: MeshesRecord): MeshesRecord {
  const out: MeshesRecord = {};
  for (const [id, mesh] of Object.entries(meshes)) {
    out[id] = cloneMeshDocument(mesh);
  }
  return out;
}

export function meshesToArray(meshes: MeshesRecord): MeshDocument[] {
  return Object.values(meshes).map((m) => cloneMeshDocument(m));
}

export function meshesFromArray(list: MeshDocument[]): MeshesRecord {
  const out: MeshesRecord = {};
  list.forEach((m) => {
    out[m.id] = cloneMeshDocument(m);
  });
  return out;
}

export function getMeshNodes(sceneGraph: SceneGraph): SceneNodeData[] {
  return sceneGraph.getAllNodes().filter((n) => n.type === 'mesh' && n.meshId);
}

export function sceneMeshIds(sceneGraph: SceneGraph): Set<string> {
  return new Set(
    getMeshNodes(sceneGraph)
      .map((n) => n.meshId)
      .filter((id): id is string => !!id),
  );
}

/** Meshes referenced by scene objects. */
export function meshesInScene(meshes: MeshesRecord, sceneGraph: SceneGraph): MeshDocument[] {
  const ids = sceneMeshIds(sceneGraph);
  return Object.values(meshes).filter((m) => ids.has(m.id));
}

export function resolveActiveMeshId(
  meshes: MeshesRecord,
  sceneGraph: SceneGraph,
  preferredId?: string,
): string {
  if (preferredId && meshes[preferredId]) return preferredId;
  return getMeshNodes(sceneGraph)[0]?.meshId ?? '';
}

export function getNodeForMeshId(sceneGraph: SceneGraph, meshId: string): SceneNodeData | undefined {
  return getMeshNodes(sceneGraph).find((n) => n.meshId === meshId);
}

export function isIdentityTransform(t: Transform): boolean {
  return (
    t.position.x === 0 &&
    t.position.y === 0 &&
    t.position.z === 0 &&
    t.rotation.x === 0 &&
    t.rotation.y === 0 &&
    t.rotation.z === 0 &&
    t.scale.x === 1 &&
    t.scale.y === 1 &&
    t.scale.z === 1
  );
}

/** Mesh with vertices transformed into world space for viewport hit-testing. */
export function meshInWorldSpace(mesh: MeshDocument, transform: Transform): MeshDocument {
  if (isIdentityTransform(transform)) return mesh;
  return {
    ...mesh,
    vertices: mesh.vertices.map((v) => transformPoint(v, transform)),
  };
}

export function getActiveSceneEntry(
  sceneGraph: SceneGraph,
  meshes: MeshesRecord,
  activeMeshId: string,
): SceneRenderEntry | undefined {
  return buildSceneRenderEntries(sceneGraph, meshes, activeMeshId, new Set()).find((e) => e.isActive);
}

export function meshForViewportPick(
  sceneGraph: SceneGraph,
  meshes: MeshesRecord,
  activeMeshId: string,
): MeshDocument | null {
  if (getMeshNodes(sceneGraph).length === 0) return null;
  const mesh = activeMeshId ? meshes[activeMeshId] : undefined;
  if (!mesh) return null;
  const entry = getActiveSceneEntry(sceneGraph, meshes, activeMeshId);
  return meshInWorldSpace(mesh, entry?.transform ?? {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  });
}

export function getMeshForNode(meshes: MeshesRecord, node: SceneNodeData): MeshDocument | null {
  if (!node.meshId) return null;
  return meshes[node.meshId] ?? null;
}

const DEG = Math.PI / 180;

export function transformPoint(v: Vec3, t: Transform): Vec3 {
  let x = v.x * t.scale.x;
  let y = v.y * t.scale.y;
  let z = v.z * t.scale.z;

  const rx = t.rotation.x * DEG;
  const ry = t.rotation.y * DEG;
  const rz = t.rotation.z * DEG;

  if (rx !== 0) {
    const cy = Math.cos(rx);
    const sy = Math.sin(rx);
    const ny = y * cy - z * sy;
    z = y * sy + z * cy;
    y = ny;
  }
  if (ry !== 0) {
    const cy = Math.cos(ry);
    const sy = Math.sin(ry);
    const nx = x * cy + z * sy;
    z = -x * sy + z * cy;
    x = nx;
  }
  if (rz !== 0) {
    const cz = Math.cos(rz);
    const sz = Math.sin(rz);
    const nx = x * cz - y * sz;
    y = x * sz + y * cz;
    x = nx;
  }

  return {
    x: x + t.position.x,
    y: y + t.position.y,
    z: z + t.position.z,
  };
}

/** Inverse of {@link transformPoint} — world space back to mesh local space. */
export function inverseTransformPoint(v: Vec3, t: Transform): Vec3 {
  let x = v.x - t.position.x;
  let y = v.y - t.position.y;
  let z = v.z - t.position.z;

  const rx = t.rotation.x * DEG;
  const ry = t.rotation.y * DEG;
  const rz = t.rotation.z * DEG;

  if (rz !== 0) {
    const cz = Math.cos(rz);
    const sz = Math.sin(rz);
    const nx = x * cz + y * sz;
    y = -x * sz + y * cz;
    x = nx;
  }
  if (ry !== 0) {
    const cy = Math.cos(ry);
    const sy = Math.sin(ry);
    const nx = x * cy - z * sy;
    z = x * sy + z * cy;
    x = nx;
  }
  if (rx !== 0) {
    const cy = Math.cos(rx);
    const sy = Math.sin(rx);
    const ny = y * cy + z * sy;
    z = -y * sy + z * cy;
    y = ny;
  }

  return {
    x: x / t.scale.x,
    y: y / t.scale.y,
    z: z / t.scale.z,
  };
}

export function meshWorldBounds(mesh: MeshDocument, transform: Transform): BoundingBox | null {
  if (mesh.vertices.length === 0) return null;
  let box = emptyBounds();
  let first = true;
  for (const v of mesh.vertices) {
    const w = transformPoint(v, transform);
    if (first) {
      box = boundsFromCorners(w, w);
      first = false;
    } else {
      box = mergeBounds(box, w, w);
    }
  }
  return first ? null : box;
}

export function sceneWorldBounds(
  sceneGraph: SceneGraph,
  meshes: MeshesRecord,
): BoundingBox | null {
  let box: BoundingBox | null = null;
  for (const node of getMeshNodes(sceneGraph)) {
    if (!node.visible) continue;
    const mesh = getMeshForNode(meshes, node);
    if (!mesh) continue;
    const wb = meshWorldBounds(mesh, node.transform);
    if (!wb) continue;
    if (!box) box = wb;
    else {
      box = mergeBounds(box, wb.min, wb.max);
    }
  }
  return box;
}

export function buildSceneRenderEntries(
  sceneGraph: SceneGraph,
  meshes: MeshesRecord,
  activeMeshId: string,
  selectedNodeIds: Set<string>,
): SceneRenderEntry[] {
  const entries: SceneRenderEntry[] = [];
  sceneGraph.traverse((node) => {
    if (node.type !== 'mesh' || !node.meshId) return;
    const mesh = meshes[node.meshId];
    if (!mesh) return;
    entries.push({
      nodeId: node.id,
      mesh,
      transform: node.transform,
      visible: node.visible,
      locked: node.locked,
      selected: selectedNodeIds.has(node.id),
      isActive: node.meshId === activeMeshId,
    });
  });
  return entries;
}

export function nextObjectName(sceneGraph: SceneGraph, meshes: MeshesRecord, base: string): string {
  const names = new Set([
    ...getMeshNodes(sceneGraph).map((n) => n.name),
    ...Object.values(meshes).map((m) => m.name),
  ]);
  let i = 1;
  while (names.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

export function addMeshToScene(
  sceneGraph: SceneGraph,
  meshes: MeshesRecord,
  mesh: MeshDocument,
  transform?: Partial<Transform>,
  nodeName?: string,
): { nodeId: string; meshId: string } {
  ensureLayerData(mesh);
  meshes[mesh.id] = mesh;
  const node = createSceneNode({
    name: nodeName ?? mesh.name,
    type: 'mesh',
    meshId: mesh.id,
    transform: {
      position: { x: 0, y: 0, z: 0, ...(transform?.position ?? {}) },
      rotation: { x: 0, y: 0, z: 0, ...(transform?.rotation ?? {}) },
      scale: { x: 1, y: 1, z: 1, ...(transform?.scale ?? {}) },
    },
  });
  sceneGraph.addNode(node);
  return { nodeId: node.id, meshId: mesh.id };
}

export function removeMeshFromScene(
  sceneGraph: SceneGraph,
  meshes: MeshesRecord,
  nodeId: string,
): string | null {
  const node = sceneGraph.getNode(nodeId);
  if (!node || node.type !== 'mesh' || !node.meshId) return null;
  const meshId = node.meshId;
  sceneGraph.removeNode(nodeId);
  delete meshes[meshId];
  return meshId;
}

export function createEmptySceneMesh(): { mesh: MeshDocument; nodeId: string } {
  const mesh = createMeshDocument('Mesh');
  ensureLayerData(mesh);
  const sceneGraph = new SceneGraph();
  const { nodeId } = addMeshToScene(sceneGraph, { [mesh.id]: mesh }, mesh);
  return { mesh, nodeId };
}

/** Local-space bounds of a mesh document. */
export function localMeshBounds(mesh: MeshDocument): BoundingBox | null {
  return meshBounds(mesh);
}

export function offsetMeshVertices(mesh: MeshDocument, dx: number, dy: number, dz: number): void {
  mesh.vertices.forEach((v) => {
    v.x += dx;
    v.y += dy;
    v.z += dz;
  });
}

export function centerMeshAtOrigin(mesh: MeshDocument): Vec3 {
  const bounds = localMeshBounds(mesh);
  if (!bounds) return { x: 0, y: 0, z: 0 };
  const center = boundsCenter(bounds);
  offsetMeshVertices(mesh, -center.x, -center.y, -center.z);
  return center;
}
