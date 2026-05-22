import { useEffect, useRef } from 'react';
import type { Viewport3DRenderer } from '@/systems/viewport/Viewport3DRenderer';
import { boundsCenter } from '@/core/math/BoundingBox';
import type { Vec3 } from '@/core/math/Vec3';
import { SnapshotCommand } from '@/core/commands/Command';
import {
  applyTransformDrag3D,
  beginTransformDragFromSelection,
  beginTransformPending,
  createTransformDragState,
  init3dMovePlane,
  isTransformTool,
  tryStartTransformDrag,
} from '@/hooks/transformDrag';
import {
  applyModelingPreview,
  beginModelingPending,
  canStartModelingDrag,
  createModelingDragState,
  isModelingTool,
  tryStartModelingDrag,
} from '@/hooks/modelingDrag';
import {
  hasMinBaseSize,
  hasMinExtentSize,
  updatePrimDrag3D,
} from '@/hooks/primDrawHelpers';
import { applyVertexToolPlacement, shouldAutoCommitFace } from '@/systems/mesh/faceDrawing';
import {
  nearestEdgeScreen,
  nearestVertexScreen,
  pickFaceMesh3D,
  pickGroundPlane,
  pickVerticalPlane,
  pickViewPlane,
  snapVec3,
} from '@/systems/viewport/pick3D';
import { visibleFaceIndices, visibleVertexIndices } from '@/systems/layers/layerSystem';
import type { EdgeKey } from '@/systems/selection/selectionSystem';
import {
  isAdditiveSelection,
  supportsSelectionMarquee,
  supportsVertexPickDrag,
  vertexPickSelection,
} from '@/systems/selection/selectionSystem';
import { editorEvents } from '@/core/events/EventBus';
import { useEditorStore } from '@/store/editorStore';
import { isMarqueeDone, useMarqueeRect } from '@/hooks/marqueeState';

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
  const primDragRef = useRef<{ active: boolean; anchor: Vec3 | null }>({
    active: false,
    anchor: null,
  });
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const screenPos = (e: { clientX: number; clientY: number }) => {
      const r = container.getBoundingClientRect();
      return { sx: e.clientX - r.left, sy: e.clientY - r.top };
    };

    const getRenderer = () => rendererRef.current;

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

    const handleClick = (sx: number, sy: number, shiftKey: boolean, ctrlKey = false) => {
      const renderer = getRenderer();
      if (!renderer) return;
      const state = useEditorStore.getState();
      const canvas = renderer.renderer.domElement;
      const visibleVerts = visibleVertexIndices(state.mesh);
      const commitFace = (verts: number[], label = 'Add Face') => {
        const fresh = useEditorStore.getState();
        let createdFace = -1;
        fresh.runCommand(label, () => {
          const fi = fresh.mesh.faces.length;
          createdFace = fi;
          fresh.mesh.faces.push([...verts]);
          fresh.mesh.faceLayers.push(fresh.mesh.activeLayerId);
          fresh.mesh.groups[fresh.groupSel]?.faces.push(fi);
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
        const vi = nearestVertexScreen(renderer.camera, canvas, state.mesh, sx, sy, visibleVerts);
        const wp =
          vi >= 0
            ? state.mesh.vertices[vi]
            : pickGroundPlane(renderer.camera, canvas, sx, sy);
        if (!wp) return;
        const p = snapVec3(wp, state.snap);
        let placedVertex = vi;
        if (vi < 0) {
          state.runCommand('Add Vertex', () => {
            placedVertex = state.mesh.vertices.length;
            state.mesh.vertices.push({ x: p.x, y: p.y, z: p.z });
            state.mesh.vertexLayers.push(state.mesh.activeLayerId);
          });
        }
        if (placedVertex >= 0) useVertexForFaceFill(placedVertex);
        return;
      }

      if (state.tool === 'face') {
        const vi = nearestVertexScreen(renderer.camera, canvas, state.mesh, sx, sy, visibleVerts);
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
        state.applyClickSelection3D(renderer.camera, canvas, sx, sy, shiftKey, ctrlKey);
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

      if (state.primDraw) {
        const phase = state.primDraw.phase;
        const origin = phase === 'extent' ? boundsCenter(state.primDraw.bounds) : undefined;
        const p0 = pickPrim(sx, sy, phase, origin);
        if (!p0) return;
        primDragRef.current = { active: true, anchor: p0 };
        if (phase === 'base') {
          state.setPrimDraw(updatePrimDrag3D(state.primDraw, p0, p0));
        } else {
          state.setPrimDraw({ ...state.primDraw, anchor: p0, cursor: p0 });
        }
        container.setPointerCapture(e.pointerId);
        return;
      }

      const visibleVerts = visibleVertexIndices(state.mesh);
      const visibleFaces = visibleFaceIndices(state.mesh);
      const viPick = nearestVertexScreen(renderer.camera, canvas, state.mesh, sx, sy, visibleVerts);

      if (isTransformTool(state.tool)) {
        const transformVerts = state.selectedTransformVerts();
        if (
          beginTransformDragFromSelection(
            dragRef.current,
            state.tool,
            sx,
            sy,
            viPick,
            transformVerts,
            state.mesh.vertices.map((v) => ({ ...v })),
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
          state.mesh.vertices.map((v) => ({ ...v })),
        );
        container.setPointerCapture(e.pointerId);
        return;
      }

      if (supportsSelectionMarquee(state.tool)) {
        if (isModelingTool(state.tool)) {
          let hitSelected = false;
          if (state.tool === 'extrude' || state.tool === 'inset') {
            const fi = pickFaceMesh3D(renderer.camera, canvas, state.mesh, sx, sy, visibleFaces);
            hitSelected = fi >= 0 && state.selFaces.has(fi);
          } else if (state.tool === 'bevel') {
            const edge = nearestEdgeScreen(
              renderer.camera,
              canvas,
              state.mesh,
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

      if (primDragRef.current.active && state.primDraw && primDragRef.current.anchor) {
        const anchor = primDragRef.current.anchor;
        const phase = state.primDraw.phase;
        const origin = phase === 'extent' ? boundsCenter(state.primDraw.bounds) : undefined;
        const p1 = pickPrim(sx, sy, phase, origin);
        if (p1) state.setPrimDraw(updatePrimDrag3D(state.primDraw, anchor, p1));
        return;
      }

      if (isMarqueeActive()) {
        updateMarquee(sx, sy);
        return;
      }

      const drag = dragRef.current;
      if (isTransformTool(state.tool)) {
        if (tryStartTransformDrag(drag, sx, sy)) {
          if (state.tool === 'move') {
            init3dMovePlane(drag, renderer.camera, canvas, drag.mouseDownPos!.x, drag.mouseDownPos!.y);
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
              state.mesh.vertices[vi].x = drag.dragOrigVerts[vi].x + dx;
              state.mesh.vertices[vi].y = drag.dragOrigVerts[vi].y + dy;
              state.mesh.vertices[vi].z = drag.dragOrigVerts[vi].z + dz;
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

      if (primDragRef.current.active && state.primDraw) {
        const min = state.snapSize;
        const draw = state.primDraw;
        if (draw.phase === 'base' && hasMinBaseSize(draw, min)) {
          state.setPrimDraw({ ...draw, phase: 'extent', anchor: null, cursor: null });
        } else if (draw.phase === 'extent' && hasMinExtentSize(draw, min)) {
          state.commitPrimDraw();
        }
        primDragRef.current = { active: false, anchor: null };
      }

      const drag = dragRef.current;
      const moved =
        drag.mouseDownPos && Math.hypot(sx - drag.mouseDownPos.x, sy - drag.mouseDownPos.y) >= 5;

      const mDrag = modelingDragRef.current;

      if (!marqueeApplied && !state.primDraw && !moved && drag.mouseDownPos && !drag.isDragging) {
        const renderer = getRenderer();
        if (isModelingTool(state.tool) && renderer) {
          state.applyClickSelection3D(
            renderer.camera,
            renderer.renderer.domElement,
            sx,
            sy,
            e.shiftKey,
            e.ctrlKey,
          );
        } else {
          handleClick(sx, sy, e.shiftKey, e.ctrlKey);
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
      }
      modelingDragRef.current = createModelingDragState();

      drag.isDragging = false;
      drag.transformPending = false;
      drag.mouseDownPos = null;
      drag.dragVertBase = null;
      drag.beforeSnapshot = null;
      drag.drag3dPlaneStart = null;
      drag.drag3dPivot = null;

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
      renderer.zoom(e.deltaY);
      renderer.requestRender();
    };

    const onPointerLeave = () => clearMarquee();

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerUp);
    container.addEventListener('pointerleave', onPointerLeave);
    container.addEventListener('wheel', onWheel, { passive: false });
    container.addEventListener('contextmenu', (e) => e.preventDefault());

    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointercancel', onPointerUp);
      container.removeEventListener('pointerleave', onPointerLeave);
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('contextmenu', (e) => e.preventDefault());
      clearMarquee();
    };
  }, [containerRef, rendererRef, beginMarquee, updateMarquee, endMarquee, clearMarquee, isMarqueeActive]);

  return { selRect };
}
