import type { MeshDocument } from '@/core/mesh/MeshDocument';
import { cloneMeshDocument, createMeshDocument } from '@/core/mesh/MeshDocument';
import { SceneGraph } from '@/core/scene-graph/SceneGraph';
import type { View2DKey } from '@/core/math/projection';
import type { Viewport2DState } from '@/store/editorStore';
import type { ViewportLayoutId } from '@/systems/viewport/viewportLayout';

export const PROJECT_EXTENSION = '.mm3d';
export const PROJECT_MIME = 'application/json';

export const PROJECT_VERSION = 1 as const;

export interface ProjectFileV1 {
  version: typeof PROJECT_VERSION;
  mesh: MeshDocument;
  sceneGraph: ReturnType<SceneGraph['toJSON']>;
  editor: {
    vp2d: Record<View2DKey, Viewport2DState>;
    wireframe: boolean;
    flatShading: boolean;
    showGrid3D: boolean;
    viewportLayout: ViewportLayoutId;
    snapSize: number;
    snapEnabled: boolean;
    groupSel: number;
    matSel: number;
  };
}

export function serializeProject(data: Omit<ProjectFileV1, 'version'>): string {
  const file: ProjectFileV1 = { version: PROJECT_VERSION, ...data };
  return JSON.stringify(file, null, 2);
}

export function parseProject(json: string): ProjectFileV1 {
  const raw = JSON.parse(json) as Partial<ProjectFileV1>;
  if (raw.version !== PROJECT_VERSION) {
    throw new Error(`Unsupported project version: ${raw.version ?? 'unknown'}`);
  }
  if (!raw.mesh) throw new Error('Invalid project: missing mesh');
  const mesh = cloneMeshDocument(raw.mesh);
  if (!mesh.layers?.length) {
    const fresh = createMeshDocument(mesh.name);
    mesh.layers = fresh.layers;
    mesh.activeLayerId = fresh.activeLayerId;
  }
  if (!mesh.vertexLayers) mesh.vertexLayers = [];
  if (!mesh.faceLayers) mesh.faceLayers = [];
  if (!mesh.groups?.length) {
    mesh.groups = [{ name: 'Group 1', faces: [], color: '#6f9df6' }];
  }
  if (!mesh.materials?.length) {
    mesh.materials = [{ name: 'Material 1', color: '#6f9df6', opacity: 0.9 }];
  }
  if (!mesh.bones) mesh.bones = [];

  return {
    version: PROJECT_VERSION,
    mesh,
    sceneGraph: raw.sceneGraph ?? new SceneGraph().toJSON(),
    editor: {
      vp2d: raw.editor?.vp2d ?? {
        top: { pan: { x: 240, y: 240 }, zoom: 1 },
        front: { pan: { x: 240, y: 240 }, zoom: 1 },
        side: { pan: { x: 240, y: 240 }, zoom: 1 },
      },
      wireframe: raw.editor?.wireframe ?? false,
      flatShading: raw.editor?.flatShading ?? false,
      showGrid3D: raw.editor?.showGrid3D ?? true,
      viewportLayout: raw.editor?.viewportLayout ?? 'quad',
      snapSize: raw.editor?.snapSize ?? 5,
      snapEnabled: raw.editor?.snapEnabled ?? true,
      groupSel: raw.editor?.groupSel ?? 0,
      matSel: raw.editor?.matSel ?? 0,
    },
  };
}
