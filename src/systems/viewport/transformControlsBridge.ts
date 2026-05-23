import * as THREE from 'three';
import type { EditorSnapshot } from '@/core/commands/Command';
import { SnapshotCommand } from '@/core/commands/Command';
import { useEditorStore } from '@/store/editorStore';
import type { Transform } from '@/core/scene-graph/SceneNode';
import { getNodeForMeshId } from '@/systems/scene/sceneObjectHelpers';
import { getTransformTargetVertIndices } from '@/systems/viewport/transformGizmo3D';

const DEG = Math.PI / 180;

export interface TransformControlsSession {
  beforeSnapshot: EditorSnapshot | null;
  pivotStartMatrix: THREE.Matrix4;
  origObjectWorldMatrices: Map<string, THREE.Matrix4> | null;
  origWorldVerts: Map<number, THREE.Vector3> | null;
  invNodeWorldMatrix: THREE.Matrix4 | null;
  vertIndices: number[] | null;
  mode: 'translate' | 'rotate' | 'scale' | null;
}

export function createTransformControlsSession(): TransformControlsSession {
  return {
    beforeSnapshot: null,
    pivotStartMatrix: new THREE.Matrix4(),
    origObjectWorldMatrices: null,
    origWorldVerts: null,
    invNodeWorldMatrix: null,
    vertIndices: null,
    mode: null,
  };
}

function transformToMatrix(t: Transform): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3(t.position.x, t.position.y, t.position.z);
  const quat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(t.rotation.x * DEG, t.rotation.y * DEG, t.rotation.z * DEG, 'XYZ'),
  );
  const scale = new THREE.Vector3(t.scale.x, t.scale.y, t.scale.z);
  m.compose(pos, quat, scale);
  return m;
}

function matrixToTransform(m: THREE.Matrix4): Transform {
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  m.decompose(pos, quat, scale);
  const euler = new THREE.Euler().setFromQuaternion(quat, 'XYZ');
  return {
    position: { x: pos.x, y: pos.y, z: pos.z },
    rotation: { x: euler.x / DEG, y: euler.y / DEG, z: euler.z / DEG },
    scale: { x: scale.x, y: scale.y, z: scale.z },
  };
}

export function beginTransformControlsDrag(
  session: TransformControlsSession,
  pivot: THREE.Object3D,
  mode: 'translate' | 'rotate' | 'scale',
): void {
  const state = useEditorStore.getState();
  session.beforeSnapshot = state.getSnapshot();
  session.mode = mode;
  pivot.updateMatrixWorld(true);
  session.pivotStartMatrix.copy(pivot.matrixWorld);

  if (state.selectionMode === 'object' && state.selectedNodeIds.size > 0) {
    session.origObjectWorldMatrices = new Map();
    state.selectedNodeIds.forEach((nodeId) => {
      const node = state.sceneGraph.getNode(nodeId);
      if (node?.type !== 'mesh') return;
      session.origObjectWorldMatrices!.set(nodeId, transformToMatrix(node.transform));
    });
    session.origWorldVerts = null;
    session.invNodeWorldMatrix = null;
    session.vertIndices = null;
    return;
  }

  const mesh = state.getActiveMesh();
  const node = getNodeForMeshId(state.sceneGraph, mesh.id);
  const transform = node?.transform ?? {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  };
  const nodeWorld = transformToMatrix(transform);

  session.origObjectWorldMatrices = null;
  session.invNodeWorldMatrix = nodeWorld.clone().invert();

  const indices = getTransformTargetVertIndices();
  session.vertIndices = indices;
  session.origWorldVerts = new Map();
  indices.forEach((vi) => {
    const v = mesh.vertices[vi];
    session.origWorldVerts!.set(
      vi,
      new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(nodeWorld),
    );
  });
}

const deltaMatrix = new THREE.Matrix4();
const tempVec = new THREE.Vector3();

export function applyTransformControlsChange(
  session: TransformControlsSession,
  pivot: THREE.Object3D,
): void {
  if (!session.beforeSnapshot) return;

  const state = useEditorStore.getState();
  pivot.updateMatrixWorld(true);
  deltaMatrix.copy(session.pivotStartMatrix).invert();
  deltaMatrix.premultiply(pivot.matrixWorld);

  if (session.origObjectWorldMatrices) {
    session.origObjectWorldMatrices.forEach((origWorld, nodeId) => {
      const node = state.sceneGraph.getNode(nodeId);
      if (!node) return;
      const newWorld = origWorld.clone().premultiply(deltaMatrix);
      node.transform = matrixToTransform(newWorld);
    });
    state.notifyChange();
    return;
  }

  if (session.origWorldVerts && session.invNodeWorldMatrix && session.vertIndices) {
    const mesh = state.getActiveMesh();
    session.vertIndices.forEach((vi) => {
      const orig = session.origWorldVerts!.get(vi);
      if (!orig) return;
      tempVec.copy(orig).applyMatrix4(deltaMatrix).applyMatrix4(session.invNodeWorldMatrix!);
      mesh.vertices[vi].x = tempVec.x;
      mesh.vertices[vi].y = tempVec.y;
      mesh.vertices[vi].z = tempVec.z;
    });
    state.notifyChange();
  }
}

export function commitTransformControlsDrag(session: TransformControlsSession): void {
  if (!session.beforeSnapshot) return;

  const state = useEditorStore.getState();
  const after = state.getSnapshot();
  const label =
    session.mode === 'translate' ? 'move' : session.mode === 'rotate' ? 'rotate' : 'scale';
  state.history.execute(
    new SnapshotCommand(label, session.beforeSnapshot, after, (snap) => {
      state.applySnapshot(snap);
      state.notifyChange();
    }),
  );
  resetTransformControlsSession(session);
}

export function resetTransformControlsSession(session: TransformControlsSession): void {
  session.beforeSnapshot = null;
  session.origObjectWorldMatrices = null;
  session.origWorldVerts = null;
  session.invNodeWorldMatrix = null;
  session.vertIndices = null;
  session.mode = null;
}
