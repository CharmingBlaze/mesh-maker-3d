import { create } from 'zustand';
import { SceneGraph } from '@/core/scene-graph/SceneGraph';
import { createMeshDocument, cloneMeshDocument, GROUP_COLORS, type MeshDocument, type MeshLayer } from '@/core/mesh/MeshDocument';
import { CommandHistory } from '@/core/commands/CommandHistory';
import { SnapshotCommand, type EditorSnapshot } from '@/core/commands/Command';
import { editorEvents } from '@/core/events/EventBus';
import type { PrimitiveType } from '@/systems/mesh/primitives';
import { addPrimitiveForDraw } from '@/systems/mesh/primitiveFromBounds';
import { createPrimDrawState, type PrimDrawState } from '@/systems/mesh/primDraw';
import { enforceMinSize } from '@/core/math/BoundingBox';
import * as meshOps from '@/systems/mesh/meshOperations';
import { exportOBJ, exportSTL, exportPLY, exportGLTF } from '@/systems/export/exporters';
import { serializeProject, type ProjectFileV1 } from '@/systems/io/projectFormat';
import {
  defaultProjectName,
  downloadText,
  saveTextWithPicker,
} from '@/systems/io/fileAccess';
import { PROJECT_EXTENSION, PROJECT_MIME } from '@/systems/io/projectFormat';
import { importFile } from '@/systems/import/importRouter';
import { meshBounds } from '@/core/mesh/meshBounds';
import { frame2DViewports } from '@/systems/viewport/viewportFrame';
import type { View2DKey } from '@/core/math/projection';
import type { ViewportLayoutId } from '@/systems/viewport/viewportLayout';
import {
  assignNewGeometryToActiveLayer,
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
  type ScreenRect,
  parseEdgeKey,
  uniqueMeshEdges,
  type EdgeKey,
  type SelectionMode,
} from '@/systems/selection/selectionSystem';
import { applyClickSelection3D, boxSelect3D } from '@/systems/viewport/pick3D';
import { clampSnapSize, snapScalar } from '@/systems/viewport/snapGrid';
import type * as THREE from 'three';

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
  object: 'Object mode: click the model to select the whole mesh',
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
  mesh: MeshDocument;
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
  applyProject: (project: ProjectFileV1, fileName: string | null) => void;

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

function createInitialState(): Pick<
  EditorState,
  'mesh' | 'sceneGraph' | 'history' | 'selVerts' | 'selEdges' | 'selFaces' | 'vp2d' | 'layers' | 'activeLayer'
> {
  const mesh = createMeshDocument();
  ensureLayerData(mesh);
  const sceneGraph = new SceneGraph();
  sceneGraph.ensureMeshNode(mesh.id, mesh.name);
  return {
    mesh,
    sceneGraph,
    history: new CommandHistory(50),
    selVerts: new Set(),
    selEdges: new Set(),
    selFaces: new Set(),
    vp2d: defaultVp2d(),
    layers: mesh.layers,
    activeLayer: 0,
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
    mesh: cloneMeshDocument(get().mesh),
    sceneGraph: get().sceneGraph.toJSON(),
  }),

  applySnapshot: (s) => {
    const sceneGraph = SceneGraph.fromJSON(s.sceneGraph);
    ensureLayerData(s.mesh);
    set({
      mesh: s.mesh,
      sceneGraph,
      layers: s.mesh.layers,
      activeLayer: Math.max(0, s.mesh.layers.findIndex((layer) => layer.id === s.mesh.activeLayerId)),
      selVerts: new Set(),
      selEdges: new Set(),
      selFaces: new Set(),
      wipFace: [],
      primDraw: null,
    });
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
    mutate();
    const after = get().getSnapshot();
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
    const mesh = createMeshDocument();
    ensureLayerData(mesh);
    const sceneGraph = new SceneGraph();
    sceneGraph.ensureMeshNode(mesh.id, mesh.name);
    set({
      ...createInitialState(),
      mesh,
      sceneGraph,
      history: new CommandHistory(50),
      wipFace: [],
      primDraw: null,
      groupSel: 0,
      matSel: 0,
      selectionMode: 'object',
      layers: mesh.layers,
      activeLayer: 0,
      vp2d: defaultVp2d(),
      projectFileName: null,
      projectDirty: false,
      maximizedVP: null,
      viewportLayout: 'quad',
    });
    get().centerAllViews();
  },

  applyProject: (project: ProjectFileV1, fileName: string | null) => {
    const sceneGraph = SceneGraph.fromJSON(project.sceneGraph);
    ensureLayerData(project.mesh);
    sceneGraph.ensureMeshNode(project.mesh.id, project.mesh.name);
    set({
      mesh: project.mesh,
      sceneGraph,
      history: new CommandHistory(50),
      layers: project.mesh.layers,
      activeLayer: Math.max(
        0,
        project.mesh.layers.findIndex((l) => l.id === project.mesh.activeLayerId),
      ),
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
      sceneGraph.ensureMeshNode(mesh.id, mesh.name);
      set({
        mesh,
        sceneGraph,
        history: new CommandHistory(50),
        layers: mesh.layers,
        activeLayer: 0,
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
        const { mesh, groupSel } = get();
        const beforeV = mesh.vertices.length;
        const beforeF = mesh.faces.length;
        result.mesh.vertices.forEach((v, i) => {
          mesh.vertices.push({ ...v });
          mesh.vertexLayers.push(result.mesh.vertexLayers[i] ?? mesh.activeLayerId);
        });
        result.mesh.faces.forEach((f, i) => {
          if (!f) return;
          const fi = mesh.faces.length;
          mesh.faces.push(f.map((vi) => vi + beforeV));
          mesh.faceLayers.push(result.mesh.faceLayers[i] ?? mesh.activeLayerId);
          mesh.groups[groupSel]?.faces.push(fi);
        });
        assignNewGeometryToActiveLayer(mesh, beforeV, beforeF);
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Import failed');
    }
  },

  saveProject: async () => {
    const state = get();
    const json = serializeProject({
      mesh: state.mesh,
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
    const name = state.projectFileName ?? defaultProjectName(state.mesh.name);
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
    const { mesh } = get();
    set((s) => ({
      maximizedVP: null,
      viewportLayout: 'quad',
      vp2d: frame2DViewports(mesh),
      renderTick: s.renderTick + 1,
    }));
    editorEvents.emit('viewport:frame3d', meshBounds(mesh));
    editorEvents.emit('viewport:render', undefined);
  },

  selectAll: () => {
    const { mesh, selectionMode } = get();
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
    set({ selVerts: new Set(), selEdges: new Set(), selFaces: new Set(), wipFace: [] });
    get().notifyChange();
  },

  invertSelection: () => {
    const { mesh, selVerts, selEdges, selFaces, selectionMode } = get();
    const visibleVerts = visibleVertexIndices(mesh);
    const visibleFaces = visibleFaceIndices(mesh);
    const allEdges = uniqueMeshEdges(mesh).filter((edge) => {
      const [a, b] = parseEdgeKey(edge);
      return visibleVerts.has(a) && visibleVerts.has(b);
    });
    set({
      selVerts:
        selectionMode === 'vertex' || selectionMode === 'object'
          ? new Set([...visibleVerts].filter((i) => !selVerts.has(i)))
          : new Set(),
      selEdges: selectionMode === 'edge' ? new Set(allEdges.filter((edge) => !selEdges.has(edge))) : new Set(),
      selFaces:
        selectionMode === 'face' || selectionMode === 'object'
          ? new Set([...visibleFaces].filter((i) => !selFaces.has(i)))
          : new Set(),
    });
    get().notifyChange();
  },

  deleteSelected: () => {
    const state = get();
    const mode = effectiveSelectionMode(state.tool, state.selectionMode);
    const targets = getDeleteTargets(state.mesh, mode, state.selVerts, state.selEdges, state.selFaces);
    if (!hasDeletableSelection(targets)) return;

    get().runCommand('Delete', () => {
      meshOps.deleteSelection(get().mesh, targets.verts, targets.faces);
      set({ selVerts: new Set(), selEdges: new Set(), selFaces: new Set(), wipFace: [] });
      editorEvents.emit('selection:changed', undefined);
    });
  },

  startPrimDraw: (type) => {
    set({ primDraw: createPrimDrawState(type) });
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
    const { primDraw, mesh, groupSel, snapSize } = get();
    if (!primDraw) return;
    const bounds = enforceMinSize(primDraw.bounds, snapSize);
    const type = primDraw.type;
    get().runCommand(`Add ${type}`, () => {
      const beforeVertexCount = mesh.vertices.length;
      const beforeFaceCount = mesh.faces.length;
      addPrimitiveForDraw(mesh, type, bounds, primDraw.baseView, groupSel);
      assignNewGeometryToActiveLayer(mesh, beforeVertexCount, beforeFaceCount);
    });
    set({ primDraw: null });
  },

  weldVerts: (thresh = 4) => get().runCommand('Weld', () => meshOps.weldVertices(get().mesh, thresh)),
  weldAll: () => get().weldVerts(5),
  snapToGrid: () =>
    get().runCommand('Snap', () => {
      const { mesh } = get();
      meshOps.snapVerticesToGrid(mesh, get().selectedTransformVerts(), get().snap);
    }),
  averageVerts: () => get().runCommand('Average', () => meshOps.averageVertices(get().mesh, get().selectedTransformVerts())),
  flipNormals: () => get().runCommand('Flip Normals', () => meshOps.flipNormals(get().mesh, get().selFaces)),
  fillHole: () => {
    let created: number[] | null = null as number[] | null;
    const doubleSided = get().fillHoleDoubleSided;
    get().runCommand(doubleSided ? 'Fill Hole (double-sided)' : 'Fill Hole', () => {
      const { mesh, selVerts, selEdges, groupSel } = get();
      created = meshOps.fillHole(mesh, selVerts, selEdges, groupSel, doubleSided);
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
  subdivide: () => get().runCommand('Subdivide', () => meshOps.subdivide(get().mesh, get().selFaces, get().groupSel)),
  triangulateFaces: () =>
    get().runCommand('Triangulate', () => meshOps.triangulate(get().mesh, get().selFaces, get().groupSel)),
  extrudeFaces: () =>
    get().runCommand('Extrude', () => meshOps.extrudeFaces(get().mesh, get().selFaces, get().groupSel, 12)),
  bevelEdges: () =>
    get().runCommand('Bevel', () =>
      meshOps.bevelEdges(get().mesh, get().selEdges, 2, get().groupSel),
    ),
  insetFaces: () =>
    get().runCommand('Inset', () => meshOps.insetFaces(get().mesh, get().selFaces, get().groupSel, 0.12)),
  smoothMesh: () => get().runCommand('Smooth', () => meshOps.smoothMesh(get().mesh, get().selectedTransformVerts())),

  applyMove: (dx, dy, dz) => {
    const selected = get().selectedTransformVerts();
    if (selected.size === 0) return;
    get().runCommand('Move', () => {
      const { mesh } = get();
      selected.forEach((vi) => {
        mesh.vertices[vi].x += dx;
        mesh.vertices[vi].y += dy;
        mesh.vertices[vi].z += dz;
      });
    });
  },

  applyRotate: (rx, ry, rz) => {
    const selected = get().selectedTransformVerts();
    if (selected.size === 0) return;
    get().runCommand('Rotate', () => {
      const { mesh } = get();
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
    const selected = get().selectedTransformVerts();
    if (selected.size === 0) return;
    get().runCommand('Scale', () => {
      const { mesh } = get();
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
    const { mesh } = get();
    set((s) => ({ vp2d: frame2DViewports(mesh), renderTick: s.renderTick + 1 }));
    editorEvents.emit('viewport:frame3d', meshBounds(mesh));
    editorEvents.emit('viewport:render', undefined);
  },

  addGroup: () => {
    const { mesh } = get();
    mesh.groups.push({
      name: `Group${mesh.groups.length + 1}`,
      faces: [],
      color: GROUP_COLORS[mesh.groups.length % GROUP_COLORS.length],
    });
    set({ groupSel: mesh.groups.length - 1 });
    get().notifyChange();
  },

  renameGroup: () => {
    const { mesh, groupSel } = get();
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
    const { mesh, selFaces, groupSel } = get();
    selFaces.forEach((fi) => {
      mesh.groups.forEach((g) => {
        g.faces = g.faces.filter((f) => f !== fi);
      });
      mesh.groups[groupSel].faces.push(fi);
    });
    get().notifyChange();
  },

  deleteGroup: () => {
    const { mesh } = get();
    if (mesh.groups.length <= 1) return;
    mesh.groups.splice(get().groupSel, 1);
    set({ groupSel: 0 });
    get().notifyChange();
  },

  setGroupSel: (i) => set({ groupSel: i }),

  addMaterial: () => {
    const { mesh } = get();
    mesh.materials.push({
      name: `Mat${mesh.materials.length + 1}`,
      color: GROUP_COLORS[mesh.materials.length % GROUP_COLORS.length],
      opacity: 0.9,
    });
    set({ matSel: mesh.materials.length - 1 });
    get().notifyChange();
  },

  editMaterial: () => {
    const { mesh, matSel } = get();
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
    const { mesh, matSel } = get();
    const m = mesh.materials[matSel];
    if (!m) return;
    m.name = name.trim() || m.name;
    get().notifyChange();
  },

  setMaterialColor: (color) => {
    const { mesh, matSel } = get();
    const m = mesh.materials[matSel];
    if (!m) return;
    get().runCommand('Material Color', () => {
      m.color = color;
    });
  },

  pickPaletteColor: (color) => {
    const { mesh, matSel, selFaces, groupSel } = get();
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
    const { mesh, selFaces, groupSel } = get();
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
    const { mesh } = get();
    mesh.bones.push({ name: `Bone${mesh.bones.length + 1}`, pos: { x: 0, y: 0, z: 0 } });
    get().sceneGraph.addBoneNode(mesh.bones[mesh.bones.length - 1].name);
    get().notifyChange();
  },

  deleteBone: () => {
    const { mesh } = get();
    if (mesh.bones.length) {
      mesh.bones.pop();
      get().notifyChange();
    }
  },

  addLayer: () => {
    const mesh = get().mesh;
    ensureLayerData(mesh);
    const layers = [...mesh.layers, createLayer(`Layer ${mesh.layers.length + 1}`, mesh.layers.length)];
    mesh.layers = layers;
    mesh.activeLayerId = layers[layers.length - 1].id;
    set({ mesh, layers, activeLayer: layers.length - 1 });
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
    const mesh = get().mesh;
    const layers = [...mesh.layers];
    layers[index] = { ...layer, name: name.trim() || layer.name };
    mesh.layers = layers;
    set({ mesh, layers });
    get().notifyChange();
  },

  setLayerColor: (index, color) => {
    const layer = get().layers[index];
    if (!layer) return;
    const mesh = get().mesh;
    const layers = [...mesh.layers];
    layers[index] = { ...layer, color };
    mesh.layers = layers;
    set({ mesh, layers });
    get().notifyChange();
  },

  deleteLayer: (index = get().activeLayer) => {
    const { mesh, layers } = get();
    if (layers.length <= 1) return;
    if (index < 0 || index >= layers.length) return;
    const removed = layers[index];
    const fallback = layers[Math.max(0, index - 1)] ?? layers[0];
    const next = layers.filter((_, i) => i !== index);
    mesh.vertexLayers = mesh.vertexLayers.map((layerId) => (layerId === removed.id ? fallback.id : layerId));
    mesh.faceLayers = mesh.faceLayers.map((layerId) => (layerId === removed.id ? fallback.id : layerId));
    mesh.layers = next;
    mesh.activeLayerId = fallback.id;
    set({ mesh, layers: next, activeLayer: Math.max(0, next.findIndex((layer) => layer.id === fallback.id)) });
    get().notifyChange();
  },

  setActiveLayer: (index) => {
    if (index < 0 || index >= get().layers.length) return;
    const mesh = get().mesh;
    mesh.activeLayerId = get().layers[index].id;
    set({ mesh, activeLayer: index });
    get().notifyChange();
  },

  toggleLayerVisible: (index) => {
    const mesh = get().mesh;
    const layers = [...mesh.layers];
    const layer = layers[index];
    if (!layer) return;
    layers[index] = { ...layer, visible: !layer.visible };
    mesh.layers = layers;
    set({ mesh, layers });
    if (!layers[index].visible) get().deselectAll();
    get().notifyChange();
  },

  toggleLayerLocked: (index) => {
    const mesh = get().mesh;
    const layers = [...mesh.layers];
    const layer = layers[index];
    if (!layer) return;
    layers[index] = { ...layer, locked: !layer.locked };
    mesh.layers = layers;
    set({ mesh, layers });
    get().notifyChange();
  },

  assignSelectionToLayer: () => {
    const { mesh, selVerts, selEdges, selFaces } = get();
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
    set({ mesh, layers: mesh.layers });
    get().notifyChange();
  },

  reorderLayer: (from, to) => {
    const mesh = get().mesh;
    const layers = [...mesh.layers];
    if (from === to || from < 0 || to < 0 || from >= layers.length || to >= layers.length) return;
    const [moved] = layers.splice(from, 1);
    layers.splice(to, 0, moved);
    mesh.layers = layers;
    mesh.activeLayerId = moved.id;
    set({ mesh, layers, activeLayer: to });
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

  exportOBJ: () => exportOBJ(get().mesh),
  exportSTL: () => exportSTL(get().mesh),
  exportPLY: () => exportPLY(get().mesh),
  exportGLTF: () => exportGLTF(get().mesh),

  showModal: (modal) => set({ modal: { ...modal, open: true } }),
  closeModal: () => set({ modal: null }),

  applyClickSelection: (vpKey, sx, sy, shiftKey, ctrlKey = false) => {
    const state = get();
    const visibleVerts = visibleVertexIndices(state.mesh);
    const visibleFaces = visibleFaceIndices(state.mesh);
    const result = applyClickSelection2D({
      mesh: state.mesh,
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
    const visibleVerts = visibleVertexIndices(state.mesh);
    const visibleFaces = visibleFaceIndices(state.mesh);
    const result = boxSelect2D({
      mesh: state.mesh,
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
    const visibleVerts = visibleVertexIndices(state.mesh);
    const visibleFaces = visibleFaceIndices(state.mesh);
    const result = applyClickSelection3D({
      mesh: state.mesh,
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
    const visibleVerts = visibleVertexIndices(state.mesh);
    const visibleFaces = visibleFaceIndices(state.mesh);
    const result = boxSelect3D({
      mesh: state.mesh,
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
    const { mesh, selectionMode, selVerts, selEdges, selFaces } = get();
    if (selectionMode === 'edge') {
      return editableVertexIndices(mesh, new Set([...selEdges].flatMap((edge) => parseEdgeKey(edge))));
    }
    if (selectionMode === 'face') {
      return editableVertexIndices(
        mesh,
        new Set([...editableFaceIndices(mesh, selFaces)].flatMap((fi) => mesh.faces[fi] ?? [])),
      );
    }
    if (selectionMode === 'object') {
      if (selVerts.size > 0) return editableVertexIndices(mesh, selVerts);
      if (selFaces.size > 0) {
        return editableVertexIndices(
          mesh,
          new Set([...editableFaceIndices(mesh, selFaces)].flatMap((fi) => mesh.faces[fi] ?? [])),
        );
      }
      return visibleVertexIndices(mesh);
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
