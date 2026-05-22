import { create } from 'zustand';
import { SceneGraph } from '@/core/scene-graph/SceneGraph';
import { createMeshDocument, cloneMeshDocument, GROUP_COLORS, type MeshDocument, type MeshLayer } from '@/core/mesh/MeshDocument';
import { CommandHistory } from '@/core/commands/CommandHistory';
import { SnapshotCommand, type EditorSnapshot } from '@/core/commands/Command';
import { editorEvents } from '@/core/events/EventBus';
import type { PrimitiveType } from '@/systems/mesh/primitives';
import { createPrimitiveMeshDocument } from '@/systems/mesh/primitiveFromBounds';
import { createPrimDrawState, type PrimDrawState } from '@/systems/mesh/primDraw';
import { canCommitPrimDraw } from '@/hooks/primDrawHelpers';
import { enforceMinSize } from '@/core/math/BoundingBox';
import * as meshOps from '@/systems/mesh/meshOperations';
import { exportOBJ, exportSTL, exportPLY, exportGLTF } from '@/systems/export/exporters';
import { serializeProject, type ProjectFileV2 } from '@/systems/io/projectFormat';
import {
  defaultProjectName,
  downloadText,
  saveTextWithPicker,
} from '@/systems/io/fileAccess';
import { PROJECT_EXTENSION, PROJECT_MIME } from '@/systems/io/projectFormat';
import { importFile } from '@/systems/import/importRouter';
import {
  addMeshToScene,
  cloneMeshesRecord,
  getMeshForNode,
  getMeshNodes,
  getNodeForMeshId,
  meshesFromArray,
  meshesToArray,
  nextObjectName,
  removeMeshFromScene,
  sceneWorldBounds,
  type MeshesRecord,
} from '@/systems/scene/sceneObjectHelpers';
import {
  pickSceneObject2D,
  pickSceneObject3D,
  toggleNodeSelection,
} from '@/systems/scene/scenePick';
import { frame2DViewports, frame2DViewportsFromBounds } from '@/systems/viewport/viewportFrame';
import type { View2DKey } from '@/core/math/projection';
import type { ViewportLayoutId } from '@/systems/viewport/viewportLayout';
import {
  createLayer,
  editableFaceIndices,
  editableVertexIndices,
  ensureLayerData,
  visibleFaceIndices,
  visibleVertexIndices,
} from '@/systems/layers/layerSystem';
import {
  applyClickSelection2D,
  boxSelect2D,
  effectiveSelectionMode,
  getDeleteTargets,
  hasDeletableSelection,
  isAdditiveSelection,
  type ScreenRect,
  parseEdgeKey,
  uniqueMeshEdges,
  type EdgeKey,
  type SelectionMode,
} from '@/systems/selection/selectionSystem';
import { applyClickSelection3D, boxSelect3D } from '@/systems/viewport/pick3D';
import { clampSnapSize, snapScalar } from '@/systems/viewport/snapGrid';
import * as THREE from 'three';

export type ToolId =
  | 'select'
  | 'move'
  | 'rotate'
  | 'scale'
  | 'extrude'
  | 'bevel'
  | 'inset'
  | 'vertex'
  | 'face';
export type FaceDrawMode = 'none' | 'tri' | 'quad';

export type LayerState = MeshLayer;

export const TOOL_HINTS: Record<ToolId, string> = {
  select: 'Face/Edge/Vertex mode · Click pick · Drag box = marquee · Shift/Ctrl = add',
  move: 'Select verts/edges/faces first · Drag anywhere to move · Side panel Move also works',
  rotate: 'Click = select · Drag = rotate selection around its center',
  scale: 'Click = select · Drag = scale selection around its center',
  extrude: 'Shift/Ctrl+click = add/remove face · Shift/Ctrl+box = multi-select · Drag selected face to extrude',
  bevel: 'Shift/Ctrl+click = add/remove edge · Shift/Ctrl+box = multi-select · Drag selected edge to bevel',
  inset: 'Shift/Ctrl+click = add/remove face · Shift/Ctrl+box = multi-select · Drag selected face to inset',
  vertex: 'Click to chain vertices (Tris/Quads auto-face) · click first again to close · drag to move',
  face: 'Click vertices in order · Tri/Quad auto-fills · None waits until first vertex is clicked again',
};

export const MODE_HINTS: Record<SelectionMode, string> = {
  object: 'Object mode: click layer scenes to select · Move/Rotate/Scale transforms the whole layer scene',
  vertex: 'Vertex mode: click to chain/build mesh · drag to move · Shift/Ctrl = add/remove from selection',
  edge: 'Edge mode: select and transform connected edge endpoints',
  face: 'Click face to select · Drag box = marquee multi-select · Shift/Ctrl add/remove',
};

export interface Viewport2DState {
  pan: { x: number; y: number };
  zoom: number;
}

export interface ModalState {
  open: boolean;
  title: string;
  fields: { id: string; label: string; type: 'text' | 'color'; value: string }[];
  onConfirm: (values: Record<string, string>) => void;
}

interface EditorState {
  meshes: MeshesRecord;
  activeMeshId: string;
  selectedNodeIds: Set<string>;
  sceneGraph: SceneGraph;
  history: CommandHistory;

  tool: ToolId;
  selectionMode: SelectionMode;
  snapSize: number;
  snapEnabled: boolean;
  faceDrawMode: FaceDrawMode;
  /** When true, Fill Hole adds front + back faces (visible from both sides). */
  fillHoleDoubleSided: boolean;
  wipFace: number[];
  groupSel: number;
  matSel: number;
  wireframe: boolean;
  flatShading: boolean;
  showGrid3D: boolean;
  layers: LayerState[];
  activeLayer: number;

  selVerts: Set<number>;
  selEdges: Set<EdgeKey>;
  selFaces: Set<number>;
  activeVP: View2DKey | '3d';
  /** When set, that viewport fills the workspace; null = use viewportLayout. */
  maximizedVP: View2DKey | '3d' | null;
  viewportLayout: ViewportLayoutId;
  vp2d: Record<View2DKey, Viewport2DState>;
  renderTick: number;
  primDraw: PrimDrawState | null;

  modal: ModalState | null;
  projectFileName: string | null;
  projectDirty: boolean;

  getSnapshot: () => EditorSnapshot;
  applySnapshot: (s: EditorSnapshot) => void;
  runCommand: (name: string, mutate: () => void) => void;
  notifyChange: (opts?: { markDirty?: boolean }) => void;

  setTool: (t: ToolId) => void;
  setFaceDrawMode: (mode: FaceDrawMode) => void;
  setFillHoleDoubleSided: (enabled: boolean) => void;
  setSelectionMode: (mode: SelectionMode) => void;
  snap: (v: number) => number;
  undo: () => void;
  redo: () => void;
  newScene: () => void;
  openProjectFromFile: (file: File) => Promise<void>;
  importMeshFromFile: (file: File) => Promise<void>;
  saveProject: () => Promise<void>;
  saveProjectAs: () => Promise<void>;
  centerAllViews: () => void;
  applyProject: (project: ProjectFileV2, fileName: string | null) => void;

  getActiveMesh: () => MeshDocument;
  setActiveMesh: (meshId: string) => void;
  selectSceneNode: (nodeId: string, shiftKey?: boolean, ctrlKey?: boolean) => void;
  setSelectedNodeIds: (ids: Set<string>) => void;
  deleteSelectedObjects: () => void;
  duplicateSelectedObjects: () => void;
  renameSceneNode: (nodeId: string, name: string) => void;
  toggleSceneNodeVisible: (nodeId: string) => void;
  toggleSceneNodeLocked: (nodeId: string) => void;
  getMeshForNode: (nodeId: string) => MeshDocument | null;
  applyObjectClickSelection: (
    vpKey: View2DKey | '3d',
    sx: number,
    sy: number,
    shiftKey: boolean,
    ctrlKey?: boolean,
    camera?: THREE.PerspectiveCamera,
    canvas?: HTMLCanvasElement,
  ) => void;

  selectAll: () => void;
  deselectAll: () => void;
  invertSelection: () => void;
  deleteSelected: () => void;

  startPrimDraw: (type: PrimitiveType) => void;
  cancelPrimDraw: () => void;
  setPrimDraw: (draw: PrimDrawState | null) => void;
  commitPrimDraw: () => void;
  weldVerts: (thresh?: number) => void;
  weldAll: () => void;
  snapToGrid: () => void;
  averageVerts: () => void;
  flipNormals: () => void;
  fillHole: () => void;
  subdivide: () => void;
  triangulateFaces: () => void;
  extrudeFaces: () => void;
  bevelEdges: () => void;
  insetFaces: () => void;
  smoothMesh: () => void;

  applyMove: (dx: number, dy: number, dz: number) => void;
  applyRotate: (rx: number, ry: number, rz: number) => void;
  applyScale: (sx: number, sy: number, sz: number) => void;

  toggleWireframe: () => void;
  toggleFlat: () => void;
  toggleGrid3D: () => void;
  setShowGrid3D: (visible: boolean) => void;
  frameAll: () => void;
  resetViews: () => void;

  addGroup: () => void;
  renameGroup: () => void;
  assignGroup: () => void;
  deleteGroup: () => void;
  setGroupSel: (i: number) => void;

  addMaterial: () => void;
  editMaterial: () => void;
  assignMaterial: () => void;
  setMaterialName: (name: string) => void;
  setMaterialColor: (color: string) => void;
  pickPaletteColor: (color: string) => void;
  applyMaterialToSelection: (materialIndex?: number) => void;
  setMatSel: (i: number) => void;

  addBone: () => void;
  deleteBone: () => void;

  addLayer: () => void;
  renameLayer: (index?: number) => void;
  renameLayerInline: (index: number, name: string) => void;
  setLayerColor: (index: number, color: string) => void;
  deleteLayer: (index?: number) => void;
  setActiveLayer: (index: number) => void;
  toggleLayerVisible: (index: number) => void;
  toggleLayerLocked: (index: number) => void;
  assignSelectionToLayer: () => void;
  reorderLayer: (from: number, to: number) => void;
  moveLayerUp: () => void;
  moveLayerDown: () => void;

  exportOBJ: () => void;
  exportSTL: () => void;
  exportPLY: () => void;
  exportGLTF: () => void;
  markProjectSaved: (fileName: string | null) => void;

  showModal: (modal: Omit<ModalState, 'open'>) => void;
  closeModal: () => void;

  applyClickSelection: (
    vpKey: View2DKey,
    sx: number,
    sy: number,
    shiftKey: boolean,
    ctrlKey?: boolean,
  ) => void;
  applyBoxSelection: (vpKey: View2DKey, rect: ScreenRect, shiftKey: boolean, ctrlKey?: boolean) => void;
  applyClickSelection3D: (
    camera: THREE.PerspectiveCamera,
    canvas: HTMLCanvasElement,
    sx: number,
    sy: number,
    shiftKey: boolean,
    ctrlKey?: boolean,
  ) => void;
  applyBoxSelection3D: (
    camera: THREE.PerspectiveCamera,
    canvas: HTMLCanvasElement,
    rect: ScreenRect,
    shiftKey: boolean,
    ctrlKey?: boolean,
  ) => void;
  setSelVerts: (s: Set<number>) => void;
  setSelEdges: (s: Set<EdgeKey>) => void;
  setSelFaces: (s: Set<number>) => void;
  selectedTransformVerts: () => Set<number>;
  setWipFace: (w: number[]) => void;
  setActiveVP: (vp: View2DKey | '3d') => void;
  setViewportLayout: (layout: ViewportLayoutId) => void;
  toggleViewportMaximize: () => void;
  setVp2d: (key: View2DKey, partial: Partial<Viewport2DState>) => void;
  setSnapSize: (n: number) => void;
  setSnapEnabled: (b: boolean) => void;
  bumpRender: () => void;
}

const defaultVp2d = (): Record<View2DKey, Viewport2DState> => ({
  top: { pan: { x: 240, y: 240 }, zoom: 1 },
  front: { pan: { x: 240, y: 240 }, zoom: 1 },
  side: { pan: { x: 240, y: 240 }, zoom: 1 },
});

function syncLayerStateFromMesh(mesh: MeshDocument): { layers: LayerState[]; activeLayer: number } {
  ensureLayerData(mesh);
  return {
    layers: mesh.layers,
    activeLayer: Math.max(0, mesh.layers.findIndex((l) => l.id === mesh.activeLayerId)),
  };
}

function commitActiveMesh(mesh: MeshDocument): void {
  useEditorStore.setState((s) => ({
    meshes: { ...s.meshes, [mesh.id]: mesh },
    ...syncLayerStateFromMesh(mesh),
  }));
}

function createInitialState(): Pick<
  EditorState,
  | 'meshes'
  | 'activeMeshId'
  | 'selectedNodeIds'
  | 'sceneGraph'
  | 'history'
  | 'selVerts'
  | 'selEdges'
  | 'selFaces'
  | 'vp2d'
  | 'layers'
  | 'activeLayer'
> {
  const mesh = createMeshDocument();
  ensureLayerData(mesh);
  const sceneGraph = new SceneGraph();
  const meshes: MeshesRecord = { [mesh.id]: mesh };
  addMeshToScene(sceneGraph, meshes, mesh);
  const layerState = syncLayerStateFromMesh(mesh);
  return {
    meshes,
    activeMeshId: mesh.id,
    selectedNodeIds: new Set(),
    sceneGraph,
    history: new CommandHistory(50),
    selVerts: new Set(),
    selEdges: new Set(),
    selFaces: new Set(),
    vp2d: defaultVp2d(),
    ...layerState,
  };
}

export const useEditorStore = create<EditorState>((set, get) => ({
  ...createInitialState(),
  tool: 'select',
  selectionMode: 'object',
  snapSize: 5,
  snapEnabled: true,
  faceDrawMode: 'tri',
  fillHoleDoubleSided: false,
  wipFace: [],
  groupSel: 0,
  matSel: 0,
  wireframe: false,
  flatShading: false,
  showGrid3D: true,
  activeVP: 'top',
  maximizedVP: null,
  viewportLayout: 'quad',
  renderTick: 0,
  primDraw: null,
  modal: null,
  projectFileName: null,
  projectDirty: false,

  getSnapshot: () => ({
    meshes: cloneMeshesRecord(get().meshes),
    activeMeshId: get().activeMeshId,
    selectedNodeIds: [...get().selectedNodeIds],
    sceneGraph: get().sceneGraph.toJSON(),
  }),

  applySnapshot: (s) => {
    const sceneGraph = SceneGraph.fromJSON(s.sceneGraph);
    const meshes = cloneMeshesRecord(s.meshes);
    const activeMeshId = meshes[s.activeMeshId] ? s.activeMeshId : Object.keys(meshes)[0] ?? '';
    const mesh = meshes[activeMeshId];
    if (mesh) ensureLayerData(mesh);
    const layerState = mesh ? syncLayerStateFromMesh(mesh) : { layers: [], activeLayer: 0 };
    set({
      meshes,
      activeMeshId,
      selectedNodeIds: new Set(s.selectedNodeIds),
      sceneGraph,
      ...layerState,
      selVerts: new Set(),
      selEdges: new Set(),
      selFaces: new Set(),
      wipFace: [],
    });
  },

  getActiveMesh: () => {
    const { meshes, activeMeshId } = get();
    const mesh = meshes[activeMeshId];
    if (!mesh) throw new Error('No active mesh');
    return mesh;
  },

  setActiveMesh: (meshId) => {
    const mesh = get().meshes[meshId];
    if (!mesh) return;
    const node = getNodeForMeshId(get().sceneGraph, meshId);
    set({
      activeMeshId: meshId,
      selectedNodeIds: node ? new Set([node.id]) : new Set(),
      ...syncLayerStateFromMesh(mesh),
      selVerts: new Set(),
      selEdges: new Set(),
      selFaces: new Set(),
      wipFace: [],
    });
    editorEvents.emit('selection:changed', undefined);
    get().notifyChange();
  },

  getMeshForNode: (nodeId) => {
    const node = get().sceneGraph.getNode(nodeId);
    if (!node) return null;
    return getMeshForNode(get().meshes, node);
  },

  setSelectedNodeIds: (ids) => {
    set({ selectedNodeIds: ids });
    editorEvents.emit('selection:changed', undefined);
    get().notifyChange();
  },

  selectSceneNode: (nodeId, shiftKey = false, ctrlKey = false) => {
    const node = get().sceneGraph.getNode(nodeId);
    if (!node || node.type !== 'mesh' || !node.meshId) return;
    const nextIds = toggleNodeSelection(get().selectedNodeIds, nodeId, shiftKey, ctrlKey);
    const mesh = get().meshes[node.meshId];
    if (!mesh) return;
    set({
      selectedNodeIds: nextIds,
      activeMeshId: node.meshId,
      ...syncLayerStateFromMesh(mesh),
      selVerts: new Set(),
      selEdges: new Set(),
      selFaces: new Set(),
      wipFace: [],
    });
    editorEvents.emit('selection:changed', undefined);
    get().notifyChange();
  },

  applyObjectClickSelection: (vpKey, sx, sy, shiftKey, ctrlKey = false, camera, canvas) => {
    const state = get();
    let nodeId: string | null = null;
    if (vpKey === '3d' && camera && canvas) {
      const raycaster = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      nodeId = pickSceneObject3D(
        state.sceneGraph,
        state.meshes,
        state.activeMeshId,
        state.selectedNodeIds,
        camera,
        canvas,
        raycaster,
        ndc,
        sx,
        sy,
      );
    } else if (vpKey !== '3d') {
      nodeId = pickSceneObject2D(
        state.sceneGraph,
        state.meshes,
        state.activeMeshId,
        state.selectedNodeIds,
        vpKey,
        state.vp2d[vpKey].pan,
        state.vp2d[vpKey].zoom,
        sx,
        sy,
      );
    }
    if (nodeId) {
      state.selectSceneNode(nodeId, shiftKey, ctrlKey);
    } else if (!isAdditiveSelection(shiftKey, ctrlKey)) {
      set({ selectedNodeIds: new Set(), selVerts: new Set(), selEdges: new Set(), selFaces: new Set() });
      editorEvents.emit('selection:changed', undefined);
      get().notifyChange();
    }
  },

  deleteSelectedObjects: () => {
    const { selectedNodeIds, sceneGraph } = get();
    const nodeIds = [...selectedNodeIds].filter((id) => sceneGraph.getNode(id)?.type === 'mesh');
    if (nodeIds.length === 0) return;
    get().runCommand('Delete Object', () => {
      const st = get();
      const meshes = { ...st.meshes };
      const sg = SceneGraph.fromJSON(st.sceneGraph.toJSON());
      nodeIds.forEach((id) => removeMeshFromScene(sg, meshes, id));
      let activeMeshId = st.activeMeshId;
      if (!meshes[activeMeshId]) {
        const remaining = getMeshNodes(sg);
        activeMeshId = remaining[0]?.meshId ?? '';
      }
      const mesh = meshes[activeMeshId];
      set({
        meshes,
        sceneGraph: sg,
        activeMeshId,
        selectedNodeIds: new Set(),
        ...(mesh ? syncLayerStateFromMesh(mesh) : { layers: [], activeLayer: 0 }),
        selVerts: new Set(),
        selEdges: new Set(),
        selFaces: new Set(),
        wipFace: [],
      });
    });
  },

  duplicateSelectedObjects: () => {
    const { selectedNodeIds, sceneGraph } = get();
    const nodeIds = [...selectedNodeIds].filter((id) => sceneGraph.getNode(id)?.type === 'mesh');
    if (nodeIds.length === 0) return;
    get().runCommand('Duplicate', () => {
      const st = get();
      const newMeshes = { ...st.meshes };
      const sg = SceneGraph.fromJSON(st.sceneGraph.toJSON());
      const newSel = new Set<string>();
      let lastMeshId = st.activeMeshId;
      nodeIds.forEach((id) => {
        const node = sg.getNode(id);
        if (!node?.meshId) return;
        const src = st.meshes[node.meshId];
        if (!src) return;
        const copy = cloneMeshDocument(src);
        copy.name = nextObjectName(sg, newMeshes, src.name);
        const { nodeId, meshId } = addMeshToScene(sg, newMeshes, copy, {
          position: {
            x: node.transform.position.x + st.snapSize,
            y: node.transform.position.y,
            z: node.transform.position.z + st.snapSize,
          },
          rotation: { ...node.transform.rotation },
          scale: { ...node.transform.scale },
        });
        newSel.add(nodeId);
        lastMeshId = meshId;
      });
      const mesh = newMeshes[lastMeshId];
      set({
        meshes: newMeshes,
        sceneGraph: sg,
        activeMeshId: lastMeshId,
        selectedNodeIds: newSel,
        ...(mesh ? syncLayerStateFromMesh(mesh) : {}),
        selVerts: new Set(),
        selEdges: new Set(),
        selFaces: new Set(),
      });
    });
  },

  renameSceneNode: (nodeId, name) => {
    const node = get().sceneGraph.getNode(nodeId);
    if (!node) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    node.name = trimmed;
    if (node.meshId && get().meshes[node.meshId]) {
      get().meshes[node.meshId].name = trimmed;
    }
    get().notifyChange();
  },

  toggleSceneNodeVisible: (nodeId) => {
    const node = get().sceneGraph.getNode(nodeId);
    if (!node) return;
    node.visible = !node.visible;
    get().notifyChange();
  },

  toggleSceneNodeLocked: (nodeId) => {
    const node = get().sceneGraph.getNode(nodeId);
    if (!node) return;
    node.locked = !node.locked;
    get().notifyChange();
  },

  notifyChange: (opts) => {
    set((s) => ({
      renderTick: s.renderTick + 1,
      projectDirty: opts?.markDirty === false ? s.projectDirty : true,
    }));
    editorEvents.emit('scene:changed', undefined);
    editorEvents.emit('viewport:render', undefined);
  },

  runCommand: (name, mutate) => {
    const before = get().getSnapshot();
    const meshCountBefore = Object.keys(before.meshes).length;
    mutate();
    const after = get().getSnapshot();
    if (Object.keys(after.meshes).length === meshCountBefore && name.startsWith('Add ')) {
      return;
    }
    const cmd = new SnapshotCommand(name, before, after, (snap) => {
      get().applySnapshot(snap);
      get().notifyChange();
    });
    get().history.execute(cmd);
    get().notifyChange();
  },

  setTool: (t) => {
    const { wipFace } = get();
    if (wipFace.length > 0) set({ wipFace: [] });
    if (get().primDraw) set({ primDraw: null });
    set({ tool: t });
    if ((t === 'extrude' || t === 'inset') && get().selectionMode !== 'face') get().setSelectionMode('face');
    else if (t === 'bevel' && get().selectionMode !== 'edge') get().setSelectionMode('edge');
    editorEvents.emit('tool:changed', t);
    get().notifyChange();
  },

  setFaceDrawMode: (faceDrawMode) => {
    set({ faceDrawMode, wipFace: [] });
    get().notifyChange();
  },

  setFillHoleDoubleSided: (fillHoleDoubleSided) => set({ fillHoleDoubleSided }),

  setSelectionMode: (selectionMode) => {
    const mode = effectiveSelectionMode(get().tool, selectionMode);
    let tool = get().tool;
    if (mode === 'face' && (tool === 'face' || tool === 'vertex')) tool = 'select';
    if (mode === 'edge' && tool === 'vertex') tool = 'select';
    if (mode === 'vertex' && tool === 'face') tool = 'select';
    set({
      selectionMode: mode,
      tool,
      selVerts: new Set(),
      selEdges: new Set(),
      selFaces: new Set(),
      wipFace: [],
    });
    editorEvents.emit('selection:changed', undefined);
    get().notifyChange();
  },

  snap: (v) => snapScalar(v, get().snapSize, get().snapEnabled),

  undo: () => {
    if (get().history.undo()) {
      set({ selVerts: new Set(), selFaces: new Set(), wipFace: [] });
      get().notifyChange();
    }
  },

  redo: () => {
    if (get().history.redo()) {
      set({ selVerts: new Set(), selFaces: new Set(), wipFace: [] });
      get().notifyChange();
    }
  },

  markProjectSaved: (fileName) => set({ projectFileName: fileName, projectDirty: false }),

  newScene: () => {
    const msg = get().projectDirty
      ? 'Discard unsaved changes and start a new scene?'
      : 'Start a new empty scene?';
    if (!confirm(msg)) return;
    set({
      ...createInitialState(),
      history: new CommandHistory(50),
      wipFace: [],
      primDraw: null,
      groupSel: 0,
      matSel: 0,
      selectionMode: 'object',
      vp2d: defaultVp2d(),
      projectFileName: null,
      projectDirty: false,
      maximizedVP: null,
      viewportLayout: 'quad',
    });
    get().centerAllViews();
  },

  applyProject: (project: ProjectFileV2, fileName: string | null) => {
    const sceneGraph = SceneGraph.fromJSON(project.sceneGraph);
    const meshes = meshesFromArray(project.meshes);
    Object.values(meshes).forEach((m) => ensureLayerData(m));
    const activeMesh = meshes[project.activeMeshId] ?? Object.values(meshes)[0];
    set({
      meshes,
      activeMeshId: activeMesh.id,
      selectedNodeIds: new Set(),
      sceneGraph,
      history: new CommandHistory(50),
      ...syncLayerStateFromMesh(activeMesh),
      vp2d: project.editor.vp2d,
      wireframe: project.editor.wireframe,
      flatShading: project.editor.flatShading,
      showGrid3D: project.editor.showGrid3D,
      viewportLayout: project.editor.viewportLayout,
      snapSize: project.editor.snapSize,
      snapEnabled: project.editor.snapEnabled,
      groupSel: project.editor.groupSel,
      matSel: project.editor.matSel,
      selVerts: new Set(),
      selEdges: new Set(),
      selFaces: new Set(),
      wipFace: [],
      primDraw: null,
      maximizedVP: null,
      projectFileName: fileName,
      projectDirty: false,
    });
    get().centerAllViews();
  },

  openProjectFromFile: async (file) => {
    try {
      const result = await importFile(file);
      if (result.kind === 'project') {
        if (get().projectDirty && !confirm('Replace current scene? Unsaved changes will be lost.')) return;
        get().applyProject(result.project, file.name);
        return;
      }
      if (get().projectDirty && !confirm('Replace current scene with imported mesh?')) return;
      const mesh = result.mesh;
      ensureLayerData(mesh);
      const sceneGraph = new SceneGraph();
      const meshes: MeshesRecord = { [mesh.id]: mesh };
      addMeshToScene(sceneGraph, meshes, mesh);
      set({
        meshes,
        activeMeshId: mesh.id,
        selectedNodeIds: new Set(),
        sceneGraph,
        history: new CommandHistory(50),
        ...syncLayerStateFromMesh(mesh),
        selVerts: new Set(),
        selEdges: new Set(),
        selFaces: new Set(),
        projectFileName: null,
        projectDirty: true,
      });
      get().centerAllViews();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to open file');
    }
  },

  importMeshFromFile: async (file) => {
    try {
      const result = await importFile(file);
      if (result.kind === 'project') {
        alert('Use Open for .mm3d project files. Import adds geometry to the current scene.');
        return;
      }
      get().runCommand(`Import ${file.name}`, () => {
        const st = get();
        const imported = cloneMeshDocument(result.mesh);
        ensureLayerData(imported);
        imported.name = nextObjectName(st.sceneGraph, st.meshes, imported.name);
        const meshes = { ...st.meshes };
        const sg = SceneGraph.fromJSON(st.sceneGraph.toJSON());
        const { nodeId, meshId } = addMeshToScene(sg, meshes, imported);
        set({
          meshes,
          sceneGraph: sg,
          activeMeshId: meshId,
          selectedNodeIds: new Set([nodeId]),
          ...syncLayerStateFromMesh(imported),
          selVerts: new Set(),
          selEdges: new Set(),
          selFaces: new Set(),
        });
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Import failed');
    }
  },

  saveProject: async () => {
    const state = get();
    const json = serializeProject({
      meshes: meshesToArray(state.meshes),
      activeMeshId: state.activeMeshId,
      sceneGraph: state.sceneGraph.toJSON(),
      editor: {
        vp2d: state.vp2d,
        wireframe: state.wireframe,
        flatShading: state.flatShading,
        showGrid3D: state.showGrid3D,
        viewportLayout: state.viewportLayout,
        snapSize: state.snapSize,
        snapEnabled: state.snapEnabled,
        groupSel: state.groupSel,
        matSel: state.matSel,
      },
    });
    const name = state.projectFileName ?? defaultProjectName(state.getActiveMesh().name);
    const usedPicker = await saveTextWithPicker(
      json,
      name,
      PROJECT_MIME,
      'MeshMaker 3D Project',
      PROJECT_EXTENSION,
    );
    if (usedPicker || !state.projectFileName) {
      get().markProjectSaved(name);
    } else {
      downloadText(json, name, PROJECT_MIME);
      get().markProjectSaved(name);
    }
  },

  saveProjectAs: async () => {
    await get().saveProject();
  },

  centerAllViews: () => {
    const state = get();
    const bounds = sceneWorldBounds(state.sceneGraph, state.meshes);
    const mesh = state.getActiveMesh();
    set((s) => ({
      maximizedVP: null,
      viewportLayout: 'quad',
      vp2d: bounds ? frame2DViewportsFromBounds(bounds) : frame2DViewports(mesh),
      renderTick: s.renderTick + 1,
    }));
    editorEvents.emit('viewport:frame3d', bounds);
    editorEvents.emit('viewport:render', undefined);
  },

  selectAll: () => {
    const { selectionMode, sceneGraph } = get();
    if (selectionMode === 'object') {
      const ids = new Set(getMeshNodes(sceneGraph).map((n) => n.id));
      set({ selectedNodeIds: ids });
      get().notifyChange();
      return;
    }
    const mesh = get().getActiveMesh();
    const visibleVerts = visibleVertexIndices(mesh);
    const visibleFaces = visibleFaceIndices(mesh);
    set({
      selVerts: selectionMode === 'face' ? new Set() : visibleVerts,
      selEdges:
        selectionMode === 'edge'
          ? new Set(
              uniqueMeshEdges(mesh).filter((edge) => {
                const [a, b] = parseEdgeKey(edge);
                return visibleVerts.has(a) && visibleVerts.has(b);
              }),
            )
          : new Set(),
      selFaces: selectionMode === 'vertex' || selectionMode === 'edge' ? new Set() : visibleFaces,
    });
    get().notifyChange();
  },

  deselectAll: () => {
    set({ selVerts: new Set(), selEdges: new Set(), selFaces: new Set(), selectedNodeIds: new Set(), wipFace: [] });
    get().notifyChange();
  },

  invertSelection: () => {
    const { selVerts, selEdges, selFaces, selectionMode, sceneGraph } = get();
    if (selectionMode === 'object') {
      const all = new Set(getMeshNodes(sceneGraph).map((n) => n.id));
      const next = new Set([...all].filter((id) => !get().selectedNodeIds.has(id)));
      set({ selectedNodeIds: next });
      get().notifyChange();
      return;
    }
    const mesh = get().getActiveMesh();
    const visibleVerts = visibleVertexIndices(mesh);
    const visibleFaces = visibleFaceIndices(mesh);
    const allEdges = uniqueMeshEdges(mesh).filter((edge) => {
      const [a, b] = parseEdgeKey(edge);
      return visibleVerts.has(a) && visibleVerts.has(b);
    });
    set({
      selVerts:
        selectionMode === 'vertex'
          ? new Set([...visibleVerts].filter((i) => !selVerts.has(i)))
          : new Set(),
      selEdges: selectionMode === 'edge' ? new Set(allEdges.filter((edge) => !selEdges.has(edge))) : new Set(),
      selFaces:
        selectionMode === 'face'
          ? new Set([...visibleFaces].filter((i) => !selFaces.has(i)))
          : new Set(),
    });
    get().notifyChange();
  },

  deleteSelected: () => {
    const state = get();
    const mode = effectiveSelectionMode(state.tool, state.selectionMode);
    if (mode === 'object' && state.selectedNodeIds.size > 0) {
      state.deleteSelectedObjects();
      return;
    }
    const mesh = state.getActiveMesh();
    const targets = getDeleteTargets(mesh, mode, state.selVerts, state.selEdges, state.selFaces);
    if (!hasDeletableSelection(targets)) return;

    get().runCommand('Delete', () => {
      meshOps.deleteSelection(get().getActiveMesh(), targets.verts, targets.faces);
      set({ selVerts: new Set(), selEdges: new Set(), selFaces: new Set(), wipFace: [] });
      editorEvents.emit('selection:changed', undefined);
    });
  },

  startPrimDraw: (type) => {
    set({
      primDraw: createPrimDrawState(type),
      tool: 'select',
      selectionMode: 'object',
    });
    get().notifyChange();
  },

  cancelPrimDraw: () => {
    set({ primDraw: null });
    get().notifyChange();
  },

  setPrimDraw: (draw) => {
    set({ primDraw: draw });
    get().notifyChange();
  },

  commitPrimDraw: () => {
    const { primDraw, snapSize } = get();
    if (!primDraw || !canCommitPrimDraw(primDraw, snapSize)) return;

    const type = primDraw.type;
    const baseView = primDraw.baseView;
    const bounds = enforceMinSize(primDraw.bounds, snapSize);
    const label = type.charAt(0).toUpperCase() + type.slice(1);

    get().runCommand(`Add ${label}`, () => {
      const st = get();
      const name = nextObjectName(st.sceneGraph, st.meshes, 'Layer Scene');
      const { mesh, worldCenter } = createPrimitiveMeshDocument(type, bounds, baseView, name);
      if (mesh.vertices.length === 0 || mesh.faces.length === 0) return;

      const newMeshes = { ...st.meshes };
      const sg = SceneGraph.fromJSON(st.sceneGraph.toJSON());
      const { nodeId, meshId } = addMeshToScene(sg, newMeshes, mesh, { position: worldCenter }, name);
      set({
        primDraw: null,
        meshes: newMeshes,
        sceneGraph: sg,
        activeMeshId: meshId,
        selectedNodeIds: new Set([nodeId]),
        ...syncLayerStateFromMesh(mesh),
        selVerts: new Set(),
        selEdges: new Set(),
        selFaces: new Set(),
      });
    });
    get().notifyChange();
  },

  weldVerts: (thresh = 4) => get().runCommand('Weld', () => meshOps.weldVertices(get().getActiveMesh(), thresh)),
  weldAll: () => get().weldVerts(5),
  snapToGrid: () =>
    get().runCommand('Snap', () => {
      meshOps.snapVerticesToGrid(get().getActiveMesh(), get().selectedTransformVerts(), get().snap);
    }),
  averageVerts: () => get().runCommand('Average', () => meshOps.averageVertices(get().getActiveMesh(), get().selectedTransformVerts())),
  flipNormals: () => get().runCommand('Flip Normals', () => meshOps.flipNormals(get().getActiveMesh(), get().selFaces)),
  fillHole: () => {
    let created: number[] | null = null as number[] | null;
    const doubleSided = get().fillHoleDoubleSided;
    get().runCommand(doubleSided ? 'Fill Hole (double-sided)' : 'Fill Hole', () => {
      const st = get();
      created = meshOps.fillHole(st.getActiveMesh(), st.selVerts, st.selEdges, st.groupSel, doubleSided);
    });
    if (created !== null && created.length > 0) {
      set({
        selFaces: new Set(created),
        selVerts: new Set(),
        selEdges: new Set(),
        wipFace: [],
      });
      editorEvents.emit('selection:changed', undefined);
      get().notifyChange();
    }
  },
  subdivide: () => get().runCommand('Subdivide', () => meshOps.subdivide(get().getActiveMesh(), get().selFaces, get().groupSel)),
  triangulateFaces: () =>
    get().runCommand('Triangulate', () => meshOps.triangulate(get().getActiveMesh(), get().selFaces, get().groupSel)),
  extrudeFaces: () =>
    get().runCommand('Extrude', () => meshOps.extrudeFaces(get().getActiveMesh(), get().selFaces, get().groupSel, 12)),
  bevelEdges: () =>
    get().runCommand('Bevel', () =>
      meshOps.bevelEdges(get().getActiveMesh(), get().selEdges, 2, get().groupSel),
    ),
  insetFaces: () =>
    get().runCommand('Inset', () => meshOps.insetFaces(get().getActiveMesh(), get().selFaces, get().groupSel, 0.12)),
  smoothMesh: () => get().runCommand('Smooth', () => meshOps.smoothMesh(get().getActiveMesh(), get().selectedTransformVerts())),

  applyMove: (dx, dy, dz) => {
    const state = get();
    if (state.selectionMode === 'object' && state.selectedNodeIds.size > 0) {
      get().runCommand('Move Object', () => {
        state.selectedNodeIds.forEach((id) => {
          const node = get().sceneGraph.getNode(id);
          if (node?.type === 'mesh') {
            node.transform.position.x += dx;
            node.transform.position.y += dy;
            node.transform.position.z += dz;
          }
        });
      });
      return;
    }
    const selected = state.selectedTransformVerts();
    if (selected.size === 0) return;
    get().runCommand('Move', () => {
      const mesh = get().getActiveMesh();
      selected.forEach((vi) => {
        mesh.vertices[vi].x += dx;
        mesh.vertices[vi].y += dy;
        mesh.vertices[vi].z += dz;
      });
    });
  },

  applyRotate: (rx, ry, rz) => {
    const state = get();
    if (state.selectionMode === 'object' && state.selectedNodeIds.size > 0) {
      get().runCommand('Rotate Object', () => {
        state.selectedNodeIds.forEach((id) => {
          const node = get().sceneGraph.getNode(id);
          if (node?.type === 'mesh') {
            node.transform.rotation.x += rx;
            node.transform.rotation.y += ry;
            node.transform.rotation.z += rz;
          }
        });
      });
      return;
    }
    const selected = state.selectedTransformVerts();
    if (selected.size === 0) return;
    get().runCommand('Rotate', () => {
      const mesh = get().getActiveMesh();
      const tgt = [...selected];
      const rxr = (rx * Math.PI) / 180,
        ryr = (ry * Math.PI) / 180,
        rzr = (rz * Math.PI) / 180;
      tgt.forEach((vi) => {
        let { x, y, z } = mesh.vertices[vi];
        let ny = y * Math.cos(rxr) - z * Math.sin(rxr),
          nz = y * Math.sin(rxr) + z * Math.cos(rxr);
        y = ny;
        z = nz;
        let nx = x * Math.cos(ryr) + z * Math.sin(ryr);
        nz = -x * Math.sin(ryr) + z * Math.cos(ryr);
        x = nx;
        z = nz;
        nx = x * Math.cos(rzr) - y * Math.sin(rzr);
        ny = x * Math.sin(rzr) + y * Math.cos(rzr);
        mesh.vertices[vi] = { x: nx, y: ny, z };
      });
    });
  },

  applyScale: (sx, sy, sz) => {
    const state = get();
    if (state.selectionMode === 'object' && state.selectedNodeIds.size > 0) {
      get().runCommand('Scale Object', () => {
        state.selectedNodeIds.forEach((id) => {
          const node = get().sceneGraph.getNode(id);
          if (node?.type === 'mesh') {
            node.transform.scale.x *= sx;
            node.transform.scale.y *= sy;
            node.transform.scale.z *= sz;
          }
        });
      });
      return;
    }
    const selected = state.selectedTransformVerts();
    if (selected.size === 0) return;
    get().runCommand('Scale', () => {
      const mesh = get().getActiveMesh();
      selected.forEach((vi) => {
        mesh.vertices[vi].x *= sx;
        mesh.vertices[vi].y *= sy;
        mesh.vertices[vi].z *= sz;
      });
    });
  },

  toggleWireframe: () => {
    set((s) => ({ wireframe: !s.wireframe }));
    get().notifyChange();
  },
  toggleFlat: () => {
    set((s) => ({ flatShading: !s.flatShading }));
    get().notifyChange();
  },
  toggleGrid3D: () => {
    set((s) => ({ showGrid3D: !s.showGrid3D }));
    get().notifyChange();
  },
  setShowGrid3D: (visible) => {
    set({ showGrid3D: visible });
    get().notifyChange();
  },
  resetViews: () => {
    get().centerAllViews();
  },

  frameAll: () => {
    const state = get();
    const bounds = sceneWorldBounds(state.sceneGraph, state.meshes);
    const mesh = state.getActiveMesh();
    set((s) => ({
      vp2d: bounds ? frame2DViewportsFromBounds(bounds) : frame2DViewports(mesh),
      renderTick: s.renderTick + 1,
    }));
    editorEvents.emit('viewport:frame3d', bounds);
    editorEvents.emit('viewport:render', undefined);
  },

  addGroup: () => {
    const mesh = get().getActiveMesh();
    mesh.groups.push({
      name: `Group${mesh.groups.length + 1}`,
      faces: [],
      color: GROUP_COLORS[mesh.groups.length % GROUP_COLORS.length],
    });
    set({ groupSel: mesh.groups.length - 1 });
    get().notifyChange();
  },

  renameGroup: () => {
    const mesh = get().getActiveMesh();
    const { groupSel } = get();
    get().showModal({
      title: 'Rename Group',
      fields: [{ id: 'name', label: 'Name', type: 'text', value: mesh.groups[groupSel].name }],
      onConfirm: (vals) => {
        mesh.groups[groupSel].name = vals.name || mesh.groups[groupSel].name;
        get().notifyChange();
      },
    });
  },

  assignGroup: () => {
    const mesh = get().getActiveMesh();
    const { selFaces, groupSel } = get();
    selFaces.forEach((fi) => {
      mesh.groups.forEach((g) => {
        g.faces = g.faces.filter((f) => f !== fi);
      });
      mesh.groups[groupSel].faces.push(fi);
    });
    get().notifyChange();
  },

  deleteGroup: () => {
    const mesh = get().getActiveMesh();
    if (mesh.groups.length <= 1) return;
    mesh.groups.splice(get().groupSel, 1);
    set({ groupSel: 0 });
    get().notifyChange();
  },

  setGroupSel: (i) => set({ groupSel: i }),

  addMaterial: () => {
    const mesh = get().getActiveMesh();
    mesh.materials.push({
      name: `Mat${mesh.materials.length + 1}`,
      color: GROUP_COLORS[mesh.materials.length % GROUP_COLORS.length],
      opacity: 0.9,
    });
    set({ matSel: mesh.materials.length - 1 });
    get().notifyChange();
  },

  editMaterial: () => {
    const mesh = get().getActiveMesh();
    const { matSel } = get();
    const m = mesh.materials[matSel];
    get().showModal({
      title: 'Edit Material',
      fields: [
        { id: 'name', label: 'Name', type: 'text', value: m.name },
        { id: 'color', label: 'Color', type: 'color', value: m.color },
      ],
      onConfirm: (vals) => {
        mesh.materials[matSel].name = vals.name;
        mesh.materials[matSel].color = vals.color;
        get().notifyChange();
      },
    });
  },

  assignMaterial: () => get().applyMaterialToSelection(),

  setMaterialName: (name) => {
    const mesh = get().getActiveMesh();
    const { matSel } = get();
    const m = mesh.materials[matSel];
    if (!m) return;
    m.name = name.trim() || m.name;
    get().notifyChange();
  },

  setMaterialColor: (color) => {
    const mesh = get().getActiveMesh();
    const { matSel } = get();
    const m = mesh.materials[matSel];
    if (!m) return;
    get().runCommand('Material Color', () => {
      m.color = color;
    });
  },

  pickPaletteColor: (color) => {
    const mesh = get().getActiveMesh();
    const { matSel, selFaces, groupSel } = get();
    const m = mesh.materials[matSel];
    if (!m) return;
    get().runCommand(selFaces.size > 0 ? 'Paint Faces' : 'Material Color', () => {
      m.color = color;
      if (selFaces.size > 0) {
        mesh.groups[groupSel].color = color;
      }
    });
  },

  applyMaterialToSelection: (materialIndex) => {
    const mesh = get().getActiveMesh();
    const { selFaces, groupSel } = get();
    if (selFaces.size === 0) return;
    const idx = materialIndex ?? get().matSel;
    const m = mesh.materials[idx];
    if (!m) return;
    set({ matSel: idx });
    get().runCommand('Assign Material', () => {
      mesh.groups[groupSel].color = m.color;
    });
  },

  setMatSel: (i) => set({ matSel: i }),

  addBone: () => {
    const mesh = get().getActiveMesh();
    mesh.bones.push({ name: `Bone${mesh.bones.length + 1}`, pos: { x: 0, y: 0, z: 0 } });
    get().sceneGraph.addBoneNode(mesh.bones[mesh.bones.length - 1].name);
    get().notifyChange();
  },

  deleteBone: () => {
    const mesh = get().getActiveMesh();
    if (mesh.bones.length) {
      mesh.bones.pop();
      get().notifyChange();
    }
  },

  addLayer: () => {
    const mesh = get().getActiveMesh();
    ensureLayerData(mesh);
    const layers = [...mesh.layers, createLayer(`Layer ${mesh.layers.length + 1}`, mesh.layers.length)];
    mesh.layers = layers;
    mesh.activeLayerId = layers[layers.length - 1].id;
    commitActiveMesh(mesh);
    get().notifyChange();
  },

  renameLayer: (index = get().activeLayer) => {
    const layer = get().layers[index];
    if (!layer) return;
    get().showModal({
      title: 'Rename Layer',
      fields: [{ id: 'name', label: 'Name', type: 'text', value: layer.name }],
      onConfirm: (vals) => {
        get().renameLayerInline(index, vals.name);
      },
    });
  },

  renameLayerInline: (index, name) => {
    const layer = get().layers[index];
    if (!layer) return;
    const mesh = get().getActiveMesh();
    const layers = [...mesh.layers];
    layers[index] = { ...layer, name: name.trim() || layer.name };
    mesh.layers = layers;
    commitActiveMesh(mesh);
    get().notifyChange();
  },

  setLayerColor: (index, color) => {
    const layer = get().layers[index];
    if (!layer) return;
    const mesh = get().getActiveMesh();
    const layers = [...mesh.layers];
    layers[index] = { ...layer, color };
    mesh.layers = layers;
    commitActiveMesh(mesh);
    get().notifyChange();
  },

  deleteLayer: (index = get().activeLayer) => {
    const mesh = get().getActiveMesh();
    const { layers } = get();
    if (layers.length <= 1) return;
    if (index < 0 || index >= layers.length) return;
    const removed = layers[index];
    const fallback = layers[Math.max(0, index - 1)] ?? layers[0];
    const next = layers.filter((_, i) => i !== index);
    mesh.vertexLayers = mesh.vertexLayers.map((layerId) => (layerId === removed.id ? fallback.id : layerId));
    mesh.faceLayers = mesh.faceLayers.map((layerId) => (layerId === removed.id ? fallback.id : layerId));
    mesh.layers = next;
    mesh.activeLayerId = fallback.id;
    commitActiveMesh(mesh);
    set({ activeLayer: Math.max(0, next.findIndex((layer) => layer.id === fallback.id)) });
    get().notifyChange();
  },

  setActiveLayer: (index) => {
    if (index < 0 || index >= get().layers.length) return;
    const mesh = get().getActiveMesh();
    mesh.activeLayerId = get().layers[index].id;
    commitActiveMesh(mesh);
    set({ activeLayer: index });
    get().notifyChange();
  },

  toggleLayerVisible: (index) => {
    const mesh = get().getActiveMesh();
    const layers = [...mesh.layers];
    const layer = layers[index];
    if (!layer) return;
    layers[index] = { ...layer, visible: !layer.visible };
    mesh.layers = layers;
    commitActiveMesh(mesh);
    if (!layers[index].visible) get().deselectAll();
    get().notifyChange();
  },

  toggleLayerLocked: (index) => {
    const mesh = get().getActiveMesh();
    const layers = [...mesh.layers];
    const layer = layers[index];
    if (!layer) return;
    layers[index] = { ...layer, locked: !layer.locked };
    mesh.layers = layers;
    commitActiveMesh(mesh);
    get().notifyChange();
  },

  assignSelectionToLayer: () => {
    const mesh = get().getActiveMesh();
    const { selVerts, selEdges, selFaces } = get();
    ensureLayerData(mesh);
    const targetLayerId = mesh.activeLayerId;
    const selectedVerts = new Set([...selVerts, ...[...selEdges].flatMap((edge) => parseEdgeKey(edge))]);
    selectedVerts.forEach((vi) => {
      if (mesh.vertices[vi]) mesh.vertexLayers[vi] = targetLayerId;
    });
    selFaces.forEach((fi) => {
      if (mesh.faces[fi]) {
        mesh.faceLayers[fi] = targetLayerId;
        mesh.faces[fi]?.forEach((vi) => {
          mesh.vertexLayers[vi] = targetLayerId;
        });
      }
    });
    commitActiveMesh(mesh);
    get().notifyChange();
  },

  reorderLayer: (from, to) => {
    const mesh = get().getActiveMesh();
    const layers = [...mesh.layers];
    if (from === to || from < 0 || to < 0 || from >= layers.length || to >= layers.length) return;
    const [moved] = layers.splice(from, 1);
    layers.splice(to, 0, moved);
    mesh.layers = layers;
    mesh.activeLayerId = moved.id;
    commitActiveMesh(mesh);
    set({ activeLayer: to });
    get().notifyChange();
  },

  moveLayerUp: () => {
    const i = get().activeLayer;
    if (i > 0) get().reorderLayer(i, i - 1);
  },

  moveLayerDown: () => {
    const i = get().activeLayer;
    if (i < get().layers.length - 1) get().reorderLayer(i, i + 1);
  },

  exportOBJ: () => exportOBJ(get().getActiveMesh()),
  exportSTL: () => exportSTL(get().getActiveMesh()),
  exportPLY: () => exportPLY(get().getActiveMesh()),
  exportGLTF: () => exportGLTF(get().getActiveMesh()),

  showModal: (modal) => set({ modal: { ...modal, open: true } }),
  closeModal: () => set({ modal: null }),

  applyClickSelection: (vpKey, sx, sy, shiftKey, ctrlKey = false) => {
    const state = get();
    const mesh = state.getActiveMesh();
    const visibleVerts = visibleVertexIndices(mesh);
    const visibleFaces = visibleFaceIndices(mesh);
    const result = applyClickSelection2D({
      mesh,
      vpKey,
      vpState: state.vp2d[vpKey],
      sx,
      sy,
      selectionMode: effectiveSelectionMode(state.tool, state.selectionMode),
      selVerts: state.selVerts,
      selEdges: state.selEdges,
      selFaces: state.selFaces,
      shiftKey,
      ctrlKey,
      visibleVerts,
      visibleFaces,
    });
    set({
      selVerts: result.selVerts,
      selEdges: result.selEdges,
      selFaces: result.selFaces,
    });
    editorEvents.emit('selection:changed', undefined);
    get().notifyChange();
  },

  applyBoxSelection: (vpKey, rect, shiftKey, ctrlKey = false) => {
    const state = get();
    const mesh = state.getActiveMesh();
    const visibleVerts = visibleVertexIndices(mesh);
    const visibleFaces = visibleFaceIndices(mesh);
    const result = boxSelect2D({
      mesh,
      vpKey,
      vpState: state.vp2d[vpKey],
      rect,
      selectionMode: effectiveSelectionMode(state.tool, state.selectionMode),
      selVerts: state.selVerts,
      selEdges: state.selEdges,
      selFaces: state.selFaces,
      shiftKey,
      ctrlKey,
      visibleVerts,
      visibleFaces,
    });
    set({
      selVerts: result.selVerts,
      selEdges: result.selEdges,
      selFaces: result.selFaces,
    });
    editorEvents.emit('selection:changed', undefined);
    get().notifyChange();
  },

  applyClickSelection3D: (camera, canvas, sx, sy, shiftKey, ctrlKey = false) => {
    const state = get();
    const mesh = state.getActiveMesh();
    const visibleVerts = visibleVertexIndices(mesh);
    const visibleFaces = visibleFaceIndices(mesh);
    const result = applyClickSelection3D({
      mesh,
      camera,
      canvas,
      sx,
      sy,
      selectionMode: effectiveSelectionMode(state.tool, state.selectionMode),
      selVerts: state.selVerts,
      selEdges: state.selEdges,
      selFaces: state.selFaces,
      shiftKey,
      ctrlKey,
      visibleVerts,
      visibleFaces,
    });
    set({
      selVerts: result.selVerts,
      selEdges: result.selEdges,
      selFaces: result.selFaces,
    });
    editorEvents.emit('selection:changed', undefined);
    get().notifyChange();
  },

  applyBoxSelection3D: (camera, canvas, rect, shiftKey, ctrlKey = false) => {
    const state = get();
    const mesh = state.getActiveMesh();
    const visibleVerts = visibleVertexIndices(mesh);
    const visibleFaces = visibleFaceIndices(mesh);
    const result = boxSelect3D({
      mesh,
      camera,
      canvas,
      rect,
      selectionMode: effectiveSelectionMode(state.tool, state.selectionMode),
      selVerts: state.selVerts,
      selEdges: state.selEdges,
      selFaces: state.selFaces,
      shiftKey,
      ctrlKey,
      visibleVerts,
      visibleFaces,
    });
    set({
      selVerts: result.selVerts,
      selEdges: result.selEdges,
      selFaces: result.selFaces,
    });
    editorEvents.emit('selection:changed', undefined);
    get().notifyChange();
  },

  setSelVerts: (s) => {
    set({ selVerts: s });
    editorEvents.emit('selection:changed', undefined);
    get().notifyChange();
  },
  setSelEdges: (s) => {
    set({ selEdges: s });
    editorEvents.emit('selection:changed', undefined);
    get().notifyChange();
  },
  setSelFaces: (s) => {
    set({ selFaces: s });
    editorEvents.emit('selection:changed', undefined);
    get().notifyChange();
  },
  selectedTransformVerts: () => {
    const { selectionMode, selVerts, selEdges, selFaces } = get();
    const mesh = get().getActiveMesh();
    if (selectionMode === 'object') return new Set<number>();
    if (selectionMode === 'edge') {
      return editableVertexIndices(mesh, new Set([...selEdges].flatMap((edge) => parseEdgeKey(edge))));
    }
    if (selectionMode === 'face') {
      return editableVertexIndices(
        mesh,
        new Set([...editableFaceIndices(mesh, selFaces)].flatMap((fi) => mesh.faces[fi] ?? [])),
      );
    }
    return editableVertexIndices(mesh, selVerts);
  },
  setWipFace: (w) => {
    set({ wipFace: w });
    get().notifyChange();
  },
  setActiveVP: (vp) => set({ activeVP: vp }),
  setViewportLayout: (viewportLayout) => {
    set({ viewportLayout, maximizedVP: null, renderTick: get().renderTick + 1 });
    get().notifyChange();
    requestAnimationFrame(() => editorEvents.emit('viewport:render', undefined));
  },
  toggleViewportMaximize: () => {
    const state = get();
    const next = state.maximizedVP ? null : state.activeVP;
    set({ maximizedVP: next, renderTick: state.renderTick + 1 });
    get().notifyChange();
    const refresh = () => {
      editorEvents.emit('viewport:render', undefined);
      window.dispatchEvent(new Event('resize'));
    };
    requestAnimationFrame(() => {
      refresh();
      requestAnimationFrame(() => {
        refresh();
        window.setTimeout(refresh, 150);
      });
    });
  },
  setVp2d: (key, partial) =>
    set((s) => ({ vp2d: { ...s.vp2d, [key]: { ...s.vp2d[key], ...partial } } })),
  setSnapSize: (n) => {
    set({ snapSize: clampSnapSize(n) });
    get().notifyChange();
  },
  setSnapEnabled: (b) => set({ snapEnabled: b }),
  bumpRender: () => {
    set((s) => ({ renderTick: s.renderTick + 1 }));
    editorEvents.emit('viewport:render', undefined);
  },
}));
