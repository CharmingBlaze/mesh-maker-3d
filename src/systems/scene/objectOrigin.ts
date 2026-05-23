import type { MeshDocument } from '@/core/mesh/MeshDocument';
import { boundsCenter } from '@/core/math/BoundingBox';
import type { Transform } from '@/core/scene-graph/SceneNode';
import {
  localMeshBounds,
  offsetMeshVertices,
  transformPoint,
} from '@/systems/scene/sceneObjectHelpers';

/** Move object origin to geometry center; mesh stays in world space. */
export function originToGeometry(mesh: MeshDocument, transform: Transform): boolean {
  const bounds = localMeshBounds(mesh);
  if (!bounds) return false;

  const center = boundsCenter(bounds);
  const worldCenter = transformPoint(center, transform);
  offsetMeshVertices(mesh, -center.x, -center.y, -center.z);
  transform.position = { x: worldCenter.x, y: worldCenter.y, z: worldCenter.z };
  return true;
}

/** Bake world transform into mesh verts and reset object transform to identity. */
export function geometryToOrigin(mesh: MeshDocument, transform: Transform): boolean {
  if (mesh.vertices.length === 0) return false;

  const t: Transform = {
    position: { ...transform.position },
    rotation: { ...transform.rotation },
    scale: { ...transform.scale },
  };

  mesh.vertices = mesh.vertices.map((v) => transformPoint(v, t));
  transform.position = { x: 0, y: 0, z: 0 };
  transform.rotation = { x: 0, y: 0, z: 0 };
  transform.scale = { x: 1, y: 1, z: 1 };
  return true;
}
