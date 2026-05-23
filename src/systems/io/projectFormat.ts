import type { MeshDocument } from '@/core/mesh/MeshDocument';
import { cloneMeshDocument, createMeshDocument } from '@/core/mesh/MeshDocument';
import { SceneGraph } from '@/core/scene-graph/SceneGraph';
import type { View2DKey } from '@/core/math/projection';
import type { Viewport2DState } from '@/store/editorStore';
import type { ViewportLayoutId } from '@/systems/viewport/viewportLayout';
import { meshesFromArray } from '@/systems/scene/sceneObjectHelpers';

export const PROJECT_EXTENSION = '.mm3d';
export const PROJECT_MIME = 'application/json';

export const PROJECT_VERSION = 2 as const;

export interface ProjectEditorState {
  vp2d: Record<View2DKey, Viewport2DState>;
  wireframe: boolean;
  flatShading: boolean;
  showGrid3D: boolean;
  viewportLayout: ViewportLayoutId;
  snapSize: number;
  snapEnabled: boolean;
  groupSel: number;
  matSel: number;
}

export interface ProjectFileV2 {
  version: typeof PROJECT_VERSION;
  meshes: MeshDocument[];
  activeMeshId: string;
  sceneGraph: ReturnType<SceneGraph['toJSON']>;
  editor: ProjectEditorState;
}

/** Legacy v1 — single mesh */
export interface ProjectFileV1Legacy {
  version: 1;
  mesh: MeshDocument;
  sceneGraph: ReturnType<SceneGraph['toJSON']>;
  editor: ProjectEditorState;
}

export type ProjectFile = ProjectFileV2;

function normalizeMesh(mesh: MeshDocument): MeshDocument {
  const doc = cloneMeshDocument(mesh);
  if (!doc.layers?.length) {
    const fresh = createMeshDocument(doc.name);
    doc.layers = fresh.layers;
    doc.activeLayerId = fresh.activeLayerId;
  }
  if (!doc.vertexLayers) doc.vertexLayers = [];
  if (!doc.faceLayers) doc.faceLayers = [];
  if (!doc.groups?.length) {
    doc.groups = [{ name: 'Group 1', faces: [], color: '#6f9df6' }];
  }
  if (!doc.materials?.length) {
    doc.materials = [{ name: 'Material 1', color: '#6f9df6', opacity: 0.9 }];
  }
  if (!doc.bones) doc.bones = [];
  if (!doc.faceUvs) doc.faceUvs = [];
  while (doc.faceUvs.length < doc.faces.length) doc.faceUvs.push(null);
  return doc;
}

const defaultEditor = (): ProjectEditorState => ({
  vp2d: {
    top: { pan: { x: 240, y: 240 }, zoom: 1 },
    front: { pan: { x: 240, y: 240 }, zoom: 1 },
    side: { pan: { x: 240, y: 240 }, zoom: 1 },
  },
  wireframe: false,
  flatShading: false,
  showGrid3D: true,
  viewportLayout: 'quad',
  snapSize: 5,
  snapEnabled: true,
  groupSel: 0,
  matSel: 0,
});

export function serializeProject(data: Omit<ProjectFileV2, 'version'>): string {
  const file: ProjectFileV2 = { version: PROJECT_VERSION, ...data };
  return JSON.stringify(file, null, 2);
}

export function parseProject(json: string): ProjectFileV2 {
  const raw = JSON.parse(json) as {
    version?: number;
    mesh?: MeshDocument;
    meshes?: MeshDocument[];
    activeMeshId?: string;
    sceneGraph?: ReturnType<SceneGraph['toJSON']>;
    editor?: Partial<ProjectEditorState>;
  };
  const editor: ProjectEditorState = {
    ...defaultEditor(),
    ...raw.editor,
  };

  if (raw.version === 2 && raw.meshes?.length) {
    const meshes = raw.meshes.map(normalizeMesh);
    const activeMeshId = raw.activeMeshId && meshes.some((m) => m.id === raw.activeMeshId)
      ? raw.activeMeshId
      : meshes[0].id;
    return {
      version: PROJECT_VERSION,
      meshes,
      activeMeshId,
      sceneGraph: raw.sceneGraph ?? new SceneGraph().toJSON(),
      editor,
    };
  }

  if (raw.version === 1 && raw.mesh) {
    const mesh = normalizeMesh(raw.mesh);
    const sceneGraph = raw.sceneGraph ?? new SceneGraph().toJSON();
    const g = SceneGraph.fromJSON(sceneGraph);
    g.ensureMeshNode(mesh.id, mesh.name);
    return {
      version: PROJECT_VERSION,
      meshes: [mesh],
      activeMeshId: mesh.id,
      sceneGraph: g.toJSON(),
      editor,
    };
  }

  throw new Error(`Unsupported project version: ${raw.version ?? 'unknown'}`);
}

/** @deprecated use ProjectFileV2 */
export type ProjectFileV1 = ProjectFileV2;

export { meshesFromArray };
