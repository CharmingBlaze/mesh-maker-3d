import type { SceneNodeData } from '@/core/scene-graph/SceneNode';
import type { View2DKey } from '@/core/math/projection';
import { VIEW2D_DEFS, w2s } from '@/core/math/projection';
import type { BoundingBox } from '@/core/math/BoundingBox';
import type * as THREE from 'three';
import type { SceneGraph } from '@/core/scene-graph/SceneGraph';
import type { MeshesRecord } from '@/systems/scene/sceneObjectHelpers';
import {
  buildSceneRenderEntries,
  getMeshNodes,
  meshWorldBounds,
  transformPoint,
} from '@/systems/scene/sceneObjectHelpers';
import { vertexToScreen } from '@/systems/viewport/pick3D';
import { isAdditiveSelection } from '@/systems/selection/selectionSystem';

function projectWorldBounds2D(
  bounds: BoundingBox,
  vpKey: View2DKey,
  pan: { x: number; y: number },
  zoom: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const vd = VIEW2D_DEFS[vpKey];
  const corners = [
    bounds.min,
    bounds.max,
    { x: bounds.min.x, y: bounds.min.y, z: bounds.max.z },
    { x: bounds.max.x, y: bounds.max.y, z: bounds.min.z },
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  corners.forEach((c) => {
    const p = vd.proj(c);
    const s = w2s(p.x, p.y, pan, zoom);
    minX = Math.min(minX, s.x);
    minY = Math.min(minY, s.y);
    maxX = Math.max(maxX, s.x);
    maxY = Math.max(maxY, s.y);
  });
  return { minX, minY, maxX, maxY };
}

export function pickSceneObject2D(
  sceneGraph: SceneGraph,
  meshes: MeshesRecord,
  activeMeshId: string,
  selectedNodeIds: Set<string>,
  vpKey: View2DKey,
  pan: { x: number; y: number },
  zoom: number,
  sx: number,
  sy: number,
): string | null {
  const entries = buildSceneRenderEntries(sceneGraph, meshes, activeMeshId, selectedNodeIds);
  let best: string | null = null;
  let bestArea = Infinity;

  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (!entry.visible || entry.locked) continue;
    const wb = meshWorldBounds(entry.mesh, entry.transform);
    if (!wb) continue;
    const rect = projectWorldBounds2D(wb, vpKey, pan, zoom);
    if (sx >= rect.minX && sx <= rect.maxX && sy >= rect.minY && sy <= rect.maxY) {
      const area = (rect.maxX - rect.minX) * (rect.maxY - rect.minY);
      if (area < bestArea) {
        bestArea = area;
        best = entry.nodeId;
      }
    }
  }
  return best;
}

function rayTriangleHit(
  ray: THREE.Ray,
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  c: { x: number; y: number; z: number },
): number | null {
  const orig = ray.origin;
  const dir = ray.direction;
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const acx = c.x - a.x;
  const acy = c.y - a.y;
  const acz = c.z - a.z;
  const pvecx = dir.y * acz - dir.z * acy;
  const pvecy = dir.z * acx - dir.x * acz;
  const pvecz = dir.x * acy - dir.y * acx;
  const det = abx * pvecx + aby * pvecy + abz * pvecz;
  if (Math.abs(det) < 1e-10) return null;
  const invDet = 1 / det;
  const tvecx = orig.x - a.x;
  const tvecy = orig.y - a.y;
  const tvecz = orig.z - a.z;
  const u = (tvecx * pvecx + tvecy * pvecy + tvecz * pvecz) * invDet;
  if (u < 0 || u > 1) return null;
  const qvecx = tvecy * abz - tvecz * aby;
  const qvecy = tvecz * abx - tvecx * abz;
  const qvecz = tvecx * aby - tvecy * abx;
  const v = (dir.x * qvecx + dir.y * qvecy + dir.z * qvecz) * invDet;
  if (v < 0 || u + v > 1) return null;
  const t = (acx * qvecx + acy * qvecy + acz * qvecz) * invDet;
  return t > 1e-6 ? t : null;
}

export function pickSceneObject3D(
  sceneGraph: SceneGraph,
  meshes: MeshesRecord,
  activeMeshId: string,
  selectedNodeIds: Set<string>,
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  raycaster: THREE.Raycaster,
  ndc: THREE.Vector2,
  sx: number,
  sy: number,
): string | null {
  const rect = canvas.getBoundingClientRect();
  ndc.x = (sx / rect.width) * 2 - 1;
  ndc.y = -(sy / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);

  const entries = buildSceneRenderEntries(sceneGraph, meshes, activeMeshId, selectedNodeIds);
  let bestNode: string | null = null;
  let bestT = Infinity;

  for (const entry of entries) {
    if (!entry.visible || entry.locked) continue;
    const mesh = entry.mesh;
    const t = entry.transform;

    for (const face of mesh.faces) {
      if (!face || face.length < 3) continue;
      const v0 = transformPoint(mesh.vertices[face[0]], t);
      for (let i = 1; i < face.length - 1; i++) {
        const v1 = transformPoint(mesh.vertices[face[i]], t);
        const v2 = transformPoint(mesh.vertices[face[i + 1]], t);
        const hit = rayTriangleHit(raycaster.ray, v0, v1, v2);
        if (hit !== null && hit < bestT) {
          bestT = hit;
          bestNode = entry.nodeId;
        }
      }
    }

    const wb = meshWorldBounds(mesh, t);
    if (wb && bestNode === null) {
      const center = {
        x: (wb.min.x + wb.max.x) / 2,
        y: (wb.min.y + wb.max.y) / 2,
        z: (wb.min.z + wb.max.z) / 2,
      };
      const sc = vertexToScreen(camera, canvas, center);
      if (Math.hypot(sc.x - sx, sc.y - sy) < 14) {
        bestNode = entry.nodeId;
      }
    }
  }

  return bestNode;
}

export function toggleNodeSelection(
  selectedNodeIds: Set<string>,
  nodeId: string,
  shiftKey: boolean,
  ctrlKey = false,
): Set<string> {
  const additive = isAdditiveSelection(shiftKey, ctrlKey);
  const next = new Set(selectedNodeIds);
  if (additive) {
    if (next.has(nodeId)) next.delete(nodeId);
    else next.add(nodeId);
  } else {
    next.clear();
    next.add(nodeId);
  }
  return next;
}

export function meshNodeCount(sceneGraph: SceneGraph): number {
  return getMeshNodes(sceneGraph).length;
}

export function resolvePrimaryNode(
  sceneGraph: SceneGraph,
  selectedNodeIds: Set<string>,
): SceneNodeData | null {
  for (const id of selectedNodeIds) {
    const node = sceneGraph.getNode(id);
    if (node?.type === 'mesh') return node;
  }
  const nodes = getMeshNodes(sceneGraph);
  return nodes[0] ?? null;
}

export function getActiveMeshIdFromSelection(
  sceneGraph: SceneGraph,
  meshes: MeshesRecord,
  selectedNodeIds: Set<string>,
  fallback: string,
): string {
  const node = resolvePrimaryNode(sceneGraph, selectedNodeIds);
  if (node?.meshId && meshes[node.meshId]) return node.meshId;
  return fallback;
}
