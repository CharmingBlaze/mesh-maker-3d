import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { VIEW2D_DEFS, s2w, type View2DKey } from '@/core/math/projection';
import { drawSceneView2D } from '@/systems/viewport/drawView2D';
import { buildSceneRenderEntries, getActiveSceneEntry, meshForViewportPick } from '@/systems/scene/sceneObjectHelpers';
import { useEditorStore } from '@/store/editorStore';
import { editorEvents } from '@/core/events/EventBus';
import { SnapshotCommand } from '@/core/commands/Command';
import { screenToWorld,
  updatePrimDrag,
  constrainPrimDrawBounds,
  resolvePrimDragRelease,
  isClickNotDrag,
  adjustPrimDrawExtentByWheel,
  footprintSquareAxes,
  lastPrimSizeForDraw,
} from '@/hooks/primDrawHelpers';
import {
  applyHandleDrag,
  buildPrimDrawHandles,
  boundsHasVisibleSize,
  handleCursor,
  hitTestPrimDrawHandle2D,
  type PrimDrawHandle,
} from '@/systems/mesh/primDrawHandles';
import type { BoundingBox } from '@/core/math/BoundingBox';
import type { Vec3 } from '@/core/math/Vec3';
import {
  isAdditiveSelection,
  effectiveSelectionMode,
  nearestEdge2D,
  nearestFace2D,
  nearestVertex2D,
  supportsSelectionMarquee,
  supportsVertexPickDrag,
  vertexPickSelection,
} from '@/systems/selection/selectionSystem';
import { visibleFaceIndices, visibleVertexIndices } from '@/systems/layers/layerSystem';
import { applyVertexToolPlacement, shouldAutoCommitFace } from '@/systems/mesh/faceDrawing';
import {
  applyTransformDrag2D,
  beginObjectTransformDrag,
  beginTransformDragFromSelection,
  beginTransformPending,
  createTransformDragState,
  isTransformTool,
  tryStartTransformDrag,
} from '@/hooks/transformDrag';
import {
  applyModelingPreview,
  beginModelingPending,
  canStartModelingDrag,
  createModelingDragState,
  isModelingTool,
  startModalModelingDrag,
  tryStartModelingDrag,
} from '@/hooks/modelingDrag';
import { isMarqueeDone, useMarqueeRect } from '@/hooks/marqueeState';
import { useSceneRevision } from '@/hooks/useSceneRevision';
import { syncViewport2DToSize, frame2DViewportAtSize } from '@/systems/viewport/viewportFrame';
import { setViewport2DSize } from '@/systems/viewport/viewportSizes';
import { sceneWorldBounds } from '@/systems/scene/sceneObjectHelpers';
import {
  addKnifePoint,
  createKnifeDrawState,
  withKnifeHover,
} from '@/systems/mesh/knifeDraw';
import { pickKnifePoint2D } from '@/systems/mesh/knifePick';
import { knifePointToLocal } from '@/hooks/knifeHelpers';
import type { EdgeKey } from '@/systems/selection/selectionSystem';
import {
  beginLoopCutDrag,
  createLoopCutDragState,
  loopCutTFromDrag,
  resetLoopCutDrag,
} from '@/hooks/loopCutDrag';
import { edgeSlideAmountFromDrag } from '@/systems/mesh/edgeSlide';
import { mirrorOffsetFromDrag } from '@/systems/mesh/mirrorGeometry';
import { computeSelectionWorldPivot, type GizmoMode } from '@/systems/viewport/transformGizmo3D';
import {
  applyGizmoDragToPivot2D,
  capturePivotTransform,
  gizmoModeToControlsMode,
  hitTestTransformGizmo2D,
  syncPivotToWorld,
  type GizmoAxis,
} from '@/systems/viewport/transformGizmo2D';
import {
  applyTransformControlsChange,
  beginTransformControlsDrag,
  commitTransformControlsDrag,
  createTransformControlsSession,
} from '@/systems/viewport/transformControlsBridge';

export function useViewport2D(vpKey: View2DKey) {
  const renderTick = useSceneRevision();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const panningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const {
    selRect,
    beginMarquee,
    updateMarquee,
    endMarquee,
    clearMarquee,
    isMarqueeActive,
    peekMarqueeRect,
  } = useMarqueeRect();
  const primDragRef = useRef<{
    active: boolean;
    mode: 'create-base' | 'create-extent' | 'handle';
    anchor: Vec3 | null;
    screen: { x: number; y: number } | null;
    handle: PrimDrawHandle | null;
    dragStart: { bounds: BoundingBox; world: Vec3 } | null;
  }>({ active: false, mode: 'create-base', anchor: null, screen: null, handle: null, dragStart: null });
  const [primHandleId, setPrimHandleId] = useState<string | null>(null);
  const [gizmoHoverAxis, setGizmoHoverAxis] = useState<GizmoAxis | null>(null);

  const pivotObjectRef = useRef(new THREE.Object3D());
  const transformSessionRef = useRef(createTransformControlsSession());
  const gizmoDragRef = useRef<{
    active: boolean;
    axis: GizmoAxis | null;
    mode: GizmoMode | null;
    startScreen: { x: number; y: number } | null;
    startPosition: THREE.Vector3 | null;
    startQuaternion: THREE.Quaternion | null;
    startScale: THREE.Vector3 | null;
    pivotWorld: { x: number; y: number; z: number } | null;
  }>({
    active: false,
    axis: null,
    mode: null,
    startScreen: null,
    startPosition: null,
    startQuaternion: null,
    startScale: null,
    pivotWorld: null,
  });

  const dragRef = useRef(createTransformDragState());
  const modelingDragRef = useRef(createModelingDragState());
  const loopCutDragRef = useRef(createLoopCutDragState());
  const edgeSlideDragRef = useRef(createLoopCutDragState());
  const mirrorDragRef = useRef(createLoopCutDragState());
  const lastSizeRef = useRef<{ w: number; h: number } | null>(null);
  const renderRef = useRef<() => void>(() => {});

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const state = useEditorStore.getState();
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const entries = buildSceneRenderEntries(
      state.sceneGraph,
      state.meshes,
      state.activeMeshId,
      state.selectedNodeIds,
    );
    const gizmoTool: GizmoMode | null =
      isTransformTool(state.tool) && !state.primDraw ? (state.tool as GizmoMode) : null;
    const gizmoPivot = gizmoTool ? computeSelectionWorldPivot() : null;
    const gizmo =
      gizmoTool && gizmoPivot
        ? { mode: gizmoTool, pivot: gizmoPivot, hoverAxis: gizmoHoverAxis }
        : null;

    drawSceneView2D(
      ctx,
      canvas.width,
      canvas.height,
      vpKey,
      entries,
      state.activeMeshId,
      state.selectionMode,
      state.vp2d[vpKey],
      state.selVerts,
      state.selEdges,
      state.selFaces,
      state.wipFace,
      selRect,
      state.primDraw,
      {
        snapSize: state.snapSize,
        showGrid: state.showGrid3D,
      },
      primHandleId,
      state.knifeDraw,
      gizmo,
    );
  }, [vpKey, selRect, primHandleId, gizmoHoverAxis]);

  renderRef.current = render;

  useEffect(() => {
    render();
    return editorEvents.on('viewport:render', render);
  }, [render, renderTick]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const fitToSize = (mode: 'resize' | 'frame' = 'resize') => {
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      if (w < 8 || h < 8) return;

      setViewport2DSize(vpKey, w, h);

      const state = useEditorStore.getState();
      const vp = state.vp2d[vpKey];

      if (mode === 'frame') {
        const bounds = sceneWorldBounds(state.sceneGraph, state.meshes);
        const mesh = state.hasSceneObjects() ? state.getActiveMesh() : null;
        state.setVp2d(vpKey, frame2DViewportAtSize(vpKey, w, h, bounds, mesh));
      } else if (vp.viewSize) {
        const synced = syncViewport2DToSize(vp, { w, h });
        if (
          synced.pan.x !== vp.pan.x ||
          synced.pan.y !== vp.pan.y ||
          synced.zoom !== vp.zoom ||
          synced.viewSize?.w !== vp.viewSize?.w ||
          synced.viewSize?.h !== vp.viewSize?.h
        ) {
          state.setVp2d(vpKey, synced);
        }
      }

      lastSizeRef.current = { w, h };
      renderRef.current();
    };

    const ro = new ResizeObserver(() => fitToSize('resize'));
    ro.observe(container);
    fitToSize('resize');
    const offFrame = editorEvents.on('viewport:frame2d', () => fitToSize('frame'));
    return () => {
      ro.disconnect();
      offFrame();
    };
  }, [vpKey]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const state = useEditorStore.getState();
      if (state.primDraw?.phase === 'extent') {
        const next = adjustPrimDrawExtentByWheel(
          state.primDraw,
          e.deltaY,
          state.snapSize,
          e.shiftKey,
        );
        state.setPrimDraw(next);
        return;
      }
      const r = container.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      const vp = state.vp2d[vpKey];
      const viewSize = lastSizeRef.current ?? vp.viewSize ?? { w: r.width, h: r.height };
      const before = s2w(sx, sy, vp.pan, vp.zoom);
      const f = e.deltaY > 0 ? 0.85 : 1 / 0.85;
      const zoom = Math.max(0.04, Math.min(40, vp.zoom * f));
      const after = s2w(sx, sy, vp.pan, zoom);
      state.setVp2d(vpKey, {
        zoom,
        pan: {
          x: vp.pan.x + (after.x - before.x) * zoom,
          y: vp.pan.y + (after.y - before.y) * zoom,
        },
        viewSize,
      });
      state.notifyChange();
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [vpKey]);

  const handleVpClick = useCallback(
    (e: React.MouseEvent, sx: number, sy: number) => {
      const state = useEditorStore.getState();
      const vd = VIEW2D_DEFS[vpKey];
      const vpState = state.vp2d[vpKey];
      const pickMesh = meshForViewportPick(state.sceneGraph, state.meshes, state.activeMeshId);
      if (!pickMesh) {
        if (
          supportsSelectionMarquee(state.tool) &&
          effectiveSelectionMode(state.tool, state.selectionMode) === 'object'
        ) {
          state.applyObjectClickSelection(vpKey, sx, sy, e.shiftKey, e.ctrlKey);
        }
        return;
      }
      const mesh = state.getActiveMesh();
      const visibleVerts = visibleVertexIndices(mesh);
      const wc = s2w(sx, sy, vpState.pan, vpState.zoom);
      const wx = state.snap(wc.x);
      const wy = state.snap(wc.y);
      const wp3 = vd.unproj(wx, wy);
      const commitFace = (verts: number[], label = 'Add Face') => {
        const fresh = useEditorStore.getState();
        fresh.runCommand(label, () => {
          const fi = fresh.getActiveMesh().faces.length;
          fresh.getActiveMesh().faces.push([...verts]);
          fresh.getActiveMesh().faceLayers.push(fresh.getActiveMesh().activeLayerId);
          fresh.getActiveMesh().groups[fresh.groupSel]?.faces.push(fi);
        });
        fresh.setWipFace([]);
      };

      if (state.tool === 'vertex') {
        let placedVertex = -1;
        state.runCommand('Add Vertex', () => {
          const vi = nearestVertex2D(sx, sy, vpKey, pickMesh, vpState, { visibleVertices: visibleVerts });
          if (vi < 0) {
            placedVertex = mesh.vertices.length;
            mesh.vertices.push({ x: wp3.x, y: wp3.y, z: wp3.z });
            mesh.vertexLayers.push(mesh.activeLayerId);
          } else {
            placedVertex = vi;
          }
        });
        if (placedVertex >= 0) {
          const result = applyVertexToolPlacement(placedVertex, state.faceDrawMode, state.wipFace);
          if (result.committed) {
            const label =
              state.faceDrawMode === 'tri'
                ? 'Add Triangle'
                : state.faceDrawMode === 'quad'
                  ? 'Add Quad'
                  : 'Add Face';
            const toCommit = state.faceDrawMode === 'none' ? state.wipFace : result.wipFace;
            commitFace(toCommit, label);
          } else {
            state.setWipFace(result.wipFace);
            state.setSelVerts(new Set(result.wipFace));
            state.notifyChange();
          }
        }
      } else if (state.tool === 'face') {
        const vi = nearestVertex2D(sx, sy, vpKey, pickMesh, vpState, { visibleVertices: visibleVerts });
        if (vi >= 0) {
          const wip = [...state.wipFace];
          if (wip.length >= 3 && wip[0] === vi) {
            commitFace(wip);
          } else if (!wip.includes(vi)) {
            const nextWip = [...wip, vi];
            if (shouldAutoCommitFace(state.faceDrawMode, nextWip.length)) {
              commitFace(nextWip, state.faceDrawMode === 'tri' ? 'Add Triangle' : 'Add Quad');
            } else {
              state.setWipFace(nextWip);
            }
          }
          state.notifyChange();
        }
      } else if (supportsSelectionMarquee(state.tool)) {
        const mode = effectiveSelectionMode(state.tool, state.selectionMode);
        if (mode === 'object') {
          state.applyObjectClickSelection(vpKey, sx, sy, e.shiftKey, e.ctrlKey);
        } else {
          state.applyClickSelection(vpKey, sx, sy, e.shiftKey, e.ctrlKey, e.altKey);
        }
      }
    },
    [vpKey],
  );

  const handlers = {
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onMouseDown: (e: React.MouseEvent) => {
      const state = useEditorStore.getState();
      const el = containerRef.current!;
      const r = el.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      e.preventDefault();
      dragRef.current.mouseDownPos = { x: sx, y: sy };
      dragRef.current.isDragging = false;
      state.setActiveVP(vpKey);

      if (state.armedModeling && isModelingTool(state.tool)) {
        if (startModalModelingDrag(modelingDragRef.current, state.tool, sx, sy)) {
          return;
        }
        state.clearArmedModeling();
      }

      if (state.armedModeling === 'loopcut' && state.loopCutPreview && e.button === 0) {
        beginLoopCutDrag(loopCutDragRef.current, sx, sy, state.loopCutPreview.t);
        return;
      }

      if (state.armedModeling === 'edgeslide' && state.edgeSlidePreview && e.button === 0) {
        beginLoopCutDrag(edgeSlideDragRef.current, sx, sy, state.edgeSlidePreview.amount);
        return;
      }

      if (state.armedModeling === 'mirror' && state.mirrorPreview && e.button === 0) {
        beginLoopCutDrag(mirrorDragRef.current, sx, sy, state.mirrorPreview.offset);
        return;
      }

      if (state.tool === 'knife' && state.selectionMode !== 'object' && e.button === 0) {
        const pickMesh = meshForViewportPick(state.sceneGraph, state.meshes, state.activeMeshId);
        if (!pickMesh) return;
        const mesh = state.getActiveMesh();
        const entry = getActiveSceneEntry(state.sceneGraph, state.meshes, state.activeMeshId);
        const transform = entry?.transform ?? {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        };
        const vpState = state.vp2d[vpKey];
        const visibleVerts = visibleVertexIndices(mesh);
        const visibleFaces = visibleFaceIndices(mesh);
        const draw = state.knifeDraw?.view === vpKey ? state.knifeDraw : createKnifeDrawState(vpKey);
        const worldPoint = pickKnifePoint2D(
          vpKey,
          pickMesh,
          sx,
          sy,
          vpState,
          visibleVerts,
          visibleFaces,
          draw.points,
          {
            shiftKey: e.shiftKey,
            ctrlKey: e.ctrlKey || e.metaKey,
            snap: state.snap,
          },
        );
        if (!worldPoint) return;
        const point = knifePointToLocal(worldPoint, transform);
        const next = addKnifePoint(withKnifeHover(draw, point), point);
        if (!next) return;
        state.setKnifeDraw(next);
        return;
      }

      if (state.primDraw && e.button === 0) {
        const vpState = state.vp2d[vpKey];
        const p0 = screenToWorld(vpKey, sx, sy, vpState, state.snap);
        const handles = buildPrimDrawHandles(
          state.primDraw.bounds,
          state.primDraw.phase,
          state.primDraw.extentAxis,
        );
        const hit = boundsHasVisibleSize(state.primDraw.bounds)
          ? hitTestPrimDrawHandle2D(sx, sy, handles, vpKey, vpState.pan, vpState.zoom)
          : null;

        if (hit) {
          primDragRef.current = {
            active: true,
            mode: 'handle',
            anchor: p0,
            screen: { x: sx, y: sy },
            handle: hit,
            dragStart: { bounds: state.primDraw.bounds, world: p0 },
          };
          setPrimHandleId(hit.id);
          return;
        }

        if (state.primDraw.phase === 'base') {
          primDragRef.current = {
            active: true,
            mode: 'create-base',
            anchor: p0,
            screen: { x: sx, y: sy },
            handle: null,
            dragStart: null,
          };
          state.setPrimDraw(updatePrimDrag(state.primDraw, vpKey, p0, p0));
        } else {
          primDragRef.current = {
            active: true,
            mode: 'create-extent',
            anchor: p0,
            screen: { x: sx, y: sy },
            handle: null,
            dragStart: null,
          };
          state.setPrimDraw({ ...state.primDraw, anchor: p0, cursor: p0 });
        }
        return;
      }

      if (e.button === 2 || e.button === 1) {
        panningRef.current = true;
        const vp = state.vp2d[vpKey];
        panStartRef.current = { x: e.clientX - vp.pan.x, y: e.clientY - vp.pan.y };
        return;
      }

      const vpState = state.vp2d[vpKey];
      const pickMesh = meshForViewportPick(state.sceneGraph, state.meshes, state.activeMeshId);
      if (!pickMesh) {
        if (supportsSelectionMarquee(state.tool)) {
          beginMarquee(
            sx,
            sy,
            (rect, shiftKey, ctrlKey) => {
              const fresh = useEditorStore.getState();
              if (supportsSelectionMarquee(fresh.tool)) {
                fresh.applyBoxSelection(vpKey, rect, shiftKey, ctrlKey);
              }
            },
            containerRef.current,
          );
        }
        return;
      }
      const mesh = state.getActiveMesh();
      const visibleVerts = visibleVertexIndices(mesh);
      const visibleFaces = visibleFaceIndices(mesh);
      const viPick = nearestVertex2D(sx, sy, vpKey, pickMesh, vpState, {
        visibleVertices: visibleVerts,
      });

      if (isTransformTool(state.tool) && !state.primDraw) {
        const gizmoMode = state.tool as GizmoMode;
        const pivot = computeSelectionWorldPivot();
        if (pivot) {
          const axis = hitTestTransformGizmo2D(
            vpKey,
            gizmoMode,
            pivot,
            vpState.pan,
            vpState.zoom,
            sx,
            sy,
          );
          if (axis) {
            const pivotObj = pivotObjectRef.current;
            syncPivotToWorld(pivotObj, pivot);
            beginTransformControlsDrag(
              transformSessionRef.current,
              pivotObj,
              gizmoModeToControlsMode(gizmoMode),
            );
            const captured = capturePivotTransform(pivotObj);
            gizmoDragRef.current = {
              active: true,
              axis,
              mode: gizmoMode,
              startScreen: { x: sx, y: sy },
              startPosition: captured.position,
              startQuaternion: captured.quaternion,
              startScale: captured.scale,
              pivotWorld: pivot,
            };
            setGizmoHoverAxis(axis);
            return;
          }
        }
      }

      if (isTransformTool(state.tool)) {
        if (
          state.selectionMode === 'object' &&
          beginObjectTransformDrag(dragRef.current, state.tool, sx, sy)
        ) {
          return;
        }
        const transformVerts = state.selectedTransformVerts();
        if (
          beginTransformDragFromSelection(
            dragRef.current,
            state.tool,
            sx,
            sy,
            viPick,
            transformVerts,
            mesh.vertices.map((v) => ({ ...v })),
          )
        ) {
          return;
        }
      }

      if (supportsVertexPickDrag(state.tool, state.selectionMode) && viPick >= 0) {
        if (state.tool !== 'vertex') {
          const nextSel = vertexPickSelection(state.selVerts, viPick, e.shiftKey, e.ctrlKey);
          state.setSelVerts(nextSel);
          editorEvents.emit('selection:changed', undefined);
          state.notifyChange();
        }

        beginTransformPending(
          dragRef.current,
          { x: sx, y: sy },
          { vi: viPick },
          mesh.vertices.map((v) => ({ ...v })),
        );
        return;
      }

      if (supportsSelectionMarquee(state.tool)) {
        if (isModelingTool(state.tool)) {
          let hitSelected = false;
          if (state.tool === 'extrude' || state.tool === 'inset') {
            const fi = nearestFace2D(sx, sy, vpKey, pickMesh, vpState, { visibleFaces });
            hitSelected = fi >= 0 && state.selFaces.has(fi);
          } else if (state.tool === 'bevel') {
            const edge = nearestEdge2D(sx, sy, vpKey, pickMesh, vpState, {
              visibleVertices: visibleVerts,
              visibleFaces,
            });
            hitSelected = !!edge && state.selEdges.has(edge as EdgeKey);
          }
          if (
            hitSelected &&
            canStartModelingDrag(state.tool) &&
            !isAdditiveSelection(e.shiftKey, e.ctrlKey)
          ) {
            beginModelingPending(modelingDragRef.current, { x: sx, y: sy });
            return;
          }
        }

        beginMarquee(
          sx,
          sy,
          (rect, shiftKey, ctrlKey) => {
            const fresh = useEditorStore.getState();
            if (supportsSelectionMarquee(fresh.tool)) {
              fresh.applyBoxSelection(vpKey, rect, shiftKey, ctrlKey);
            }
          },
          containerRef.current,
        );
      }
    },
    onMouseMove: (e: React.MouseEvent) => {
      const state = useEditorStore.getState();
      const el = containerRef.current!;
      const r = el.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      const vpState = state.vp2d[vpKey];

      if (
        loopCutDragRef.current.isDragging &&
        state.loopCutPreview &&
        loopCutDragRef.current.mouseDownPos
      ) {
        const dy = sy - loopCutDragRef.current.mouseDownPos.y;
        state.updateLoopCutT(loopCutTFromDrag(dy, loopCutDragRef.current.startT));
        return;
      }

      if (
        edgeSlideDragRef.current.isDragging &&
        state.edgeSlidePreview &&
        edgeSlideDragRef.current.mouseDownPos
      ) {
        const dy = sy - edgeSlideDragRef.current.mouseDownPos.y;
        state.updateEdgeSlideAmount(edgeSlideAmountFromDrag(dy, edgeSlideDragRef.current.startT));
        return;
      }

      if (
        mirrorDragRef.current.isDragging &&
        state.mirrorPreview &&
        mirrorDragRef.current.mouseDownPos
      ) {
        const dy = sy - mirrorDragRef.current.mouseDownPos.y;
        state.updateMirrorPreview({
          offset: mirrorOffsetFromDrag(dy, mirrorDragRef.current.startT),
        });
        return;
      }

      if (state.tool === 'knife' && state.selectionMode !== 'object') {
        const pickMesh = meshForViewportPick(state.sceneGraph, state.meshes, state.activeMeshId);
        if (!pickMesh) return;
        const mesh = state.getActiveMesh();
        const entry = getActiveSceneEntry(state.sceneGraph, state.meshes, state.activeMeshId);
        const transform = entry?.transform ?? {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        };
        const vpState = state.vp2d[vpKey];
        const visibleVerts = visibleVertexIndices(mesh);
        const visibleFaces = visibleFaceIndices(mesh);
        const draw = state.knifeDraw?.view === vpKey ? state.knifeDraw : createKnifeDrawState(vpKey);
        const worldHover = pickKnifePoint2D(
          vpKey,
          pickMesh,
          sx,
          sy,
          vpState,
          visibleVerts,
          visibleFaces,
          draw.points,
          {
            shiftKey: e.shiftKey,
            ctrlKey: e.ctrlKey || e.metaKey,
            snap: state.snap,
          },
        );
        const hover = worldHover ? knifePointToLocal(worldHover, transform) : null;
        state.setKnifeDraw(withKnifeHover(draw, hover));
        return;
      }

      if (primDragRef.current.active && state.primDraw && primDragRef.current.anchor) {
        let p1 = screenToWorld(vpKey, sx, sy, vpState, state.snap);
        const drag = primDragRef.current;

        if (drag.mode === 'handle' && drag.handle) {
          const modifiers = { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey };
          const nextBounds = applyHandleDrag(
            drag.dragStart?.bounds ?? state.primDraw.bounds,
            drag.handle,
            p1,
            state.snap,
            drag.dragStart ?? undefined,
            modifiers,
            state.primDraw.phase === 'base' ? footprintSquareAxes(state.primDraw) : undefined,
          );
          state.setPrimDraw(
            constrainPrimDrawBounds({ ...state.primDraw, bounds: nextBounds, cursor: p1 }),
          );
          return;
        }

        const anchor = drag.anchor;
        if (!anchor) return;
        if (state.primDraw.phase === 'extent' && drag.screen && drag.mode === 'create-extent') {
          const axis = state.primDraw.extentAxis;
          const start = drag.screen;
          const raw =
            axis === 'y'
              ? -(sy - start.y) / vpState.zoom
              : (sx - start.x) / vpState.zoom;
          p1 = { ...anchor, [axis]: state.snap(anchor[axis] + raw) };
        }
        const updated = updatePrimDrag(state.primDraw, vpKey, anchor, p1, {
          shiftKey: e.shiftKey,
          ctrlKey: e.ctrlKey,
        });
        state.setPrimDraw(updated);
        return;
      }

      if (state.primDraw && !primDragRef.current.active) {
        const handles = buildPrimDrawHandles(
          state.primDraw.bounds,
          state.primDraw.phase,
          state.primDraw.extentAxis,
        );
        const hit = boundsHasVisibleSize(state.primDraw.bounds)
          ? hitTestPrimDrawHandle2D(sx, sy, handles, vpKey, vpState.pan, vpState.zoom)
          : null;
        const nextId = hit?.id ?? null;
        if (nextId !== primHandleId) setPrimHandleId(nextId);
        if (containerRef.current) {
          containerRef.current.style.cursor = handleCursor(hit);
        }
      } else if (containerRef.current && !state.primDraw) {
        containerRef.current.style.cursor = '';
      }

      if (gizmoDragRef.current.active && gizmoDragRef.current.axis && gizmoDragRef.current.mode) {
        const g = gizmoDragRef.current;
        const gizmoMode = g.mode!;
        const gizmoAxis = g.axis!;
        if (
          g.startScreen &&
          g.startPosition &&
          g.startQuaternion &&
          g.startScale &&
          g.pivotWorld
        ) {
          applyGizmoDragToPivot2D(
            pivotObjectRef.current,
            gizmoMode,
            gizmoAxis,
            vpKey,
            g.pivotWorld,
            vpState.pan,
            vpState.zoom,
            g.startScreen,
            sx,
            sy,
            g.startPosition,
            g.startQuaternion,
            g.startScale,
          );
          applyTransformControlsChange(transformSessionRef.current, pivotObjectRef.current);
        }
        return;
      }

      if (
        isTransformTool(state.tool) &&
        !state.primDraw &&
        !panningRef.current &&
        !gizmoDragRef.current.active
      ) {
        const gizmoMode = state.tool as GizmoMode;
        const pivot = computeSelectionWorldPivot();
        if (pivot) {
          const axis = hitTestTransformGizmo2D(
            vpKey,
            gizmoMode,
            pivot,
            vpState.pan,
            vpState.zoom,
            sx,
            sy,
          );
          if (axis !== gizmoHoverAxis) setGizmoHoverAxis(axis);
        } else if (gizmoHoverAxis) {
          setGizmoHoverAxis(null);
        }
      }

      if (panningRef.current) {
        const viewSize = lastSizeRef.current ?? undefined;
        state.setVp2d(vpKey, {
          pan: { x: e.clientX - panStartRef.current.x, y: e.clientY - panStartRef.current.y },
          ...(viewSize ? { viewSize } : {}),
        });
        state.notifyChange();
        return;
      }

      if (isMarqueeActive()) {
        updateMarquee(sx, sy);
        return;
      }

      const drag = dragRef.current;
      if (isTransformTool(state.tool)) {
        tryStartTransformDrag(drag, sx, sy);
        if (drag.isDragging) {
          applyTransformDrag2D(state.tool, drag, vpKey, sx, sy, vpState.pan, vpState.zoom);
        }
      } else if (isModelingTool(state.tool)) {
        const mDrag = modelingDragRef.current;
        tryStartModelingDrag(mDrag, state.tool, sx, sy);
        if (mDrag.isDragging) {
          applyModelingPreview(state.tool, mDrag, sx, sy, {
            kind: '2d',
            vpKey,
            pan: vpState.pan,
            zoom: vpState.zoom,
          });
        }
      } else if (supportsVertexPickDrag(state.tool, state.selectionMode)) {
        if (!isTransformTool(state.tool)) {
          tryStartTransformDrag(drag, sx, sy);
        }
        if (drag.isDragging && isTransformTool(state.tool)) {
          applyTransformDrag2D(state.tool, drag, vpKey, sx, sy, vpState.pan, vpState.zoom);
        } else if (drag.isDragging && drag.mouseDownPos && drag.dragVertBase && 'vi' in drag.dragVertBase) {
          const vd = VIEW2D_DEFS[vpKey];
          const origW = s2w(drag.mouseDownPos.x, drag.mouseDownPos.y, vpState.pan, vpState.zoom);
          const curW = s2w(sx, sy, vpState.pan, vpState.zoom);
          const deltaWorld = vd.unproj(curW.x - origW.x, curW.y - origW.y);
          const moveSet =
            state.tool === 'vertex'
              ? state.wipFace.length > 0
                ? new Set(state.wipFace)
                : drag.dragVertBase && 'vi' in drag.dragVertBase
                  ? new Set([drag.dragVertBase.vi])
                  : state.selectedTransformVerts()
              : state.selectedTransformVerts();
          moveSet.forEach((vi) => {
            const activeMesh = state.getActiveMesh();
            activeMesh.vertices[vi].x = drag.dragOrigVerts[vi].x + deltaWorld.x;
            activeMesh.vertices[vi].y = drag.dragOrigVerts[vi].y + deltaWorld.y;
            activeMesh.vertices[vi].z = drag.dragOrigVerts[vi].z + deltaWorld.z;
          });
          state.notifyChange();
        }
      }

    },
    onMouseUp: (e: React.MouseEvent) => {
      const state = useEditorStore.getState();
      const el = containerRef.current!;
      const r = el.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;

      if (panningRef.current) {
        panningRef.current = false;
        if (isMarqueeActive()) endMarquee(e.shiftKey, e.ctrlKey);
        return;
      }

      const liveMarquee = peekMarqueeRect();
      const marqueeApplied = !!liveMarquee && isMarqueeDone(liveMarquee);
      if (isMarqueeActive()) endMarquee(e.shiftKey, e.ctrlKey);

      if (loopCutDragRef.current.isDragging) {
        state.commitLoopCutPreview();
        resetLoopCutDrag(loopCutDragRef.current);
        dragRef.current.mouseDownPos = null;
        return;
      }

      if (edgeSlideDragRef.current.isDragging) {
        state.commitEdgeSlidePreview();
        resetLoopCutDrag(edgeSlideDragRef.current);
        dragRef.current.mouseDownPos = null;
        return;
      }

      if (mirrorDragRef.current.isDragging) {
        state.commitMirrorPreview();
        resetLoopCutDrag(mirrorDragRef.current);
        dragRef.current.mouseDownPos = null;
        return;
      }

      if (primDragRef.current.active && state.primDraw && primDragRef.current.anchor) {
        const min = state.snapSize;
        const draw = state.primDraw;
        const mode = primDragRef.current.mode;
        const drag = primDragRef.current;
        const clickPoint = primDragRef.current.anchor;
        const pointerMoved = drag.screen
          ? !isClickNotDrag(drag.screen, sx, sy)
          : true;

        const next = resolvePrimDragRelease(
          draw,
          mode,
          min,
          vpKey,
          clickPoint,
          pointerMoved,
          lastPrimSizeForDraw(state.lastPrimSizes, draw.type),
        );
        if (next) {
          state.setPrimDraw(next);
        }

        primDragRef.current = {
          active: false,
          mode: 'create-base',
          anchor: null,
          screen: null,
          handle: null,
          dragStart: null,
        };
        dragRef.current.mouseDownPos = null;
        return;
      }

      if (gizmoDragRef.current.active) {
        commitTransformControlsDrag(transformSessionRef.current);
        gizmoDragRef.current = {
          active: false,
          axis: null,
          mode: null,
          startScreen: null,
          startPosition: null,
          startQuaternion: null,
          startScale: null,
          pivotWorld: null,
        };
        setGizmoHoverAxis(null);
        dragRef.current.mouseDownPos = null;
        return;
      }

      const drag = dragRef.current;
      const mDrag = modelingDragRef.current;
      const moved =
        drag.mouseDownPos &&
        Math.hypot(sx - drag.mouseDownPos.x, sy - drag.mouseDownPos.y) >= 5;

      if (
        !marqueeApplied &&
        !state.primDraw &&
        !state.loopCutPreview &&
        !state.edgeSlidePreview &&
        !state.mirrorPreview &&
        !state.knifeDraw &&
        state.tool !== 'knife' &&
        !drag.isDragging &&
        !mDrag.isDragging &&
        !moved &&
        drag.mouseDownPos
      ) {
        if (isModelingTool(state.tool)) {
          state.applyClickSelection(vpKey, sx, sy, e.shiftKey, e.ctrlKey, e.altKey);
        } else {
          handleVpClick(e, sx, sy);
        }
      }

      if (
        drag.isDragging &&
        drag.beforeSnapshot &&
        supportsVertexPickDrag(state.tool, state.selectionMode) &&
        !isTransformTool(state.tool)
      ) {
        const before = drag.beforeSnapshot;
        const after = state.getSnapshot();
        state.history.execute(
          new SnapshotCommand('Move', before, after, (snap) => {
            state.applySnapshot(snap);
            state.notifyChange();
          }),
        );
        drag.beforeSnapshot = null;
      } else if (drag.isDragging && drag.beforeSnapshot && isTransformTool(state.tool)) {
        const before = drag.beforeSnapshot;
        const after = state.getSnapshot();
        state.history.execute(
          new SnapshotCommand(state.tool, before, after, (snap) => {
            state.applySnapshot(snap);
            state.notifyChange();
          }),
        );
        drag.beforeSnapshot = null;
      }

      if (mDrag.isDragging && mDrag.beforeSnapshot && isModelingTool(state.tool)) {
        const before = mDrag.beforeSnapshot;
        const after = state.getSnapshot();
        const label = state.tool.charAt(0).toUpperCase() + state.tool.slice(1);
        state.history.execute(
          new SnapshotCommand(label, before, after, (snap) => {
            state.applySnapshot(snap);
            state.notifyChange();
          }),
        );
        if (state.tool === 'inset' || state.tool === 'extrude') {
          state.setSelFaces(new Set(mDrag.targetFaces));
        } else if (state.tool === 'bevel') {
          state.setSelEdges(new Set(mDrag.targetEdges));
        }
        state.clearArmedModeling();
      }
      modelingDragRef.current = createModelingDragState();

      drag.isDragging = false;
      drag.transformPending = false;
      drag.mouseDownPos = null;
      drag.dragVertBase = null;
    },
    onMouseLeave: () => {
      panningRef.current = false;
      clearMarquee();
      if (gizmoDragRef.current.active) {
        commitTransformControlsDrag(transformSessionRef.current);
        gizmoDragRef.current = {
          active: false,
          axis: null,
          mode: null,
          startScreen: null,
          startPosition: null,
          startQuaternion: null,
          startScale: null,
          pivotWorld: null,
        };
        setGizmoHoverAxis(null);
      }
      if (primDragRef.current.active) {
        primDragRef.current = {
          ...primDragRef.current,
          active: false,
        };
      }
      dragRef.current.transformPending = false;
      dragRef.current.isDragging = false;
    },
    onDoubleClick: (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      const state = useEditorStore.getState();
      if (state.selectionMode === 'object') return;
      if (state.primDraw || state.knifeDraw) return;
      state.selectLinked();
    },
  };

  return { canvasRef, containerRef, handlers, selRect };
}
