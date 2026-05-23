import { useEffect, useRef } from 'react';
import type { Viewport3DRenderer } from '@/systems/viewport/Viewport3DRenderer';
import { boundsCenter } from '@/core/math/BoundingBox';
import type { Vec3 } from '@/core/math/Vec3';
import { SnapshotCommand } from '@/core/commands/Command';
import {
  applyTransformDrag3D,
  beginObjectTransformDrag,
  beginTransformDragFromSelection,
  beginTransformPending,
  createTransformDragState,
  init3dMovePlane,
  init3dObjectMovePlane,
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
import {
  adjustPrimDrawExtentByWheel,
  isClickNotDrag,
  resolvePrimDragRelease,
  updatePrimDrag3D,
  constrainPrimDrawBounds,
  footprintSquareAxes,
  lastPrimSizeForDraw,
} from '@/hooks/primDrawHelpers';
import {
  applyHandleDrag,
  buildPrimDrawHandles,
  boundsHasVisibleSize,
  handleCursor,
  hitTestPrimDrawHandleScreen,
  type PrimDrawHandle,
} from '@/systems/mesh/primDrawHandles';
import type { BoundingBox } from '@/core/math/BoundingBox';
import { applyVertexToolPlacement, shouldAutoCommitFace } from '@/systems/mesh/faceDrawing';
import {
  nearestEdgeScreen,
  nearestVertexScreen,
  pickFaceMesh3D,
  pickGroundPlane,
  pickVerticalPlane,
  pickViewPlane,
  snapVec3,
  vertexToScreen,
} from '@/systems/viewport/pick3D';
import { meshForViewportPick, getActiveSceneEntry } from '@/systems/scene/sceneObjectHelpers';
import { visibleFaceIndices, visibleVertexIndices } from '@/systems/layers/layerSystem';
import type { EdgeKey } from '@/systems/selection/selectionSystem';
import {
  isAdditiveSelection,
  effectiveSelectionMode,
  supportsSelectionMarquee,
  supportsVertexPickDrag,
  vertexPickSelection,
} from '@/systems/selection/selectionSystem';
import { editorEvents } from '@/core/events/EventBus';
import { useEditorStore } from '@/store/editorStore';
import {
  addKnifePoint,
  createKnifeDrawState,
  withKnifeHover,
} from '@/systems/mesh/knifeDraw';
import { pickKnifePoint3D } from '@/systems/mesh/knifePick';
import { captureKnifeViewBasis, knifeDrawForWorldPreview, knifePointToLocal } from '@/hooks/knifeHelpers';
import { isMarqueeDone, useMarqueeRect } from '@/hooks/marqueeState';
import {
  beginLoopCutDrag,
  createLoopCutDragState,
  loopCutTFromDrag,
  resetLoopCutDrag,
} from '@/hooks/loopCutDrag';
import { edgeSlideAmountFromDrag } from '@/systems/mesh/edgeSlide';
import { mirrorOffsetFromDrag } from '@/systems/mesh/mirrorGeometry';

export type ScreenSelRect = import('@/systems/viewport/drawView2D').SelRect;

type NavMode = 'none' | 'orbit' | 'pan';

export function useViewport3DInteraction(
  rendererRef: React.RefObject<Viewport3DRenderer | null>,
  containerRef: React.RefObject<HTMLDivElement | null>,
) {
  const {
    selRect,
    beginMarquee,
    updateMarquee,
    endMarquee,
    clearMarquee,
    isMarqueeActive,
    peekMarqueeRect,
  } = useMarqueeRect();
  const navModeRef = useRef<NavMode>('none');
  const navLastRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef(createTransformDragState());
  const modelingDragRef = useRef(createModelingDragState());
  const loopCutDragRef = useRef(createLoopCutDragState());
  const edgeSlideDragRef = useRef(createLoopCutDragState());
  const mirrorDragRef = useRef(createLoopCutDragState());
  const primDragRef = useRef<{
    active: boolean;
    mode: 'create-base' | 'create-extent' | 'handle';
    anchor: Vec3 | null;
    screen: { x: number; y: number } | null;
    handle: PrimDrawHandle | null;
    dragStart: { bounds: BoundingBox; world: Vec3 } | null;
  }>({
    active: false,
    mode: 'create-base',
    anchor: null,
    screen: null,
    handle: null,
    dragStart: null,
  });
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const screenPos = (e: { clientX: number; clientY: number }) => {
      const r = container.getBoundingClientRect();
      return { sx: e.clientX - r.left, sy: e.clientY - r.top };
    };

    const getRenderer = () => rendererRef.current;

    const pickHandleWorld = (
      sx: number,
      sy: number,
      handle: PrimDrawHandle,
      bounds: BoundingBox,
    ) => {
      const renderer = getRenderer();
      const canvas = renderer?.renderer.domElement;
      if (!renderer || !canvas) return null;
      const state = useEditorStore.getState();
      const pivot = handle.kind === 'center' ? boundsCenter(bounds) : handle.position;
      const raw = pickViewPlane(renderer.camera, canvas, sx, sy, pivot);
      return raw ? snapVec3(raw, state.snap) : null;
    };

    const hitPrimHandle = (sx: number, sy: number, draw: NonNullable<ReturnType<typeof useEditorStore.getState>['primDraw']>) => {
      const renderer = getRenderer();
      const canvas = renderer?.renderer.domElement;
      if (!renderer || !canvas || !boundsHasVisibleSize(draw.bounds)) return null;
      const handles = buildPrimDrawHandles(draw.bounds, draw.phase, draw.extentAxis);
      return hitTestPrimDrawHandleScreen(sx, sy, handles, (v) =>
        vertexToScreen(renderer.camera, canvas, v),
      );
    };

    const pickPrim = (sx: number, sy: number, phase: 'base' | 'extent', origin?: Vec3) => {
      const renderer = getRenderer();
      const canvas = renderer?.renderer.domElement;
      if (!renderer || !canvas) return null;
      const state = useEditorStore.getState();
      const raw =
        phase === 'base'
          ? pickGroundPlane(renderer.camera, canvas, sx, sy)
          : pickVerticalPlane(renderer.camera, canvas, sx, sy, origin!);
      return raw ? snapVec3(raw, state.snap) : null;
    };

    const handleClick = (sx: number, sy: number, shiftKey: boolean, ctrlKey = false, altKey = false) => {
      const renderer = getRenderer();
      if (!renderer) return;
      const state = useEditorStore.getState();
      const canvas = renderer.renderer.domElement;
      const mesh = state.getActiveMesh();
      const pickMesh = meshForViewportPick(state.sceneGraph, state.meshes, state.activeMeshId);
      if (!pickMesh) {
        if (
          supportsSelectionMarquee(state.tool) &&
          effectiveSelectionMode(state.tool, state.selectionMode) === 'object'
        ) {
          state.applyObjectClickSelection('3d', sx, sy, shiftKey, ctrlKey, renderer.camera, canvas);
        }
        return;
      }
      const visibleVerts = visibleVertexIndices(mesh);
      const commitFace = (verts: number[], label = 'Add Face') => {
        const fresh = useEditorStore.getState();
        let createdFace = -1;
        fresh.runCommand(label, () => {
          const active = fresh.getActiveMesh();
          const fi = active.faces.length;
          createdFace = fi;
          active.faces.push([...verts]);
          active.faceLayers.push(active.activeLayerId);
          active.groups[fresh.groupSel]?.faces.push(fi);
        });
        const latest = useEditorStore.getState();
        latest.setWipFace([]);
        latest.setSelVerts(new Set(verts));
        if (createdFace >= 0) latest.setSelFaces(new Set([createdFace]));
      };
      const useVertexForFaceFill = (vertexIndex: number) => {
        const fresh = useEditorStore.getState();
        const result = applyVertexToolPlacement(vertexIndex, fresh.faceDrawMode, fresh.wipFace);
        if (result.committed) {
          const label =
            fresh.faceDrawMode === 'tri'
              ? 'Add Triangle'
              : fresh.faceDrawMode === 'quad'
                ? 'Add Quad'
                : 'Add Face';
          const toCommit = fresh.faceDrawMode === 'none' ? fresh.wipFace : result.wipFace;
          commitFace(toCommit, label);
        } else {
          fresh.setWipFace(result.wipFace);
          fresh.setSelVerts(new Set(result.wipFace));
          fresh.notifyChange();
        }
      };

      if (state.tool === 'vertex') {
        const vi = nearestVertexScreen(renderer.camera, canvas, pickMesh, sx, sy, visibleVerts);
        const wp =
          vi >= 0
            ? mesh.vertices[vi]
            : pickGroundPlane(renderer.camera, canvas, sx, sy);
        if (!wp) return;
        const p = snapVec3(wp, state.snap);
        let placedVertex = vi;
        if (vi < 0) {
          state.runCommand('Add Vertex', () => {
            const active = state.getActiveMesh();
            placedVertex = active.vertices.length;
            active.vertices.push({ x: p.x, y: p.y, z: p.z });
            active.vertexLayers.push(active.activeLayerId);
          });
        }
        if (placedVertex >= 0) useVertexForFaceFill(placedVertex);
        return;
      }

      if (state.tool === 'face') {
        const vi = nearestVertexScreen(renderer.camera, canvas, pickMesh, sx, sy, visibleVerts);
        if (vi < 0) return;
        const fresh = useEditorStore.getState();
        const wip = [...fresh.wipFace];
        if (wip.length >= 3 && wip[0] === vi) {
          commitFace(wip);
        } else if (!wip.includes(vi)) {
          const nextWip = [...wip, vi];
          fresh.setSelVerts(new Set(nextWip));
          if (shouldAutoCommitFace(fresh.faceDrawMode, nextWip.length)) {
            commitFace(nextWip, fresh.faceDrawMode === 'tri' ? 'Add Triangle' : 'Add Quad');
          } else {
            fresh.setWipFace(nextWip);
          }
        }
        useEditorStore.getState().notifyChange();
        return;
      }

      if (supportsSelectionMarquee(state.tool)) {
        const mode = effectiveSelectionMode(state.tool, state.selectionMode);
        if (mode === 'object') {
          state.applyObjectClickSelection('3d', sx, sy, shiftKey, ctrlKey, renderer.camera, canvas);
        } else {
          state.applyClickSelection3D(renderer.camera, canvas, sx, sy, shiftKey, ctrlKey, altKey);
        }
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      const renderer = getRenderer();
      if (!renderer) return;
      const state = useEditorStore.getState();
      state.setActiveVP('3d');
      const { sx, sy } = screenPos(e);
      const canvas = renderer.renderer.domElement;

      if (e.button === 2) {
        e.preventDefault();
        navModeRef.current = 'orbit';
        navLastRef.current = { x: e.clientX, y: e.clientY };
        container.setPointerCapture(e.pointerId);
        return;
      }

      if (e.button === 1) {
        if (!state.primDraw) {
          e.preventDefault();
          navModeRef.current = 'pan';
          navLastRef.current = { x: e.clientX, y: e.clientY };
          container.setPointerCapture(e.pointerId);
        }
        return;
      }

      if (e.button !== 0) return;
      e.preventDefault();

      dragRef.current.mouseDownPos = { x: sx, y: sy };
      dragRef.current.isDragging = false;

      if (state.armedModeling && isModelingTool(state.tool)) {
        if (startModalModelingDrag(modelingDragRef.current, state.tool, sx, sy)) {
          container.setPointerCapture(e.pointerId);
          return;
        }
        state.clearArmedModeling();
      }

      if (state.armedModeling === 'loopcut' && state.loopCutPreview) {
        beginLoopCutDrag(loopCutDragRef.current, sx, sy, state.loopCutPreview.t);
        container.setPointerCapture(e.pointerId);
        return;
      }

      if (state.armedModeling === 'edgeslide' && state.edgeSlidePreview) {
        beginLoopCutDrag(edgeSlideDragRef.current, sx, sy, state.edgeSlidePreview.amount);
        container.setPointerCapture(e.pointerId);
        return;
      }

      if (state.armedModeling === 'mirror' && state.mirrorPreview) {
        beginLoopCutDrag(mirrorDragRef.current, sx, sy, state.mirrorPreview.offset);
        container.setPointerCapture(e.pointerId);
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
        const visibleVerts = visibleVertexIndices(mesh);
        const visibleFaces = visibleFaceIndices(mesh);
        const draw =
          state.knifeDraw?.view === '3d'
            ? state.knifeDraw
            : createKnifeDrawState('3d', captureKnifeViewBasis(renderer.camera));
        const worldPoint = pickKnifePoint3D(
          renderer.camera,
          canvas,
          pickMesh,
          sx,
          sy,
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
        renderer.setKnifePreview(knifeDrawForWorldPreview(next, transform));
        container.setPointerCapture(e.pointerId);
        return;
      }

      if (state.primDraw) {
        const draw = state.primDraw;
        const hit = hitPrimHandle(sx, sy, draw);

        if (hit) {
          const p0 = pickHandleWorld(sx, sy, hit, draw.bounds) ?? hit.position;
          primDragRef.current = {
            active: true,
            mode: 'handle',
            anchor: p0,
            screen: { x: sx, y: sy },
            handle: hit,
            dragStart: { bounds: draw.bounds, world: p0 },
          };
          renderer.setCadPrimPreview(draw, hit.id);
          container.setPointerCapture(e.pointerId);
          return;
        }

        const phase = draw.phase;
        const origin = phase === 'extent' ? boundsCenter(draw.bounds) : undefined;
        const p0 = pickPrim(sx, sy, phase, origin);
        if (!p0) return;
        primDragRef.current = {
          active: true,
          mode: phase === 'base' ? 'create-base' : 'create-extent',
          anchor: p0,
          screen: { x: sx, y: sy },
          handle: null,
          dragStart: null,
        };
        if (phase === 'base') {
          state.setPrimDraw(updatePrimDrag3D(draw, p0, p0));
        } else {
          state.setPrimDraw({ ...draw, anchor: p0, cursor: p0 });
        }
        container.setPointerCapture(e.pointerId);
        return;
      }

      const mesh = state.getActiveMesh();
      const pickMesh = meshForViewportPick(state.sceneGraph, state.meshes, state.activeMeshId);
      if (!pickMesh) {
        if (supportsSelectionMarquee(state.tool)) {
          beginMarquee(
            sx,
            sy,
            (rect, shiftKey, ctrlKey) => {
              const fresh = useEditorStore.getState();
              if (supportsSelectionMarquee(fresh.tool)) {
                fresh.applyBoxSelection3D(renderer.camera, canvas, rect, shiftKey, ctrlKey);
              }
            },
            container,
          );
          container.setPointerCapture(e.pointerId);
        }
        return;
      }
      const visibleVerts = visibleVertexIndices(mesh);
      const visibleFaces = visibleFaceIndices(mesh);
      const viPick = nearestVertexScreen(renderer.camera, canvas, pickMesh, sx, sy, visibleVerts);

      if (isTransformTool(state.tool)) {
        if (renderer.isTransformGizmoDragging()) {
          return;
        }
        if (
          state.selectionMode === 'object' &&
          beginObjectTransformDrag(dragRef.current, state.tool, sx, sy)
        ) {
          container.setPointerCapture(e.pointerId);
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
          container.setPointerCapture(e.pointerId);
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
        container.setPointerCapture(e.pointerId);
        return;
      }

      if (supportsSelectionMarquee(state.tool)) {
        if (isModelingTool(state.tool)) {
          let hitSelected = false;
          if (state.tool === 'extrude' || state.tool === 'inset') {
            const fi = pickFaceMesh3D(renderer.camera, canvas, pickMesh, sx, sy, visibleFaces);
            hitSelected = fi >= 0 && state.selFaces.has(fi);
          } else if (state.tool === 'bevel') {
            const edge = nearestEdgeScreen(
              renderer.camera,
              canvas,
              pickMesh,
              sx,
              sy,
              visibleVerts,
              visibleFaces,
            );
            hitSelected = !!edge && state.selEdges.has(edge as EdgeKey);
          }
          if (
            hitSelected &&
            canStartModelingDrag(state.tool) &&
            !isAdditiveSelection(e.shiftKey, e.ctrlKey)
          ) {
            beginModelingPending(modelingDragRef.current, { x: sx, y: sy });
            container.setPointerCapture(e.pointerId);
            return;
          }
        }

        beginMarquee(
          sx,
          sy,
          (rect, shiftKey, ctrlKey) => {
            const fresh = useEditorStore.getState();
            const r = getRenderer();
            if (!r || !supportsSelectionMarquee(fresh.tool)) return;
            fresh.applyBoxSelection3D(r.camera, r.renderer.domElement, rect, shiftKey, ctrlKey);
          },
          container,
        );
        container.setPointerCapture(e.pointerId);
        return;
      }

      if (state.tool === 'vertex' || state.tool === 'face') {
        container.setPointerCapture(e.pointerId);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const renderer = getRenderer();
      if (!renderer) return;
      const { sx, sy } = screenPos(e);
      const state = useEditorStore.getState();
      const canvas = renderer.renderer.domElement;

      if (navModeRef.current === 'orbit') {
        const dx = e.clientX - navLastRef.current.x;
        const dy = e.clientY - navLastRef.current.y;
        navLastRef.current = { x: e.clientX, y: e.clientY };
        renderer.orbit(dx, dy, container.clientHeight);
        renderer.requestRender();
        return;
      }

      if (navModeRef.current === 'pan') {
        const dx = e.clientX - navLastRef.current.x;
        const dy = e.clientY - navLastRef.current.y;
        navLastRef.current = { x: e.clientX, y: e.clientY };
        renderer.pan(dx, dy);
        renderer.requestRender();
        return;
      }

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
        const visibleVerts = visibleVertexIndices(mesh);
        const visibleFaces = visibleFaceIndices(mesh);
        const draw =
          state.knifeDraw?.view === '3d'
            ? state.knifeDraw
            : createKnifeDrawState('3d', captureKnifeViewBasis(renderer.camera));
        const worldHover = pickKnifePoint3D(
          renderer.camera,
          canvas,
          pickMesh,
          sx,
          sy,
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
        const next = withKnifeHover(draw, hover);
        state.setKnifeDraw(next);
        renderer.setKnifePreview(knifeDrawForWorldPreview(next, transform));
        return;
      }

      if (primDragRef.current.active && state.primDraw && primDragRef.current.anchor) {
        const drag = primDragRef.current;
        const draw = state.primDraw;

        if (drag.mode === 'handle' && drag.handle) {
          const p1 = pickHandleWorld(sx, sy, drag.handle, drag.dragStart?.bounds ?? draw.bounds);
          if (p1) {
            const modifiers = { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey };
            const nextBounds = applyHandleDrag(
              drag.dragStart?.bounds ?? draw.bounds,
              drag.handle,
              p1,
              state.snap,
              drag.dragStart ?? undefined,
              modifiers,
              draw.phase === 'base' ? footprintSquareAxes(draw) : undefined,
            );
            const updated = constrainPrimDrawBounds({ ...draw, bounds: nextBounds, cursor: p1 });
            state.setPrimDraw(updated);
            renderer.setCadPrimPreview(updated, drag.handle.id);
          }
          return;
        }

        const phase = draw.phase;
        const origin = phase === 'extent' ? boundsCenter(draw.bounds) : undefined;
        const p1 = pickPrim(sx, sy, phase, origin);
        if (p1 && drag.anchor) {
          state.setPrimDraw(
            updatePrimDrag3D(draw, drag.anchor, p1, { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey }),
          );
        }
        return;
      }

      if (state.primDraw && !primDragRef.current.active) {
        const hit = hitPrimHandle(sx, sy, state.primDraw);
        renderer.setCadPrimPreview(state.primDraw, hit?.id ?? null);
        container.style.cursor = handleCursor(hit);
      } else if (!state.primDraw) {
        container.style.cursor = '';
      }

      const drag = dragRef.current;

      if (isMarqueeActive()) {
        updateMarquee(sx, sy);
        return;
      }

      if (isTransformTool(state.tool)) {
        if (renderer.isTransformGizmoDragging()) return;
        if (tryStartTransformDrag(drag, sx, sy)) {
          if (state.tool === 'move') {
            if (drag.dragOrigObjects?.length) {
              init3dObjectMovePlane(
                drag,
                renderer.camera,
                canvas,
                drag.mouseDownPos!.x,
                drag.mouseDownPos!.y,
              );
            } else {
              init3dMovePlane(
                drag,
                renderer.camera,
                canvas,
                drag.mouseDownPos!.x,
                drag.mouseDownPos!.y,
              );
            }
          }
        }
        if (drag.isDragging) {
          applyTransformDrag3D(state.tool, drag, renderer.camera, canvas, sx, sy);
        }
        return;
      }

      const mDrag = modelingDragRef.current;
      if (isModelingTool(state.tool)) {
        tryStartModelingDrag(mDrag, state.tool, sx, sy);
        if (mDrag.isDragging) {
          applyModelingPreview(state.tool, mDrag, sx, sy, {
            kind: '3d',
            camera: renderer.camera,
            canvas,
          });
        }
        return;
      }

      if (supportsVertexPickDrag(state.tool, state.selectionMode)) {
        if (!isTransformTool(state.tool)) {
          if (tryStartTransformDrag(drag, sx, sy)) {
            const moveIndices =
              state.tool === 'vertex'
                ? state.wipFace.length > 0
                  ? state.wipFace
                  : drag.dragVertBase && 'vi' in drag.dragVertBase
                    ? [drag.dragVertBase.vi]
                    : [...state.selectedTransformVerts()]
                : [...state.selectedTransformVerts()];
            init3dMovePlane(
              drag,
              renderer.camera,
              canvas,
              drag.mouseDownPos!.x,
              drag.mouseDownPos!.y,
              moveIndices,
            );
          }
        }
        if (drag.isDragging && drag.drag3dPlaneStart && drag.drag3dPivot) {
          const cur = pickViewPlane(renderer.camera, canvas, sx, sy, drag.drag3dPivot);
          if (cur) {
            const dx = cur.x - drag.drag3dPlaneStart.x;
            const dy = cur.y - drag.drag3dPlaneStart.y;
            const dz = cur.z - drag.drag3dPlaneStart.z;
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
              activeMesh.vertices[vi].x = drag.dragOrigVerts[vi].x + dx;
              activeMesh.vertices[vi].y = drag.dragOrigVerts[vi].y + dy;
              activeMesh.vertices[vi].z = drag.dragOrigVerts[vi].z + dz;
            });
            state.notifyChange();
          }
        }
        return;
      }

    };

    const onPointerUp = (e: PointerEvent) => {
      const { sx, sy } = screenPos(e);

      if (e.button === 1 || e.button === 2) {
        navModeRef.current = 'none';
        try {
          container.releasePointerCapture(e.pointerId);
        } catch {
          /* released */
        }
        return;
      }

      if (e.button !== 0) return;

      const state = useEditorStore.getState();

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
        const pointerMoved = drag.screen ? !isClickNotDrag(drag.screen, sx, sy) : true;

        const next = resolvePrimDragRelease(
          draw,
          mode,
          min,
          '3d',
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
        const renderer = getRenderer();
        const freshDraw = useEditorStore.getState().primDraw;
        if (renderer && freshDraw) {
          renderer.setCadPrimPreview(freshDraw, null);
        }
      }

      const drag = dragRef.current;
      const moved =
        drag.mouseDownPos && Math.hypot(sx - drag.mouseDownPos.x, sy - drag.mouseDownPos.y) >= 5;

      const mDrag = modelingDragRef.current;

      if (!marqueeApplied && !state.primDraw && !state.loopCutPreview && !state.edgeSlidePreview && !state.knifeDraw && state.tool !== 'knife' && !moved && drag.mouseDownPos && !drag.isDragging) {
        const renderer = getRenderer();
        if (isModelingTool(state.tool) && renderer) {
          state.applyClickSelection3D(
            renderer.camera,
            renderer.renderer.domElement,
            sx,
            sy,
            e.shiftKey,
            e.ctrlKey,
            e.altKey,
          );
        } else {
          handleClick(sx, sy, e.shiftKey, e.ctrlKey, e.altKey);
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
      drag.beforeSnapshot = null;
      drag.drag3dPlaneStart = null;
      drag.drag3dPivot = null;
      drag.dragOrigObjects = null;

      try {
        container.releasePointerCapture(e.pointerId);
      } catch {
        /* released */
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (!container.contains(e.target as Node)) return;
      const renderer = getRenderer();
      if (!renderer) return;
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
        renderer.setCadPrimPreview(next);
        return;
      }
      renderer.zoom(e.deltaY);
      renderer.requestRender();
    };

    const onPointerLeave = () => clearMarquee();

    const onDoubleClick = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const state = useEditorStore.getState();
      if (state.selectionMode === 'object') return;
      if (state.primDraw || state.knifeDraw) return;
      state.selectLinked();
    };

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerUp);
    container.addEventListener('pointerleave', onPointerLeave);
    container.addEventListener('wheel', onWheel, { passive: false });
    container.addEventListener('contextmenu', (e) => e.preventDefault());
    container.addEventListener('dblclick', onDoubleClick);

    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointercancel', onPointerUp);
      container.removeEventListener('pointerleave', onPointerLeave);
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('contextmenu', (e) => e.preventDefault());
      container.removeEventListener('dblclick', onDoubleClick);
      clearMarquee();
    };
  }, [containerRef, rendererRef, beginMarquee, updateMarquee, endMarquee, clearMarquee, isMarqueeActive]);

  return { selRect };
}
